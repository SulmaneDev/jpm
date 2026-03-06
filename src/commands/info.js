'use strict';

const BaseCommand = require('./base-command');
const registry = require('../core/registry');
const semver = require('../utils/semver');
const { Spinner } = require('../utils/progress');

/**
 * InfoCommand handles the 'jpm info' and 'jpm view' commands.
 * It fetches and displays detailed metadata about a specific package and version.
 */
class InfoCommand extends BaseCommand {
    constructor() {
        super('info');
    }

    /**
     * Executes the package information retrieval.
     * 
     * @param {string[]} args - Package specification (e.g., 'pkg@1.2.3' or 'pkg')
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        if (!args.length) {
            this.logger.error('Usage: jpm info <package> [version]');
            throw new Error('No package name provided.');
        }

        let [pkgSpec] = args;
        let name, version;

        // Parse name and version from spec (handling scoped packages)
        const lastAt = pkgSpec.lastIndexOf('@');
        if (lastAt > 0 && !(pkgSpec.startsWith('@') && pkgSpec.indexOf('@', 1) === -1)) {
            name = pkgSpec.slice(0, lastAt);
            version = pkgSpec.slice(lastAt + 1);
        } else {
            name = pkgSpec;
            version = 'latest';
        }

        const spinner = new Spinner(`Fetching info for ${name}...`).start();

        try {
            const [meta, latest, versions, tags] = await Promise.all([
                registry.getVersion(name, version),
                registry.getLatest(name),
                registry.getVersions(name),
                registry.getDistTags(name),
            ]);
            spinner.succeed(`${name}@${meta.version}`);

            const c = this.logger.c;
            this.logger.log('');
            this.logger.log(`${c.bold(meta.name)} ${c.gray(`v${meta.version}`)}`);
            if (meta.description) {
                this.logger.log(meta.description);
            }

            this.logger.log('');
            this.logger.log(`${c.cyan('latest')}      ${latest}`);
            this.logger.log(`${c.cyan('license')}     ${meta.license || 'n/a'}`);
            this.logger.log(`${c.cyan('author')}      ${this._formatAuthor(meta.author)}`);
            if (meta.homepage) {
                this.logger.log(`${c.cyan('homepage')}    ${meta.homepage}`);
            }
            if (meta.repository?.url) {
                this.logger.log(`${c.cyan('repository')}  ${meta.repository.url.replace('git+', '')}`);
            }

            // Render keywords
            if (meta.keywords?.length) {
                this.logger.log(`${c.cyan('keywords')}    ${meta.keywords.slice(0, 10).join(', ')}`);
            }

            // Render distribution tags
            if (Object.keys(tags).length > 1) {
                this.logger.log('');
                this.logger.section('Tags');
                for (const [tag, ver] of Object.entries(tags)) {
                    this.logger.log(`  ${tag.padEnd(12)} ${ver}`);
                }
            }

            // Render dependencies
            const deps = meta.dependencies || {};
            if (Object.keys(deps).length) {
                this.logger.log('');
                this.logger.section('Dependencies');
                for (const [dep, range] of Object.entries(deps)) {
                    this.logger.log(`  ${c.cyan(dep.padEnd(30))} ${range}`);
                }
            }

            // Render recent versions
            const recentVersions = semver.rsort(versions).slice(0, 10);
            this.logger.log('');
            this.logger.section(`Versions (latest 10 of ${versions.length})`);
            this.logger.log('  ' + recentVersions.join('  '));

            this.logger.log('');
            this.logger.log(c.gray(`jpm install ${name}@${meta.version}`));
        } catch (err) {
            spinner.fail(`Package "${name}" not found: ${err.message}`);
            throw err;
        }
    }

    /**
     * Formats author information into a readable string.
     * 
     * @param {string|Object} author - Author data from package.json
     * @returns {string} Formatted author string
     * @private
     */
    _formatAuthor(author) {
        if (!author) return 'n/a';
        if (typeof author === 'object') return author.name || 'n/a';
        return author;
    }
}

module.exports = InfoCommand;

