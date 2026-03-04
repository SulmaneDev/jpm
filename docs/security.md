# Security Architecture

Security is not an add-on in JPM; it's a fundamental property of the system.

## 1. Zip Slip Protection

The "Zip Slip" vulnerability is a widespread arbitrary file write vulnerability that typically occurs when an application extracts files from an archive without validating the target path.

**How JPM solves it**:
JPM's internal extractor (built on `tar`) includes a strict path validation layer. Every file path within the archive is resolved against the target extraction directory. If a path resolves to a location outside the package folder, JPM kills the process immediately, preventing malicious files from overwriting system or project configurations.

## 2. Platform-Aware Integrity

JPM leverages cryptographic integrity checks (SHA-512) for every downloaded byte.

**Deterministic Verification**:
During installation, JPM computes the hash of the downloaded tarball and matches it against the registry-provided `integrity` string. If there is a mismatch, JPM rolls back the installation to ensure your project remains untainted.

## 3. Malicious Script Scanning

Install scripts (`preinstall`, `postinstall`) are common vectors for supply-chain attacks.

**Proactive Auditing**:
Before running any script, JPM's `scan` command can analyze the script content for suspicious patterns such as:

- Data exfiltration (authorized `curl`, `wget`)
- System modification (unauthorized `sudo`, `rm`)
- Obfuscated payloads

## 4. Transactional Reliability

JPM treats every installation as a transaction. If a download fails, an integrity check misses, or a script errors out, JPM **rolls back** the changes to the `node_modules` directory. You will never be left with a partial or corrupted installation.
