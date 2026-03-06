'use strict';

const BaseCommand = require('./base-command');
const Resolver = require('../core/resolver');
const Installer = require('../core/installer');
const Lockfile = require('../core/lockfile');
const PackageJSON = require('../core/package-json');
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
        const pkgJson = PackageJSON.fromDir(cwd);
        const lockfile = new Lockfile(cwd);
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
            // General install from package.json
            const spinner = new Spinner('Reading package.json...').start();
            const allDeps = {
                ...pkgJson.dependencies,
                ...(flags.production ? {} : pkgJson.devDependencies),
            };
            spinner.succeed(`Found ${Object.keys(allDeps).length} dependencies`);

            // Deterministic install from lockfile if it exists and no arguments provided
            if (lockfile.exists()) {
                this.logger.info('Using lock file for deterministic install');
                const lockData = lockfile.allPackages();
                const installer = new Installer(cwd);
                const bar = new Spinner('Installing from lock file...');
                bar.start();
                const fakeMap = new Map(lockData.map(p => [`${p.name}@${p.version}`, p]));
                await installer.installAll(fakeMap, { dryRun, flags });
                bar.succeed(`Installed ${lockData.length} packages`);
                return;
            }

            toInstall = Object.entries(allDeps).map(([name, version]) => ({ name, version }));
        }

        if (!toInstall.length) {
            this.logger.info('Nothing to install.');
            return;
        }

        // ── Resolve ────────────────────────────────────────────────────────────────
        const resolveSpinner = new Spinner(`Resolving ${toInstall.length} package(s)...`).start();
        const resolver = new Resolver();

        const deps = {};
        const devDeps = {};
        for (const { name, version } of toInstall) {
            if (isDev) devDeps[name] = version;
            else deps[name] = version;
        }

        let resolvedMap;
        try {
            resolvedMap = await resolver.resolve(deps, devDeps, {}, (count, total) => {
                resolveSpinner.text = `Resolving packages... (${count} resolved)`;
            });
            resolveSpinner.succeed(`Resolved ${resolvedMap.size} packages (including transitive deps)`);
        } catch (err) {
            resolveSpinner.fail(`Resolution failed: ${err.message}`);
            throw err; // Let caller handle exit
        }

        // Warn about circular deps
        const circular = resolver.findCircular();
        if (circular.length) {
            this.logger.warn(`Circular dependencies detected:\n  ${circular.join('\n  ')}`);
        }

        // ── Install ────────────────────────────────────────────────────────────────
        this.logger.info(`Installing ${resolvedMap.size} packages...`);
        const installer = new Installer(cwd);
        try {
            await installer.installAll(resolvedMap, { dryRun, flags });
        } catch (err) {
            this.logger.error(`Install failed: ${err.message}`);
            throw err;
        }

        // ── Update package.json & lock file ─────────────────────────────────────────
        if (!noSave && !dryRun && args.length) {
            for (const { name } of toInstall) {
                const resolved = [...resolvedMap.values()].find(m => m.name === name);
                if (!resolved) continue;
                pkgJson.addDependency(name, resolved.version, { dev: !!isDev, exact: isExact });
            }
            pkgJson.save();
            this.logger.verbose('Updated package.json');
        }

        if (!dryRun) {
            lockfile.update(resolvedMap).save();
            this.logger.verbose('Updated jpm-lock.json');
        }

        // ── Summary ────────────────────────────────────────────────────────────────
        const dupes = resolver.deduplicate();
        if (dupes.length) {
            this.logger.verbose(`Deduplication: ${dupes.length} packages have multiple versions`);
        }

        const directly = toInstall.map(({ name }) => {
            const r = [...resolvedMap.values()].find(m => m.name === name);
            return r ? `${r.name}@${r.version}` : name;
        });

        this.logger.success(`\nadded ${resolvedMap.size} packages`);
        directly.forEach(p => this.logger.log(`  + ${this.logger.c.green(p)}`));
    }
}

module.exports = InstallCommand;

