'use strict';

// ANSI color codes — no external dep
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgRed:   '\x1b[41m',
  bgGreen: '\x1b[42m',
};

const isTTY = process.stdout.isTTY;
const noColor = process.env.NO_COLOR || process.env.JPM_NO_COLOR;

function colorize(code, text) {
  if (noColor || !isTTY) return text;
  return `${code}${text}${C.reset}`;
}

// Log levels: silent=0, error=1, warn=2, info=3, verbose=4, debug=5
let logLevel = 3;

function setLevel(level) {
  const levels = { silent: 0, error: 1, warn: 2, info: 3, verbose: 4, debug: 5 };
  logLevel = typeof level === 'string' ? (levels[level] ?? 3) : level;
}

const prefix = {
  error:   colorize(C.red,     '✖ error'),
  warn:    colorize(C.yellow,  '⚠ warn '),
  info:    colorize(C.cyan,    'ℹ info '),
  success: colorize(C.green,   '✔ '),
  verbose: colorize(C.gray,    '… verb '),
  debug:   colorize(C.magenta, '⬡ debug'),
};

const logger = {
  setLevel,

  error(...args) {
    if (logLevel >= 1) process.stderr.write(`${prefix.error}  ${args.join(' ')}\n`);
  },

  warn(...args) {
    if (logLevel >= 2) process.stderr.write(`${prefix.warn}  ${args.join(' ')}\n`);
  },

  info(...args) {
    if (logLevel >= 3) process.stdout.write(`${prefix.info}  ${args.join(' ')}\n`);
  },

  success(...args) {
    if (logLevel >= 3) process.stdout.write(`${prefix.success}${args.join(' ')}\n`);
  },

  verbose(...args) {
    if (logLevel >= 4) process.stdout.write(`${prefix.verbose}  ${args.join(' ')}\n`);
  },

  debug(...args) {
    if (logLevel >= 5) process.stdout.write(`${prefix.debug}  ${args.join(' ')}\n`);
  },

  // Plain output — always printed unless silent
  log(...args) {
    if (logLevel >= 1) process.stdout.write(`${args.join(' ')}\n`);
  },

  // Highlighted section header
  section(title) {
    if (logLevel >= 3) process.stdout.write(`\n${colorize(C.bold + C.cyan, title)}\n`);
  },

  // Render a 2-column table
  table(rows, headers) {
    if (logLevel < 3) return;
    const cols = headers || Object.keys(rows[0] || {});
    const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
    const hr = widths.map(w => '─'.repeat(w + 2)).join('┼');
    const fmt = (row, isHead = false) => cols
      .map((c, i) => {
        const cell = String(row[c] ?? '').padEnd(widths[i]);
        return isHead ? colorize(C.bold, ` ${cell} `) : ` ${cell} `;
      })
      .join('│');
    process.stdout.write(`┌${hr.replace(/┼/g, '┬')}┐\n`);
    process.stdout.write(`│${fmt(Object.fromEntries(cols.map(c => [c, c])), true)}│\n`);
    process.stdout.write(`├${hr}┤\n`);
    rows.forEach(r => process.stdout.write(`│${fmt(r)}│\n`));
    process.stdout.write(`└${hr.replace(/┼/g, '┴')}┘\n`);
  },

  // Render a dependency tree
  tree(node, prefix_ = '', isLast = true) {
    if (logLevel < 3) return;
    const connector = isLast ? '└── ' : '├── ';
    const ext       = isLast ? '    ' : '│   ';
    const name = colorize(C.bold, node.name);
    const ver  = colorize(C.gray, `@${node.version}`);
    process.stdout.write(`${prefix_}${prefix_ ? connector : ''}${name}${ver}\n`);
    const children = node.dependencies || [];
    children.forEach((child, i) => {
      logger.tree(child, prefix_ + (prefix_ ? ext : ''), i === children.length - 1);
    });
  },

  // Colorize helpers exposed for other modules
  c: {
    red:     (t) => colorize(C.red, t),
    green:   (t) => colorize(C.green, t),
    yellow:  (t) => colorize(C.yellow, t),
    blue:    (t) => colorize(C.blue, t),
    cyan:    (t) => colorize(C.cyan, t),
    gray:    (t) => colorize(C.gray, t),
    bold:    (t) => colorize(C.bold, t),
    magenta: (t) => colorize(C.magenta, t),
  },
};

module.exports = logger;
