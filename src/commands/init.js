'use strict';

const readline = require('node:readline');
const path = require('node:path');
const os = require('node:os');
const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');

/**
 * InitCommand handles the 'jpm init' and 'jpm setup' commands.
 * It initializes a new package.json file, either interactively or with defaults.
 */
class InitCommand extends BaseCommand {
    constructor() {
        super('init');
    }

    /**
     * Executes the initialization process.
     * 
     * @param {string[]} args - Optional arguments
     * @param {Object} flags - CLI flags (e.g., -y for defaults)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const pkgFile = path.join(cwd, 'package.json');
        const pkg = new PackageJSON(pkgFile);

        if (flags.y || flags.yes) {
            // Non-interactive: write defaults immediately
            pkg.save();
            this.logger.success(`Created package.json`);
            return;
        }

        this.logger.section('JPM Init — create a new package.json');
        this.logger.log(this.logger.c.gray('Press Enter to accept defaults shown in parentheses.\n'));

        const existing = pkg.data;

        const answers = await this._prompt([
            { key: 'name', label: 'Package name', default: existing.name || path.basename(cwd) },
            { key: 'version', label: 'Version', default: existing.version || '1.0.0' },
            { key: 'description', label: 'Description', default: existing.description || '' },
            { key: 'main', label: 'Entry point', default: existing.main || 'index.js' },
            { key: 'author', label: 'Author', default: existing.author || os.userInfo().username },
            { key: 'license', label: 'License', default: existing.license || 'MIT' },
        ]);

        const data = {
            name: answers.name,
            version: answers.version,
            description: answers.description,
            main: answers.main,
            scripts: existing.scripts || { test: 'echo "Error: no test specified" && exit 1' },
            keywords: existing.keywords || [],
            author: answers.author,
            license: answers.license,
            dependencies: existing.dependencies || {},
            devDependencies: existing.devDependencies || {},
        };

        // Strip empty strings from output to keep it clean
        for (const [k, v] of Object.entries(data)) {
            if (v === '') delete data[k];
        }

        this.logger.log('\n' + JSON.stringify(data, null, 2));
        const confirm = await this._ask('\nIs this OK? (yes) ');

        if (confirm.toLowerCase() === 'no' || confirm.toLowerCase() === 'n') {
            this.logger.warn('Aborted.');
            return;
        }

        for (const [k, v] of Object.entries(data)) {
            pkg.setField(k, v);
        }

        pkg.save();
        this.logger.success(`\nWrote to ${pkgFile}`);
    }

    /**
     * Internal helper to prompt for multiple fields sequentially via terminal.
     * 
     * @param {Object[]} fields - Field definitions to prompt for
     * @returns {Promise<Object>} Map of field keys to user answers
     * @private
     */
    _prompt(fields) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answers = {};
        return new Promise(resolve => {
            let i = 0;
            const next = () => {
                if (i >= fields.length) {
                    rl.close();
                    resolve(answers);
                    return;
                }
                const f = fields[i++];
                const label = this.logger.c.cyan(f.label) + (f.default ? this.logger.c.gray(` (${f.default})`) : '') + ': ';
                rl.question(label, (val) => {
                    answers[f.key] = val.trim() || f.default || '';
                    next();
                });
            };
            next();
        });
    }

    /**
     * Internal helper to ask a single question via terminal.
     * 
     * @param {string} label - Question text
     * @returns {Promise<string>} Trimmed user response
     * @private
     */
    _ask(label) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise(resolve => {
            rl.question(this.logger.c.cyan(label), (val) => {
                rl.close();
                resolve(val.trim());
            });
        });
    }
}

module.exports = InitCommand;

