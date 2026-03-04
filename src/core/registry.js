'use strict';

const { getJSON, download } = require('../utils/http');
const config = require('../utils/config');
const logger = require('../utils/logger');

const REGISTRY = () => config.registry.replace(/\/$/, '');

const LRUCache = require('../utils/lru-cache');
const env = require('../utils/env');

/**
 * In-memory metadata cache for registry requests, optimized for resolution speed.
 * @type {LRUCache}
 * @private
 */
const metaCache = new LRUCache(1000);

/**
 * Fetches the full packument for a package from the registry.
 * 
 * @param {string} name - The canonical name of the package
 * @returns {Promise<Object>} The packument object containing version history and tags
 */
async function getPackument(name) {
    const url = `${REGISTRY()}/${encodeURIComponent(name).replace('%40', '@')}`;
    if (metaCache.has(url)) return metaCache.get(url);

    logger.verbose(`registry GET ${url}`);
    const doc = await getJSON(url, {
        headers: { Accept: 'application/vnd.npm.install-v1+json, application/json' },
        timeout: config.timeout,
        retries: config.retries,
    });
    metaCache.set(url, doc);
    return doc;
}

/**
 * Fetches specific version metadata for a package.
 * 
 * @param {string} name - The package name
 * @param {string} version - Specific version or dist-tag (e.g., 'latest')
 * @returns {Promise<Object>} The version manifest
 * @throws {Error} If the requested version is unavailable in the registry
 */
async function getVersion(name, version) {
    const packument = await getPackument(name);
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
 * @returns {Promise<string[]>} Array of version strings
 */
async function getVersions(name) {
    const packument = await getPackument(name);
    return Object.keys(packument.versions || {});
}

/**
 * Retrieves the version string flagged as 'latest' in the registry.
 * 
 * @param {string} name - The package name
 * @returns {Promise<string|undefined>} The latest version string
 */
async function getLatest(name) {
    const packument = await getPackument(name);
    return packument['dist-tags']?.latest;
}

/**
 * Retrieves all distribution tags associated with a package.
 * 
 * @param {string} name - The package name
 * @returns {Promise<Object.<string, string>>} Map of tags to versions
 */
async function getDistTags(name) {
    const packument = await getPackument(name);
    return packument['dist-tags'] || {};
}

/**
 * Downloads a package tarball and writes it to a destination stream.
 * 
 * @param {string} tarballUrl - Fully qualified URL to the tarball
 * @param {import('node:stream').Writable} destStream - Target writable stream
 * @param {Function} [onProgress] - Optional heartbeat for download progress
 * @returns {Promise<void>}
 */
async function downloadTarball(tarballUrl, destStream, onProgress) {
    logger.verbose(`tarball GET ${tarballUrl}`);
    return download(tarballUrl, destStream, {
        timeout: config.timeout * 2,
        retries: config.retries,
        onProgress,
    });
}

/**
 * Executes a full-text search against the npm registry.
 * 
 * @param {string} query - Search term
 * @param {Object} [options] - Pagination options
 * @param {number} [options.size=20] - Number of results to return
 * @param {number} [options.from=0] - Offset for results
 * @returns {Promise<Object[]>} List of search result objects
 */
async function search(query, { size = 20, from = 0 } = {}) {
    const url = `${REGISTRY()}/-/v1/search?text=${encodeURIComponent(query)}&size=${size}&from=${from}`;
    const doc = await getJSON(url, { timeout: config.timeout });
    return doc.objects || [];
}

/**
 * Queries the registry for known security vulnerabilities.
 * 
 * @param {Object.<string, string[]>} requires - Map of package names to lists of required versions
 * @returns {Promise<Object>} Audit report containing vulnerabilities and metadata
 */
async function fetchAdvisories(requires) {
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

    try { return JSON.parse(res.body); }
    catch { return { advisories: {}, metadata: {} }; }
}

module.exports = {
    getPackument, getVersion, getVersions,
    getLatest, getDistTags,
    downloadTarball, search, fetchAdvisories,
};
