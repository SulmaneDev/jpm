# Configuration Reference

JPM can be tuned to fit your workflow using the `.jpmrc` configuration file.

## Configuration Search Path

1.  **Global**: `~/.jpmrc`
2.  **Local**: `.jpmrc` (current directory)
3.  **Environment**: `JPM_` prefixed variables
4.  **CLI**: Arguments passed to the command

## Available Settings

| Key           | Default                       | Description                                              |
| :------------ | :---------------------------- | :------------------------------------------------------- |
| `registry`    | `https://registry.npmjs.org/` | The npm-compatible registry URL.                         |
| `loglevel`    | `info`                        | Output verbosity (`silent`, `info`, `verbose`, `debug`). |
| `save-exact`  | `false`                       | If true, pins versions exactly in `package.json`.        |
| `audit-level` | `moderate`                    | Minimum severity to report in security audits.           |
| `cache-dir`   | `~/.jpm/cache`                | Path to the global package cache.                        |
| `strict-ssl`  | `true`                        | Enforces valid SSL certificates.                         |

## Managing Config via CLI

You can get or set configuration values directly from your terminal:

```bash
# Set a new registry
jpm config set registry https://my.internal.repo

# View current loglevel
jpm config get loglevel
```

## Environment Variables

Any configuration key can be overridden using environment variables:

- `JPM_LOGLEVEL=debug`
- `JPM_REGISTRY=https://mirror.com`
