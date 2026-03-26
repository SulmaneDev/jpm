'use strict';

const BaseCommand = require('./base-command');
const Engine = require('../core/engine');

/**
 * VerifyCommand handles the 'jpm verify' command.
 * It checks if node_modules matches the jpm-lock.json file.
 */
class VerifyCommand extends BaseCommand {
    constructor() {
        super('verify');
    }

    /**
     * Executes the verification process.
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

        this.logger.info('Verifying node_modules against lockfile...');
        const report = engine.verifyEnvironment();

        const hasIssues = report.missing.length > 0 || report.mismatched.length > 0 || report.extraneous.length > 0;

        if (!hasIssues) {
            this.logger.success('Environment is consistent with lockfile.');
            return;
        }

        if (report.missing.length > 0) {
            this.logger.warn(`\n${this.logger.c.bold('Missing packages:')} (${report.missing.length})`);
            report.missing.forEach(p => this.logger.log(`  - ${p.name}@${p.version}`));
        }

        if (report.mismatched.length > 0) {
            this.logger.warn(`\n${this.logger.c.bold('Mismatched versions:')} (${report.mismatched.length})`);
            report.mismatched.forEach(p => {
                this.logger.log(`  ! ${p.name}: expected ${p.expected}, found ${p.actual}`);
            });
        }

        if (report.extraneous.length > 0) {
            this.logger.info(`\n${this.logger.c.bold('Extraneous packages:')} (${report.extraneous.length})`);
            report.extraneous.forEach(p => this.logger.log(`  + ${p.name}@${p.version}`));
            this.logger.info('\nRun `jpm prune` to remove extraneous packages.');
        }

        if (report.missing.length > 0 || report.mismatched.length > 0) {
            this.logger.info('\nRun `jpm syn` or `jpm install` to fix missing/mismatched packages.');
        }
    }
}

module.exports = VerifyCommand;
