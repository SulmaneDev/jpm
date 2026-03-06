'use strict';

const registry = require('./registry');
const semver = require('../utils/semver');
const system = require('../utils/system');
const logger = require('../utils/logger');

/**
 * Resolves a full dependency tree given a root package configuration.
 *
 * This class handles recursive dependency resolution, version satisfaction,
 * aliasing (npm: protocol), circular dependency detection, and deduplication.
 * 
 * Performance is optimized using parallel resolution and an in-flight request tracker
 * to prevent redundant registry queries for the same package/range pair.
 */
class Resolver {
    /**
     * Creates an instance of the Resolver.
     * Initializes internal state for resolution tracking.
     */
    constructor() {
        /** 
         * Map of "name@version" to resolved package metadata.
         * @type {Map<string, Object>} 
         * @private
         */
        this._resolved = new Map();

        /** 
         * Map of "name@range" to active resolution promises to prevent redundant work.
         * @type {Map<string, Promise>} 
         * @private
         */
        this._inFlight = new Map();

        /** 
         * Stack of resolved keys ("name@version") being processed in the current recursion path.
         * Used for circular dependency detection.
         * @type {string[]} 
         * @private
         */
        this._stack = [];

        /** @type {number} */
        this._totalToResolve = 0;
        /** @type {number} */
        this._resolvedCount = 0;
    }

    /**
     * Resolves a set of dependencies recursively.
     * 
     * @param {Object.<string, string>} [deps={}] - Production dependencies
     * @param {Object.<string, string>} [devDeps={}] - Development dependencies
     * @param {Object.<string, string>} [peerDeps={}] - Peer dependencies
     * @param {Function} [onProgress] - Optional progress callback (current, total)
     * @returns {Promise<Map<string, Object>>} A promise that resolves to the flat map of resolved packages
     * @example
     * const resolver = new Resolver();
     * const resolved = await resolver.resolve({ express: '^4.17.1' });
     */
    async resolve(deps = {}, devDeps = {}, peerDeps = {}, onProgress) {
        const all = { ...deps, ...devDeps, ...peerDeps };
        this._totalToResolve = Object.keys(all).length;
        this._resolvedCount = 0;
        this._onProgress = onProgress;

        await Promise.all(
            Object.entries(all).map(([name, range]) => this._resolveOne(name, range))
        );
        return this._resolved;
    }

    /**
     * Initiates or joins an existing resolution for a single package and range.
     * 
     * @param {string} name - Package name
     * @param {string} range - Semver range or alias
     * @returns {Promise<void>}
     * @private
     */
    async _resolveOne(name, range) {
        const key = `${name}@${range}`;

        if (this._inFlight.has(key)) {
            return this._inFlight.get(key);
        }

        const p = this._doResolve(name, range);
        this._inFlight.set(key, p);

        try {
            await p;
            this._resolvedCount++;
            this._onProgress?.(this._resolvedCount, this._totalToResolve);
            return p;
        } finally {
            this._inFlight.delete(key);
        }
    }

    /**
     * Internal resolution logic for a single package and range.
     * Handles npm aliases and recursive resolution of transitive dependencies.
     * 
     * @param {string} name - The name as declared in dependencies
     * @param {string} range - The semver range or npm:alias
     * @returns {Promise<void>}
     * @protected
     */
    async _doResolve(name, range) {
        let targetName = name;
        let targetRange = range === '' || range === '*' || range === 'latest' ? 'latest' : range;

        // Handle npm: alias protocol (e.g., "pkg": "npm:real-pkg@^1.0.0")
        if (targetRange.startsWith('npm:')) {
            const parts = targetRange.slice(4).split('@');
            if (targetRange.slice(4).startsWith('@')) {
                // Scoped alias: npm:@scope/pkg@range
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

            const resolvedKey = `${name}@${chosen}`;

            // Check if already resolved globally or in current path
            if (this._resolved.has(resolvedKey)) return;
            if (this._stack.includes(resolvedKey)) return;

            // 3. Retrieve exhaustive version metadata
            const meta = await registry.getVersion(targetName, chosen);

            // 4. Map metadata to internal representation
            const metaToStore = {
                name: targetName,
                alias: name !== targetName ? name : undefined,
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

            const dependencies = {
                ...metaToStore.deps,
                ...metaToStore.optDeps
            };

            await Promise.all(
                Object.entries(dependencies).map(async ([depName, depRange]) => {
                    // Pre-check for optional dependency compatibility
                    if (metaToStore.optDeps[depName]) {
                        try {
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
                            // If check fails, fall through to normal resolution
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

    /**
     * Identifies package name collisions and returns a summary.
     * Used for post-resolution analysis and potential hoisting.
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
     * Performs a Depth-First Search on the resolved graph to detect cycles.
     * 
     * @returns {string[]} An array of strings describing detected cycles (e.g., "A → B → A")
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
                for (const [depName, depRange] of Object.entries(meta.deps)) {
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

