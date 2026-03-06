'use strict';

const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');
const Installer = require('../core/installer');
const Lockfile = require('../core/lockfile');
const { Spinner } = require('../utils/progress');

/**
 * UninstallCommand handles the 'jpm uninstall' command and its aliases.
 * It removes packages from node_modules and updates package.json and the lockfile.
 */
class UninstallCommand extends BaseCommand {
    constructor() {
        super('uninstall');
    }

    /**
     * Executes the uninstallation process for one or more packages.
     * 
     * @param {string[]} args - Names of packages to uninstall
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        if (!args.length) {
            this.logger.error('Usage: jpm uninstall <package> [package2 ...]');
            throw new Error('No package names provided for uninstallation.');
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

            // Remove from lock file (remove all versions for this package name)
            const lockedPackages = lockfile.allPackages();
            for (const pkg of lockedPackages) {
                if (pkg.name === name) {
                    lockfile.removePackage(pkg.name, pkg.version);
                }
            }

            spinner.succeed(`Removed ${name}`);
        }

        pkgJson.save();
        lockfile.save();
        this.logger.success(`\nRemoved ${args.length} package(s)`);
    }
}

module.exports = UninstallCommand;
