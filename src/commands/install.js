'use strict';

const BaseCommand = require('./base-command');
const { Spinner } = require('../utils/progress');

/**
 * InstallCommand handles the 'jpm install' command and its aliases.
 * It coordinates package resolution, downloading, and filesystem installation.
 */
class InstallCommand extends BaseCommand {
    constructor() {
        super('install');
    }

    /**
     * Executes the installation process.
     * 
     * @param {string[]} args - Positional arguments (package names/versions)
     * @param {Object} flags - CLI flags (e.g., --save-dev, --fast)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const Engine = require('../core/engine');
        const engine = new Engine(cwd);

        const isDev = flags.D || flags['save-dev'];
        const isExact = flags.E || flags['save-exact'] || this.config.saveExact;
        const noSave = flags['no-save'];
        const dryRun = flags['dry-run'];

        // ── Parse packages to install ──────────────────────────────────────────────
        let toInstall = [];

        if (args.length) {
            // Specific packages requested: `jpm install express lodash@4.17.21`
            for (const arg of args) {
                const lastAt = arg.lastIndexOf('@');
                const hasVersion = lastAt > 0;
                const name = hasVersion ? arg.slice(0, lastAt) : arg;
                const version = hasVersion ? arg.slice(lastAt + 1) : 'latest';
                toInstall.push({ name, version });
            }
        } else {
            // General install from package.json/lockfile
            if (engine.lockfile.exists()) {
                await engine.installFromLock(flags);
                return;
            }

            const allDeps = {
                ...engine.pkgJson.dependencies,
                ...(flags.production ? {} : engine.pkgJson.devDependencies),
            };

            if (!Object.keys(allDeps).length) {
                this.logger.info('Nothing to install.');
                return;
            }

            toInstall = Object.entries(allDeps).map(([name, version]) => ({ name, version }));
        }

        // ── Core Installation Flow ────────────────────────────────────────────────
        const resolvedMap = await engine.install(toInstall, {
            dev: !!isDev,
            exact: !!isExact,
            noSave: !!noSave,
            flags
        });

        // ── Summary ────────────────────────────────────────────────────────────────
        const directly = toInstall.map(({ name }) => {
            const r = [...resolvedMap.values()].find(m => m.name === name);
            return r ? `${r.name}@${r.version}` : name;
        });

        this.logger.success(`\nadded ${resolvedMap.size} packages`);
        directly.forEach(p => this.logger.log(`  + ${this.logger.c.green(p)}`));
    }
}

module.exports = InstallCommand;

