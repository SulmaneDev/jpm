# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-06

### Changed

- **Refactored Command Architecture**: Migrated all 12 CLI commands to a modern Object-Oriented Programming (OOP) paradigm using a new `BaseCommand` abstract class.
- **Enhanced Core Modules**: Converted `Registry`, `Cache`, `Lockfile`, `PackageJSON`, and `Resolver` into classes for better encapsulation and maintainability.
- **Improved Documentation**: Replaced informal comments with professional JSDoc across refactored modules.
- **CLI Router Update**: The central command router in `bin/jpm.js` now supports both class-based and function-based handlers for seamless backward compatibility.

### Fixed

- **Info Command**: Resolved a reference error in the `info` command identified during the refactor.

## [1.0.0] - 2026-03-04

### Added

- Initial release of JPM Package Manager.
- Core features: Installation, Uninstallation, Search, Info, List, Audit, Publish.
- Monorepo support with workspaces.
- Integrity verification and security audits.
- Full SemVer resolution support.
- Built-in progress bars and colored CLI output.
