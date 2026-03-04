'use strict';

const path = require('node:path');
const { readJSONSafe, writeJSON } = require('../utils/fs');
const { hashString } = require('../security/integrity');

const LOCK_VERSION = 1;
const LOCK_FILE = 'jpm-lock.json';

/**
 * jpm-lock.json structure:
 * {
 *   "lockVersion": 1,
 *   "packages": {
 *     "express@4.18.2": {
 *       "name": "express",
 *       "version": "4.18.2",
 *       "resolved": "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
 *       "integrity": "sha512-...",
 *       "dependencies": { "accepts": "^1.3.8", ... }
 *     },
 *     ...
 *   }
 * }
 */

class Lockfile {
    constructor(projectRoot) {
        this.filePath = path.join(projectRoot, LOCK_FILE);
        this._data = this._load();
    }

    _load() {
        const data = readJSONSafe(this.filePath, null);
        if (!data) return { lockVersion: LOCK_VERSION, packages: {} };
        return data;
    }

    /**
     * Build/update lock file from a resolved package map
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
     * Verifies if the lockfile has been tampered with.
     */
    verify() {
        if (!this._data.integrity || !this._data.packages) return true;
        const actual = hashString(JSON.stringify(this._data.packages));
        return actual === this._data.integrity;
    }

    /** Add or update a single package entry */
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

    /** Remove a package entry */
    removePackage(name, version) {
        const key = `${name}@${version}`;
        delete this._data.packages[key];
        return this;
    }

    /** Look up a specific package in the lock file */
    getPackage(name, version) {
        return this._data.packages[`${name}@${version}`] || null;
    }

    /** Check whether the lock file has a resolved entry for name@range */
    hasPackage(name, version) {
        return Boolean(this._data.packages[`${name}@${version}`]);
    }

    /** Return all locked packages as array */
    allPackages() {
        return Object.values(this._data.packages);
    }

    /** Write lock file to disk */
    save() {
        writeJSON(this.filePath, this._data, 2);
        return this;
    }

    /** Raw data */
    get data() { return this._data; }

    /** Whether a lock file exists */
    exists() {
        const fs = require('node:fs');
        return fs.existsSync(this.filePath);
    }
}

module.exports = Lockfile;
