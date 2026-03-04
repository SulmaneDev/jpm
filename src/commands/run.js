'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const PackageJSON = require('../core/package-json');
const logger = require('../utils/logger');

module.exports = async function run(args, flags) {
    const [scriptName, ...scriptArgs] = args;
    const cwd = process.cwd();
    const pkgJson = PackageJSON.fromDir(cwd);
    const scripts = pkgJson.scripts;

    // `jpm run` with no script — list available scripts
    if (!scriptName) {
        logger.section('Available scripts:');
        if (!Object.keys(scripts).length) {
            logger.info('No scripts defined in package.json');
            return;
        }
        for (const [name, cmd] of Object.entries(scripts)) {
            logger.log(`  ${logger.c.cyan(name.padEnd(20))} ${logger.c.gray(cmd)}`);
        }
        return;
    }

    if (!scripts[scriptName]) {
        logger.error(`Script "${scriptName}" not found in package.json`);
        logger.info(`Available: ${Object.keys(scripts).join(', ')}`);
        process.exit(1);
    }

    // Pre-hook: check for 'pre<script>'
    if (scripts[`pre${scriptName}`]) {
        logger.info(`> ${pkgJson.name} pre${scriptName}`);
        run_script(`pre${scriptName}`, scripts, cwd, scriptArgs);
    }

    logger.info(`\n> ${pkgJson.name} ${scriptName}`);
    logger.info(`> ${scripts[scriptName]}\n`);

    const result = run_script(scriptName, scripts, cwd, scriptArgs);

    // Post-hook: check for 'post<script>'
    if (scripts[`post${scriptName}`]) {
        logger.info(`> ${pkgJson.name} post${scriptName}`);
        run_script(`post${scriptName}`, scripts, cwd, scriptArgs);
    }

    if (result.status !== 0) {
        logger.error(`Script "${scriptName}" exited with code ${result.status}`);
        process.exit(result.status || 1);
    }
};

function run_script(name, scripts, cwd, extraArgs) {
    const cmd = scripts[name] + (extraArgs.length ? ' ' + extraArgs.join(' ') : '');

    // Add local .bin to PATH so locally installed binaries work
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
