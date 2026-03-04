# Performance Engineering

JPM is engineered for speed. This document explores the technical optimizations that make it one of the fastest package managers in the ecosystem.

## 1. Worker-Pool Installation

Traditional package managers often download and extract packages in sequence or in small, fixed batches.

**How JPM does it**:
JPM implements a high-performance **Worker-Pool** architecture. Instead of processing packages one by one, it maintains a pool of workers that handle the lifecycle (fetch → verify → extract → link) for multiple packages simultaneously. This maximizes network bandwidth and utilizes all available CPU cores.

## 2. Platform-Aware Filtering

Many modern packages (like `esbuild`, `vite`, `rollup`) include optional dependencies for every possible operating system and architecture.

**How JPM does it**:
During the resolution phase, JPM detects the current system's OS and CPU. It then **filters out** irrelevant optional dependencies before they are even resolved or downloaded. This can reduce the number of packages to resolve by up to **80%** in projects like Vite, resulting in massive speed gains.

## 3. LRU Caching Layer

JPM features a sophisticated caching system in `~/.jpm/cache`.

**Features**:

- **Deduplication**: Identical tarballs are stored once across multiple projects.
- **In-Memory Metadata**: Frequently accessed package metadata (packuments) are cached in memory to avoid repetitive registry calls.
- **Incremental Extraction**: JPM only extracts what has changed, keeping your `node_modules` lightning-fast.

## 4. Environment-Awareness (Node vs Bun)

JPM is "Joint" because it optimizes for your runtime.

- **On Bun**: It uses native `Bun.write` and `Bun.spawn` for even faster I/O.
- **On Node**: It uses optimized streams and keep-alive HTTP agents to minimize connection overhead.
