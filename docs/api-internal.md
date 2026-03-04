# Internal API Reference

This document is for contributors and developers looking to understand the core architecture of JPM.

## Architecture Map

JPM is built around four main core modules that work together in a decoupled fashion.

### 1. `Resolver`

Responsible for building the dependency graph. It handles:

- Semver range resolution.
- Alias (`npm:`) protocol.
- **Platform-aware filtering** of optional dependencies.
- Deduplication and hoisting logic.

### 2. `Installer`

Orchestrates the physical installation to disk.

- Implements the **Worker-Pool** for parallel processing.
- Handles downloading, integrity verification, and extraction.
- Manages symlinking for binaries and workspaces.

### 3. `Registry`

The communication layer for the npm registry.

- Implements high-performance fetching with keep-alive.
- Handles redirections and decompression.
- Caches packuments and version metadata.

### 4. `Cache`

The disk persistence layer.

- Manages the storage of tarballs and JSON metadata.
- Implements LRU logic (coming soon) for cache cleanup.

## Utility Layer

- **`src/utils/fs.js`**: Atomic filesystem operations.
- **`src/utils/http.js`**: Robust HTTP client with circuit breaking.
- **`src/utils/system.js`**: Platform and architecture detection.
- **`src/utils/logger.js`**: Colorized, multi-level logging.
