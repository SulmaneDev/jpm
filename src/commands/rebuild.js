'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const BaseCommand = require('./base-command');
const { Spinner } = require('../utils/progress');

/**
 * RebuildCommand handles the 'jpm rebuild' command.
 * It re-runs lifecycle scripts (preinstall, install, postinstall) for installed packages.
 */
class RebuildCommand extends BaseCommand {
    constructor() {
        super('rebuild');
    }

    /**
     * Executes the rebuild process across node_modules.
     * 
     * @param {string[]} args - Optional package names to limit the rebuild to
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const nmDir = path.join(cwd, 'node_modules');

        if (!fs.existsSync(nmDir)) {
            this.logger.error('node_modules directory not found. Run jpm install first.');
            return;
        }

        const targets = args.length ? new Set(args) : null;
        const scanSpinner = new Spinner('Scanning node_modules for scripts...').start();

        const pkgsWithScripts = [];
        const entries = fs.readdirSync(nmDir, { withFileTypes: true });

        for (const entry of entries) {
            // Skip non-package entries (like .bin)
            if (entry.name.startsWith('.')) continue;

            if (entry.name.startsWith('@')) {
                // Handle scoped packages
                const scopeDir = path.join(nmDir, entry.name);
                try {
                    const scopedEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
                    for (const scopedEntry of scopedEntries) {
                        this._checkPkg(path.join(scopeDir, scopedEntry.name), pkgsWithScripts, targets);
                    }
                } catch (e) { /* ignore read errors */ }
            } else {
                this._checkPkg(path.join(nmDir, entry.name), pkgsWithScripts, targets);
            }
        }

        scanSpinner.succeed(`Found ${pkgsWithScripts.length} package(s) with lifecycle scripts.`);

        if (pkgsWithScripts.length === 0) {
            this.logger.info('No lifecycle scripts found to run.');
            return;
        }

        for (const { name, dir, scripts } of pkgsWithScripts) {
            // Lifecycle scripts run in specific order: preinstall -> install -> postinstall
            for (const hook of ['preinstall', 'install', 'postinstall']) {
                if (scripts[hook]) {
                    this.logger.section(`▶ ${this.logger.c.cyan(name)} — ${hook}`);
                    const result = spawnSync(scripts[hook], {
                        cwd: dir,
                        shell: true,
                        stdio: 'inherit',
                        env: { ...process.env, PATH: `${path.join(nmDir, '.bin')}${path.delimiter}${process.env.PATH}` }
                    });

                    if (result.status !== 0) {
                        this.logger.warn(`Script "${hook}" in ${name} failed with exit code ${result.status}`);
                    }
                }
            }
        }

        this.logger.success('Rebuild complete!');
    }

    /**
     * Checks a directory for a package.json containing lifecycle scripts.
     * 
     * @param {string} dir - Directory to check
     * @param {Array} list - Array to push matching package info into
     * @param {Set|null} targets - Optional set of package names to filter by
     * @private
     */
    _checkPkg(dir, list, targets) {
        const pkgFile = path.join(dir, 'package.json');
        if (!fs.existsSync(pkgFile)) return;

        try {
            const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
            if (targets && !targets.has(pkg.name)) return;

            const scripts = pkg.scripts || {};
            const hasScripts = scripts.install || scripts.preinstall || scripts.postinstall;

            if (hasScripts) {
                list.push({ name: pkg.name, dir, scripts });
            }
        } catch (err) {
            // skip invalid or unreadable package.json
        }
    }
}

module.exports = RebuildCommand;
