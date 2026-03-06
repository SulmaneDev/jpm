'use strict';

const { getJSON, download } = require('../utils/http');
const config = require('../utils/config');
const logger = require('../utils/logger');
const LRUCache = require('../utils/lru-cache');

/**
 * Registry class handles all interactions with the npm registry.
 * It provides methods for fetching package metadata, versions, and downloading tarballs.
 * Optimized with an in-memory LRU cache for resolution speed.
 */
class Registry {
    /**
     * Creates an instance of the Registry.
     * @param {Object} [options={}] - Configuration options for the registry
     */
    constructor(options = {}) {
        this._config = options.config || config;
        /**
         * In-memory metadata cache for registry requests.
         * @type {LRUCache}
         * @private
         */
        this._metaCache = new LRUCache(1000);
    }

    /**
     * Gets the base registry URL from configuration.
     * @returns {string} The registry URL without trailing slash
     * @private
     */
    _getRegistryUrl() {
        return this._config.registry.replace(/\/$/, '');
    }

    /**
     * Fetches the full packument for a package from the registry.
     * Includes an internal LRU cache to speed up subsequent requests.
     * 
     * @param {string} name - The canonical name of the package (e.g., 'express' or '@types/node')
     * @returns {Promise<Object>} The packument object containing version history and tags
     * @example
     * const packument = await registry.getPackument('lodash');
     */
    async getPackument(name) {
        const url = `${this._getRegistryUrl()}/${encodeURIComponent(name).replace('%40', '@')}`;
        if (this._metaCache.has(url)) return this._metaCache.get(url);

        logger.verbose(`registry GET ${url}`);
        const doc = await getJSON(url, {
            headers: { Accept: 'application/vnd.npm.install-v1+json, application/json' },
            timeout: this._config.timeout,
            retries: this._config.retries,
        });
        this._metaCache.set(url, doc);
        return doc;
    }

    /**
     * Fetches specific version metadata for a package.
     * 
     * @param {string} name - The package name
     * @param {string} version - Specific version (e.g., '1.0.0') or dist-tag (e.g., 'latest')
     * @returns {Promise<Object>} The version manifest containing dependencies and dist info
     * @throws {Error} If the requested version is unavailable in the registry
     * @example
     * const versionData = await registry.getVersion('express', '4.17.1');
     */
    async getVersion(name, version) {
        const packument = await this.getPackument(name);
        const ver = version === 'latest'
            ? packument['dist-tags']?.latest
            : version;

        const data = packument.versions?.[ver];
        if (!data) throw new Error(`Version ${name}@${ver} not found in registry`);
        return data;
    }

    /**
     * Retrieves all available version strings for a package.
     * 
     * @param {string} name - The package name
     * @returns {Promise<string[]>} Array of version strings sorted by publication time (if provided by registry)
     */
    async getVersions(name) {
        const packument = await this.getPackument(name);
        return Object.keys(packument.versions || {});
    }

    /**
     * Retrieves the version string flagged as 'latest' in the registry.
     * 
     * @param {string} name - The package name
     * @returns {Promise<string|undefined>} The latest version string
     */
    async getLatest(name) {
        const packument = await this.getPackument(name);
        return packument['dist-tags']?.latest;
    }

    /**
     * Retrieves all distribution tags associated with a package.
     * 
     * @param {string} name - The package name
     * @returns {Promise<Object.<string, string>>} Map of tags to versions (e.g., { latest: '1.0.0', beta: '1.1.0-beta.1' })
     */
    async getDistTags(name) {
        const packument = await this.getPackument(name);
        return packument['dist-tags'] || {};
    }

    /**
     * Downloads a package tarball and writes it to a destination stream.
     * 
     * @param {string} tarballUrl - Fully qualified URL to the tarball (usually from version metadata)
     * @param {import('node:stream').Writable} destStream - Target writable stream (e.g., fs.createWriteStream)
     * @param {Function} [onProgress] - Optional heartbeat for download progress (receivedBytes, totalBytes)
     * @returns {Promise<void>}
     */
    async downloadTarball(tarballUrl, destStream, onProgress) {
        logger.verbose(`tarball GET ${tarballUrl}`);
        return download(tarballUrl, destStream, {
            timeout: this._config.timeout * 2,
            retries: this._config.retries,
            onProgress,
        });
    }

    /**
     * Executes a full-text search against the npm registry.
     * 
     * @param {string} query - Search term
     * @param {Object} [options] - Pagination options
     * @param {number} [options.size=20] - Number of results to return per page
     * @param {number} [options.from=0] - Offset for results
     * @returns {Promise<Object[]>} List of search result objects containing package info and scores
     */
    async search(query, { size = 20, from = 0 } = {}) {
        const url = `${this._getRegistryUrl()}/-/v1/search?text=${encodeURIComponent(query)}&size=${size}&from=${from}`;
        const doc = await getJSON(url, { timeout: this._config.timeout });
        return doc.objects || [];
    }

    /**
     * Queries the registry for known security vulnerabilities.
     * Uses the npm quick audit endpoint for efficiency.
     * 
     * @param {Object.<string, string[]>} requires - Map of package names to lists of required versions
     * @returns {Promise<Object>} Audit report containing vulnerabilities, advisories, and metadata
     */
    async fetchAdvisories(requires) {
        const url = `https://registry.npmjs.org/-/npm/v1/security/audits/quick`;
        const packages = {};
        for (const [name, versions] of Object.entries(requires)) {
            packages[name] = versions;
        }

        const { request } = require('../utils/http');
        const body = JSON.stringify({
            name: 'audit-target',
            version: '1.0.0',
            requires: Object.fromEntries(
                Object.entries(requires).map(([n, vs]) => [n, vs[0] || '*'])
            ),
            dependencies: packages,
        });

        const res = await request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            body,
            timeout: 30_000,
            retries: 2,
            strict: true, // Security: Always use HTTPS for audits
        });

        try {
            return JSON.parse(res.body);
        } catch {
            return { advisories: {}, metadata: {} };
        }
    }
}

// Singleton instance for backward compatibility
const defaultRegistry = new Registry();

// Export the class and the singleton members to maintain backward compatibility
module.exports = {
    Registry,
    getPackument: defaultRegistry.getPackument.bind(defaultRegistry),
    getVersion: defaultRegistry.getVersion.bind(defaultRegistry),
    getVersions: defaultRegistry.getVersions.bind(defaultRegistry),
    getLatest: defaultRegistry.getLatest.bind(defaultRegistry),
    getDistTags: defaultRegistry.getDistTags.bind(defaultRegistry),
    downloadTarball: defaultRegistry.downloadTarball.bind(defaultRegistry),
    search: defaultRegistry.search.bind(defaultRegistry),
    fetchAdvisories: defaultRegistry.fetchAdvisories.bind(defaultRegistry),
};

