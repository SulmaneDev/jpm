# Troubleshooting

Encountered an issue with JPM? Here are some common problems and their solutions.

## 0. Run `jpm doctor`

The first step in any troubleshooting process should be to run the **`jpm doctor`** command. This utility will:

- Check your registry connectivity.
- Verify Node.js and Bun versions.
- Check cache directory permissions and environment variables.

If `jpm doctor` reports issues, fix them before proceeding.

## 1. "Unknown command" error

If you see `error Unknown command: "x"`, it means you are using an older version of JPM.

- **Solution**: Pull the latest changes from the repository and run `npm link` again to update your global JPM binary.

## 2. "Lockfile signature mismatch"

JPM signs its lockfiles to prevent tampering. If you manually edit `jpm-lock.json`, the signature will break.

- **Solution**: Run `jpm syn` to re-generate the lockfile and its signature based on your `package.json`.

## 3. "Permission denied" during install

This typically happens when JPM tries to create symlinks for binaries in a protected directory.

- **Solution on Windows**: Ensure your terminal is running as Administrator, or check your user permissions for the `node_modules` folder.
- **Solution on Linux/macOS**: Avoid using `sudo jpm`. Instead, ensure your project directory is owned by your user.

## 4. "Registry error 404"

JPM cannot find the package you are looking for.

- **Solution**: Verify the package name and version. If you are using a private registry, ensure it is correctly configured in your `.jpmrc`.

## 5. Slow performance on first run

JPM builds its cache on the first run. Subsequent installs will be significantly faster.

- **Solution**: Let the first installation complete. If it's still slow, check your internet connection or registry latency.

---

[Still need help? Report an issue on GitHub](https://github.com/whomaderules/jpm/issues)
