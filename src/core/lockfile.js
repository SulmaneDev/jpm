'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSONSafe, writeJSON } = require('../utils/fs');
const { hashString } = require('../security/integrity');

const LOCK_VERSION = 1;
const LOCK_FILE = 'jpm-lock.json';

/**
 * Manages the jpm-lock.json file for deterministic installations.
 * The lockfile stores exact versions and integrity hashes for all dependencies.
 */
class Lockfile {
    /**
     * Creates an instance of the Lockfile.
     * 
     * @param {string} projectRoot - The absolute path to the project root directory
     */
    constructor(projectRoot) {
        /** @type {string} */
        this.filePath = path.join(projectRoot, LOCK_FILE);
        /** @type {Object} */
        this._data = this._load();
    }

    /**
     * Loads the lockfile data from disk or returns a default structure.
     * 
     * @returns {Object} The lockfile data
     * @private
     */
    _load() {
        const data = readJSONSafe(this.filePath, null);
        if (!data) return { lockVersion: LOCK_VERSION, packages: {} };
        return data;
    }

    /**
     * Builds or updates the lockfile data from a resolved dependency map.
     * Sorts keys for consistent output.
     * 
     * @param {Map<string, Object>} resolvedMap - Map of resolved package metadata
     * @returns {this} The current instance for chaining
     */
    update(resolvedMap) {
        const packages = {};
        const keys = Array.from(resolvedMap.keys()).sort();
        for (const key of keys) {
            const meta = resolvedMap.get(key);
            packages[key] = {
                name: meta.name,
                version: meta.version,
                resolved: meta.resolved || '',
                integrity: meta.integrity || '',
                shasum: meta.shasum || '',
                dependencies: meta.deps || {},
                engines: meta.engines || {},
            };
        }

        const integrity = hashString(JSON.stringify(packages));
        this._data = {
            lockVersion: LOCK_VERSION,
            integrity,
            packages
        };
        return this;
    }

    /**
     * Verifies the cryptographic integrity of the lockfile packages.
     * 
     * @returns {boolean} True if the integrity hash matches the current package data
     */
    verify() {
        if (!this._data.integrity || !this._data.packages) return true;
        const actual = hashString(JSON.stringify(this._data.packages));
        return actual === this._data.integrity;
    }

    /**
     * Adds or updates a single package entry in the lockfile data.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @param {Object} meta - Package metadata
     * @returns {this} The current instance for chaining
     */
    setPackage(name, version, meta) {
        const key = `${name}@${version}`;
        this._data.packages[key] = {
            name,
            version,
            resolved: meta.resolved || '',
            integrity: meta.integrity || '',
            shasum: meta.shasum || '',
            dependencies: meta.dependencies || {},
        };
        return this;
    }

    /**
     * Removes a package entry from the lockfile data.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {this} The current instance for chaining
     */
    removePackage(name, version) {
        const key = `${name}@${version}`;
        delete this._data.packages[key];
        return this;
    }

    /**
     * Retrieves a specific package entry from the lockfile data.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {Object|null} The package entry or null if not found
     */
    getPackage(name, version) {
        return this._data.packages[`${name}@${version}`] || null;
    }

    /**
     * Checks if the lockfile contains a specific package version.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @returns {boolean} True if the package version exists
     */
    hasPackage(name, version) {
        return Boolean(this._data.packages[`${name}@${version}`]);
    }

    /**
     * Returns an array of all package entries stored in the lockfile.
     * 
     * @returns {Object[]} Array of package entry objects
     */
    allPackages() {
        return Object.values(this._data.packages);
    }

    /**
     * Writes the current lockfile data to disk.
     * 
     * @returns {this} The current instance for chaining
     */
    save() {
        writeJSON(this.filePath, this._data, 2);
        return this;
    }

    /**
     * Returns the raw lockfile data structure.
     * @type {Object}
     */
    get data() { return this._data; }

    /**
     * Checks if the lockfile exists on the filesystem.
     * 
     * @returns {boolean} True if the lockfile exists
     */
    exists() {
        return fs.existsSync(this.filePath);
    }
}

module.exports = Lockfile;

