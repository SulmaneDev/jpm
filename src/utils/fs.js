'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const env = require('./env');

// ── Directory ─────────────────────────────────────────────────────────────────

function mkdirp(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function rimraf(target) {
    if (!fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true });
}

function emptyDir(dir) {
    if (!fs.existsSync(dir)) { mkdirp(dir); return; }
    for (const entry of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
}

// ── File I/O ──────────────────────────────────────────────────────────────────

function readJSON(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
}

function writeJSON(filePath, data, indent = 2) {
    mkdirp(path.dirname(filePath));
    // Atomic write: write to temp then rename
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, indent) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
}

async function writeJSONAsync(filePath, data, indent = 2) {
    mkdirp(path.dirname(filePath));
    const content = JSON.stringify(data, null, indent) + '\n';
    return env.writeFile(filePath, content);
}

function readJSONSafe(filePath, fallback = null) {
    try { return readJSON(filePath); }
    catch { return fallback; }
}

// ── Symlinks ──────────────────────────────────────────────────────────────────

function symlink(target, linkPath) {
    mkdirp(path.dirname(linkPath));
    if (fs.existsSync(linkPath) || isSymlink(linkPath)) {
        fs.unlinkSync(linkPath);
    }
    // On Windows use junction for dirs, file for files
    const type = fs.existsSync(target) && fs.statSync(target).isDirectory()
        ? (process.platform === 'win32' ? 'junction' : 'dir')
        : 'file';
    fs.symlinkSync(
        process.platform === 'win32' ? path.resolve(target) : target,
        linkPath,
        type
    );
}

function isSymlink(p) {
    try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

// ── Bin linking ───────────────────────────────────────────────────────────────

function linkBin(binPath, targetDir) {
    mkdirp(targetDir);
    const name = path.basename(binPath);
    const dest = path.join(targetDir, name);
    symlink(path.resolve(binPath), dest);
    // chmod +x
    try { fs.chmodSync(binPath, 0o755); } catch {/* windows */ }
}

// ── Copy ──────────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
    mkdirp(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ── Temp ──────────────────────────────────────────────────────────────────────

function tempDir(prefix = 'jpm-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── Walk ──────────────────────────────────────────────────────────────────────

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}

// ── package.json finder ───────────────────────────────────────────────────────

function findPackageJson(startDir) {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, 'package.json');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// ── Size ──────────────────────────────────────────────────────────────────────

function dirSize(dir) {
    let total = 0;
    try {
        for (const f of walk(dir)) {
            try { total += fs.statSync(f).size; } catch { }
        }
    } catch { }
    return total;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

module.exports = {
    mkdirp, rimraf, emptyDir,
    readJSON, writeJSON, writeJSONAsync, readJSONSafe,
    symlink, isSymlink, linkBin,
    copyDir, tempDir, walk,
    findPackageJson, dirSize, formatBytes,
};
