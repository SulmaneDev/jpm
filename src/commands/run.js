'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');

/**
 * RunCommand handles the 'jpm run' command.
 * It executes scripts defined in package.json, supporting pre/post hooks.
 */
class RunCommand extends BaseCommand {
    constructor() {
        super('run');
    }

    /**
     * Executes a specified script from package.json.
     * 
     * @param {string[]} args - Positional arguments (script name and optional parameters)
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const [scriptName, ...scriptArgs] = args;
        const cwd = process.cwd();
        const pkgJson = PackageJSON.fromDir(cwd);
        const scripts = pkgJson.scripts;

        // If no script name provided, list all available scripts
        if (!scriptName) {
            this.logger.section('Available scripts:');
            const scriptEntries = Object.entries(scripts);
            if (!scriptEntries.length) {
                this.logger.info('No scripts defined in package.json');
                return;
            }
            for (const [name, cmd] of scriptEntries) {
                this.logger.log(`  ${this.logger.c.cyan(name.padEnd(20))} ${this.logger.c.gray(cmd)}`);
            }
            return;
        }

        if (!scripts[scriptName]) {
            this.logger.error(`Script "${scriptName}" not found in package.json`);
            this.logger.info(`Available: ${Object.keys(scripts).join(', ')}`);
            throw new Error(`Script "${scriptName}" not found.`);
        }

        // Execute pre-hook if it exists
        const preHook = `pre${scriptName}`;
        if (scripts[preHook]) {
            this.logger.info(`> ${pkgJson.name} ${preHook}`);
            this._executeScript(preHook, scripts, cwd, scriptArgs);
        }

        this.logger.info(`\n> ${pkgJson.name} ${scriptName}`);
        this.logger.info(`> ${scripts[scriptName]}\n`);

        const result = this._executeScript(scriptName, scripts, cwd, scriptArgs);

        // Execute post-hook if it exists
        const postHook = `post${scriptName}`;
        if (scripts[postHook]) {
            this.logger.info(`> ${pkgJson.name} ${postHook}`);
            this._executeScript(postHook, scripts, cwd, scriptArgs);
        }

        if (result.status !== 0) {
            const code = result.status || 1;
            this.logger.error(`Script "${scriptName}" exited with code ${code}`);
            process.exit(code);
        }
    }

    /**
     * Internal helper to spawn a process for a script.
     * Adds node_modules/.bin to the PATH.
     * 
     * @param {string} name - Script name to run
     * @param {Object} scripts - Script definitions from package.json
     * @param {string} cwd - Current working directory
     * @param {string[]} extraArgs - Additional arguments to pass to the script
     * @returns {import('node:child_process').SpawnSyncReturns<Buffer>}
     * @private
     */
    _executeScript(name, scripts, cwd, extraArgs) {
        const cmd = scripts[name] + (extraArgs.length ? ' ' + extraArgs.join(' ') : '');

        const binPath = path.join(cwd, 'node_modules', '.bin');
        const env = {
            ...process.env,
            PATH: `${binPath}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
        };

        return spawnSync(cmd, {
            cwd,
            shell: true,
            stdio: 'inherit',
            env,
        });
    }
}

module.exports = RunCommand;

