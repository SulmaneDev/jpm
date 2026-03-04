'use strict';

const config = require('../utils/config');
const logger = require('../utils/logger');

module.exports = async function configCmd(args, flags) {
    const [action, key, ...rest] = args;
    const value = rest.join(' ');

    switch (action) {
        case 'get':
            if (!key) { logger.error('Usage: jpm config get <key>'); process.exit(1); }
            const val = config.get(key);
            if (val === undefined) { logger.warn(`Key "${key}" not set`); }
            else { logger.log(String(val)); }
            break;

        case 'set':
            if (!key || value === '') { logger.error('Usage: jpm config set <key> <value>'); process.exit(1); }
            const layer = flags.global ? 'user' : 'project';
            config.set(key, value, layer);
            logger.success(`Set ${key} = ${value} (${layer})`);
            break;

        case 'delete':
        case 'del':
            if (!key) { logger.error('Usage: jpm config delete <key>'); process.exit(1); }
            config.delete(key, flags.global ? 'user' : 'project');
            logger.success(`Deleted key: ${key}`);
            break;

        case 'list':
        case 'ls': {
            const all = config.list();
            const rows = Object.entries(all).map(([k, v]) => ({ Key: k, Value: String(v) }));
            logger.table(rows, ['Key', 'Value']);
            break;
        }

        default:
            logger.log(`
${logger.c.bold('jpm config')} — manage configuration

  ${logger.c.cyan('jpm config list')}            List all configuration values
  ${logger.c.cyan('jpm config get <key>')}       Get a specific value
  ${logger.c.cyan('jpm config set <key> <val>')} Set a value (project .jpmrc)
  ${logger.c.cyan('jpm config delete <key>')}    Delete a key
  
  ${logger.c.gray('Add --global to modify ~/.jpmrc instead of .jpmrc')}

${logger.c.bold('Common keys:')}
  registry          ${logger.c.gray('Registry URL (default: https://registry.npmjs.org/)')}
  loglevel          ${logger.c.gray('Log level: silent|error|warn|info|verbose|debug')}
  save-exact        ${logger.c.gray('Save exact versions (true/false)')}
  audit-level       ${logger.c.gray('Minimum audit severity: low|moderate|high|critical')}
  cache             ${logger.c.gray('Cache directory path')}
`);
    }
};
