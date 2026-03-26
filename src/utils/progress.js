
'use strict';

const isTTY = process.stdout.isTTY;

// ── Spinner ───────────────────────────────────────────────────────────────────
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Spinner {
    constructor(text = '') {
        this.text = text;
        this._frame = 0;
        this._timer = null;
        this._active = false;
    }

    start(text) {
        if (text) this.text = text;
        if (!isTTY) { process.stdout.write(`${this.text}...\n`); return this; }
        this._active = true;
        this._render();
        this._timer = setInterval(() => this._render(), 80);
        return this;
    }

    _render() {
        const frame = FRAMES[this._frame++ % FRAMES.length];
        process.stdout.write(`\r\x1b[36m${frame}\x1b[0m ${this.text}\x1b[K`);
    }

    update(text) {
        this.text = text;
        return this;
    }

    succeed(text) {
        this._stop();
        const msg = text || this.text;
        process.stdout.write(`\r\x1b[32m✔\x1b[0m ${msg}\x1b[K\n`);
        return this;
    }

    fail(text) {
        this._stop();
        const msg = text || this.text;
        process.stderr.write(`\r\x1b[31m✘\x1b[0m ${msg}\x1b[K\n`);
        return this;
    }

    warn(text) {
        this._stop();
        const msg = text || this.text;
        process.stdout.write(`\r\x1b[33m⚠\x1b[0m ${msg}\x1b[K\n`);
        return this;
    }

    _stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this._active = false;
        if (isTTY) process.stdout.write('\r\x1b[K');
    }
}

// ── Progress Bar ─────────────────────────────────────────────────────────────
class ProgressBar {
    constructor({ total = 100, width = 30, label = '' } = {}) {
        this.total = total;
        this.width = width;
        this.label = label;
        this.current = 0;
    }

    tick(amount = 1) {
        this.current = Math.min(this.current + amount, this.total);
        this._render();
        if (this.current >= this.total) process.stdout.write('\n');
    }

    set(value) {
        this.current = Math.min(value, this.total);
        this._render();
        if (this.current >= this.total) process.stdout.write('\n');
    }

    _render() {
        if (!isTTY) return;
        const pct = this.current / this.total;
        const filled = Math.round(this.width * pct);
        const bar = `\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(this.width - filled)}\x1b[0m`;
        const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
        const cur = String(this.current).padStart(String(this.total).length);
        process.stdout.write(`\r ${bar} ${pctStr}  ${cur}/${this.total}  ${this.label}\x1b[K`);
    }
}

// ── Multi-line download tracker ───────────────────────────────────────────────
class MultiBar {
    constructor() {
        this._bars = new Map();
        this._lines = 0;
    }

    add(name, total) {
        this._bars.set(name, { current: 0, total, name });
        this._render();
        return name;
    }

    update(name, current) {
        const bar = this._bars.get(name);
        if (bar) { bar.current = current; this._render(); }
    }

    remove(name) {
        this._bars.delete(name);
        this._render();
    }

    _render() {
        if (!isTTY) return;
        // Move cursor up to overwrite previous output
        if (this._lines > 0) process.stdout.write(`\x1b[${this._lines}A`);
        let out = '';
        for (const bar of this._bars.values()) {
            const pct = bar.total ? bar.current / bar.total : 0;
            const filled = Math.round(20 * pct);
            const b = `\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(20 - filled)}\x1b[0m`;
            const name = bar.name.slice(0, 30).padEnd(30);
            const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
            out += `\r ${b} ${pctStr}  ${name}\x1b[K\n`;
        }
        process.stdout.write(out);
        this._lines = this._bars.size;
    }

    stop() {
        if (isTTY && this._lines > 0) process.stdout.write('\n');
        this._bars.clear();
        this._lines = 0;
    }
}

module.exports = { Spinner, ProgressBar, MultiBar };
