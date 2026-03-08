# Command Line Interface

The JPM CLI is designed to be concise and powerful. Here is the full breakdown of every available command.

## Dependency Management

### `get [packages]`

Installs one or more packages.
| Flag | Description |
| :--- | :--- |
| `-D, --save-dev` | Save to devDependencies |
| `-E, --save-exact` | Pin exact version |
| `--fast` | Bypass heavy security checks |

### `drop <packages>`

Removes packages from your project.

### `syn`

Synchronizes your project based on the lockfile. This is the command to run after cloning a repo.

### `up [packages]`

Upgrades dependencies while respecting your semver ranges.

### `rebuild [packages]`

Re-runs lifecycle scripts (`preinstall`, `install`, `postinstall`) for installed packages. This is helpful when native module builds fail or post-install scripts need a re-run.

---

## Execution

### `x <package> [args]`

Executes a remote binary (like `npx`).

- **Security First**: Runs a scan before execution.
- **Platform Filtering**: Only downloads what is needed for your specific OS.

### `run <script>`

Executes a script from `package.json`. Alias: `do`.

---

## Discovery

### `peek`

Shows the installed dependency tree. Alias: `ls`, `list`.

### `why <package>`

Traces and displays all dependency paths leading to a specific package, explaining why it was installed.

### `find <query>`

Search for packages on the npm registry. Alias: `search`.

### `info <package>`

Get detailed information about any package. Alias: `view`, `show`.

---

## Management

### `scan [--fix]`

Deep security audit of your project. Checks for vulnerabilities and integrity issues. Alias: `audit`.

- **`--fix`**: Automatically attempts to patch vulnerabilities by upgrading affected packages to their fixed versions.

### `create <template> [args]`

Scaffold a new project using a `create-` template (e.g., `jpm create vite`).

### `doctor`

Performs an environment health check, verifying Node.js/Bun versions, registry connectivity, and cache permissions.

### `link [package]`

Facilitates local package development.

- `jpm link`: Run in a package directory to register it globally.
- `jpm link <pkg>`: Run in a consumer project to use the globally linked package.

### `config <get|set>`

Manage JPM configuration values. Alias: `cfg`.

### `cache <clean|ls>`

Manage the global package cache.

- `clean`: Wipes the local cache.
- `ls`: Shows cache size and list of packages.
