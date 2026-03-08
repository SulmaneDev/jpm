'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const BaseCommand = require('./base-command');
const { mkdirp, symlink } = require('../utils/fs');
const PackageJSON = require('../core/package-json');

/**
 * LinkCommand handles 'jpm link' and 'jpm link <package>'.
 * Facilitates local package development by creating symbolic links between projects.
 * Similar to 'npm link'.
 */
class LinkCommand extends BaseCommand {
    constructor() {
        super('link');
        /** @type {string} */
        this.globalLinkDir = path.join(os.homedir(), '.jpm', 'links');
    }

    /**
     * Executes the linking process.
     * 
     * @param {string[]} args - Optional package name to link into current project
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();

        if (args.length === 0) {
            // Step 1: Run 'jpm link' in the package directory to register it globally
            await this._linkGlobal(cwd);
        } else {
            // Step 2: Run 'jpm link <pkg>' in the consumer project to use the linked package
            for (const pkgName of args) {
                await this._linkToProject(pkgName, cwd);
            }
        }
    }

    /**
     * Registers a local package directory in the global JPM links folder.
     * 
     * @param {string} pkgDir - Absolute path to the package directory
     * @returns {Promise<void>}
     * @private
     */
    async _linkGlobal(pkgDir) {
        let pkg;
        try {
            pkg = PackageJSON.fromDir(pkgDir);
        } catch (err) {
            this.logger.error(`Could not read package.json in ${pkgDir}`);
            return;
        }

        mkdirp(this.globalLinkDir);
        const dest = path.join(this.globalLinkDir, pkg.name);

        this.logger.info(`Registering ${this.logger.c.cyan(pkg.name)} globally...`);

        try {
            symlink(pkgDir, dest);
            this.logger.success(`${this.logger.c.bold(pkg.name)} linked globally to ${pkgDir}`);
            this.logger.log(`Run ${this.logger.c.gray(`jpm link ${pkg.name}`)} in another project to use it.`);
        } catch (err) {
            this.logger.error(`Failed to create global link: ${err.message}`);
        }
    }

    /**
     * Links a globally registered package into a project's node_modules.
     * 
     * @param {string} pkgName - Name of the package to link
     * @param {string} projectDir - Absolute path to the consumer project
     * @returns {Promise<void>}
     * @private
     */
    async _linkToProject(pkgName, projectDir) {
        const globalSrc = path.join(this.globalLinkDir, pkgName);
        if (!fs.existsSync(globalSrc)) {
            this.logger.error(`Package "${pkgName}" is not linked globally.`);
            this.logger.log(`Run ${this.logger.c.gray('jpm link')} inside the ${pkgName} directory first.`);
            return;
        }

        const projectNM = path.join(projectDir, 'node_modules', pkgName);
        this.logger.info(`Linking ${this.logger.c.cyan(pkgName)} into project...`);

        try {
            symlink(globalSrc, projectNM);
            this.logger.success(`${this.logger.c.bold(pkgName)} linked to ${this.logger.c.gray(projectNM)}`);
        } catch (err) {
            this.logger.error(`Failed to link ${pkgName}: ${err.message}`);
        }
    }
}

module.exports = LinkCommand;
