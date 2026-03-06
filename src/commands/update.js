'use strict';

const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');
const registry = require('../core/registry');
const semver = require('../utils/semver');
const { Spinner } = require('../utils/progress');

/**
 * UpdateCommand handles the 'jpm update' and 'jpm outdated' commands.
 * It checks for newer versions of installed packages and can perform updates.
 */
class UpdateCommand extends BaseCommand {
    constructor() {
        super('update');
    }

    /**
     * Executes the update or outdated check.
     * 
     * @param {string[]} args - Optional package names to limit the check
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const pkgJson = PackageJSON.fromDir(cwd);
        const allDeps = pkgJson.allDeps();

        const targets = args.length
            ? args.reduce((acc, n) => { if (allDeps[n]) acc[n] = allDeps[n]; return acc; }, {})
            : allDeps;

        if (Object.keys(targets).length === 0) {
            this.logger.info('No dependencies found to check.');
            return;
        }

        const spinner = new Spinner(`Checking ${Object.keys(targets).length} packages for updates...`).start();
        const rows = [];

        await Promise.all(
            Object.entries(targets).map(async ([name, range]) => {
                try {
                    const versions = await registry.getVersions(name);
                    const latest = await registry.getLatest(name);
                    const current = semver.maxSatisfying(versions, range);
                    const wanted = semver.maxSatisfying(versions, range);
                    const isOutdated = latest && current && semver.gt(latest, current);

                    rows.push({
                        Package: name,
                        Current: current || 'n/a',
                        Wanted: wanted || 'n/a',
                        Latest: latest || 'n/a',
                        Status: isOutdated
                            ? this.logger.c.yellow('outdated')
                            : this.logger.c.green('up to date'),
                    });
                } catch (err) {
                    rows.push({
                        Package: name,
                        Current: '?',
                        Wanted: '?',
                        Latest: '?',
                        Status: this.logger.c.red('error')
                    });
                }
            })
        );

        spinner.succeed('Done');

        // Handle 'outdated' alias/mode
        if (this.name === 'outdated' || flags.outdated) {
            const outdated = rows.filter(r => r.Status.includes('outdated'));
            if (!outdated.length) {
                this.logger.success('All packages are up to date!');
                return;
            }
            this.logger.table(outdated, ['Package', 'Current', 'Wanted', 'Latest', 'Status']);
            return;
        }

        // Filter for packages that actually need updating
        const outdatedPkgs = rows.filter(r => r.Status.includes('outdated'));
        if (!outdatedPkgs.length) {
            this.logger.success('All packages are up to date!');
            return;
        }

        this.logger.info(`Updating ${outdatedPkgs.length} package(s)...`);

        // Use dynamic import/require to avoid circular dependency with InstallCommand
        const InstallCommand = require('./install');
        const installInstance = new InstallCommand();

        const pkgArgs = outdatedPkgs.map(p => `${p.Package}@${p.Latest}`);
        await installInstance.run(pkgArgs, flags);
    }
}

module.exports = UpdateCommand;

