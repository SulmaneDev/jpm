'use strict';

const registry = require('../core/registry');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');

module.exports = async function search(args, flags) {
    const query = args.join(' ');
    if (!query) { logger.error('Usage: jpm search <query>'); process.exit(1); }

    const size = parseInt(flags.size || flags.n || '20', 10);
    const spinner = new Spinner(`Searching for "${query}"...`).start();

    let results;
    try {
        results = await registry.search(query, { size });
    } catch (err) {
        spinner.fail(`Search failed: ${err.message}`);
        process.exit(1);
    }

    spinner.succeed(`Found ${results.length} result(s) for "${query}"`);

    if (!results.length) { logger.info('No packages found.'); return; }

    logger.log('');
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
    logger.table(rows, ['Name', 'Version', 'Description', 'Downloads', 'Score']);

    logger.log(`\n${logger.c.gray('Run `jpm info <package>` for details. `jpm install <package>` to install.')}`);
};
