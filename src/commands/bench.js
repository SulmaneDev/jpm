'use strict';

const BaseCommand = require('./base-command');
const { performance } = require('node:perf_hooks');

/**
 * BenchCommand handles the 'jpm bench' command.
 * It measures the execution time of 'jpm syn' or 'jpm install'.
 */
class BenchCommand extends BaseCommand {
    constructor() {
        super('bench');
    }

    /**
     * Executes the benchmark process.
     * 
     * @param {string[]} args - Optional arguments (e.g., 'syn' or 'install <pkg>')
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const commandToRun = args.length > 0 ? args[0] : 'syn';
        const commandArgs = args.slice(1);

        const COMMANDS = {
            syn: () => require('./install'),
            install: () => require('./install')
        };

        const loader = COMMANDS[commandToRun];

        if (!loader) {
            this.logger.error(`Cannot benchmark unknown command: ${commandToRun}`);
            this.logger.info('Supported commands for bench: syn, install');
            return;
        }

        this.logger.info(`Starting benchmark for: jpm ${commandToRun} ${commandArgs.join(' ')}`);

        const handler = loader();
        const instance = new handler(commandToRun);

        // Pass a silent flag if requested, though bench itself might want to see output
        const runFlags = { ...flags };

        const startTime = performance.now();

        try {
            await instance.run(commandArgs, runFlags);
        } catch (err) {
            this.logger.error(`Command failed during benchmark: ${err.message}`);
            return;
        }

        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const durationSec = (durationMs / 1000).toFixed(3);

        this.logger.success(`\nBenchmark Complete!`);
        this.logger.log(`Command: jpm ${commandToRun} ${commandArgs.join(' ')}`);
        this.logger.log(`Execution Time: ${this.logger.c.yellow(`${durationSec}s`)} (${Math.round(durationMs)}ms)`);
    }
}

module.exports = BenchCommand;
