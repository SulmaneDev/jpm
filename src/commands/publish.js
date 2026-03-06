'use strict';

const fs = require('node:fs');
const path = require('node:path');
const tar = require('tar');
const BaseCommand = require('./base-command');
const PackageJSON = require('../core/package-json');
const integrity = require('../security/integrity');
const { getJSON, request } = require('../utils/http');
const { tempDir } = require('../utils/fs');
const { Spinner } = require('../utils/progress');

/**
 * PublishCommand handles the 'jpm publish' and 'jpm ship' commands.
 * It validates a package, packs it into a tarball, and uploads it to the registry.
 */
class PublishCommand extends BaseCommand {
    constructor() {
        super('publish');
    }

    /**
     * Executes the package publishing process.
     * 
     * @param {string[]} args - Optional arguments
     * @param {Object} flags - CLI flags (e.g., --otp)
     * @returns {Promise<void>}
     */
    async run(args, flags) {
        const cwd = process.cwd();
        const pkgJson = PackageJSON.fromDir(cwd);

        // 1. Validate package configuration
        const errors = pkgJson.validate();
        if (errors.length) {
            this.logger.error('package.json validation failed:');
            errors.forEach(e => this.logger.error(`  ${e}`));
            throw new Error('Package validation failed.');
        }

        const { name, version } = pkgJson;
        const registryUrl = this.config.registry.replace(/\/$/, '');

        this.logger.section(`Publishing ${name}@${version}`);

        // 2. Resolve authentication token
        const token = this.config.get('//registry.npmjs.org/:_authToken') || this.config.get('_authToken');
        if (!token) {
            this.logger.error('Not logged in. Set _authToken in ~/.jpmrc or run: npm login');
            throw new Error('Authentication required.');
        }

        // 3. Prevent overwriting existing versions
        const spinner = new Spinner('Checking if version exists...').start();
        try {
            await getJSON(`${registryUrl}/${encodeURIComponent(name)}/${version}`);
            spinner.fail(`Version ${name}@${version} already exists in registry`);
            throw new Error(`Version ${version} already exists.`);
        } catch (err) {
            if (err.status !== 404) {
                spinner.warn('Could not verify version uniqueness, continuing...');
            } else {
                spinner.succeed('Version check passed');
            }
        }

        // 4. Create and pack tarball
        const tmp = tempDir('jpm-publish-');
        const tgz = path.join(tmp, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);

        const packSpinner = new Spinner('Packing tarball...').start();
        const ignore = this._getIgnoreList(cwd);

        await tar.create(
            { gzip: true, file: tgz, cwd, prefix: 'package' },
            this._getFilesToPack(cwd, ignore)
        );

        const tgzStat = fs.statSync(tgz);
        const shasum = await integrity.hashFile(tgz, 'sha1', 'hex');
        const integrityH = await integrity.generateIntegrity(tgz);
        const tgzBase64 = fs.readFileSync(tgz).toString('base64');

        packSpinner.succeed(`Packed ${this.logger.c.gray(`(${(tgzStat.size / 1024).toFixed(1)} KB)`)}`);

        // 5. Construct registry payload
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
                        tarball: `${registryUrl}/${encodeURIComponent(name)}/-/${name}-${version}.tgz`,
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

        // 6. Submit to registry
        const uploadSpinner = new Spinner('Uploading to registry...').start();
        const bodyStr = JSON.stringify(body);

        try {
            const res = await request(`${registryUrl}/${encodeURIComponent(name)}`, {
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
                throw new Error(`Registry responded with status ${res.status}`);
            }

            uploadSpinner.succeed('Published!');
            this.logger.success(`\n+ ${name}@${version}`);
            this.logger.log(this.logger.c.gray(`${registryUrl}/${encodeURIComponent(name)}`));
        } catch (err) {
            uploadSpinner.fail(`Publish error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Generates a list of files to ignore during packing.
     * 
     * @param {string} dir - Project root directory
     * @returns {Set<string>} Set of ignored patterns/filenames
     * @private
     */
    _getIgnoreList(dir) {
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

    /**
     * Scans the directory for files that should be included in the tarball.
     * 
     * @param {string} dir - Directory to scan
     * @param {Set<string>} ignore - Set of ignored patterns
     * @returns {string[]} List of files to pack
     * @private
     */
    _getFilesToPack(dir, ignore) {
        const files = [];
        for (const entry of fs.readdirSync(dir)) {
            if ([...ignore].some(ig => entry === ig || entry.startsWith(ig.replace('*', '')))) continue;
            files.push(entry);
        }
        return files.length ? files : ['.'];
    }
}

module.exports = PublishCommand;

