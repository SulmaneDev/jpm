'use strict';

const registry = require('./registry');
const semver = require('../utils/semver');
const system = require('../utils/system');
const logger = require('../utils/logger');

/**
 * Resolves a full dependency tree given a root package.json dependencies map.
 *
 * Returns a flat map: { "name@version" => { name, version, resolved, integrity, dependencies } }
 * Also detects circular dependencies and performs basic deduplication / hoisting.
 */
class Resolver {
    /**
     * Creates an instance of the Resolver.
     * Initializes maps for resolved packages, in-flight requests, and the circular dependency stack.
     */
    constructor() {
        /** @type {Map<string, object>} Map of "name@version" to package metadata */
        this._resolved = new Map();
        /** @type {Map<string, Promise>} Map of "name@range" to active resolution promises */
        this._inFlight = new Map();
        /** @type {string[]} Stack of package names being resolved to detect cycles */
        this._stack = [];
    }

    /**
     * Resolves a set of dependencies recursively.
     * 
     * @param {Object.<string, string>} [deps={}] - Regular dependencies (name to semver range)
     * @param {Object.<string, string>} [devDeps={}] - Development dependencies
     * @param {Object.<string, string>} [peerDeps={}] - Peer dependencies
     * @returns {Promise<Map<string, object>>} A promise that resolves to the flat map of resolved packages
     */
    async resolve(deps = {}, devDeps = {}, peerDeps = {}, onProgress) {
        const all = { ...deps, ...devDeps };
        this._totalToResolve = Object.keys(all).length;
        this._resolvedCount = 0;
        this._onProgress = onProgress;

        await Promise.all(
            Object.entries(all).map(([name, range]) => this._resolveOne(name, range))
        );
        return this._resolved;
    }

    async _resolveOne(name, range) {
        const key = `${name}@${range}`;

        // Already in flight? Await the existing promise.
        if (this._inFlight.has(key)) {
            return this._inFlight.get(key);
        }

        // Create a new resolution promise and store it in _inFlight.
        const p = this._doResolve(name, range);
        this._inFlight.set(key, p);

        try {
            await p;
            this._resolvedCount++;
            this._onProgress?.(this._resolvedCount, this._totalToResolve);
            return p;
        } finally {
            // No longer in flight once the promise settles.
            this._inFlight.delete(key);
        }
    }

