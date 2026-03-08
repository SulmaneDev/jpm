'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const BaseCommand = require('./base-command');
const http = require('../utils/http');
const registry = require('../core/registry');

/**
 * DoctorCommand handles the 'jpm doctor' command.
 * It performs various health checks on the environment and project.
 */
class DoctorCommand extends BaseCommand {
    constructor() {
        super('doctor');
    }

    /**
     * Executes the health checks.
     * 
     * @param {string[]} args - CLI arguments (unused)
     * @param {Object} flags - CLI flags
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        this.logger.section('JPM Doctor — Environment Health Check');

        const c = this.logger.c;
        let issues = 0;

        // 1. Check Node.js Environment
        const nodeVersion = process.version;
        const platform = process.platform;
        this.logger.log(`${c.cyan('Node.js')}    ${nodeVersion} (${platform})`);

        const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
        if (major < 18) {
            this.logger.warn(`  ! JPM recommends Node.js v18 or higher (found ${nodeVersion})`);
            issues++;
        }

        // 2. Check Registry Connectivity
        const registryUrl = this.config.get('registry');
        this.logger.log(`${c.cyan('Registry')}   ${registryUrl}`);
        try {
            const start = Date.now();
            await http.getJSON(`${registryUrl.replace(/\/$/, '')}/ping`);
            const latency = Date.now() - start;
            this.logger.log(`  ${c.green('✓')} Connected (${latency}ms)`);
        } catch (err) {
            this.logger.error(`  ${c.red('✖')} Could not connect to registry: ${err.message}`);
            issues++;
        }

        // 3. Check Cache Directory
        const cacheDir = this.config.cacheDir;
        this.logger.log(`${c.cyan('Cache Dir')}  ${cacheDir}`);
        try {
            if (!fs.existsSync(cacheDir)) {
                this.logger.log('  - Directory does not exist (will be created on first use)');
            } else {
                fs.accessSync(cacheDir, fs.constants.R_OK | fs.constants.W_OK);
                const stats = fs.statSync(cacheDir);
                this.logger.log(`  ${c.green('✓')} Writable (${stats.mode.toString(8)})`);
            }
        } catch (err) {
            this.logger.error(`  ${c.red('✖')} Cache directory is not accessible: ${err.message}`);
            issues++;
        }

        // 4. Check Local Project
        const projectRoot = this.config.get('prefix') || process.cwd();
        const pkgFile = path.join(projectRoot, 'package.json');
        this.logger.log(`${c.cyan('Project')}    ${projectRoot}`);
        if (fs.existsSync(pkgFile)) {
            this.logger.log(`  ${c.green('✓')} package.json found`);
        } else {
            this.logger.warn('  ! No package.json found in current directory');
            // Not necessarily an issue for a global check, but worth noting
        }

        this.logger.log('');
        if (issues === 0) {
            this.logger.success('Your environment is healthy! No issues found.');
        } else {
            this.logger.warn(`Found ${issues} potential issue(s). Check the logs above.`);
        }
    }
}

module.exports = DoctorCommand;
