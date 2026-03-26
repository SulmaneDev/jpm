'use strict';

const BaseCommand = require('./base-command');
const Engine = require('../core/engine');
const fs = require('node:fs');
const path = require('node:path');
const { rimraf } = require('../utils/fs');

/**
 * PruneCommand handles the 'jpm prune' command.
 * It removes extraneous packages from node_modules that are not in the lockfile.
 */
class PruneCommand extends BaseCommand {
    constructor() {
        super('prune');
    }

    /**
     * Executes the prune process.
     * 
     * @param {string[]} args - Optional arguments
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const engine = new Engine(cwd);

        if (!engine.lockfile.exists()) {
            this.logger.error('No lockfile found. Run `jpm install` first.');
            return;
        }

        this.logger.info('Scanning for extraneous packages...');
        const report = engine.verifyEnvironment();

        if (report.extraneous.length === 0) {
            this.logger.success('No extraneous packages found. Environment is clean.');
            return;
        }

        this.logger.info(`Pruning ${report.extraneous.length} extraneous package(s)...`);

        const nodeModules = path.join(cwd, 'node_modules');

        for (const pkg of report.extraneous) {
            const destDir = pkg.name.startsWith('@')
                ? path.join(nodeModules, pkg.name.split('/')[0], pkg.name.split('/')[1])
                : path.join(nodeModules, pkg.name);

            if (fs.existsSync(destDir)) {
                rimraf(destDir);
                this.logger.verbose(`Removed extraneous ${pkg.name}`);
            }
        }

        this.logger.success(`Pruned ${report.extraneous.length} package(s).`);
    }
}

module.exports = PruneCommand;
