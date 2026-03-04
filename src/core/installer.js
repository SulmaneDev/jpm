'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tar = require('tar');
const registry = require('./registry');
const cache = require('./cache');
const { mkdirp, rimraf, tempDir, symlink } = require('../utils/fs');
const { MultiBar, Spinner } = require('../utils/progress');
const logger = require('../utils/logger');

const SUSPICIOUS_PATTERNS = [
    /curl\s+.*?http/i,
    /wget\s+.*?http/i,
    /rm\s+-rf\s+\//,
    /sh\s+-c\s+.*?http/i,
    /python.*?import\s+socket/i,
];

const integrity = require('../security/integrity');

const CONCURRENCY = 6;

/**
 * Handles the actual filesystem installation of resolved packages.
 */
class Installer {
    /**
     * Creates an instance of the Installer.
     * 
     * @param {string} projectRoot - The absolute path to the project root directory
     */
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.nodeModules = path.join(projectRoot, 'node_modules');
        this._multibar = new MultiBar();
        this._flags = {};
    }

    /**
     * Installs all packages specified in a resolved dependency map.
     * 
     * @param {Map<string, object>} resolvedMap - The output of Resolver.resolve()
     * @param {object} [options={}] - Installation options
     * @param {boolean} [options.dev=false] - Whether to include devDependencies
     * @param {boolean} [options.production=false] - Whether to skip devDependencies
     * @param {boolean} [options.dryRun=false] - If true, only print what would be installed
     * @param {object} [options.flags={}] - CLI flags
     * @returns {Promise<void>}
     */
    async installAll(resolvedMap, options = {}) {
        this._flags = options.flags || {};
        if (options.dryRun) {
            logger.info('[dry-run] Would install:');
            for (const [key] of resolvedMap) logger.log(`  + ${key}`);
            return;
        }

        mkdirp(this.nodeModules);

        const packages = [...resolvedMap.values()];
        this._installedInRun = []; // Track for rollback

        try {
            if (this._flags.fast) {
                logger.warn('BLIND INSTALL: Skipping all extraction and integrity checks.');
                await this._linkBins(packages);
                return;
            }

            await this._installBatch(packages);
            await this._linkBins(packages);
        } catch (err) {
            logger.error('Installation failed. Rolling back partial changes...');
            for (const name of this._installedInRun) {
                await this.uninstall(name);
            }
            throw err;
        }

        this._multibar.stop();
    }

    /**
     * Installs packages in parallel batches to optimize network and disk I/O.
     * 
     * @param {Object[]} packages - Array of package metadata objects to install
     * @protected
     */
    async _installBatch(packages) {
        const queue = [...packages];
        const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const p = queue.shift();
                if (p) await this._installOne(p);
            }
        });
        await Promise.all(workers);
    }

    /**
     * Installs a single package into the node_modules directory.
     * Handles caching, downloading, integrity verification, and extraction.
     * 
     * @param {Object} meta - The resolved metadata for the package
     * @protected
     */
    async _installOne(meta) {
        const { name, version, resolved, integrity: integrityHash, shasum } = meta;
        const installName = meta.alias || name;
        const destDir = this._destDir(installName);

        // Check if already installed (Incremental Install)
        if (this._isInstalled(installName, version)) {
            logger.verbose(`skip ${installName}@${version} (already installed)`);
            return;
        }

        // Check local cache for the tarball
        const cached = await cache.get(name, version);
        if (cached) {
            logger.verbose(`cache hit ${installName}@${version}`);
            await this._extract(cached, destDir, installName, version);
            return;
        }

        if (!resolved) {
            logger.warn(`No tarball URL for ${installName}@${version}, skipping.`);
            return;
        }

        // Download to a temporary location
        const tmp = tempDir('jpm-dl-');
        const tgz = path.join(tmp, `${installName.replace('/', '-')}-${version}.tgz`);
        const dest = fs.createWriteStream(tgz);

        const barKey = `${installName}@${version}`;
        this._multibar.add(barKey, 100);

        try {
            await registry.downloadTarball(resolved, dest, (received, total) => {
                if (total) this._multibar.update(barKey, Math.round((received / total) * 100));
            });
            this._multibar.update(barKey, 100);
            this._multibar.remove(barKey);
        } catch (err) {
            this._multibar.remove(barKey);
            rimraf(tmp);
            throw new Error(`Failed to download ${installName}@${version}: ${err.message}`);
        }

        // Verify cryptographic integrity
        const ok = await integrity.verify(tgz, integrityHash, shasum);
        if (!ok) {
            rimraf(tmp);
            throw new Error(`Integrity check failed for ${installName}@${version}`);
        }

        // Update local cache
        await cache.set(name, version, tgz);

        // Extract contents to node_modules
        this._checkScripts(installName, version, meta);
        await this._extract(tgz, destDir, installName, version);
        rimraf(tmp);

        this._installedInRun.push(installName);
        logger.verbose(`installed ${installName}@${version}`);
    }

    /**
     * Extracts a tarball to the destination directory.
     * 
     * @param {string} tgzPath - Path to the tarball file
     * @param {string} destDir - Target directory for extraction
     * @param {string} name - Package name for logging
     * @param {string} version - Package version for logging
     * @protected
     */
    async _extract(tgzPath, destDir, name, version) {
        rimraf(destDir);
        mkdirp(destDir);

        const absoluteDest = path.resolve(destDir);

        await tar.extract({
            file: tgzPath,
            cwd: destDir,
            strip: 1,
            filter: (p, stat) => {
                const fullPath = path.resolve(destDir, p);
                if (!fullPath.startsWith(absoluteDest)) {
                    logger.error(`Zip Slip security violation blocked: ${p} in ${name}@${version}`);
                    return false;
                }
                return true;
            }
        });
    }

    /**
     * Resolves the absolute path for a package in node_modules, handling scopes.
     * 
     * @param {string} name - The package name
     * @returns {string} Absolute path to the package directory
     * @protected
     */
    _destDir(name) {
        if (name.startsWith('@')) {
            const [scope, pkg] = name.split('/');
            return path.join(this.nodeModules, scope, pkg);
        }
        return path.join(this.nodeModules, name);
    }

    /**
     * Scans package scripts for known malicious or suspicious execution patterns.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @param {Object} meta - Package metadata containing scripts
     * @returns {boolean} True if suspicious patterns were detected
     * @protected
     */
    _checkScripts(name, version, meta) {
        const scripts = meta.scripts || {};
        for (const [id, cmd] of Object.entries(scripts)) {
            if (['preinstall', 'postinstall', 'install'].includes(id)) {
                for (const pattern of SUSPICIOUS_PATTERNS) {
                    if (pattern.test(cmd)) {
                        logger.warn(`SUSPICIOUS SCRIPT detected in ${name}@${version}: "${id}": "${cmd}"`);
                        logger.warn('Exercise caution when installing this package.');
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Verifies if a specific version of a package is already present in node_modules.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version to verify
     * @returns {boolean} True if the exact version is installed
     * @protected
     */
    _isInstalled(name, version) {
        const pkgJson = path.join(this._destDir(name), 'package.json');
        if (!fs.existsSync(pkgJson)) return false;
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
            return pkg.version === version;
        } catch { return false; }
    }

    /**
     * Creates symbolic links for binary executables defined in package metadata.
     * 
     * @param {Object[]} packages - Array of resolved package metadata
     * @protected
     */
    async _linkBins(packages) {
        const binDir = path.join(this.nodeModules, '.bin');
        mkdirp(binDir);

        for (const meta of packages) {
            const { name, bin } = meta;
            const installName = meta.alias || name;
            if (!bin || typeof bin !== 'object') continue;
            for (const [binName, binPath] of Object.entries(bin)) {
                const src = path.join(this._destDir(installName), binPath);
                const dest = path.join(binDir, binName);

                // Security: Ensure binary source is within the package directory
                const resolvedSrc = path.resolve(src);
                const packageDir = path.resolve(this._destDir(installName));
                if (!resolvedSrc.startsWith(packageDir)) {
                    logger.warn(`Insecure binary path blocked for ${installName}: ${binPath}`);
                    continue;
                }

                try {
                    symlink(src, dest);
                    fs.chmodSync(src, 0o755);
                } catch { }
            }
        }
    }

    /**
     * Remove a single package from node_modules
     */
    async uninstall(name) {
        const destDir = this._destDir(name);
        if (!fs.existsSync(destDir)) return false;
        rimraf(destDir);

        // Remove bin links
        const binDir = path.join(this.nodeModules, '.bin');
        if (fs.existsSync(binDir)) {
            for (const entry of fs.readdirSync(binDir)) {
                const linkPath = path.join(binDir, entry);
                try {
                    const target = fs.readlinkSync(linkPath);
                    if (target.includes(path.sep + name + path.sep)) fs.unlinkSync(linkPath);
                } catch { }
            }
        }
        return true;
    }
}

module.exports = Installer;
