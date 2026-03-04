'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const tar = require('tar');
const PackageJSON = require('../core/package-json');
const integrity = require('../security/integrity');
const { getJSON } = require('../utils/http');
const { tempDir, mkdirp } = require('../utils/fs');
const { Spinner } = require('../utils/progress');
const logger = require('../utils/logger');
const config = require('../utils/config');

module.exports = async function publish(args, flags) {
    const cwd = process.cwd();
    const pkgJson = PackageJSON.fromDir(cwd);

    // 1. Validate
    const errors = pkgJson.validate();
    if (errors.length) {
        logger.error('package.json validation failed:');
        errors.forEach(e => logger.error(`  ${e}`));
        process.exit(1);
    }

    const { name, version } = pkgJson;
    const registry = config.registry.replace(/\/$/, '');

    logger.section(`Publishing ${name}@${version}`);

    // 2. Check auth token
    const token = config.get('//registry.npmjs.org/:_authToken') || config.get('_authToken');
    if (!token) {
        logger.error('Not logged in. Set _authToken in ~/.jpmrc or run: npm login');
        process.exit(1);
    }

    // 3. Check if version already exists
    const spinner = new Spinner('Checking if version exists...').start();
    try {
        const existing = await getJSON(`${registry}/${encodeURIComponent(name)}/${version}`);
        spinner.fail(`Version ${name}@${version} already exists in registry`);
        process.exit(1);
    } catch (err) {
        if (err.status !== 404) {
            spinner.warn('Could not verify version uniqueness, continuing...');
        } else {
            spinner.succeed('Version check passed');
        }
    }

    // 4. Create tarball
    const tmp = tempDir('jpm-publish-');
    const tgz = path.join(tmp, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);

    const packSpinner = new Spinner('Packing tarball...').start();

    // Collect files respecting .npmignore / default ignore list
    const ignore = getIgnoreList(cwd);
    await tar.create(
        { gzip: true, file: tgz, cwd, prefix: 'package' },
        getFilesToPack(cwd, ignore)
    );

    const tgzStat = fs.statSync(tgz);
    const shasum = await integrity.hashFile(tgz, 'sha1', 'hex');
    const integrityH = await integrity.generateIntegrity(tgz);
    const tgzBase64 = fs.readFileSync(tgz).toString('base64');

    packSpinner.succeed(`Packed ${logger.c.gray(`(${(tgzStat.size / 1024).toFixed(1)} KB)`)}`);

    // 5. Build publish body
    const body = {
        _id: name,
        name,
        'dist-tags': { latest: version },
        versions: {
            [version]: {
                ...pkgJson.data,
                dist: {
                    shasum,
                    integrity: integrityH,
                    tarball: `${registry}/${encodeURIComponent(name)}/-/${name}-${version}.tgz`,
                },
            },
        },
        _attachments: {
            [`${name}-${version}.tgz`]: {
                content_type: 'application/octet-stream',
                data: tgzBase64,
                length: tgzStat.size,
            },
        },
    };

    // 6. PUT to registry
    const uploadSpinner = new Spinner('Uploading to registry...').start();
    const { request } = require('../utils/http');
    const bodyStr = JSON.stringify(body);

    try {
        const res = await request(`${registry}/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(bodyStr),
                ...(flags.otp ? { 'npm-otp': flags.otp } : {}),
            },
            body: bodyStr,
            retries: 1,
        });

        if (res.status < 200 || res.status >= 300) {
            uploadSpinner.fail(`Publish failed: HTTP ${res.status} — ${res.body.slice(0, 200)}`);
            process.exit(1);
        }

        uploadSpinner.succeed('Published!');
        logger.success(`\n+ ${name}@${version}`);
        logger.log(logger.c.gray(`${registry}/${encodeURIComponent(name)}`));
    } catch (err) {
        uploadSpinner.fail(`Publish error: ${err.message}`);
        process.exit(1);
    }
};

function getIgnoreList(dir) {
    const defaults = new Set(['node_modules', '.git', '.DS_Store', '*.log', 'coverage', '.jpm-lock.json']);
    const ignoreFile = path.join(dir, '.npmignore');
    if (fs.existsSync(ignoreFile)) {
        fs.readFileSync(ignoreFile, 'utf8').split('\n').forEach(l => {
            const t = l.trim();
            if (t && !t.startsWith('#')) defaults.add(t);
        });
    }
    return defaults;
}

function getFilesToPack(dir, ignore) {
    const files = [];
    for (const entry of fs.readdirSync(dir)) {
        if ([...ignore].some(ig => entry === ig || entry.startsWith(ig.replace('*', '')))) continue;
        files.push(entry);
    }
    return files.length ? files : ['.'];
}
