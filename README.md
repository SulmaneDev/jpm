# JPM ⚡ Joint Package Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-Supported-black.svg)](https://bun.sh/)

**JPM (Joint Package Manager)** is an enterprise-grade, high-performance, and environment-aware package manager built for the modern JavaScript ecosystem. It provides a unified, blazing-fast experience across **Node.js** and **Bun** with a focus on security, speed, and advanced monorepo capabilities.

---

## 🚀 Key Features

### ⚡ Blazing Performance

- **Environment-Aware**: Leverages native Bun I/O (`Bun.write`, `Bun.spawn`) for near-zero overhead or high-performance Node.js streams.
- **Worker-Pool Installation**: Uses a continuous worker-pool architecture for maximum parallel download and extraction speeds.
- **Platform-Aware Filtering**: Only downloads optional binaries (like native modules) compatible with your specific OS and CPU, saving bandwidth and disk space.
- **Incremental Core**: Intelligent caching and symlinking system ensures you never re-download the same package twice.

### 🛡️ Hardened Security

- **Zip Slip Protection**: Built-in path traversal filtering prevents malicious packages from writing files outside their `node_modules`.
- **Strict HTTPS & Integrity**: Enforces mandatory SHA-512 integrity checks and strict SSL for all registry metadata and audits.
- **Malicious Script Detection**: Scans `preinstall`/`postinstall` scripts for suspicious patterns (e.g., unauthorized `curl` or `rm` commands).
- **Transactional Installs**: Automatic rollbacks ensure a failed installation never leaves your project in a corrupted state.

### 📦 Handy CLI

- **Simplified Command Set**: Intuitive, easy-to-remember verbs like `get`, `drop`, and `syn`.
- **Remote Execution (`x`)**: Run any package without installing it (equivalent to `npx`), with built-in security auditing before every run.
- **Hive (Workspaces)**: First-class monorepo support with seamless discovery and cross-workspace script broad casting.

---

## 📦 Handy Commands Guide

| Command            | Alias                 | Description                                  |
| :----------------- | :-------------------- | :------------------------------------------- |
| `jpm get <pkg>`    | `i`, `add`, `install` | Install packages and update `package.json`   |
| `jpm drop <pkg>`   | `remove`, `rm`        | Remove packages and cleanup binaries         |
| `jpm syn`          |                       | Synchronize all dependencies (clean install) |
| `jpm x <pkg>`      | `exec`                | Execute remote package binary (like `npx`)   |
| `jpm run <script>` | `do`                  | Execute a script defined in `package.json`   |
| `jpm scan`         | `audit`               | Deep security and vulnerability audit        |
| `jpm up`           | `upgrade`             | Upgrade dependencies to safe latest versions |
| `jpm peek`         | `ls`, `list`          | Inspect installed tree and metadata          |
| `jpm info <pkg>`   | `view`                | Detailed package intelligence/manifest       |
| `jpm hive`         | `workspace`           | Manage workspace clusters (Monorepos)        |
| `jpm setup`        | `init`                | Initialize a new JPM project                 |
| `jpm cache`        |                       | Manage the local high-speed cache            |

---

## 🛠️ Detailed Usage

### Installing Packages

```bash
jpm get express             # Add latest express
jpm get lodash@4.17.21      # Specific version
jpm get jest -D             # Add to devDependencies
jpm get --save-exact        # Pin versions precisely
```

### Remote Execution (`jpm x`)

Run packages without global installation. JPM performs a security scan on the remote package before it touches your machine.

```bash
jpm x create-next-app@latest my-app
jpm x vite@latest --open
```

### Monorepo Management (`jpm hive`)

JPM makes managing complex project clusters effortless.

```bash
jpm hive list               # See all workspace packages
jpm hive run build          # Build every package in the hive
jpm hive run test -f app    # Run tests only in matching packages
```

---

## 🔐 Security Deep Dive

### Zip Slip Protection

JPM's extractor implements a robust `filter` that resolves every file in a tarball. If a package tries to extract a file outside it's legitimate directory (using `../` hacks), JPM kills the process and reports a security violation.

### Insecure Protocol Blocking

In JPM's strict mode (enabled for all audits), any communication over plain `http:` is blocked to prevent man-in-the-middle attacks.

### Mandatory Integrity

JPM refuses to install any package that doesn't provide a valid `sha512` or `shasum` from the registry, preventing "Trust-on-First-Use" (TOFU) vulnerabilities.

---

## ⚙️ Configuration

JPM is configured via `.jpmrc` files (INI format).

**Hierarchy:**

1. CLI Flags (`--registry`, `--fast`)
2. Project `.jpmrc`
3. User `~/.jpmrc`

**Recommended `.jpmrc`:**

```ini
registry=https://registry.npmjs.org/
save-exact=false
audit-level=moderate
loglevel=info
# Use --fast globally for speed, but manually verify integrity
# fast=true
```

---

## � Installation

To build JPM from source and link it to your system:

```bash
git clone https://github.com/whomaderules/jpm.git
cd jpm
npm install       # Install build-time dependency (tar)
npm link          # Link JPM to your global path
```

---

## 📚 Documentation

- [Introduction](./docs/intro.md)
- [Getting Started](./docs/getting-started.md)
- [CLI Reference](./docs/cli.md)
- [Performance](./docs/performance.md)
- [Security](./docs/security.md)
- [Workspaces](./docs/workspaces.md)
- [Troubleshooting](./docs/troubleshooting.md)

**Built with ❤️ for the JS Community by [Muhammad Sulman](https://www.linkedin.com/in/sulmanedev)**
