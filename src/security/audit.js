'use strict';

const registry = require('../core/registry');
const semver = require('../utils/semver');
const logger = require('../utils/logger');

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const SEVERITY_COLOR = {
    info: (t) => `\x1b[37m${t}\x1b[0m`,
    low: (t) => `\x1b[32m${t}\x1b[0m`,
    moderate: (t) => `\x1b[33m${t}\x1b[0m`,
    high: (t) => `\x1b[31m${t}\x1b[0m`,
    critical: (t) => `\x1b[35m${t}\x1b[0m`,
};

/**
 * Run security audit against npm advisory database.
 * installedPackages: array of { name, version }
 */
async function audit(installedPackages, { level = 'moderate' } = {}) {
    const requires = {};
    for (const { name, version } of installedPackages) {
        if (!requires[name]) requires[name] = [];
        requires[name].push(version);
    }

    let advisoryData;
    try {
        advisoryData = await registry.fetchAdvisories(requires);
    } catch (err) {
        logger.warn(`Could not fetch advisory data: ${err.message}`);
        return { vulnerabilities: [], stats: {}, error: err.message };
    }

    const advisories = advisoryData?.advisories || {};
    const vulns = [];

    for (const [id, advisory] of Object.entries(advisories)) {
        const sev = advisory.severity || 'info';
        const affects = advisory.findings?.flatMap(f => f.paths || []) || [];

        vulns.push({
            id,
            title: advisory.title,
            severity: sev,
            package: advisory.module_name,
            range: advisory.vulnerable_versions,
            fixedIn: advisory.patched_versions,
            url: advisory.url,
            cvss: advisory.cvss?.score ?? null,
            affects,
        });
    }

    // Filter by minimum severity level
    const levelIdx = SEVERITY_ORDER.indexOf(level);
    const filtered = vulns.filter(v => SEVERITY_ORDER.indexOf(v.severity) >= levelIdx);

    const stats = SEVERITY_ORDER.reduce((acc, s) => {
        acc[s] = filtered.filter(v => v.severity === s).length;
        return acc;
    }, {});

    return { vulnerabilities: filtered, stats, total: filtered.length };
}

function formatAuditResults({ vulnerabilities, stats, total, error }) {
    if (error) {
        logger.warn(`Audit error: ${error}`);
        return;
    }

    if (!total) {
        logger.success('No vulnerabilities found.');
        return;
    }

    logger.section(`🔐 Audit Report — ${total} vulnerabilit${total === 1 ? 'y' : 'ies'} found`);

    for (const vuln of vulnerabilities) {
        const colorFn = SEVERITY_COLOR[vuln.severity] || (t => t);
        const sev = colorFn(`[${vuln.severity.toUpperCase()}]`);
        logger.log(`\n${sev} ${vuln.title}`);
        logger.log(`  Package:  ${vuln.package}`);
        logger.log(`  Range:    ${vuln.range}`);
        logger.log(`  Fix:      ${vuln.fixedIn || 'No patch available'}`);
        if (vuln.cvss) logger.log(`  CVSS:     ${vuln.cvss}`);
        logger.log(`  Info:     ${vuln.url}`);
    }

    logger.log('\nSummary:');
    for (const [sev, count] of Object.entries(stats)) {
        if (count > 0) {
            const c = SEVERITY_COLOR[sev] || (t => t);
            logger.log(`  ${c(sev.padEnd(10))} ${count}`);
        }
    }
}

module.exports = { audit, formatAuditResults };
