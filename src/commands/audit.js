'use strict';

const fs = require('node:fs');
const path = require('node:path');
const BaseCommand = require('./base-command');
const auditSec = require('../security/audit');
const { Spinner } = require('../utils/progress');

/**
 * AuditCommand handles the 'jpm audit' and 'jpm scan' commands.
 * It performs a security and integrity audit of all installed packages.
 */
class AuditCommand extends BaseCommand {
    constructor() {
        super('audit');
    }

    /**
     * Executes the security audit.
     * 
     * @param {string[]} args - Optional arguments
     * @param {Object} flags - CLI flags (e.g., --level, --fix)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const nodeModules = path.join(cwd, 'node_modules');

        const spinner = new Spinner('Scanning installed packages...').start();
        const installed = [];

        if (fs.existsSync(nodeModules)) {
            for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
                // Handle scoped packages (@org/pkg)
                if (entry.name.startsWith('@') && entry.isDirectory()) {
                    const scopeDir = path.join(nodeModules, entry.name);
                    try {
                        for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
                            const pkgJsonPath = path.join(scopeDir, scoped.name, 'package.json');
                            this._tryAddPackage(pkgJsonPath, installed);
                        }
                    } catch (e) { /* skip */ }
                } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    const pkgJsonPath = path.join(nodeModules, entry.name, 'package.json');
                    this._tryAddPackage(pkgJsonPath, installed);
                }
            }
        }

        spinner.succeed(`Found ${installed.length} installed packages`);

        const level = flags.level || this.config.auditLevel || 'moderate';
        const auditSpinner = new Spinner('Fetching advisory database...').start();

        const { vulnerabilities, stats, total, error } = await auditSec.audit(installed, { level });
        auditSpinner.succeed('Audit complete');

        auditSec.formatAuditResults({ vulnerabilities, stats, total, error });

        // Handle --fix
        if (vulnerabilities.length > 0 && flags.fix) {
            const fixable = vulnerabilities.filter(v => v.fixedIn && v.package !== 'undefined');
            if (fixable.length > 0) {
                this.logger.log('');
                this.logger.info(`Attempting to fix ${fixable.length} vulnerabilities...`);

                const Engine = require('../core/engine');
                const engine = new Engine(cwd);

                // Deduplicate and prepare package specs
                const seen = new Set();
                const toInstall = [];
                for (const v of fixable) {
                    if (seen.has(v.package)) continue;
                    seen.add(v.package);
                    toInstall.push({ name: v.package, version: v.fixedIn });
                }

                try {
                    await engine.install(toInstall, { flags });
                    this.logger.success(`Applied security patches for ${toInstall.length} packages.`);
                } catch (err) {
                    this.logger.error(`Failed to apply fixes: ${err.message}`);
                }
            } else {
                this.logger.info('No automated fixes available for these vulnerabilities.');
            }
        }

        if (total > 0 && !flags.fix) {
            process.exitCode = 1;
        }
    }

    /**
     * Internal helper to read and add package metadata to the list.
     * 
     * @param {string} pkgJsonPath - Path to the package.json file
     * @param {Object[]} list - Reference to the installed packages list
     * @private
     */
    _tryAddPackage(pkgJsonPath, list) {
        if (fs.existsSync(pkgJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
                if (pkg.name && pkg.version) {
                    list.push({ name: pkg.name, version: pkg.version });
                }
            } catch (err) {
                // Silently skip malformed package.json files
            }
        }
    }
}

module.exports = AuditCommand;

