'use strict';

/**
 * Environment detection and abstraction layer for node/bun.
 */

const isBun = typeof Bun !== 'undefined';
const isNode = !isBun && typeof process !== 'undefined' && !!process.versions.node;

module.exports = {
    isBun,
    isNode,

    // High-performance write abstraction
    async writeFile(path, data) {
        if (isBun) {
            return Bun.write(path, data);
        }
        const fs = require('node:fs/promises');
        return fs.writeFile(path, data);
    },

    // High-performance spawn abstraction
    spawn(cmd, args, opts) {
        if (isBun) {
            return Bun.spawn([cmd, ...args], opts);
        }
        const { spawn } = require('node:child_process');
        return spawn(cmd, args, opts);
    }
};
