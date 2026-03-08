'use strict';

const https = require('node:https');
const http = require('node:http');
const zlib = require('node:zlib');
const logger = require('./logger');

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 3;
const RETRY_DELAY = 1_000;
const USER_AGENT = `jpm/1.0.0 node/${process.version}`;

// Connection pool via keepAlive agents
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20 });

const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000;
const breakerState = {
    failures: 0,
    lastFailure: 0,
    open: false,
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkBreaker() {
    if (!breakerState.open) return;
    if (Date.now() - breakerState.lastFailure > CIRCUIT_RESET_MS) {
        breakerState.open = false;
        breakerState.failures = 0;
        logger.verbose('Circuit Breaker: Resetting to CLOSED');
    } else {
        throw new Error('Circuit Breaker is OPEN. Registry might be down.');
    }
}

/**
 * options: { method, headers, timeout, retries, retryDelay, stream, body, strict }
 * Returns: { status, headers, body } or a raw IncomingMessage if stream:true.
 * Uses Bun.fetch if running in a Bun environment for optimized performance.
 * 
 * @param {string} url - Target URL
 * @param {Object} [options={}] - Request options
 * @returns {Promise<Object|import('node:http').IncomingMessage>}
 */
async function request(url, options = {}) {
    // ── Native Bun Optimization ──────────────────────────────────────────────
    if (typeof Bun !== 'undefined' && !options.stream) {
        try {
            const res = await Bun.fetch(url, {
                method: options.method || 'GET',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept-Encoding': 'gzip, deflate',
                    'Accept': 'application/json',
                    ...(options.headers || {}),
                },
                body: options.body,
                redirect: 'follow',
            });
            return {
                status: res.status,
                headers: Object.fromEntries(res.headers.entries()),
                body: await res.text(),
            };
        } catch (err) {
            logger.debug(`Bun.fetch failed, falling back to node:http: ${err.message}`);
        }
    }

    const {
        method = 'GET',
        headers = {},
        timeout = DEFAULT_TIMEOUT,
        retries = DEFAULT_RETRIES,
        retryDelay = RETRY_DELAY,
        body = null,
        stream = false,
        strict = false,
    } = options;

    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';

    if (strict && !isHttps) {
        throw new Error(`Insecure protocol "${parsed.protocol}" blocked in strict mode: ${url}`);
    }
    const lib = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    checkBreaker();

    const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        agent,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept-Encoding': 'gzip, deflate',
            'Accept': 'application/json',
            ...headers,
        },
    };

    /**
     * Executes a single request attempt with retries and circuit breaker logic.
     * 
     * @param {number} attemptsLeft - Remaining retry attempts
     * @returns {Promise<Object|import('node:http').IncomingMessage>}
     */
    function attempt(attemptsLeft) {
        return new Promise((resolve, reject) => {
            const req = lib.request(reqOptions, (res) => {
                // Successful response or redirect clears one failure
                if (res.statusCode < 400) {
                    breakerState.failures = Math.max(0, breakerState.failures - 1);
                }

                // Follow redirects (301, 302, 307, 308)
                if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                    logger.verbose(`Redirect → ${res.headers.location}`);
                    request(res.headers.location, options).then(resolve, reject);
                    return;
                }

                if (stream) { resolve(res); return; }

                // Decompress
                let pipe = res;
                const enc = res.headers['content-encoding'];
                if (enc === 'gzip') pipe = res.pipe(zlib.createGunzip());
                if (enc === 'deflate') pipe = res.pipe(zlib.createInflate());

                const chunks = [];
                pipe.on('data', c => chunks.push(c));
                pipe.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    resolve({ status: res.statusCode, headers: res.headers, body: raw });
                });
                pipe.on('error', (err) => {
                    recordFailure();
                    reject(err);
                });
            });

            req.setTimeout(timeout, () => {
                recordFailure();
                req.destroy(new Error(`Timeout after ${timeout}ms: ${url}`));
            });

            req.on('error', async (err) => {
                if (attemptsLeft > 1) {
                    logger.verbose(`Retry (${retries - attemptsLeft + 2}/${retries}) ${url}`);
                    await delay(retryDelay);
                    attempt(attemptsLeft - 1).then(resolve, reject);
                } else {
                    recordFailure();
                    reject(err);
                }
            });

            if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
            req.end();
        });
    }

    /**
     * Records a failure into the circuit breaker state.
     * @private
     */
    function recordFailure() {
        breakerState.failures++;
        breakerState.lastFailure = Date.now();
        if (breakerState.failures >= CIRCUIT_THRESHOLD) {
            breakerState.open = true;
            logger.error('Circuit Breaker: OPENING due to consistent failures');
        }
    }

    return attempt(retries);
}

/**
 * Convenience method for fetching and parsing JSON from a URL.
 * 
 * @param {string} url - Target URL
 * @param {Object} [opts] - Request options
 * @returns {Promise<Object>} Parsed JSON object
 */
async function getJSON(url, opts = {}) {
    const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
    const { status, body } = res;

    if (status < 200 || status >= 300) {
        const err = new Error(`HTTP ${status}: ${url}`);
        err.status = status;
        err.body = body;
        throw err;
    }
    try {
        return typeof body === 'object' ? body : JSON.parse(body);
    } catch (e) {
        throw new Error(`Invalid JSON from ${url}: ${e.message}\nBody snippet: ${body.slice(0, 200)}`);
    }
}

/**
 * Downloads a resource and pipes it to a destination stream.
 * 
 * @param {string} url - Source URL
 * @param {import('node:stream').Writable} destStream - Target stream
 * @param {Object} [opts] - Request options including onProgress callback
 * @returns {Promise<void>}
 */
async function download(url, destStream, opts = {}) {
    return new Promise((resolve, reject) => {
        request(url, { ...opts, stream: true }).then(res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                return;
            }
            let pipe = res;
            const enc = res.headers['content-encoding'];
            if (enc === 'gzip') pipe = res.pipe(zlib.createGunzip());
            if (enc === 'deflate') pipe = res.pipe(zlib.createInflate());

            const total = parseInt(res.headers['content-length'] || '0', 10);
            let received = 0;
            pipe.on('data', chunk => {
                received += chunk.length;
                opts.onProgress?.(received, total);
            });
            pipe.pipe(destStream);
            destStream.on('finish', resolve);
            destStream.on('error', reject);
            pipe.on('error', reject);
        }, reject);
    });
}

module.exports = { request, getJSON, download };
