'use strict';

// Full SemVer implementation — no external dep
// Supports: X.Y.Z, X.Y.Z-pre+build, ranges: ^, ~, >, >=, <, <=, =, *, x, ||, ranges

const RE_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;
const RE_RANGE_PART = /^\s*([\^~>=<!*]*)([0-9x*]+(?:\.[0-9x*]+(?:\.[0-9x*]+)?)?(?:-[0-9A-Za-z-.]+)?)\s*$/;

/**
 * Represents a parsed Semantic Version (SemVer).
 */
class Version {
    /**
     * @param {string} str - The version string to parse
     */
    constructor(str) {
        const m = RE_VERSION.exec(str.trim().replace(/^v/, ''));
        if (!m) throw new Error(`Invalid version: ${str}`);
        this.major = parseInt(m[1], 10);
        this.minor = parseInt(m[2], 10);
        this.patch = parseInt(m[3], 10);
        this.pre = m[4] ? m[4].split('.') : [];
        this.build = m[5] ? m[5].split('.') : [];
        this.raw = str;
    }

    /**
     * Reconstructs the canonical version string.
     * @returns {string}
     */
    toString() {
        let s = `${this.major}.${this.minor}.${this.patch}`;
        if (this.pre.length) s += `-${this.pre.join('.')}`;
        if (this.build.length) s += `+${this.build.join('.')}`;
        return s;
    }
}

/**
 * Compares two pre-release identifier arrays according to SemVer rules.
 * 
 * @param {string[]} a - First pre-release array
 * @param {string[]} b - Second pre-release array
 * @returns {number} -1 if a < b, 1 if a > b, 0 if equal
 * @private
 */
function comparePre(a, b) {
    if (!a.length && !b.length) return 0;
    if (!a.length) return 1;
    if (!b.length) return -1;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] === b[i]) continue;
        if (a[i] === undefined) return -1;
        if (b[i] === undefined) return 1;
        const na = parseInt(a[i], 10), nb = parseInt(b[i], 10);
        if (!isNaN(na) && !isNaN(nb)) return na < nb ? -1 : 1;
        if (!isNaN(na)) return -1;
        if (!isNaN(nb)) return 1;
        return a[i] < b[i] ? -1 : 1;
    }
    return 0;
}

/**
 * Compares two versions.
 * 
 * @param {string|Version} a
 * @param {string|Version} b
 * @returns {number} -1 if a < b, 1 if a > b, 0 if equal
 */
function compare(a, b) {
    const va = a instanceof Version ? a : new Version(a);
    const vb = b instanceof Version ? b : new Version(b);
    for (const k of ['major', 'minor', 'patch']) {
        if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1;
    }
    return comparePre(va.pre, vb.pre);
}

/** @returns {boolean} True if a is greater than b */
function gt(a, b) { return compare(a, b) > 0; }
/** @returns {boolean} True if a is less than b */
function lt(a, b) { return compare(a, b) < 0; }
/** @returns {boolean} True if a is greater than or equal to b */
function gte(a, b) { return compare(a, b) >= 0; }
/** @returns {boolean} True if a is less than or equal to b */
function lte(a, b) { return compare(a, b) <= 0; }
/** @returns {boolean} True if versions are logically equal */
function eq(a, b) { return compare(a, b) === 0; }

/**
 * Parses a single semver range token (e.g., "^1.2.3") into a predicate.
 * 
 * @param {string} token 
 * @returns {function(string|Version): boolean}
 * @private
 */
