'use strict';

const fs = require('node:fs');
const path = require('node:path');
const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');
const { formatBytes } = require('../utils/fs');

/**
 * ListCommand handles the 'jpm list', 'jpm ls', and 'jpm peek' commands.
 * It visualizes the installed dependency tree and package sizes.
 */
class ListCommand extends BaseCommand {
    constructor() {
        super('list');
    }

    /**
     * Executes the listing and visualization of dependencies.
     * 
     * @param {string[]} args - Optional arguments
     * @param {Object} flags - CLI flags (e.g., --depth, --json)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const depth = parseInt(flags.depth ?? flags.d ?? '0', 10);
        const isJson = flags.json;
        const nodeModules = path.join(cwd, 'node_modules');

        const pkgJson = PackageJSON.fromDir(cwd);

        if (!fs.existsSync(nodeModules)) {
            this.logger.warn('No node_modules found. Run `jpm install` first.');
            return;
        }

        // 1. Collect installed packages
        const installed = [];
        for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;

            if (entry.name.startsWith('@') && entry.isDirectory()) {
                const scopeDir = path.join(nodeModules, entry.name);
                for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
                    const pkg = this._readPkg(path.join(scopeDir, scoped.name));
                    if (pkg) installed.push(pkg);
                }
            } else if (entry.isDirectory()) {
                const pkg = this._readPkg(path.join(nodeModules, entry.name));
                if (pkg) installed.push(pkg);
            }
        }

        // 2. Sort results alphabetically
        installed.sort((a, b) => a.name.localeCompare(b.name));

        // 3. Handle JSON output mode
        if (isJson) {
            process.stdout.write(JSON.stringify({
                name: pkgJson.name,
                dependencies: this._toObj(installed)
            }, null, 2) + '\n');
            return;
        }

        // 4. Render terminal tree view
        this.logger.log(`\n${this.logger.c.bold(pkgJson.name)}@${pkgJson.version}`);

        const directDeps = new Set([
            ...Object.keys(pkgJson.dependencies),
            ...Object.keys(pkgJson.devDependencies),
        ]);

        const total = installed.length;
        let totalSize = 0;

        for (let i = 0; i < installed.length; i++) {
            const pkg = installed[i];
            const isLast = i === installed.length - 1;
            const devMark = Object.keys(pkgJson.devDependencies).includes(pkg.name)
                ? this.logger.c.gray(' dev')
                : '';

            const conn = isLast ? '└── ' : '├── ';
            const nameStr = this.logger.c.cyan(pkg.name);
            const verStr = this.logger.c.gray(`@${pkg.version}`);
            this.logger.log(`${conn}${nameStr}${verStr}${devMark}`);

            if (depth > 0 && pkg.dependencies) {
                const subDeps = Object.entries(pkg.dependencies);
                subDeps.forEach(([depName, depRange], j) => {
                    const isLastSub = j === subDeps.length - 1;
                    const ext = isLast ? '    ' : '│   ';
                    const subConn = isLastSub ? '└── ' : '├── ';
                    this.logger.log(`${ext}${subConn}${this.logger.c.gray(depName)} ${this.logger.c.gray(depRange)}`);
                });
            }

            totalSize += pkg.size || 0;
        }

        this.logger.log(`\n${total} packages  ${formatBytes(totalSize)}`);
    }

    /**
     * Reads package metadata and calculates directory size.
     * 
     * @param {string} dir - Directory path to the package
     * @returns {Object|null} Package data object or null on failure
     * @private
     */
    _readPkg(dir) {
        const pkgJsonFile = path.join(dir, 'package.json');
        try {
            const data = JSON.parse(fs.readFileSync(pkgJsonFile, 'utf8'));
            let size = 0;
            try {
                // Shallow size calculation (top-level files only)
                for (const file of fs.readdirSync(dir)) {
                    const s = fs.statSync(path.join(dir, file));
                    if (s.isFile()) size += s.size;
                }
            } catch (err) { }
            return {
                name: data.name,
                version: data.version,
                dependencies: data.dependencies,
                size
            };
        } catch (err) {
            return null;
        }
    }

    /**
     * Converts an array of package objects into a structured object for JSON output.
     * 
     * @param {Object[]} arr - Array of package metadata
     * @returns {Object}
     * @private
     */
    _toObj(arr) {
        return Object.fromEntries(arr.map(p => [p.name, { version: p.version }]));
    }
}

module.exports = ListCommand;

