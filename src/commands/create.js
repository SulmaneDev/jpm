'use strict';

const BaseCommand = require('./base-command');
const ExecCommand = require('./x');

/**
 * CreateCommand handles project scaffolding.
 * It's a specialized wrapper around 'jpm x' (exec) that defaults to 'create-' prefixed packages.
 * For example: 'jpm create vite' will execute 'create-vite'.
 */
class CreateCommand extends BaseCommand {
    constructor() {
        super('create');
    }

    /**
     * Executes the scaffolding process.
     * 
     * @param {string[]} args - Template name and optional generator arguments
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        if (!args.length) {
            this.logger.error('Usage: jpm create <template> [options]');
            this.logger.log('Example: jpm create vite');
            return;
        }

        const template = args[0];
        // Convention: 'create-xxx' packages are used for scaffolding
        const pkgName = template.includes('/') || template.startsWith('create-')
            ? template
            : `create-${template}`;

        const remainingArgs = args.slice(1);

        this.logger.info(`Scaffolding project using ${this.logger.c.cyan(pkgName)}...`);

        /** @type {ExecCommand} */
        const exec = new ExecCommand();

        // Inherit config and logger from this command
        exec.config = this.config;
        exec.logger = this.logger;

        try {
            // jpm create vite app-name -- --template react
            // We pass the package name and all following arguments to ExecCommand
            await exec.run([pkgName, ...remainingArgs], flags);
        } catch (err) {
            this.logger.error(`Scaffolding failed: ${err.message}`);
        }
    }
}

module.exports = CreateCommand;
