'use strict';

const BaseCommand = require('./base-command');

/**
 * ConfigCommand handles the 'jpm config' commands for managing settings.
 * It provides subcommands for getting, setting, deleting, and listing configurations.
 */
class ConfigCommand extends BaseCommand {
    constructor() {
        super('config');
    }

    /**
     * Executes the configuration management actions.
     * 
     * @param {string[]} args - Action and optional key/value arguments
     * @param {Object} flags - CLI flags (e.g., --global)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const [action, key, ...rest] = args;
        const value = rest.join(' ');

        switch (action) {
            case 'get':
                if (!key) {
                    this.logger.error('Usage: jpm config get <key>');
                    throw new Error('Key missing for config get.');
                }
                const val = this.config.get(key);
                if (val === undefined) {
                    this.logger.warn(`Key "${key}" not set`);
                } else {
                    this.logger.log(String(val));
                }
                break;

            case 'set':
                if (!key || value === '') {
                    this.logger.error('Usage: jpm config set <key> <value>');
                    throw new Error('Key or value missing for config set.');
                }
                const layer = flags.global ? 'user' : 'project';
                this.config.set(key, value, layer);
                this.logger.success(`Set ${key} = ${value} (${layer})`);
                break;

            case 'delete':
            case 'del':
                if (!key) {
                    this.logger.error('Usage: jpm config delete <key>');
                    throw new Error('Key missing for config delete.');
                }
                this.config.delete(key, flags.global ? 'user' : 'project');
                this.logger.success(`Deleted key: ${key}`);
                break;

            case 'list':
            case 'ls': {
                const allConfigs = this.config.list();
                const rows = Object.entries(allConfigs).map(([k, v]) => ({
                    Key: k,
                    Value: String(v)
                }));
                this.logger.table(rows, ['Key', 'Value']);
                break;
            }

            default:
                this._renderHelp();
        }
    }

    /**
     * Internal helper to render the config-specific help message.
     * @private
     */
    _renderHelp() {
        const c = this.logger.c;
        this.logger.log(`
${c.bold('jpm config')} — manage configuration

  ${c.cyan('jpm config list')}            List all configuration values
  ${c.cyan('jpm config get <key>')}       Get a specific value
  ${c.cyan('jpm config set <key> <val>')} Set a value (project .jpmrc)
  ${c.cyan('jpm config delete <key>')}    Delete a key
  
  ${c.gray('Add --global to modify ~/.jpmrc instead of .jpmrc')}

${c.bold('Common keys:')}
  registry          ${c.gray('Registry URL (default: https://registry.npmjs.org/)')}
  loglevel          ${c.gray('Log level: silent|error|warn|info|verbose|debug')}
  save-exact        ${c.gray('Save exact versions (true/false)')}
  audit-level       ${c.gray('Minimum audit severity: low|moderate|high|critical')}
  cache             ${c.gray('Cache directory path')}
`);
    }
}

module.exports = ConfigCommand;

