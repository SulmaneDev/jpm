#!/usr/bin/env node
'use strict';

/**
 * Parses command-line arguments into a structured command, arguments, and flags object.
 * 
 * @param {string[]} argv - Raw process.argv array
 * @returns {{ command: string, args: string[], flags: Object.<string, string|boolean> }}
 */
function parseArgs(argv) {
    const args = [];
    const flags = {};
    for (const token of argv.slice(2)) {
        if (token.startsWith('--')) {
            const eq = token.indexOf('=');
            const key = eq === -1 ? token.slice(2) : token.slice(2, eq);
            const val = eq === -1 ? true : token.slice(eq + 1);
            flags[key] = val;
        } else if (token.startsWith('-') && token.length === 2) {
            flags[token.slice(1)] = true;
        } else {
            args.push(token);
        }
    }
    return { command: args[0], args: args.slice(1), flags };
}

const { command, args, flags } = parseArgs(process.argv);

// Initial configuration applying CLI-provided global overrides
const config = require('../src/utils/config');
if (flags.loglevel) config.setCLI({ loglevel: flags.loglevel });
if (flags.registry) config.setCLI({ registry: flags.registry });
if (flags.silent) config.setCLI({ loglevel: 'silent' });

const logger = require('../src/utils/logger');
logger.setLevel(config.loglevel);

/**
 * Entry point for cache-related subcommands.
 * 
 * @param {string[]} cmdArgs - Action and optional parameters
 * @param {Object} cmdFlags - CLI flags
 */
async function cacheCommand(cmdArgs, cmdFlags) {
    const cache = require('../src/core/cache');
    const { formatBytes } = require('../src/utils/fs');
    const [action] = cmdArgs;

    if (action === 'clean' || action === 'clear') {
        cache.clear();
    } else if (action === 'ls' || action === 'list') {
        const items = cache.list();
        if (!items.length) { logger.info('Cache is empty'); return; }
        logger.table(items, ['name', 'version']);
    } else {
        const s = cache.stats();
        logger.log('Cache directory: ' + logger.c.cyan(s.root || 'n/a'));
        logger.log('Packages:        ' + s.packages);
        logger.log('Total size:      ' + formatBytes(s.size));
    }
}

/**
 * Entry point for workspace (hive) management.
 * 
 * @param {string[]} cmdArgs - Subcommand and arguments
 * @param {Object} cmdFlags - CLI flags
 */
async function workspaceCommand(cmdArgs, cmdFlags) {
    const Workspace = require('../src/workspace/workspace');
    const ws = new Workspace(process.cwd());
    const [action, ...rest] = cmdArgs;

    if (!action || action === 'list' || action === 'ls') {
        const packages = ws.getPackages();
        if (!packages.length) { logger.warn('No workspaces found.'); return; }
        logger.table(packages.map(p => ({ Name: p.name, Version: p.version, Path: p.dir })), ['Name', 'Version', 'Path']);
    } else if (action === 'run') {
        await ws.runScript(rest[0], { filter: cmdFlags.filter || cmdFlags.f });
    } else if (action === 'link') {
        await ws.link();
    } else {
        logger.error('Unknown workspace subcommand: ' + action);
    }
}

/**
 * Displays version information for JPM and the current Node.js runtime.
 */
function showVersion() {
    const pkg = require('../package.json');
    logger.log('jpm v' + pkg.version);
    logger.log('node ' + process.version);
}

/**
 * Renders the terminal help interface with available commands and descriptions.
 */
function showHelp() {
    const c = logger.c;
    const lines = [
        '',
        c.bold('JPM') + ' \u2014 ' + c.yellow('Joint Package Manager') + ' v1.0.0',
        c.gray('Universal, advanced, and blazing fast (Node.js & Bun)'),
        '',
        c.bold('Handy Commands:'),
        '  ' + c.cyan('get [pkg@ver ...]') + '   Fetch and install packages',
        '  ' + c.cyan('drop <pkg ...>') + '      Remove packages from project',
        '  ' + c.cyan('syn') + '                Synchronize project dependencies',
        '  ' + c.cyan('do <script> [args]') + '  Execute a package script',
        '  ' + c.cyan('scan') + '               Deep security & integrity audit',
        '  ' + c.cyan('up [pkg ...]') + '       Upgrade project dependencies',
        '  ' + c.cyan('x <pkg> [args]') + '     Execute remote package binary',
        '',
        c.bold('Discovery & Metadata:'),
        '  ' + c.cyan('peek') + '               Inspect installed dependency tree',
        '  ' + c.cyan('find <query>') + '       Search for packages on registry',
        '  ' + c.cyan('info <pkg>') + '         Detailed package intelligence',
        '',
        c.bold('Project Life-cycle:'),
        '  ' + c.cyan('setup [-y]') + '          Initialize a new JPM project',
        '  ' + c.cyan('ship') + '               Publish package to registry',
        '  ' + c.cyan('config <get|set>') + '    Manage JPM environment (.jpmrc)',
        '  ' + c.cyan('cache [clean|ls]') + '   Disk cache operations',
        '',
        c.bold('Advanced (Hive/Workspaces):'),
        '  ' + c.cyan('hive list') + '          View workspace cluster',
        '  ' + c.cyan('hive run <script>') + '   Broadcast script to all hives',
        '  ' + c.cyan('hive link') + '          Inter-link workspace packages',
        '',
        c.bold('Global Controls:'),
        '  ' + c.cyan('--fast') + '              Blind Install (Bypass all checks)',
        '  ' + c.cyan('--registry <url>') + '    Custom registry target',
        '  ' + c.cyan('--loglevel <level>') + '  Choose verbosity (silent|debug)',
        '  ' + c.cyan('-D, --save-dev') + '      Mark as development tool',
        '',
        c.gray('JPM supports Node.js and Bun automatically.'),
        '',
    ];
    logger.log(lines.join('\n'));
}

