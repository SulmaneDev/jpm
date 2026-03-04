'use strict';

const readline = require('node:readline');
const path = require('node:path');
const os = require('node:os');
const PackageJSON = require('../core/package-json');
const logger = require('../utils/logger');

module.exports = async function init(args, flags) {
    const cwd = process.cwd();
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = new PackageJSON(pkgFile);

    if (flags.y || flags.yes) {
        // Non-interactive: write defaults
        pkg.save();
        logger.success(`Created package.json`);
        return;
    }

    logger.section('JPM Init — create a new package.json');
    logger.log(logger.c.gray('Press Enter to accept defaults shown in parentheses.\n'));

    const existing = pkg.data;

    const answers = await prompt([
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

    // Strip empty strings from output
    for (const [k, v] of Object.entries(data)) {
        if (v === '') delete data[k];
    }

    logger.log('\n' + JSON.stringify(data, null, 2));
    const confirm = await ask('\nIs this OK? (yes) ');
    if (confirm === 'no' || confirm === 'n') {
        logger.warn('Aborted.');
        return;
    }

    for (const [k, v] of Object.entries(data)) pkg.setField(k, v);
    pkg.save();
    logger.success(`\nWrote to ${pkgFile}`);
};

function prompt(fields) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answers = {};
    return new Promise(resolve => {
        let i = 0;
        function next() {
            if (i >= fields.length) { rl.close(); resolve(answers); return; }
            const f = fields[i++];
            const label = logger.c.cyan(f.label) + (f.default ? logger.c.gray(` (${f.default})`) : '') + ': ';
            rl.question(label, (val) => {
                answers[f.key] = val.trim() || f.default || '';
                next();
            });
        }
        next();
    });
}

function ask(label) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(logger.c.cyan(label), (val) => { rl.close(); resolve(val.trim()); });
    });
}
