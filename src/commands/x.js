'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Resolver = require('../core/resolver');
const Installer = require('../core/installer');
const { tempDir, rimraf } = require('../utils/fs');
const { Spinner } = require('../utils/progress');
const config = require('../utils/config');
const logger = require('../utils/logger');

/**
 * jpm x <package>[@version] [args...]
 * 
 * Equivalent to npx. Resolves, installs to a temp dir, and executes.
 */
module.exports = async function xCommand(args, flags) {
    if (!args.length) {
        logger.error('No package specified to execute.');
        logger.info('Usage: jpm x <package>[@version] [args...]');
        process.exit(1);
    }

    const pkgArg = args[0];
    const execArgs = args.slice(1);

    const lastAt = pkgArg.lastIndexOf('@');
    // Handle scoped packages correctly: @scope/pkg@version
    const hasVersion = lastAt > 0 && !pkgArg.startsWith('@') || (pkgArg.startsWith('@') && pkgArg.split('@').length > 2);

    let name, range;
    if (pkgArg.startsWith('@')) {
        const parts = pkgArg.split('@');
        name = '@' + parts[1];
        range = parts[2] || 'latest';
    } else {
        name = hasVersion ? pkgArg.slice(0, lastAt) : pkgArg;
        range = hasVersion ? pkgArg.slice(lastAt + 1) : 'latest';
    }

    const resolveSpinner = new Spinner(`Resolving ${name}@${range}...`).start();

    try {
        // 1. Resolve
        const resolver = new Resolver();
        const resolvedMap = await resolver.resolve({ [name]: range }, {}, {}, (count) => {
            resolveSpinner.text = `Resolving... (${count} resolved)`;
        });
        resolveSpinner.succeed(`Resolved ${resolvedMap.size} packages`);

        // 2. Install to temp
        const tmp = tempDir('jpm-x-');
        const installer = new Installer(tmp);

        logger.info(`Installing to temporary directory...`);
        await installer.installAll(resolvedMap, { flags });

        // 3. Find the binary
        const resolvedPkg = [...resolvedMap.values()].find(m => m.name === name);
        if (!resolvedPkg) throw new Error(`Failed to find resolved metadata for ${name}`);

        const bins = resolvedPkg.bin;
        let binName;

        if (typeof bins === 'string') {
            binName = name.split('/').pop();
        } else if (typeof bins === 'object' && bins !== null) {
            const entries = Object.keys(bins);
            if (entries.length === 0) throw new Error(`Package ${name} has no binaries.`);
            binName = entries.find(k => k === name || k === name.split('/').pop()) || entries[0];
        } else {
            throw new Error(`Package ${name} does not define any binaries in package.json`);
        }

        const binPath = path.join(tmp, 'node_modules', '.bin', binName + (process.platform === 'win32' ? '.cmd' : ''));

        // If the .cmd doesn't exist, try the raw JS file with node
        let finalBin = binPath;
        let finalArgs = execArgs;
        let useNode = false;

        const fs = require('node:fs');
        if (!fs.existsSync(binPath)) {
            // Fallback to finding the JS file
            const relPath = typeof bins === 'string' ? bins : bins[binName];
            finalBin = path.join(tmp, 'node_modules', name, relPath);
            useNode = true;
        }

        logger.info(`Executing ${binName}...\n`);

        const spawnCmd = useNode ? process.execPath : finalBin;
        const spawnArgs = useNode ? [finalBin, ...execArgs] : execArgs;

        const env = {
            ...process.env,
            PATH: `${path.join(tmp, 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
        };

        // On Windows, when shell: true is used, we need to be very careful with quoting
        // if the path to node or the binary contains spaces (like C:\Program Files\...)
        const isWin = process.platform === 'win32';

        let result;
        if (isWin && useNode) {
            // Special handling for Windows + Node to avoid quoting hell with shell: true
            result = spawnSync(`"${process.execPath}"`, [`"${finalBin}"`, ...execArgs.map(a => `"${a}"`)], {
                cwd: process.cwd(),
                stdio: 'inherit',
                env,
                shell: true,
                windowsVerbatimArguments: true
            });
        } else {
            result = spawnSync(useNode ? process.execPath : finalBin, useNode ? [finalBin, ...execArgs] : execArgs, {
                cwd: process.cwd(),
                stdio: 'inherit',
                env,
                shell: true
            });
        }

        if (result.error) throw result.error;

        // Cleanup on success if not in debug
        if (result.status === 0 && config.loglevel !== 'debug') {
            rimraf(tmp);
        }

        process.exit(result.status ?? 0);

    } catch (err) {
        resolveSpinner.fail(`Error: ${err.message}`);
        process.exit(1);
    }
};
