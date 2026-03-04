# Getting Started

Ready to experience the next generation of package management? Let's get you set up.

## Installation

Currently, JPM is available to be linked directly from source. This ensures you have the latest performance optimizations.

```bash
git clone https://github.com/whomaderules/jpm.git
cd jpm
npm install       # Install build dependencies
npm link          # Register 'jpm' globally
```

## Your First Project

### 1. Initialize

Create a new folder and run the setup wizard:

```bash
mkdir jpm-app && cd jpm-app
jpm setup
```

> [!TIP]
> Use `jpm setup -y` to quickly initialize with default values.

### 2. Add Dependencies

Add a library to your project:

```bash
jpm get express
```

### 3. Run a Script

If you have a `start` script in your `package.json`:

```bash
jpm run start
```

Or use the handy alias:

```bash
jpm do start
```

## Moving from npm/pnpm?

JPM is fully compatible with your existing `package.json`. You can switch a project to JPM simply by running:

```bash
jpm syn
```

This will read your dependencies and generate a fresh `jpm-lock.json` and a high-speed `node_modules` structure.

---

[Explore the CLI Reference →](./cli.md)
