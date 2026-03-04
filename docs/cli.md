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

### `find <query>`

Search for packages on the npm registry. Alias: `search`.

### `info <package>`

Get detailed information about any package. Alias: `view`, `show`.

---

## Management

### `scan`

Deep security audit of your project. Checks for vulnerabilities and integrity issues. Alias: `audit`.

### `config <get|set>`

Manage JPM configuration values. Alias: `cfg`.

### `cache <clean|ls>`

Manage the global package cache.

- `clean`: Wipes the local cache.
- `ls`: Shows cache size and list of packages.
