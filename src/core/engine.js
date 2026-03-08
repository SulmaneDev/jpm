'use strict';

const path = require('node:path');
const Resolver = require('./resolver');
const Installer = require('./installer');
const Lockfile = require('./lockfile');
const PackageJSON = require('./package-json');
const logger = require('../utils/logger');
const { Spinner } = require('../utils/progress');

/**
 * Engine class coordinates the higher-level package management operations.
 * It ties together resolution, installation, and persistence logic.
 */
class Engine {
    /**
     * @param {string} projectRoot - The absolute path to the project root directory
     */
    constructor(projectRoot) {
        /** @type {string} */
        this.projectRoot = projectRoot;
        /** @type {PackageJSON} */
        this.pkgJson = PackageJSON.fromDir(projectRoot);
        /** @type {Lockfile} */
        this.lockfile = new Lockfile(projectRoot);
        /** @type {Installer} */
        this.installer = new Installer(projectRoot);
    }

    /**
     * Executes a full installation flow for a set of packages.
     * 
     * @param {Array<{name: string, version: string}>} packages - Packages to install
     * @param {Object} options - Installation options
     * @param {boolean} [options.dev=false] - Whether to install as devDependencies
     * @param {boolean} [options.exact=false] - Whether to save as exact versions
     * @param {boolean} [options.noSave=false] - Whether to skip updating package.json
     * @param {Object} [options.flags={}] - CLI flags
     * @returns {Promise<Map<string, Object>>} The resolved package map
     */
    async install(packages, options = {}) {
        const { dev = false, exact = false, noSave = false, flags = {} } = options;

        // 1. Resolve
        const resolveSpinner = new Spinner(`Resolving ${packages.length} package(s)...`).start();
        const resolver = new Resolver();

        const deps = {};
        const devDeps = {};
        for (const { name, version } of packages) {
            if (dev) devDeps[name] = version;
            else deps[name] = version;
        }

        let resolvedMap;
        try {
            resolvedMap = await resolver.resolve(deps, devDeps, {}, (count) => {
                resolveSpinner.text = `Resolving packages... (${count} resolved)`;
            });
            resolveSpinner.succeed(`Resolved ${resolvedMap.size} packages`);
        } catch (err) {
            resolveSpinner.fail(`Resolution failed: ${err.message}`);
            throw err;
        }

        // 2. Audit for cycles
        const circular = resolver.findCircular();
        if (circular.length) {
            logger.warn(`Circular dependencies detected:\n  ${circular.join('\n  ')}`);
        }

        // 3. Install
        logger.info(`Installing ${resolvedMap.size} packages...`);
        try {
            await this.installer.installAll(resolvedMap, { dryRun: flags['dry-run'], flags });
        } catch (err) {
            logger.error(`Install failed: ${err.message}`);
            throw err;
        }

        // 4. Persist Changes
        if (!noSave && !flags['dry-run'] && packages.length) {
            for (const { name } of packages) {
                const resolved = [...resolvedMap.values()].find(m => m.name === name);
                if (!resolved) continue;
                this.pkgJson.addDependency(name, resolved.version, { dev, exact });
            }
            this.pkgJson.save();
            logger.verbose('Updated package.json');
        }

        if (!flags['dry-run']) {
            this.lockfile.update(resolvedMap).save();
            logger.verbose('Updated jpm-lock.json');
        }

        return resolvedMap;
    }

    /**
     * Performs a deterministic install from the lockfile.
     * 
     * @param {Object} [flags={}] - CLI flags
     * @returns {Promise<void>}
     */
    async installFromLock(flags = {}) {
        if (!this.lockfile.exists()) {
            throw new Error('No lockfile found. Run jpm install first.');
        }

        logger.info('Using lock file for deterministic install');
        const lockData = this.lockfile.allPackages();
        const spinner = new Spinner('Installing from lock file...').start();

        const fakeMap = new Map(lockData.map(p => [`${p.name}@${p.version}`, p]));
        await this.installer.installAll(fakeMap, { dryRun: flags['dry-run'], flags });

        spinner.succeed(`Installed ${lockData.length} packages`);
    }
}

module.exports = Engine;
