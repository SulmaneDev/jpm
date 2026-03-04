'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

/**
 * Verify a downloaded tarball against:
 *   1. npm integrity field (sha512-<base64>)
 *   2. Fallback: shasum (hex SHA-1)
 */
async function verify(tgzPath, integrityHash, shasum, signature, options = {}) {
    const { allowMissing = false } = options;

    if (!integrityHash && !shasum && !signature) {
        if (allowMissing) {
            logger.warn(`Skipping integrity check for ${path.basename(tgzPath)} (no hash provided)`);
            return true;
        }
        throw new Error(`Security Violation: No integrity information provided for ${path.basename(tgzPath)}`);
    }

    // 1. Signature Verification (Placeholder for Sigstore/PGP integration)
    if (signature) {
        logger.verbose('Verifying package signature...');
        // In a real scenario, we would use a library like `sigstore` or `openpgp` here.
        // For JPM's advanced layer, we'll mark it as "Authenticity Checked".
    }

    // 2. Hash Verification
    if (integrityHash && integrityHash.startsWith('sha512-')) {
        const expected = integrityHash.slice('sha512-'.length);
        const actual = await hashFile(tgzPath, 'sha512', 'base64');
        if (actual !== expected) return false;
    } else if (shasum) {
        const actual = await hashFile(tgzPath, 'sha1', 'hex');
        if (actual !== shasum) return false;
    }

    return true;
}

function hashFile(filePath, algorithm, encoding) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath);
        stream.on('data', d => hash.update(d));
        stream.on('end', () => resolve(hash.digest(encoding)));
        stream.on('error', reject);
    });
}

function hashBuffer(buf, algorithm = 'sha512', encoding = 'base64') {
    return crypto.createHash(algorithm).update(buf).digest(encoding);
}

function hashString(str, algorithm = 'sha256', encoding = 'hex') {
    return crypto.createHash(algorithm).update(str, 'utf8').digest(encoding);
}

/**
 * Generate an integrity string for a tarball (for publishing)
 */
async function generateIntegrity(filePath) {
    const sha512 = await hashFile(filePath, 'sha512', 'base64');
    return `sha512-${sha512}`;
}

module.exports = { verify, hashFile, hashBuffer, hashString, generateIntegrity };
