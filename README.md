# JPM ⚡ Joint Package Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-Supported-black.svg)](https://bun.sh/)

**JPM (Joint Package Manager)** is an enterprise-grade, high-performance, and environment-aware package manager built for the modern JavaScript ecosystem. It provides a unified, blazing-fast experience across **Node.js** and **Bun** with a focus on security, speed, and advanced monorepo capabilities.

---

## 🚀 Key Features

### ⚡ Blazing Performance

- **Environment-Aware**: Leverages native Bun I/O (`Bun.write`, `Bun.spawn`) or high-performance Node.js streams.
- **Native Bun Optimizations**: Uses `Bun.fetch` for registry requests and **SQLite-based metadata caching** for lightning-fast resolution in Bun runtimes.
- **Worker-Pool Installation**: Uses a continuous worker-pool architecture for maximum parallel download and extraction speeds.
- **Zero-Dependency Core**: Uses system `tar` for extraction, making JPM footprint smaller and faster to install.
- **Platform-Aware Filtering**: Only downloads optional binaries compatible with your specific OS and CPU.

### 🛡️ Hardened Security

- **Interactive Security Patching**: `jpm scan --fix` automatically upgrades vulnerable packages to their patched versions.
- **Zip Slip Protection**: Built-in path traversal filtering prevents malicious packages from writing files outside their `node_modules`.
- **Strict HTTPS & Integrity**: Enforces mandatory SHA-512 integrity checks and strict SSL for all registry metadata and audits.
- **Malicious Script Detection**: Scans `preinstall`/`postinstall` scripts for suspicious patterns.
- **Transactional Installs**: Automatic rollbacks prevent project corruption on failure.

### 📦 Handy CLI

- **Simplified Command Set**: Intuitive verbs like `get`, `drop`, and `syn`.
- **Project Scaffolding**: `jpm create` enables instant project setup from standard templates.
- **Dependency Diagnostics**: `jpm why` tells you exactly who brought in a specific package.
- **Environment Health**: `jpm doctor` verifies registry connectivity and cache permissions.

---

## 📦 Handy Commands Guide

| Command             | Alias                 | Description                                  |
| :------------------ | :-------------------- | :------------------------------------------- |
| `jpm get <pkg>`     | `i`, `add`, `install` | Install packages and update `package.json`   |
| `jpm drop <pkg>`    | `remove`, `rm`        | Remove packages and cleanup binaries         |
| `jpm syn`           |                       | Synchronize all dependencies (clean install) |
| `jpm scan [--fix]`  | `audit`, `scan --fix` | Security audit & interactive patching        |
| `jpm create <tmpl>` |                       | Scaffold projects (e.g., `jpm create vite`)  |
| `jpm doctor`        |                       | Check environment and registry health        |
| `jpm why <pkg>`     |                       | Trace dependency resolution paths            |
| `jpm link [pkg]`    |                       | Local package link development               |
| `jpm rebuild`       |                       | Re-run lifecycle (postinstall) scripts       |
| `jpm x <pkg>`       | `exec`                | Execute remote package binary (like `npx`)   |
| `jpm up`            | `upgrade`             | Upgrade dependencies to safe latest versions |
| `jpm peek`          | `ls`, `list`          | Inspect installed tree and metadata          |
| `jpm verify`        |                       | Verify environment consistency               |
| `jpm prune`         |                       | Remove extraneous packages                   |
| `jpm bench`         |                       | Benchmark command execution time             |

---

## 🛠️ Detailed Usage

### Scaffolding projects (`jpm create`)

JPM follows the standard `create-` convention. Running `jpm create vite` is equivalent to running `create-vite`.

```bash
jpm create vite my-app -- --template react
```

### Security Patching (`jpm scan --fix`)

Tired of manually updating vulnerable packages? Let JPM handle it.

```bash
jpm scan --fix
```

### Dependency Tracing (`jpm why`)

Understand exactly why `lodash` (or any other package) is in your `node_modules`.

```bash
jpm why lodash
```

### Local Linking (`jpm link`)

Develop local packages side-by-side.

```bash
# In the package directory
jpm link

# In the consumer project
jpm link my-local-package
```

---

## 🔐 Installation

To build JPM from source and link it to your system:

```bash
git clone https://github.com/whomaderules/jpm.git
cd jpm
npm link          # JPM is zero-dependency!
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
