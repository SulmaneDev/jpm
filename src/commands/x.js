'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const BaseCommand = require('./base-command');
const Resolver = require('../core/resolver');
const Installer = require('../core/installer');
const { tempDir, rimraf } = require('../utils/fs');
const { Spinner } = require('../utils/progress');

/**
 * ExecCommand handles the 'jpm x' and 'jpm exec' commands (equivalent to npx).
 * It resolves a package, installs it to a temporary directory, and executes its binary.
 */
class ExecCommand extends BaseCommand {
    constructor() {
        super('x');
    }

    /**
     * Executes the specified package binary.
     * 
     * @param {string[]} args - Package name and arguments for the binary
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        if (!args.length) {
            this.logger.error('No package specified to execute.');
            this.logger.info('Usage: jpm x <package>[@version] [args...]');
            throw new Error('No package specified.');
        }

        const pkgArg = args[0];
        const execArgs = args.slice(1);

        // Parse name and range from argument (handling scoped packages)
        let name, range;
        const lastAt = pkgArg.lastIndexOf('@');
        const isScoped = pkgArg.startsWith('@');
        const hasVersion = lastAt > 0 && !(isScoped && pkgArg.indexOf('@', 1) === -1);

        if (isScoped) {
            const parts = pkgArg.split('@');
            name = '@' + parts[1];
            range = parts[2] || 'latest';
        } else {
            name = hasVersion ? pkgArg.slice(0, lastAt) : pkgArg;
            range = hasVersion ? pkgArg.slice(lastAt + 1) : 'latest';
        }

        const resolveSpinner = new Spinner(`Resolving ${name}@${range}...`).start();

        let tmpDir;
        try {
            // 1. Resolve dependencies
            const resolver = new Resolver();
            const resolvedMap = await resolver.resolve({ [name]: range }, {}, {}, (count) => {
                resolveSpinner.text = `Resolving... (${count} resolved)`;
            });
            resolveSpinner.succeed(`Resolved ${resolvedMap.size} packages`);

            // 2. Install to temporary directory
            tmpDir = tempDir('jpm-x-');
            const installer = new Installer(tmpDir);

            this.logger.info(`Installing to temporary directory...`);
            await installer.installAll(resolvedMap, { flags });

            // 3. Locate and execute binary
            const resolvedPkg = [...resolvedMap.values()].find(m => m.name === name);
            if (!resolvedPkg) {
                throw new Error(`Failed to find resolved metadata for ${name}`);
            }

            const binaryInfo = this._resolveBinary(name, resolvedPkg.bin);
            const binaryPath = path.join(tmpDir, 'node_modules', '.bin', binaryInfo.name + (process.platform === 'win32' ? '.cmd' : ''));

            let finalExecutable = binaryPath;
            let finalArgs = execArgs;
            let useNode = false;

            if (!fs.existsSync(binaryPath)) {
                // Fallback: search for the JS file defined in package.json bin field
                const relPath = typeof resolvedPkg.bin === 'string' ? resolvedPkg.bin : resolvedPkg.bin[binaryInfo.name];
                finalExecutable = path.join(tmpDir, 'node_modules', name, relPath);
                useNode = true;
            }

            this.logger.info(`Executing ${binaryInfo.name}...\n`);

            const env = {
                ...process.env,
                PATH: `${path.join(tmpDir, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
            };

            const result = this._spawnProcess(finalExecutable, finalArgs, useNode, env);

            if (result.error) throw result.error;

            // Cleanup temp directory on success unless debugging
            if (result.status === 0 && this.config.loglevel !== 'debug') {
                this._cleanupTemp(tmpDir);
            }

            process.exit(result.status ?? 0);

        } catch (err) {
            if (tmpDir && fs.existsSync(tmpDir) && this.config.loglevel !== 'debug') {
                this._cleanupTemp(tmpDir);
            }
            resolveSpinner.fail(`Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Safely cleans up a temporary directory, handling Windows junctions and symlinks.
     * 
     * @param {string} tmpDir - Path to the temporary directory
     * @private
     */
    _cleanupTemp(tmpDir) {
        try {
            // On Windows, junctions inside node_modules can sometimes block rimraf
            // if not handled carefully. Our internal rimraf handles recursive delete,
            // but we add an extra safety check here.
            rimraf(tmpDir);
        } catch (err) {
            this.logger.debug(`Minor: Failed to cleanup temp directory ${tmpDir}: ${err.message}`);
        }
    }

    /**
     * Identifies the primary binary name from package metadata.
     * 
     * @param {string} pkgName - Package name
     * @param {string|Object} binField - The 'bin' field from package.json
     * @returns {Object} Binary name and relative path
     * @private
     */
    _resolveBinary(pkgName, binField) {
        let name;
        if (typeof binField === 'string') {
            name = pkgName.split('/').pop();
            return { name, path: binField };
        } else if (typeof binField === 'object' && binField !== null) {
            const entries = Object.keys(binField);
            if (entries.length === 0) throw new Error(`Package ${pkgName} has no binaries.`);
            name = entries.find(k => k === pkgName || k === pkgName.split('/').pop()) || entries[0];
            return { name, path: binField[name] };
        }
        throw new Error(`Package ${pkgName} defines no binaries.`);
    }

    /**
     * Spawns the execution process with cross-platform considerations.
     * 
     * @param {string} bin - Binary/Executable path
     * @param {string[]} args - Arguments
     * @param {boolean} useNode - Whether to execute via the node binary
     * @param {Object} env - Environment variables
     * @returns {import('node:child_process').SpawnSyncReturns<Buffer>}
     * @private
     */
    _spawnProcess(bin, args, useNode, env) {
        const isWin = process.platform === 'win32';

        if (isWin && useNode) {
            // Windows specific: wrap in quotes and use verbatim arguments for reliability
            return spawnSync(`"${process.execPath}"`, [`"${bin}"`, ...args.map(a => `"${a}"`)], {
                cwd: process.cwd(),
                stdio: 'inherit',
                env,
                shell: true,
                windowsVerbatimArguments: true
            });
        }

        return spawnSync(useNode ? process.execPath : bin, useNode ? [bin, ...args] : args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            env,
            shell: true
        });
    }
}

module.exports = ExecCommand;

