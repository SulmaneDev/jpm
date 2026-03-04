'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Config hierarchy: CLI flags > project .jpmrc > user ~/.jpmrc > global
// Format: INI-like (same as .npmrc for compatibility)

const GLOBAL_DEFAULTS = {
    registry: 'https://registry.npmjs.org/',
    'fetch-timeout': 30000,
    'fetch-retries': 3,
    'max-sockets': 20,
    loglevel: 'info',
    color: true,
    progress: true,
    'save-exact': false,
    'legacy-peer-deps': false,
    audit: true,
    'audit-level': 'moderate', // low|moderate|high|critical
    cache: path.join(os.homedir(), '.jpm', 'cache'),
    prefix: process.cwd(),
};

function parseIni(text) {
    const result = {};
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        // Coerce types
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val) && val !== '') val = Number(val);
        result[key] = val;
    }
    return result;
}

function stringifyIni(obj) {
    return Object.entries(obj)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n';
}

function readFile(filePath) {
    try { return parseIni(fs.readFileSync(filePath, 'utf8')); }
    catch { return {}; }
}

class Config {
    constructor() {
        this._layers = {
            defaults: { ...GLOBAL_DEFAULTS },
            global: readFile(path.join(os.homedir(), '.jpmrc')),
            user: readFile(path.join(os.homedir(), '.jpmrc')),
            project: {},
            cli: {},
        };
        this._loadProject();
    }

    _loadProject() {
        let dir = process.cwd();
        // Walk up looking for .jpmrc
        while (true) {
            const candidate = path.join(dir, '.jpmrc');
            if (fs.existsSync(candidate)) {
                this._layers.project = readFile(candidate);
                this._projectFile = candidate;
                break;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }

    get(key) {
        // CLI > project > user > global > defaults
        for (const layer of ['cli', 'project', 'user', 'global', 'defaults']) {
            if (Object.prototype.hasOwnProperty.call(this._layers[layer], key)) {
                return this._layers[layer][key];
            }
        }
        return undefined;
    }

    set(key, value, layer = 'project') {
        this._layers[layer][key] = value;
        if (layer === 'project' || layer === 'user') this._persist(layer);
    }

    delete(key, layer = 'project') {
        delete this._layers[layer][key];
        if (layer === 'project' || layer === 'user') this._persist(layer);
    }

    setCLI(obj) {
        Object.assign(this._layers.cli, obj);
    }

    list() {
        const merged = {};
        for (const layer of ['defaults', 'global', 'user', 'project', 'cli']) {
            Object.assign(merged, this._layers[layer]);
        }
        return merged;
    }

    _persist(layer) {
        const filePath = layer === 'user'
            ? path.join(os.homedir(), '.jpmrc')
            : (this._projectFile || path.join(process.cwd(), '.jpmrc'));
        try {
            fs.writeFileSync(filePath, stringifyIni(this._layers[layer]), 'utf8');
        } catch (e) {
            // silent — config write errors should not crash the CLI
        }
    }

    // Helpers
    get registry() { return this.get('registry'); }
    get cacheDir() { return this.get('cache'); }
    get loglevel() { return this.get('loglevel'); }
    get saveExact() { return this.get('save-exact'); }
    get timeout() { return this.get('fetch-timeout'); }
    get retries() { return this.get('fetch-retries'); }
    get auditLevel() { return this.get('audit-level'); }
}

// Singleton
const config = new Config();
module.exports = config;
