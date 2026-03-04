'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { readJSONSafe, writeJSON, findPackageJson } = require('../utils/fs');
const logger = require('../utils/logger');

const REQUIRED_FIELDS = ['name', 'version'];

class PackageJSON {
    constructor(filePath) {
        this.filePath = filePath;
        this._data = this._load();
    }

    static fromDir(dir) {
        const f = path.join(dir, 'package.json');
        return new PackageJSON(f);
    }

    static find(startDir = process.cwd()) {
        const f = findPackageJson(startDir);
        if (!f) throw new Error('No package.json found in this directory or any parent.');
        return new PackageJSON(f);
    }

    _load() {
        const data = readJSONSafe(this.filePath, null);
        if (!data) return this._empty();
        return data;
    }

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

    get name() { return this._data.name; }
    get version() { return this._data.version; }
    get dependencies() { return this._data.dependencies || {}; }
    get devDependencies() { return this._data.devDependencies || {}; }
    get peerDependencies() { return this._data.peerDependencies || {}; }
    get optionalDeps() { return this._data.optionalDependencies || {}; }
    get scripts() { return this._data.scripts || {}; }
    get workspaces() { return this._data.workspaces || []; }
    get main() { return this._data.main || 'index.js'; }
    get bin() { return this._data.bin || {}; }
    get engines() { return this._data.engines || {}; }
    get data() { return this._data; }
    get dir() { return path.dirname(this.filePath); }

    // ── Mutations ────────────────────────────────────────────────────────────────

    addDependency(name, version, { dev = false, exact = false } = {}) {
        const range = exact ? version : `^${version}`;
        const key = dev ? 'devDependencies' : 'dependencies';
        if (!this._data[key]) this._data[key] = {};
        this._data[key][name] = range;
        return this;
    }

    removeDependency(name) {
        for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            if (this._data[key]) delete this._data[key][name];
        }
        return this;
    }

    setField(key, value) {
        this._data[key] = value;
        return this;
    }

    setVersion(version) {
        this._data.version = version;
        return this;
    }

    addScript(name, command) {
        if (!this._data.scripts) this._data.scripts = {};
        this._data.scripts[name] = command;
        return this;
    }

    // ── Validation ────────────────────────────────────────────────────────────────

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

    save() {
        writeJSON(this.filePath, this._data, 2);
        return this;
    }

    exists() {
        return fs.existsSync(this.filePath);
    }

    allDeps() {
        return {
            ...this.dependencies,
            ...this.devDependencies,
            ...this.optionalDeps,
        };
    }
}

module.exports = PackageJSON;
