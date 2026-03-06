'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSONSafe, writeJSON, findPackageJson } = require('../utils/fs');

const REQUIRED_FIELDS = ['name', 'version'];

/**
 * Represents a Node.js package.json file.
 * Provides methods for reading, validating, mutating, and persisting package metadata.
 */
class PackageJSON {
    /**
     * Creates an instance of the PackageJSON.
     * 
     * @param {string} filePath - Absolute path to the package.json file
     */
    constructor(filePath) {
        /** @type {string} */
        this.filePath = filePath;
        /** @type {Object} */
        this._data = this._load();
    }

    /**
     * Creates a PackageJSON instance from a directory path.
     * 
     * @param {string} dir - Directory containing the package.json
     * @returns {PackageJSON}
     */
    static fromDir(dir) {
        const f = path.join(dir, 'package.json');
        return new PackageJSON(f);
    }

    /**
     * Finds and loads the nearest package.json starting from a directory.
     * 
     * @param {string} [startDir=process.cwd()] - Directory to start the search from
     * @returns {PackageJSON}
     * @throws {Error} If no package.json is found in the directory tree
     */
    static find(startDir = process.cwd()) {
        const f = findPackageJson(startDir);
        if (!f) throw new Error('No package.json found in this directory or any parent.');
        return new PackageJSON(f);
    }

    /**
     * Loads the package.json data from disk.
     * 
     * @returns {Object} The package data or a default structure if not found
     * @private
     */
    _load() {
        const data = readJSONSafe(this.filePath, null);
        if (!data) return this._empty();
        return data;
    }

    /**
     * Returns a default package.json structure.
     * Used when creating a new package or when the file is missing/invalid.
     * 
     * @returns {Object}
     * @private
     */
    _empty() {
        return {
            name: path.basename(path.dirname(this.filePath || process.cwd())),
            version: '1.0.0',
            description: '',
            main: 'index.js',
            scripts: { test: 'echo "Error: no test specified" && exit 1' },
            keywords: [],
            author: '',
            license: 'MIT',
            dependencies: {},
            devDependencies: {},
        };
    }

    // ── Accessors ────────────────────────────────────────────────────────────────

    /** @type {string} */
    get name() { return this._data.name; }

    /** @type {string} */
    get version() { return this._data.version; }

    /** @type {Object.<string, string>} */
    get dependencies() { return this._data.dependencies || {}; }

    /** @type {Object.<string, string>} */
    get devDependencies() { return this._data.devDependencies || {}; }

    /** @type {Object.<string, string>} */
    get peerDependencies() { return this._data.peerDependencies || {}; }

    /** @type {Object.<string, string>} */
    get optionalDeps() { return this._data.optionalDependencies || {}; }

    /** @type {Object.<string, string>} */
    get scripts() { return this._data.scripts || {}; }

    /** @type {string[]} */
    get workspaces() { return this._data.workspaces || []; }

    /** @type {string} */
    get main() { return this._data.main || 'index.js'; }

    /** @type {Object.<string, string>} */
    get bin() { return this._data.bin || {}; }

    /** @type {Object.<string, string>} */
    get engines() { return this._data.engines || {}; }

    /** @type {Object} */
    get data() { return this._data; }

    /** @type {string} */
    get dir() { return path.dirname(this.filePath); }

    // ── Mutations ────────────────────────────────────────────────────────────────

    /**
     * Adds a dependency to the package.json.
     * 
     * @param {string} name - Package name
     * @param {string} version - Package version
     * @param {Object} [options={}] - Dependency options
     * @param {boolean} [options.dev=false] - Whether to add as a devDependency
     * @param {boolean} [options.exact=false] - Whether to use the exact version instead of a caret range
     * @returns {this} The current instance for chaining
     */
    addDependency(name, version, { dev = false, exact = false } = {}) {
        const range = exact ? version : `^${version}`;
        const key = dev ? 'devDependencies' : 'dependencies';
        if (!this._data[key]) this._data[key] = {};
        this._data[key][name] = range;
        return this;
    }

    /**
     * Removes a dependency from all dependency sections.
     * 
     * @param {string} name - Package name to remove
     * @returns {this} The current instance for chaining
     */
    removeDependency(name) {
        for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            if (this._data[key]) delete this._data[key][name];
        }
        return this;
    }

    /**
     * Sets a top-level field in the package.json.
     * 
     * @param {string} key - Field name
     * @param {*} value - Field value
     * @returns {this} The current instance for chaining
     */
    setField(key, value) {
        this._data[key] = value;
        return this;
    }

    /**
     * Sets the package version.
     * 
     * @param {string} version - New version string
     * @returns {this} The current instance for chaining
     */
    setVersion(version) {
        this._data.version = version;
        return this;
    }

    /**
     * Adds or updates a script in the scripts section.
     * 
     * @param {string} name - Script name
     * @param {string} command - Command to execute
     * @returns {this} The current instance for chaining
     */
    addScript(name, command) {
        if (!this._data.scripts) this._data.scripts = {};
        this._data.scripts[name] = command;
        return this;
    }

    // ── Validation ────────────────────────────────────────────────────────────────

    /**
     * Validates the internal package data against basic npm requirements.
     * 
     * @returns {string[]} Array of validation error messages
     */
    validate() {
        const errors = [];
        for (const field of REQUIRED_FIELDS) {
            if (!this._data[field]) errors.push(`Missing required field: "${field}"`);
        }
        if (this._data.name && !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(this._data.name)) {
            errors.push(`Invalid package name: "${this._data.name}"`);
        }
        if (this._data.version && !/^\d+\.\d+\.\d+/.test(this._data.version)) {
            errors.push(`Invalid version: "${this._data.version}"`);
        }
        return errors;
    }

    // ── Persistence ──────────────────────────────────────────────────────────────

    /**
     * Writes the current package data to disk.
     * 
     * @returns {this} The current instance for chaining
     */
    save() {
        writeJSON(this.filePath, this._data, 2);
        return this;
    }

    /**
     * Checks if the package.json file exists on the filesystem.
     * 
     * @returns {boolean}
     */
    exists() {
        return fs.existsSync(this.filePath);
    }

    /**
     * Returns a combined map of all dependencies (prod, dev, and optional).
     * 
     * @returns {Object.<string, string>}
     */
    allDeps() {
        return {
            ...this.dependencies,
            ...this.devDependencies,
            ...this.optionalDeps,
        };
    }
}

module.exports = PackageJSON;

