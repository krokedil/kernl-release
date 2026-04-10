# Development README for Kernl Deployment Action

Thank you for your interest in contributing to the Kernl Deployment Action! This guide will provide you with the necessary information to build and test a new release of the action.

## Pre-requisites

Before you begin, please ensure you have the following installed on your local machine:

- Node.js (version 16 or above)
- npm (usually comes with Node.js)

All other tooling (ncc, jest, eslint, typescript) is installed locally as a devDependency when you run `npm install`, so no global installs are required.

## Building the Action

We are using [Vercel's ncc](https://github.com/vercel/ncc) to compile the action into a single JavaScript file that can be checked into the repository. This way, the action can be run directly without needing to install dependencies each time the action is used.

To build the action, follow these steps:

1. Navigate to the action's directory.
2. Run `npm install` to install the dependencies.
3. Run `npm run build` to build the action.
4. This will create a `dist` folder containing `index.js`. These are the compiled and minified versions of the action.

## Testing the Action

The project has unit tests that cover the action's behavior without making real network requests to Kernl. They live in [`__tests__/`](./__tests__) and use [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/), mocking `axios`, `@actions/core`, `fs`, `glob`, and `archiver` so the tests run fully offline.

To run the tests locally:

```bash
npm test
```

When adding new functionality, add a corresponding test in `__tests__/index.test.ts`. The existing tests serve as a reference for how to mock each dependency.

### End-to-end testing in a real workflow

Unit tests cover the logic, but it's still a good idea to verify the action runs end-to-end inside a real GitHub workflow before releasing:

1. Push your changes to a new branch in your fork of the repository.
2. In your test repository, modify your workflow to use the action from your branch.
3. Trigger the workflow and observe the action's behavior. Make sure it is working as expected.

## Linting

The project uses [ESLint](https://eslint.org/) with [typescript-eslint](https://typescript-eslint.io/)'s type-checked ruleset. The configuration lives in [`eslint.config.mjs`](./eslint.config.mjs) and enables a few rules specifically chosen to catch async/promise mistakes:

- `no-async-promise-executor`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/no-misused-promises`

To run the linter:

```bash
npm run lint        # report issues
npm run lint:fix    # report issues and auto-fix what can be fixed
```

Lint should be clean before opening a release.

## Creating a Release

Once your changes have been tested and are ready to be included in the main project:

1. Update the version number in the `package.json`.
2. Run `npm install` to update the `package-lock.json`.
3. Commit the changes with a message describing the changes made.
4. Push the changes to GitHub.
5. On GitHub, create a new release. The tag version and release title should match the new version number in the `package.json`.
6. In the release description, provide a summary of changes made in this release.

We appreciate your contributions and look forward to seeing your improvements to the Kernl Deployment Action!