    /**
     * Internal resolution logic for a single package and range.
     * 
     * @param {string} name - The name of the package as declared in dependencies
     * @param {string} range - The semver range or npm:alias
     * @protected
     */
    async _doResolve(name, range) {
        // Handle npm: alias protocol (e.g., "wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0")
        let targetName = name;
        let targetRange = range === '' || range === '*' || range === 'latest' ? 'latest' : range;

        if (targetRange.startsWith('npm:')) {
            const parts = targetRange.slice(4).split('@');
            // Handle scoped packages in alias: npm:@scope/pkg@range
            if (targetRange.slice(4).startsWith('@')) {
                targetName = '@' + parts[1];
                targetRange = parts[2] || 'latest';
            } else {
                targetName = parts[0];
                targetRange = parts[1] || 'latest';
            }
        }

        try {
            // 1. Fetch available versions for the target package
            const versions = await registry.getVersions(targetName);

            // 2. Select the best matching version candidates
            const chosen = targetRange === 'latest'
                ? await registry.getLatest(targetName)
                : semver.maxSatisfying(versions, targetRange);

            if (!chosen) {
                throw new Error(`No version of ${targetName} satisfies "${targetRange}". Available: ${versions.slice(-5).join(', ')}`);
            }

            // The resolved key uses the original dependency name to allow multiple aliases of the same package
            const resolvedKey = `${name}@${chosen}`;

            // Check if already resolved to avoid redundant work
            if (this._resolved.has(resolvedKey)) return;

            // Detect circular dependencies on the current resolution path
            if (this._stack.includes(resolvedKey)) return;

            // 3. Retrieve exhaustive version metadata
            const meta = await registry.getVersion(targetName, chosen);

            // 4. Map metadata to internal representation
            const metaToStore = {
                name: targetName, // The actual package name for installation
                alias: name !== targetName ? name : undefined, // Alias used in package.json
                version: chosen,
                resolved: meta.dist?.tarball,
                integrity: meta.dist?.integrity || meta.dist?.shasum,
                shasum: meta.dist?.shasum,
                deps: meta.dependencies || {},
                devDeps: meta.devDependencies || {},
                peerDeps: meta.peerDependencies || {},
                optDeps: meta.optionalDependencies || {},
                engines: meta.engines || {},
                bin: meta.bin || {},
                scripts: meta.scripts || {},
            };
            this._resolved.set(resolvedKey, metaToStore);

            // 5. Recursively resolve transitive dependencies
            this._stack.push(resolvedKey);

            // Combine normal and optional dependencies for resolution
            const dependencies = {
                ...metaToStore.deps,
                ...metaToStore.optDeps
            };

            await Promise.all(
                Object.entries(dependencies).map(async ([depName, depRange]) => {
                    // Check if it's an optional dependency and if it's compatible with current system
                    if (metaToStore.optDeps[depName]) {
                        try {
                            // We need the packument to see the OS/CPU of the potential version
                            // Actually, a better way is to resolve it first, then check compatibility
                            // before resolving its own transitive dependencies.
                            // But to be even faster, we can check the packument's version metadata.
                            const packument = await registry.getPackument(depName);
                            const version = semver.maxSatisfying(Object.keys(packument.versions || {}), depRange);
                            if (version) {
                                const depMeta = packument.versions[version];
                                if (depMeta && !system.isCompatible(depMeta)) {
                                    logger.debug(`Skipping optional dependency ${depName}@${version}: incompatible platform`);
                                    return;
                                }
                            }
                        } catch (e) {
                            // If packument fetch fails, we'll let _resolveOne handle it normally
                        }
                    }
                    return this._resolveOne(depName, depRange);
                })
            );
            this._stack.pop();

        } catch (err) {
            logger.error(`Failed to resolve ${name}@${range}: ${err.message}`);
            throw err;
        }
    }

    // ── Analysis helpers ────────────────────────────────────────────────────────

    /**
     * Identifies package name collisions and suggests resolution to the highest version.
     * 
     * @returns {Object[]} List of duplicate packages and their versions
     */
    deduplicate() {
        const byName = new Map();
        for (const [key, meta] of this._resolved) {
            if (!byName.has(meta.name)) byName.set(meta.name, []);
            byName.get(meta.name).push(meta);
        }
        const dupes = [];
        for (const [name, metas] of byName) {
            if (metas.length > 1) {
                dupes.push({ name, versions: metas.map(m => m.version) });
            }
        }
        return dupes;
    }

    /**
     * Traverses the resolved dependency graph to identify circular references.
     * 
     * @returns {string[]} An array of strings describing the detected cycles (e.g., "A → B → A")
     */
    findCircular() {
        const cycles = [];
        const visited = new Set();
        const path = [];

        const dfs = (key) => {
            if (path.includes(key)) {
                const cycle = path.slice(path.indexOf(key));
                cycles.push(cycle.join(' → ') + ' → ' + key);
                return;
            }
            if (visited.has(key)) return;
            visited.add(key);
            path.push(key);

            const meta = this._resolved.get(key);
            if (meta) {
                // We must match dependency ranges to their ACTUAL resolved versions in this._resolved
                for (const [depName, depRange] of Object.entries(meta.deps)) {
                    // Find the version of depName that was actually resolved
                    for (const [resKey, resMeta] of this._resolved) {
                        if (resMeta.name === depName && semver.satisfies(resMeta.version, depRange)) {
                            dfs(resKey);
                        }
                    }
                }
            }
            path.pop();
        };

        for (const [key] of this._resolved) dfs(key);
        return [...new Set(cycles)];
    }

    /**
     * Returns the complete flat map of resolved dependency metadata.
     * @type {Map<string, Object>}
     */
    get resolved() { return this._resolved; }
}

module.exports = Resolver;
