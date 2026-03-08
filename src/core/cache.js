'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../utils/config');
const { mkdirp, rimraf } = require('../utils/fs');
const logger = require('../utils/logger');

/**
 * Cache class handles persistent disk caching of package tarballs and metadata.
 * Packages are stored at `<cacheDir>/<name>/<version>.tgz`.
 * Scoped packages handle '@' by replacing '/' with '__SCOPE__'.
 */
class Cache {
    /**
     * Creates an instance of the Cache.
     * @param {Object} [options={}] - Configuration options for the cache
     */
    constructor(options = {}) {
        this._config = options.config || config;
    }

    /**
     * Returns the root directory for the cache.
     * @returns {string} Absolute path to the cache directory
     */
    get cacheRoot() {
        return this._config.cacheDir;
    }

    /**
     * Resolves the absolute path for a package tarball in the cache.
     * 
     * @param {string} name - The package name
     * @param {string} version - The package version
     * @returns {string} Absolute path to the .tgz file
     * @private
     */
    _tgzPath(name, version) {
        const safeName = name.replace('/', '__SCOPE__');
        return path.join(this.cacheRoot, safeName, `${version}.tgz`);
    }

    /**
     * Resolves the absolute path for a package metadata JSON in the cache.
     * 
     * @param {string} name - The package name
     * @param {string} version - The package version
     * @returns {string} Absolute path to the .json file
     * @private
     */
    _metaPath(name, version) {
        const safeName = name.replace('/', '__SCOPE__');
        return path.join(this.cacheRoot, safeName, `${version}.json`);
    }

    /**
     * Initializes a SQLite database for metadata caching if running in Bun.
     * 
     * @returns {Object|null} The SQLite database instance or null
     * @private
     */
    _getSQLite() {
        if (typeof Bun === 'undefined') return null;
        if (this._db) return this._db;

        try {
            const { Database } = require('bun:sqlite');
            const dbPath = path.join(this.cacheRoot, 'cache.sqlite');
            mkdirp(this.cacheRoot);
            this._db = new Database(dbPath);
            this._db.run('CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, data TEXT)');
            return this._db;
        } catch (e) {
            return null;
        }
    }

    /**
     * Retrieves a package tarball from the cache if it exists.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {Promise<string|null>} Path to the cached tarball, or null if not found
     */
    async get(name, version) {
        const p = this._tgzPath(name, version);
        if (fs.existsSync(p)) {
            logger.verbose(`cache hit ${name}@${version}`);
            return p;
        }
        return null;
    }

    /**
     * Stores a package tarball in the cache.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @param {string} srcTgz - Path to the source tarball to be copied
     * @returns {Promise<void>}
     */
    async set(name, version, srcTgz) {
        const dest = this._tgzPath(name, version);
        mkdirp(path.dirname(dest));
        fs.copyFileSync(srcTgz, dest);
        logger.verbose(`cache store ${name}@${version}`);
    }

    /**
     * Stores package metadata in the cache.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @param {Object} meta - Metadata object to be serialized
     * @returns {Promise<void>}
     */
    async setMeta(name, version, meta) {
        const db = this._getSQLite();
        if (db) {
            try {
                db.run('INSERT OR REPLACE INTO metadata (id, data) VALUES (?, ?)', [`${name}@${version}`, JSON.stringify(meta)]);
            } catch (e) { /* fallback */ }
        }

        const p = this._metaPath(name, version);
        mkdirp(path.dirname(p));
        fs.writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8');
    }

    /**
     * Retrieves package metadata from the cache.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {Promise<Object|null>} Decoded metadata object, or null if not found/invalid
     */
    async getMeta(name, version) {
        const db = this._getSQLite();
        if (db) {
            try {
                const row = db.query('SELECT data FROM metadata WHERE id = ?').get(`${name}@${version}`);
                if (row) return JSON.parse(row.data);
            } catch (e) { /* fallback */ }
        }

        const p = this._metaPath(name, version);
        try {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
            return null;
        }
    }

    /**
     * Checks if a package version exists in the cache.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {boolean} True if the tarball exists in cache
     */
    has(name, version) {
        return fs.existsSync(this._tgzPath(name, version));
    }

    /**
     * Clears specific items or the entire cache.
     * 
     * @param {string} [name] - Optional package name to clear
     * @param {string} [version] - Optional version to clear (requires name)
     */
    clear(name, version) {
        if (name && version) {
            rimraf(this._tgzPath(name, version));
            rimraf(this._metaPath(name, version));
        } else if (name) {
            const safeName = name.replace('/', '__SCOPE__');
            rimraf(path.join(this.cacheRoot, safeName));
        } else {
            // Clear entire cache
            rimraf(this.cacheRoot);
            logger.success('Cache cleared');
        }
    }

    /**
     * Calculates cache statistics (total packages and disk usage).
     * 
     * @returns {Object} { packages: number, size: number, root: string }
     */
    stats() {
        const root = this.cacheRoot;
        if (!fs.existsSync(root)) return { packages: 0, size: 0, root };

        let packages = 0;
        let size = 0;

        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else {
                    const s = fs.statSync(full);
                    size += s.size;
                    if (entry.name.endsWith('.tgz')) packages++;
                }
            }
        };

        try {
            walk(root);
        } catch { }
        return { packages, size, root };
    }

    /**
     * Lists all packages and versions currently in the cache.
     * 
     * @returns {{ name: string, version: string }[]} Array of package descriptors
     */
    list() {
        const root = this.cacheRoot;
        if (!fs.existsSync(root)) return [];
        const result = [];
        for (const scopeOrName of fs.readdirSync(root)) {
            const dir = path.join(root, scopeOrName);
            if (!fs.statSync(dir).isDirectory()) continue;
            for (const file of fs.readdirSync(dir)) {
                if (file.endsWith('.tgz')) {
                    const version = file.replace('.tgz', '');
                    const name = scopeOrName.replace('__SCOPE__', '/');
                    result.push({ name, version });
                }
            }
        }
        return result;
    }
}

// Singleton instance for backward compatibility
const defaultCache = new Cache();

module.exports = {
    Cache,
    get: defaultCache.get.bind(defaultCache),
    set: defaultCache.set.bind(defaultCache),
    getMeta: defaultCache.getMeta.bind(defaultCache),
    setMeta: defaultCache.setMeta.bind(defaultCache),
    has: defaultCache.has.bind(defaultCache),
    clear: defaultCache.clear.bind(defaultCache),
    stats: defaultCache.stats.bind(defaultCache),
    list: defaultCache.list.bind(defaultCache),
};

