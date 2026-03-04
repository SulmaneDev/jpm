'use strict';

const PackageJSON = require('../core/package-json');
const registry = require('../core/registry');
const semver = require('../utils/semver');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');

/** jpm update [pkg] | jpm outdated */
module.exports = async function update(args, flags, command) {
    const cwd = process.cwd();
    const pkgJson = PackageJSON.fromDir(cwd);
    const allDeps = pkgJson.allDeps();

    const targets = args.length
        ? args.reduce((acc, n) => { if (allDeps[n]) acc[n] = allDeps[n]; return acc; }, {})
        : allDeps;

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
                        ? logger.c.yellow('outdated')
                        : logger.c.green('up to date'),
                });
            } catch {
                rows.push({ Package: name, Current: '?', Wanted: '?', Latest: '?', Status: logger.c.red('error') });
            }
        })
    );

    spinner.succeed('Done');

    if (command === 'outdated') {
        const outdated = rows.filter(r => r.Status.includes('outdated'));
        if (!outdated.length) { logger.success('All packages are up to date!'); return; }
        logger.table(outdated, ['Package', 'Current', 'Wanted', 'Latest', 'Status']);
        return;
    }

    // Actually update
    const outdatedPkgs = rows.filter(r => r.Status.includes('outdated'));
    if (!outdatedPkgs.length) { logger.success('All packages are up to date!'); return; }

    logger.info(`Updating ${outdatedPkgs.length} package(s)...`);
    const installCmd = require('./install');
    const pkgArgs = outdatedPkgs.map(p => `${p.Package}@${p.Latest}`);
    await installCmd(pkgArgs, flags);
};
