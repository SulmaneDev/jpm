'use strict';

const fs = require('node:fs');
const path = require('node:path');
const auditSec = require('../security/audit');
const PackageJSON = require('../core/package-json');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');
const config = require('../utils/config');

module.exports = async function auditCmd(args, flags) {
    const cwd = process.cwd();
    const nodeModules = path.join(cwd, 'node_modules');

    // Collect all installed packages from node_modules
    const spinner = new Spinner('Scanning installed packages...').start();
    const installed = [];

    if (fs.existsSync(nodeModules)) {
        for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
            // Handle scoped packages (@org)
            if (entry.name.startsWith('@') && entry.isDirectory()) {
                const scopeDir = path.join(nodeModules, entry.name);
                for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
                    const pkgJson = path.join(scopeDir, scoped.name, 'package.json');
                    if (fs.existsSync(pkgJson)) {
                        try {
                            const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
                            installed.push({ name: pkg.name, version: pkg.version });
                        } catch { }
                    }
                }
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const pkgJson = path.join(nodeModules, entry.name, 'package.json');
                if (fs.existsSync(pkgJson)) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
                        installed.push({ name: pkg.name, version: pkg.version });
                    } catch { }
                }
            }
        }
    }

    spinner.succeed(`Found ${installed.length} installed packages`);

    const level = flags.level || config.auditLevel || 'moderate';
    const auditSpinner = new Spinner('Fetching advisory database...').start();

    const { vulnerabilities, stats, total, error } = await auditSec.audit(installed, { level });
    auditSpinner.succeed('Audit complete');

    auditSec.formatAuditResults({ vulnerabilities, stats, total, error });

    if (total > 0) process.exitCode = 1;
};
