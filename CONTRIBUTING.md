# Contributing to IDE Shepherd

## Welcome

Welcome! We are glad you are interested in contributing to IDE Shepherd. This guide will help you understand the requirements and guidelines to improve your contributor experience.

## License

Unless explicitly stated otherwise, all files in this repository are licensed under the Apache License 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/).
Copyright 2025-Present Datadog, Inc.

By contributing to this repository, you agree that your contributions will be licensed under the Apache License 2.0.

## Contributing to Code

### New Features

If you want to contribute with a new feature, before start writing any code, you will need to get your proposal accepted by the maintainers. This is to avoid going through the effort of writing the code and getting it rejected because it is already being worked on in a different way, or it is outside the scope of the project.

Open a new issue with the title "[RFC] Title of your proposal". In the description explain carefully why you think this feature is needed, why it is useful, and how you plan to implement it. We recommend to use the RFC issue template we provide.

The maintainers will label the issue as `type/feature` or `type/major_change` and `rfc/discussion` and will start a conversation with you to discuss it. If the proposal gets accepted it will be tagged as `rfc/approved`. Feel free to start coding at that point and propose a PR, linking it to the issue.

During the RFC process, your change proposal, alongside with implementation approaches, will get discussed with the maintainers, ensuring that you don't waste time with wrong approaches or features that are out of scope for the project.

If, after the discussion, the proposal gets rejected, the team will give you an explanation, label the issue as `rfc/rejected` and close the issue.

### Bug Fixes

If you have identified an issue that is already labeled as `type/bug` that hasn't been assigned to anyone, feel free to claim it, and ask a maintainer to add you as assignee. Once you have some code ready, open a PR, linking it to the issue. Take into account that if the changes to fix the bug are not trivial, you need to follow the RFC process as well to discuss the options with the maintainers.

## Setting up your Development Environment

### Prerequisites

- Node.js (20.x recommended)
- VS Code (1.99.3 or later)

### Development Setup

1. **Clone the repository**

   ```sh
   git clone https://github.com/DataDog/IDE-SHEPHERD-extension.git
   cd IDE-SHEPHERD-extension
   ```

2. **Install dependencies**

   ```sh
   npm install
   ```

3. **Install VS Code Extension Manager (optional, for packaging)**
   ```sh
   npm install -g @vscode/vsce
   ```

### Development Workflow

1. **Compile TypeScript**

   ```sh
   npm run compile
   # Or for continuous compilation during development:
   npm run watch
   ```

2. **Run formatting**

   ```sh
   npm run format
   npm run format:check
   ```

3. **Type checking**

   ```sh
   npm run typecheck
   ```

4. **Run tests**

   ```sh
   npm test
   ```

5. **Package the extension into a VSIX file**
   ```sh
   vsce package
   ```

### Testing the Extension

1. **Install from local package**

   ```sh
   code --install-extension ide-shepherd-extension-*.vsix
   ```

2. **Reload VS Code**
   - Restart VS Code or reload the window (`Ctrl+Shift+P` → "Developer: Reload Window")

### Extension Structure

The extension is organized as follows:

```
src/
├── extension.ts      # Main extension entry point
├── detection/        # Security detection logic
├── monitor/          # Real-time monitoring components
├── scanner/          # Extension scanning functionality
├── lib/              # Shared utilities and libraries
└── test/             # Test files
```

## Testing and Linting your Changes

### Running Tests

To run the test suite:

```sh
npm test
```

This will:

- Compile the TypeScript code
- Run the linter
- Execute all unit and integration tests

### Linting

To check for linting issues:

```sh
npm run lint
```

To automatically fix linting issues:

```sh
npm run lint:fix
```

### Code Formatting

To format your code:

```sh
npm run format
```

To check if your code is properly formatted:

```sh
npm run format:check
```

### Type Checking

To run TypeScript type checking:

```sh
npm run typecheck
```

## Contributing to Issues

### Contributing to Reporting Bugs

If you think you have found a bug in IDE Shepherd feel free to report it. When creating issues, you will be presented with a template to fill. Please, fill as much as you can from that template, including steps to reproduce your issue, so we can address it quicker.

Before reporting a bug, please [search if an issue already exists](https://docs.github.com/en/github/searching-for-information-on-github/searching-on-github/searching-issues-and-pull-requests#search-by-the-title-body-or-comments).

**Bug Report Template:**

- Clear and concise description of the bug
- Steps to reproduce the behavior
- Expected behavior
- Screenshots (if applicable)
- Environment details:
  - OS (e.g., macOS, Windows, Linux)
  - VS Code Version
  - IDE Shepherd Extension Version
  - Node.js Version
- Relevant logs from VS Code Output Panel or Developer Console

### Contributing to Triaging Issues

Triaging issues is a great way to contribute to an open source project. Some actions you can perform on an open by someone else issue that will help addressing it sooner:

**Trying to reproduce the issue.** If you can reproduce the issue following the steps the reporter provided, add a comment specifying that you could reproduce the issue.

**Finding duplicates.** If there is a bug, there might be a chance that it was already reported in a different issue. If you find an already reported issue that is the same one as the one you are triaging, add a comment with "Duplicate of" followed by the issue number of the original one.

**Asking the reporter for more information if needed.** Sometimes the reporter of an issue doesn't include enough information to work on the fix, i.e. lack of steps to reproduce, not specifying the affected version, etc. If you find a bug that doesn't have enough information, add a comment tagging the reporter asking for the missing information.

## Pull Request Guidelines

When you're ready to submit your changes:

1. **Create a new branch** with the form: `<username>/<branch-function>`

   ```sh
   git checkout -b username/feature-name
   ```

2. **Make your changes** and commit them with clear, descriptive commit messages

3. **Push to your branch**

   ```sh
   git push origin username/feature-name
   ```

4. **Open a Pull Request** with:
   - A clear title describing the change
   - A description of what the PR does and why
   - Link to any related issues
   - Screenshots or examples if applicable

5. **Ensure all checks pass:**
   - All tests pass
   - Linting passes
   - Type checking passes
   - Code is properly formatted

Thank you for contributing to IDE Shepherd! 🎉
