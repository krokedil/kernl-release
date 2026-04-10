# Changelog

All notable changes of the krokedil/kernl-release action are documented in this file.

The format is based on [Keep a Changelog](https://kepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

------------------

# [1.1.0] - 2026-04-10
### Added
- Added support for sending the tested and minimum required WordPress versions as part of the deployment process. This will be taken from the changelog.json file for the version being deployed.
- Added CI action for testing the action on pull requests and pushes to master to ensure that the action is working as expected.
- Added a changelog.md file to document changes to the action itself.

### Changed
- Updated the action to use the latest version of the GitHub Actions toolkit.
- Updated the action to use version 24 of Node.js.

## [1.0.0] - 2023-06-13

### Added

* Initial release of the action.
