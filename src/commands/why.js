'use strict';

const BaseCommand = require('./base-command');
const Lockfile = require('../core/lockfile');
const PackageJSON = require('../core/package-json');

/**
 * WhyCommand handles the 'jpm why <pkg>' command.
 * It traces dependency paths to explain why a package is installed.
 */
class WhyCommand extends BaseCommand {
    constructor() {
        super('why');
    }

    /**
     * Executes the dependency tracing.
     * 
     * @param {string[]} args - Package name to trace
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        if (!args.length) {
            this.logger.error('Usage: jpm why <package>');
            return;
        }

        const target = args[0];
        const cwd = process.cwd();
        const lockfile = new Lockfile(cwd);
        const pkgJson = PackageJSON.fromDir(cwd);

        if (!lockfile.exists()) {
            this.logger.error('No lockfile found. Run jpm install first.');
            return;
        }

        const lockData = lockfile.allPackages();
        // Index by name for easier lookup
        const pkgMap = new Map();
        for (const p of lockData) {
            pkgMap.set(p.name, p);
        }

        const topLevel = pkgJson.allDeps();
        const paths = [];
        const seen = new Set();

        /**
         * Recursively searches for the target package in the dependency tree.
         * 
         * @param {string} currentName - Current package being inspected
         * @param {string[]} currentPath - Breadcrumb path to the current package
         */
        const findPaths = (currentName, currentPath = []) => {
            const pathKey = [...currentPath, currentName].join('>');
            if (seen.has(pathKey)) return;
            seen.add(pathKey);

            if (currentName === target) {
                paths.push([...currentPath, target]);
                return;
            }

            const pkg = pkgMap.get(currentName);
            if (!pkg || !pkg.dependencies) return;

            for (const dep of Object.keys(pkg.dependencies)) {
                // Generic cycle protection: don't revisit same package in current path
                if (currentPath.includes(dep)) continue;
                findPaths(dep, [...currentPath, currentName]);
            }
        };

        for (const root of Object.keys(topLevel)) {
            findPaths(root, ['(project)']);
        }

        if (paths.length === 0) {
            this.logger.info(`Package "${this.logger.c.bold(target)}" is not required by any installed package.`);
            return;
        }

        const c = this.logger.c;
        this.logger.section(`Found ${paths.length} path(s) to ${c.bold(target)}:`);

        for (const path of paths) {
            const formatted = path.map((p, i) => {
                if (p === '(project)') return c.gray(p);
                if (p === target) return c.yellow(c.bold(p));
                return c.cyan(p);
            }).join(c.gray(' → '));

            this.logger.log(`  ${formatted}`);
        }
    }
}

module.exports = WhyCommand;
