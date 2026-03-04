# Hive Workspaces (Monorepos)

JPM's **Hive** feature provides a seamless way to manage multiple interconnected packages within a single repository.

## 1. Defining a Hive

Simply add the `workspaces` field to your root `package.json`:

```json
{
  "name": "project-root",
  "workspaces": ["packages/*", "apps/*"]
}
```

## 2. The `hive` Command

JPM provides global monorepo controls.

- **`jpm hive list`**: Displays all discovered workspace packages, their versions, and locations.
- **`jpm hive run <script>`**: Broadcasts a script to all packages in the hive.
- **`jpm hive link`**: Re-calculates and fixes all inter-package symlinks.

## 3. Hoisting & Symlinking

JPM uses an advanced hoisting algorithm to keep your `node_modules` efficient.

- **Hoisting**: Common dependencies are pulled to the root level to save space.
- **Intelligent Symlinking**: Local packages are linked to each other using absolute paths (junctions on Windows), ensuring that changes in one package are immediately reflected in another without needing a "build & publish" cycle.

## 4. Parallel Execution

When running scripts across the hive (e.g., `jpm hive run build`), JPM executes them in parallel while strictly respecting the dependency graph (coming soon), ensuring that your packages build in the correct order as fast as possible.