/**
 * Command routing table mapping CLI verbs to their respective implementations.
 */
const COMMANDS = {
    get: () => require('../src/commands/install'),
    drop: () => require('../src/commands/uninstall'),
    syn: () => require('../src/commands/install'),
    do: () => require('../src/commands/run'),
    up: () => require('../src/commands/update'),
    scan: () => require('../src/commands/audit'),
    ship: () => require('../src/commands/publish'),
    setup: () => require('../src/commands/init'),
    peek: () => require('../src/commands/list'),
    find: () => require('../src/commands/search'),
    info: () => require('../src/commands/info'),
    x: () => require('../src/commands/x'),
    hive: () => workspaceCommand,

    // Aliases & Standard Compatibility
    install: () => require('../src/commands/install'),
    i: () => require('../src/commands/install'),
    add: () => require('../src/commands/install'),
    uninstall: () => require('../src/commands/uninstall'),
    remove: () => require('../src/commands/uninstall'),
    rm: () => require('../src/commands/uninstall'),
    un: () => require('../src/commands/uninstall'),
    update: () => require('../src/commands/update'),
    upgrade: () => require('../src/commands/update'),
    outdated: () => require('../src/commands/update'),
    search: () => require('../src/commands/search'),
    publish: () => require('../src/commands/publish'),
    audit: () => require('../src/commands/audit'),
    run: () => require('../src/commands/run'),
    init: () => require('../src/commands/init'),
    create: () => require('../src/commands/init'),
    show: () => require('../src/commands/info'),
    view: () => require('../src/commands/info'),
    list: () => require('../src/commands/list'),
    ls: () => require('../src/commands/list'),
    exec: () => require('../src/commands/x'),
    workspace: () => workspaceCommand,
    ws: () => workspaceCommand,
    config: () => require('../src/commands/config'),
    cfg: () => require('../src/commands/config'),
    cache: () => cacheCommand,
    help: () => showHelp,
    version: () => showVersion,
};

// ── Global Error Boundaries ──────────────────────────────────────────────────

/**
 * Global handler for uncaught exceptions to ensure graceful termination.
 */
process.on('uncaughtException', (err) => {
    logger.error('FATAL EXCEPTION: ' + err.message);
    if (config.loglevel === 'debug' || config.loglevel === 'verbose') {
        logger.log(err.stack);
    }
    logger.info('\nIf this persists, please report the issue at: https://github.com/whomaderules/jpm/issues');
    process.exit(1);
});

/**
 * Global handler for unhandled promise rejections.
 */
process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED REJECTION: ' + (reason instanceof Error ? reason.message : reason));
    if ((config.loglevel === 'debug' || config.loglevel === 'verbose') && reason instanceof Error) {
        logger.log(reason.stack);
    }
    process.exit(1);
});

/**
 * Principal execution routine of the JPM CLI.
 */
async function main() {
    if (!command || command === 'help' || flags.help || flags.h) {
        await showHelp();
        return;
    }

    if (command === 'version' || flags.version || flags.v) {
        showVersion();
        return;
    }

    const loader = COMMANDS[command];
    if (!loader) {
        logger.error('Unknown command: "' + command + '"');
        logger.info('Run ' + logger.c.cyan('jpm help') + ' for usage.');
        process.exit(1);
    }

    const handler = loader();
    try {
        if (typeof handler === 'function' && handler.prototype instanceof (require('../src/commands/base-command'))) {
            const instance = new handler(command);
            await instance.run(args, flags);
        } else {
            // Backward compatibility for functional commands
            await handler(args, flags, command);
        }
    } catch (err) {
        if (flags.loglevel === 'debug' || flags.loglevel === 'verbose') {
            logger.error(err.stack || err.message);
        } else {
            logger.error(err.message);
        }
        process.exit(1);
    }
}

main();
