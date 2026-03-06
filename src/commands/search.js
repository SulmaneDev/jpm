'use strict';

const BaseCommand = require('./base-command');
const registry = require('../core/registry');
const { Spinner } = require('../utils/progress');

/**
 * SearchCommand handles the 'jpm search' and 'jpm find' commands.
 * It queries the registry for packages matching a search term and displays results.
 */
class SearchCommand extends BaseCommand {
    constructor() {
        super('search');
    }

    /**
     * Executes the package search.
     * 
     * @param {string[]} args - Search query terms
     * @param {Object} flags - CLI flags (e.g., --size)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const query = args.join(' ');
        if (!query) {
            this.logger.error('Usage: jpm search <query>');
            throw new Error('No search query provided.');
        }

        const size = parseInt(flags.size || flags.n || '20', 10);
        const spinner = new Spinner(`Searching for "${query}"...`).start();

        try {
            const results = await registry.search(query, { size });
            spinner.succeed(`Found ${results.length} result(s) for "${query}"`);

            if (!results.length) {
                this.logger.info('No packages found.');
                return;
            }

            this.logger.log('');
            const rows = results.map(r => ({
                Name: r.package?.name || '',
                Version: r.package?.version || '',
                Description: (r.package?.description || '').slice(0, 55),
                Downloads: r.downloads?.weekly != null
                    ? r.downloads.weekly.toLocaleString()
                    : 'n/a',
                Score: r.score?.final != null
                    ? (r.score.final * 100).toFixed(0) + '%'
                    : 'n/a',
            }));

            this.logger.table(rows, ['Name', 'Version', 'Description', 'Downloads', 'Score']);
            this.logger.log(`\n${this.logger.c.gray('Run `jpm info <package>` for details. `jpm install <package>` to install.')}`);
        } catch (err) {
            spinner.fail(`Search failed: ${err.message}`);
            throw err;
        }
    }
}

module.exports = SearchCommand;

