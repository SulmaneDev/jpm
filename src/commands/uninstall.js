'use strict';

const PackageJSON = require('../core/package-json');
const Installer = require('../core/installer');
const Lockfile = require('../core/lockfile');
const Resolver = require('../core/resolver');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');

module.exports = async function uninstall(args, flags) {
    if (!args.length) {
        logger.error('Usage: jpm uninstall <package> [package2 ...]');
        process.exit(1);
    }

    const cwd = process.cwd();
    const pkgJson = PackageJSON.fromDir(cwd);
    const lockfile = new Lockfile(cwd);
    const installer = new Installer(cwd);

    for (const name of args) {
        const spinner = new Spinner(`Removing ${name}...`).start();

        const removed = await installer.uninstall(name);
        if (!removed) {
            spinner.warn(`${name} was not installed`);
            continue;
        }

        // Remove from package.json
        pkgJson.removeDependency(name);

        // Remove from lock file — remove all entries with this name
        const toRemove = lockfile.allPackages()
            .filter(p => p.name === name)
            .map(p => ({ name: p.name, version: p.version }));

        for (const { name: n, version: v } of toRemove) {
            lockfile.removePackage(n, v);
        }

        spinner.succeed(`Removed ${name}`);
    }

    pkgJson.save();
    lockfile.save();
    logger.success(`\nRemoved ${args.length} package(s)`);
};
