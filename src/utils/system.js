'use strict';

/**
 * System capabilities and environment detection.
 */
const system = {
    platform: process.platform, // 'win32', 'linux', 'darwin', etc.
    arch: process.arch,         // 'x64', 'arm64', etc.

    /**
     * Checks if a package's OS/CPU requirements match the current system.
     * 
     * @param {Object} meta - Package metadata (must contain 'os' and/or 'cpu' arrays)
     * @returns {boolean} True if the package is compatible or no requirements defined
     */
    isCompatible(meta) {
        // OS check
        if (meta.os && Array.isArray(meta.os)) {
            const isMatch = meta.os.some(o => {
                if (o.startsWith('!')) return system.platform !== o.slice(1);
                return system.platform === o;
            });
            if (!isMatch) return false;
        }

        // CPU check
        if (meta.cpu && Array.isArray(meta.cpu)) {
            const isMatch = meta.cpu.some(c => {
                if (c.startsWith('!')) return system.arch !== c.slice(1);
                return system.arch === c;
            });
            if (!isMatch) return false;
        }

        return true;
    }
};

module.exports = system;
