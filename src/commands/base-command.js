'use strict';

const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * BaseCommand is the abstract base class for all JPM CLI commands.
 * It provides common infrastructure for argument parsing, validation, and logging.
 * 
 * Each command must implement the `run` method.
 * 
 * @abstract
 */
class BaseCommand {
    /**
     * @param {string} name - The canonical name of the command (e.g., 'install')
     * @param {Object} [options={}] - Command configuration options
     */
    constructor(name, options = {}) {
        /** @type {string} */
        this.name = name;
        /** @type {Object} */
        this.options = options;
        /** @type {Object} */
        this.config = config;
        /** @type {Object} */
        this.logger = logger;
    }

    /**
     * The main execution entry point for the command.
     * Must be implemented by subclasses.
     * 
     * @param {string[]} args - Positional command line arguments
     * @param {Object} flags - Parsed CLI flags/options
     * @returns {Promise<void>}
     * @abstract
     */
    async run(args, flags) {
        throw new Error(`Command "${this.name}" does not implement the run() method.`);
    }

    /**
     * Displays command-specific help information.
     * Can be overridden by subclasses for more detailed help.
     */
    help() {
        this.logger.log(`Usage: jpm ${this.name} [options] [args]`);
    }

    /**
     * Validates command arguments. Can be overridden by subclasses.
     * 
     * @param {string[]} args - Positional arguments
     * @returns {boolean} True if arguments are valid
     */
    validate(args) {
        return true;
    }
}

module.exports = BaseCommand;
