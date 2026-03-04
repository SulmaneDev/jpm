'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PackageJSON = require('../core/package-json');
const { mkdirp, symlink } = require('../utils/fs');
const logger = require('../utils/logger');

/**
 * Discovers and manages workspaces in a monorepo.
 * Supports glob-like patterns: "packages/*", "apps/*"
 */
class Workspace {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.rootPkg = PackageJSON.fromDir(rootDir);
    }

    /** Returns array of { name, version, dir, pkg } for all workspace packages */
    getPackages() {
        const patterns = this.rootPkg.workspaces;
        if (!patterns || !patterns.length) return [];

        const packages = [];
        for (const pattern of patterns) {
            const matchedDirs = this._glob(pattern);
            for (const dir of matchedDirs) {
                const pkgFile = path.join(dir, 'package.json');
                if (!fs.existsSync(pkgFile)) continue;
                const pkg = PackageJSON.fromDir(dir);
                packages.push({
                    name: pkg.name,
                    version: pkg.version,
                    dir,
                    pkg,
                });
            }
        }

        return packages;
    }

    /**
     * Link workspace packages into each other's node_modules
     * so inter-workspace imports work without publishing.
     */
    async link() {
        const packages = this.getPackages();
        const byName = new Map(packages.map(p => [p.name, p]));

        for (const ws of packages) {
            const allDeps = {
                ...ws.pkg.dependencies,
                ...ws.pkg.devDependencies,
            };

            for (const depName of Object.keys(allDeps)) {
                if (!byName.has(depName)) continue;
                const depWs = byName.get(depName);

                // Create symlink: ws/node_modules/depName → depWs.dir
                const linkPath = path.join(ws.dir, 'node_modules', depName);
                mkdirp(path.dirname(linkPath));
                try {
                    symlink(depWs.dir, linkPath);
                    logger.verbose(`linked ${depName} → ${depWs.dir} in ${ws.name}`);
                } catch (err) {
                    logger.warn(`Could not link ${depName} in ${ws.name}: ${err.message}`);
                }
            }
        }

        logger.success(`Linked ${packages.length} workspace packages`);
    }

    /** Run a script across all (or filtered) workspaces */
    async runScript(scriptName, { filter } = {}) {
        const { spawnSync } = require('node:child_process');
        const packages = this.getPackages().filter(ws =>
            !filter || ws.name.includes(filter)
        );

        for (const ws of packages) {
            if (!ws.pkg.scripts[scriptName]) {
                logger.verbose(`[${ws.name}] no script "${scriptName}" — skipping`);
                continue;
            }
            logger.section(`▶ ${ws.name} — ${scriptName}`);
            const result = spawnSync(ws.pkg.scripts[scriptName], {
                cwd: ws.dir,
                shell: true,
                stdio: 'inherit',
            });
            if (result.status !== 0) {
                logger.error(`[${ws.name}] script "${scriptName}" failed with exit code ${result.status}`);
            }
        }
    }

    /** Simple glob: supports "packages/*" — one level wildcard only */
    _glob(pattern) {
        const parts = pattern.split('/');
        let dirs = [this.rootDir];

        for (const part of parts) {
            const next = [];
            for (const base of dirs) {
                if (part === '*' || part === '**') {
                    try {
                        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
                            if (entry.isDirectory()) next.push(path.join(base, entry.name));
                        }
                    } catch { }
                } else {
                    const candidate = path.join(base, part);
                    if (fs.existsSync(candidate)) next.push(candidate);
                }
            }
            dirs = next;
        }

        return dirs;
    }
}

module.exports = Workspace;
