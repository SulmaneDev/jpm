'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PackageJSON = require('../core/package-json');
const { formatBytes } = require('../utils/fs');
const logger = require('../utils/logger');

module.exports = async function list(args, flags) {
    const cwd = process.cwd();
    const depth = parseInt(flags.depth ?? flags.d ?? '0', 10);
    const json = flags.json;
    const nodeModules = path.join(cwd, 'node_modules');

    const pkgJson = PackageJSON.fromDir(cwd);

    if (!fs.existsSync(nodeModules)) {
        logger.warn('No node_modules found. Run `jpm install` first.');
        return;
    }

    // Collect top-level installed packages
    const installed = [];
    for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;

        if (entry.name.startsWith('@') && entry.isDirectory()) {
            const scopeDir = path.join(nodeModules, entry.name);
            for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
                const pkg = readPkg(path.join(scopeDir, scoped.name));
                if (pkg) installed.push(pkg);
            }
        } else if (entry.isDirectory()) {
            const pkg = readPkg(path.join(nodeModules, entry.name));
            if (pkg) installed.push(pkg);
        }
    }

    // Sort alphabetically
    installed.sort((a, b) => a.name.localeCompare(b.name));

    if (json) {
        process.stdout.write(JSON.stringify({ name: pkgJson.name, dependencies: toObj(installed) }, null, 2) + '\n');
        return;
    }

    logger.log(`\n${logger.c.bold(pkgJson.name)}@${pkgJson.version}`);

    const directDeps = new Set([
        ...Object.keys(pkgJson.dependencies),
        ...Object.keys(pkgJson.devDependencies),
    ]);

    const total = installed.length;
    let totalSize = 0;

    for (let i = 0; i < installed.length; i++) {
        const pkg = installed[i];
        const isLast = i === installed.length - 1;
        const isDir = directDeps.has(pkg.name);
        const devMark = Object.keys(pkgJson.devDependencies).includes(pkg.name)
            ? logger.c.gray(' dev')
            : '';

        const conn = isLast ? '└── ' : '├── ';
        const nameStr = logger.c.cyan(pkg.name);
        const verStr = logger.c.gray(`@${pkg.version}`);
        logger.log(`${conn}${nameStr}${verStr}${devMark}`);

        if (depth > 0 && pkg.dependencies) {
            const subDeps = Object.entries(pkg.dependencies);
            subDeps.forEach(([depName, depRange], j) => {
                const isLastSub = j === subDeps.length - 1;
                const ext = isLast ? '    ' : '│   ';
                const subConn = isLastSub ? '└── ' : '├── ';
                logger.log(`${ext}${subConn}${logger.c.gray(depName)} ${logger.c.gray(depRange)}`);
            });
        }

        totalSize += pkg.size || 0;
    }

    logger.log(`\n${total} packages  ${formatBytes(totalSize)}`);
};

function readPkg(dir) {
    const f = path.join(dir, 'package.json');
    try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        let size = 0;
        try {
            for (const file of fs.readdirSync(dir)) {
                const s = fs.statSync(path.join(dir, file));
                if (s.isFile()) size += s.size;
            }
        } catch { }
        return { name: data.name, version: data.version, dependencies: data.dependencies, size };
    } catch { return null; }
}

function toObj(arr) {
    return Object.fromEntries(arr.map(p => [p.name, { version: p.version }]));
}
