'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../utils/config');
const { mkdirp, rimraf } = require('../utils/fs');
const logger = require('../utils/logger');

/**
 * Disk cache at ~/.jpm/cache/<name>/<version>.tgz
 * Also stores metadata JSON alongside: <name>/<version>.json
 */

function cacheRoot() {
    return config.cacheDir;
}

function tgzPath(name, version) {
    const safeName = name.replace('/', '__SCOPE__');
    return path.join(cacheRoot(), safeName, `${version}.tgz`);
}

function metaPath(name, version) {
    const safeName = name.replace('/', '__SCOPE__');
    return path.join(cacheRoot(), safeName, `${version}.json`);
}

async function get(name, version) {
    const p = tgzPath(name, version);
    if (fs.existsSync(p)) {
        logger.verbose(`cache hit ${name}@${version}`);
        return p;
    }
    return null;
}

async function set(name, version, srcTgz) {
    const dest = tgzPath(name, version);
    mkdirp(path.dirname(dest));
    fs.copyFileSync(srcTgz, dest);
    logger.verbose(`cache store ${name}@${version}`);
}

async function setMeta(name, version, meta) {
    const p = metaPath(name, version);
    mkdirp(path.dirname(p));
    fs.writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8');
}

async function getMeta(name, version) {
    const p = metaPath(name, version);
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
}

function has(name, version) {
    return fs.existsSync(tgzPath(name, version));
}

function clear(name, version) {
    if (name && version) {
        rimraf(tgzPath(name, version));
        rimraf(metaPath(name, version));
    } else if (name) {
        const safeName = name.replace('/', '__SCOPE__');
        rimraf(path.join(cacheRoot(), safeName));
    } else {
        // Clear entire cache
        rimraf(cacheRoot());
        logger.success('Cache cleared');
    }
}

function stats() {
    const root = cacheRoot();
    if (!fs.existsSync(root)) return { packages: 0, size: 0 };

    let packages = 0;
    let size = 0;

    function walk(dir) {
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
    }

    try { walk(root); } catch { }
    return { packages, size, root };
}

function list() {
    const root = cacheRoot();
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

module.exports = { get, set, getMeta, setMeta, has, clear, stats, list };
