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
        let name, requestedVersion;

        // Parse name and version from spec (handling scoped packages)
        const lastAt = pkgSpec.lastIndexOf('@');
        if (lastAt > 0 && !(pkgSpec.startsWith('@') && pkgSpec.indexOf('@', 1) === -1)) {
            name = pkgSpec.slice(0, lastAt);
            requestedVersion = pkgSpec.slice(lastAt + 1);
        } else {
            name = pkgSpec;
            requestedVersion = 'latest';
        }

        const spinner = new Spinner(`Fetching info for ${name}...`).start();

        try {
            const packument = await registry.getPackument(name);
            const version = requestedVersion === 'latest'
                ? packument['dist-tags']?.latest
                : requestedVersion;

            const meta = packument.versions?.[version];
            if (!meta) {
                throw new Error(`Version ${name}@${version} not found in registry.`);
            }

            spinner.succeed(`${name}@${meta.version}`);

            const c = this.logger.c;
            const latest = packument['dist-tags']?.latest;
            const time = packument.time?.[version];
            const tags = packument['dist-tags'] || {};
            const versions = Object.keys(packument.versions || {});

            this.logger.log('');
            this.logger.log(`${c.bold(c.yellow(meta.name))} ${c.gray(`v${meta.version}`)}`);
            if (meta.description) {
                this.logger.log(c.italic(meta.description));
            }

            this.logger.log('');
            const grid = [
                [`${c.cyan('Latest Version')}`, latest],
                [`${c.cyan('License')}`, meta.license || 'n/a'],
                [`${c.cyan('Author')}`, this._formatAuthor(meta.author)],
                [`${c.cyan('Published')}`, this._formatTime(time)],
                [`${c.cyan('Size')}`, this._formatSize(meta.dist?.unpackedSize)],
            ];

            if (meta.homepage) grid.push([`${c.cyan('Homepage')}`, meta.homepage]);
            if (meta.repository?.url) {
                grid.push([`${c.cyan('Repository')}`, meta.repository.url.replace('git+', '').replace('.git', '')]);
            }

            // Print grid
            for (const [key, val] of grid) {
                this.logger.log(`${key.padEnd(25)} ${val}`);
            }

            // Render keywords
            if (meta.keywords?.length) {
                this.logger.log(`${c.cyan('Keywords').padEnd(25)} ${meta.keywords.slice(0, 10).join(', ')}`);
            }

            // Render maintainers
            if (meta.maintainers?.length) {
                const maintainers = meta.maintainers.map(m => m.name || m).join(', ');
                this.logger.log(`${c.cyan('Maintainers').padEnd(25)} ${maintainers}`);
            }

            // Render distribution tags
            this.logger.log('');
            this.logger.section('Distribution Tags');
            for (const [tag, ver] of Object.entries(tags)) {
                const color = tag === 'latest' ? c.green : c.white;
                this.logger.log(`  ${color(tag.padEnd(12))} ${ver}`);
            }

            // Render dependencies
            const deps = meta.dependencies || {};
            if (Object.keys(deps).length) {
                this.logger.log('');
                this.logger.section(`Dependencies (${Object.keys(deps).length})`);
                for (const [dep, range] of Object.entries(deps)) {
                    this.logger.log(`  ${c.cyan(dep.padEnd(30))} ${c.gray(range)}`);
                }
            }

            // Render recent versions
            const recentVersions = semver.rsort(versions).slice(0, 10);
            this.logger.log('');
            this.logger.section(`Recent Versions (Showing 10 of ${versions.length})`);
            this.logger.log('  ' + recentVersions.map(v => v === version ? c.bold(c.yellow(v)) : v).join('  '));

            this.logger.log('');
            this.logger.log(c.gray(`To install this package, run:`));
            this.logger.log(`${c.cyan('jpm install')} ${name}@${meta.version}`);
            this.logger.log('');
        } catch (err) {
            spinner.fail(`Package "${name}" retrieval failed: ${err.message}`);
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
        if (typeof author === 'object') {
            let str = author.name || 'n/a';
            if (author.email) str += ` <${author.email}>`;
            return str;
        }
        return author;
    }

    /**
     * Formats bytes into a human-readable string.
     * 
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted size (e.g., '1.2 MB')
     * @private
     */
    _formatSize(bytes) {
        if (!bytes || isNaN(bytes)) return 'n/a';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Formats a time string into a readable date and relative time.
     * 
     * @param {string} timeStr - ISO time string
     * @returns {string} Formatted time
     * @private
     */
    _formatTime(timeStr) {
        if (!timeStr) return 'n/a';
        try {
            const date = new Date(timeStr);
            return `${date.toLocaleDateString()} (${this._timeAgo(date)})`;
        } catch (e) {
            return 'n/a';
        }
    }

    /**
     * Calculates a relative "time ago" string.
     * 
     * @param {Date} date - Date object
     * @returns {string} Time ago string
     * @private
     */
    _timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = Math.floor(seconds / 31536000);
        if (interval >= 1) return interval + (interval === 1 ? " year ago" : " years ago");
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) return interval + (interval === 1 ? " month ago" : " months ago");
        interval = Math.floor(seconds / 86400);
        if (interval >= 1) return interval + (interval === 1 ? " day ago" : " days ago");
        interval = Math.floor(seconds / 3600);
        if (interval >= 1) return interval + (interval === 1 ? " hour ago" : " hours ago");
        interval = Math.floor(seconds / 60);
        if (interval >= 1) return interval + (interval === 1 ? " minute ago" : " minutes ago");
        return Math.floor(seconds) + " seconds ago";
    }
}

module.exports = InfoCommand;

