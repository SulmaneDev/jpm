'use strict';

const registry = require('../core/registry');
const semver = require('../utils/semver');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');

module.exports = async function info(args, flags) {
    if (!args.length) { logger.error('Usage: jpm info <package> [version]'); process.exit(1); }

    let [pkgSpec] = args;
    let name, version;

    const lastAt = pkgSpec.lastIndexOf('@');
    if (lastAt > 0) { name = pkgSpec.slice(0, lastAt); version = pkgSpec.slice(lastAt + 1); }
    else { name = pkgSpec; version = 'latest'; }

    const spinner = new Spinner(`Fetching info for ${name}...`).start();

    let meta, latest, versions, tags;
    try {
        [meta, latest, versions, tags] = await Promise.all([
            registry.getVersion(name, version),
            registry.getLatest(name),
            registry.getVersions(name),
            registry.getDistTags(name),
        ]);
        spinner.succeed(`${name}@${meta.version}`);
    } catch (err) {
        spinner.fail(`Package "${name}" not found: ${err.message}`);
        process.exit(1);
    }

    const c = logger.c;
    logger.log('');
    logger.log(`${c.bold(meta.name)} ${c.gray(`v${meta.version}`)}`);
    if (meta.description) logger.log(meta.description);

    logger.log('');
    logger.log(`${c.cyan('latest')}      ${latest}`);
    logger.log(`${c.cyan('license')}     ${meta.license || 'n/a'}`);
    logger.log(`${c.cyan('author')}      ${typeof meta.author === 'object' ? meta.author.name : (meta.author || 'n/a')}`);
    if (meta.homepage) logger.log(`${c.cyan('homepage')}    ${meta.homepage}`);
    if (meta.repository?.url) logger.log(`${c.cyan('repository')}  ${meta.repository.url.replace('git+', '')}`);

    // Keywords
    if (meta.keywords?.length) {
        logger.log(`${c.cyan('keywords')}    ${meta.keywords.slice(0, 10).join(', ')}`);
    }

    // Dist-tags
    if (Object.keys(tags).length > 1) {
        logger.log('');
        logger.section('Tags');
        for (const [tag, ver] of Object.entries(tags)) {
            logger.log(`  ${tag.padEnd(12)} ${ver}`);
        }
    }

    // Dependencies
    const deps = meta.dependencies || {};
    if (Object.keys(deps).length) {
        logger.log('');
        logger.section('Dependencies');
        for (const [dep, range] of Object.entries(deps)) {
            logger.log(`  ${c.cyan(dep.padEnd(30))} ${range}`);
        }
    }

    // Recent versions
    const recentVersions = semver.rsort(versions).slice(0, 10);
    logger.log('');
    logger.section(`Versions (latest 10 of ${versions.length})`);
    logger.log('  ' + recentVersions.join('  '));

    logger.log('');
    logger.log(c.gray(`jpm install ${name}@${meta.version}`));
};