function parseSimpleRange(token) {
    token = token.trim();
    if (!token || token === '*' || token === 'latest') return () => true;

    const hyphen = token.match(/^(.+?)\s+-\s+(.+)$/);
    if (hyphen) {
        const lo = hyphen[1].trim(), hi = hyphen[2].trim();
        return (v) => gte(v, lo) && lte(v, hi);
    }

    const m = RE_RANGE_PART.exec(token);
    if (!m) return () => false;

    const [, op, verStr] = m;
    const hasPre = verStr.includes('-');

    const baseVer = verStr.split(/[-+]/)[0];
    const parts = baseVer.split('.').map(p => (p === 'x' || p === '*' ? null : parseInt(p, 10)));
    const [maj, min, pat] = parts;

    let lo, hi;

    if (op === '^') {
        lo = verStr;
        if (maj !== null && maj > 0) hi = `${maj + 1}.0.0-0`;
        else if (min !== null && min > 0) hi = `0.${min + 1}.0-0`;
        else hi = `0.0.${(pat ?? 0) + 1}-0`;
    } else if (op === '~') {
        lo = verStr;
        if (min !== null) hi = `${maj}.${min + 1}.0-0`;
        else hi = `${maj + 1}.0.0-0`;
    } else if (op === '>') {
        return (v) => gt(v, verStr);
    } else if (op === '<') {
        return (v) => lt(v, verStr);
    } else if (op === '>=') {
        return (v) => gte(v, verStr);
    } else if (op === '<=') {
        return (v) => lte(v, verStr);
    } else if (op === '=') {
        return (v) => eq(v, verStr);
    } else {
        if (maj === null || isNaN(maj)) return () => true;
        if (min === null || isNaN(min)) {
            lo = `${maj}.0.0`;
            hi = `${maj + 1}.0.0-0`;
        } else if (pat === null || isNaN(pat)) {
            lo = `${maj}.${min}.0`;
            hi = `${maj}.${min + 1}.0-0`;
        } else {
            return (v) => eq(v, verStr);
        }
    }

    return (v) => {
        const ver = v instanceof Version ? v : new Version(v);
        if (!gte(ver, lo)) return false;
        if (hi && !lt(ver, hi)) return false;

        if (ver.pre.length > 0) {
            if (hasPre) {
                const rangeV = new Version(verStr);
                return ver.major === rangeV.major && ver.minor === rangeV.minor && ver.patch === rangeV.patch;
            }
            return false;
        }
        return true;
    };
}

/**
 * Checks if a version satisfies a given semver range.
 * 
 * @param {string} version 
 * @param {string} range 
 * @returns {boolean}
 */
function satisfies(version, range) {
    if (!range || range === '*' || range === 'latest') return true;
    try {
        const orGroups = range.split('||');
        return orGroups.some(group => {
            const parts = group.trim().split(/\s+(?=[\^~><=!])/);
            return parts.every(part => parseSimpleRange(part)(version));
        });
    } catch {
        return false;
    }
}

/** @returns {boolean} True if the range string is valid */
function validRange(range) {
    try { parseSimpleRange(range); return true; } catch { return false; }
}

/** @returns {Version|null} Parsed version or null if invalid */
function parse(str) {
    try { return new Version(str); } catch { return null; }
}

/** @returns {string|null} Validated version string or null */
function valid(str) {
    return parse(str) ? str.trim().replace(/^v/, '') : null;
}

/**
 * Coerces a dirty string into a valid major.minor.patch version string.
 * @param {string} str 
 * @returns {string|null}
 */
function coerce(str) {
    const m = str.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return null;
    return `${m[1] ?? 0}.${m[2] ?? 0}.${m[3] ?? 0}`;
}

/**
 * Finds the highest version in an array that satisfies a range.
 * 
 * @param {string[]} versions 
 * @param {string} range 
 * @returns {string|null}
 */
function maxSatisfying(versions, range) {
    return versions
        .filter(v => { try { return satisfies(v, range); } catch { return false; } })
        .sort((a, b) => compare(b, a))[0] ?? null;
}

/**
 * Finds the lowest version in an array that satisfies a range.
 * 
 * @param {string[]} versions 
 * @param {string} range 
 * @returns {string|null}
 */
function minSatisfying(versions, range) {
    return versions
        .filter(v => { try { return satisfies(v, range); } catch { return false; } })
        .sort((a, b) => compare(a, b))[0] ?? null;
}

/**
 * Increments a version according to release type.
 * 
 * @param {string} version 
 * @param {'major'|'minor'|'patch'|'prerelease'} release 
 * @returns {string|null}
 */
function inc(version, release) {
    const v = new Version(version);
    if (release === 'major') return `${v.major + 1}.0.0`;
    if (release === 'minor') return `${v.major}.${v.minor + 1}.0`;
    if (release === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
    if (release === 'prerelease') {
        if (v.pre.length) {
            const last = parseInt(v.pre[v.pre.length - 1], 10);
            if (!isNaN(last)) {
                return `${v.major}.${v.minor}.${v.patch}-${v.pre.slice(0, -1).concat(last + 1).join('.')}`;
            }
        }
        return `${v.major}.${v.minor}.${v.patch + 1}-0`;
    }
    return null;
}

/** Sorts an array of version strings */
function sort(versions) {
    return [...versions].sort((a, b) => compare(a, b));
}

/** Sorts an array of version strings in reverse */
function rsort(versions) {
    return [...versions].sort((a, b) => compare(b, a));
}

module.exports = {
    Version, compare, gt, lt, gte, lte, eq,
    satisfies, validRange, parse, valid, coerce,
    maxSatisfying, minSatisfying, inc, sort, rsort,
};
