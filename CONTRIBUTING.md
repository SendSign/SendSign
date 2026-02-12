# Contributing to SendSign

Thank you for your interest in contributing to SendSign! This document provides guidelines and instructions for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Coding Standards](#coding-standards)
- [Good First Issues](#good-first-issues)

---

## Code of Conduct

SendSign follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code.

**In short:**
- Be respectful and inclusive
- Be patient and welcoming
- Assume good intent
- Give and receive feedback graciously

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/sendsign.git
   cd sendsign
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/sendsign/sendsign.git
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## Development Setup

### Prerequisites

- **Node.js** 20+ and npm
- **Docker** and docker-compose (for local database and MinIO)
- **Git**
- **A code editor** (VS Code recommended)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   cd signing-ui && npm install && cd ..
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set required variables
   ```

3. **Generate development certificates:**
   ```bash
   npx tsx scripts/generate-dev-cert.ts
   ```

4. **Start services:**
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations:**
   ```bash
   npx drizzle-kit push:pg
   ```

6. **Start the API server:**
   ```bash
   npm run dev
   ```

7. **In another terminal, start the Signing UI dev server:**
   ```bash
   cd signing-ui
   npm run dev
   ```

**Access:**
- API: http://localhost:3000
- Signing UI (dev): http://localhost:5173
- MinIO Console: http://localhost:9001 (minioadmin / minioadmin)

---

## Project Structure

```
sendsign/
├── src/                      # Backend API (TypeScript)
│   ├── api/                  # Express routes and middleware
│   │   ├── routes/           # Endpoint handlers
│   │   └── middleware/       # Auth, validation, rate limiting
│   ├── db/                   # Database schema and connection (Drizzle ORM)
│   ├── documents/            # PDF processing and field placement
│   ├── workflow/             # Envelope lifecycle management
│   ├── ceremony/             # Signing ceremony and token management
│   ├── crypto/               # Document sealing, hashing, certificates
│   ├── storage/              # S3 document storage and encryption
│   ├── notifications/        # Email, SMS, WhatsApp, webhooks
│   ├── audit/                # Audit trail logging and export
│   ├── config/               # Environment config and validation
│   └── index.ts              # Express app entry point
├── signing-ui/               # Frontend signing UI (React + Vite)
│   ├── src/
│   │   ├── components/       # React components (field types, PDF viewer)
│   │   ├── pages/            # Page components (signing, verify, complete)
│   │   ├── hooks/            # Custom React hooks (field logic)
│   │   └── types/            # TypeScript interfaces
├── scripts/                  # Utility scripts (dev cert generation, e2e test)
├── docs/                     # Documentation
├── sendsign-plugin/            # Cowork plugin files
├── deploy/                   # Deployment configs (future: Helm, Terraform)
├── tests/                    # Test files (*.test.ts)
├── docker-compose.yml        # Local development environment
├── Dockerfile                # Production Docker image
└── BUILD_RECIPE.md           # Step-by-step build instructions
```

---

## Development Workflow

### 1. Pick an Issue

Browse the [issue tracker](https://github.com/sendsign/sendsign/issues) and find an issue that interests you.

- **Good first issues** are labeled `good first issue`
- **Help wanted** issues are labeled `help wanted`

Comment on the issue to let others know you're working on it.

### 2. Create a Branch

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

**Branch naming:**
- `feature/` for new features
- `fix/` for bug fixes
- `docs/` for documentation changes
- `refactor/` for code refactoring
- `test/` for test improvements

### 3. Make Changes

- Follow the [coding standards](#coding-standards)
- Write tests for new functionality
- Update documentation if needed

### 4. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/documents/fieldPlacer.test.ts

# Run tests in watch mode
npm test -- --watch

# Type check
npm run typecheck

# Lint
npm run lint
```

### 5. Commit Your Changes

```bash
git add .
git commit -m "feat: add support for dropdown fields"
```

**Commit message format:**
```
<type>: <short description>

[optional longer description]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation change
- `test`: Test change
- `refactor`: Code refactoring (no functionality change)
- `perf`: Performance improvement
- `chore`: Build process, tooling, or other non-code changes

**Examples:**
```
feat: add support for radio button fields

Implements radio button field type with single-select behavior.
Includes field placement, rendering, and validation.

Closes #123
```

```
fix: prevent duplicate signing tokens

Tokens were being generated multiple times if send was called
repeatedly. Now we check for existing tokens first.
```

### 6. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Go to GitHub and create a pull request from your branch to `main`.

---

## Testing

SendSign uses **Vitest** for testing.

### Running Tests

```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific file
npm test -- src/workflow/envelopeManager.test.ts
```

### Writing Tests

**Test file naming:** `*.test.ts` (same directory as the file being tested)

**Example:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createEnvelope } from './envelopeManager.js';

describe('envelopeManager', () => {
  beforeEach(async () => {
    // Clean up database before each test
  });

  it('should create an envelope with signers', async () => {
    const envelope = await createEnvelope({
      subject: 'Test NDA',
      signers: [{ name: 'Alice', email: 'alice@test.local' }],
    });

    expect(envelope.id).toBeDefined();
    expect(envelope.signers).toHaveLength(1);
  });
});
```

**Test coverage goals:**
- Core modules: 90%+ coverage
- API routes: 80%+ coverage
- Utilities: 100% coverage

---

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass locally (`npm test`)
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] Linter passes (`npm run lint`)
- [ ] Code is formatted consistently
- [ ] Documentation is updated (if needed)
- [ ] Commit messages follow the format
- [ ] Branch is up to date with `main`

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Related Issue
Closes #123

## Changes
- Added X feature
- Fixed Y bug
- Refactored Z module

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manually tested in local environment

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

1. **Automated checks** run on every PR (lint, test, build)
2. **Code review** by maintainers
3. **Changes requested** (if needed)
4. **Approval** by at least one maintainer
5. **Merge** to `main`

**What reviewers look for:**
- Correctness: Does it work as intended?
- Tests: Are there sufficient tests?
- Code quality: Is it readable and maintainable?
- Documentation: Is it clear for future contributors?
- Security: Are there any security concerns?

---

## Coding Standards

### TypeScript

- **Strict mode enabled** — no `any` types without explicit justification
- **Named exports** preferred over default exports
- **Async/await** everywhere (no raw callbacks or `.then()`)
- **Functional style** where possible (immutability, pure functions)

### Code Style

- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Yes
- **Line length:** 120 characters max
- **Formatting:** Prettier (run `npm run format`)

### API Conventions

- **All endpoints return JSON:**
  ```typescript
  { success: boolean, data?: T, error?: string }
  ```
- **Use Zod for validation** (not manual checks)
- **Use Drizzle ORM for database** (no raw SQL in app code)
- **Async route handlers** with `express-async-errors`

### Naming Conventions

- **Files:** `camelCase.ts` (e.g., `envelopeManager.ts`)
- **Classes:** `PascalCase` (rare in this codebase)
- **Functions:** `camelCase` (e.g., `createEnvelope`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
- **Interfaces/Types:** `PascalCase` (e.g., `EnvelopeData`)

### Comments

- Use comments sparingly — code should be self-explanatory
- Use JSDoc for public API functions:
  ```typescript
  /**
   * Create a new signing envelope.
   * @param data - Envelope creation data
   * @returns The created envelope with generated ID
   */
  export async function createEnvelope(data: CreateEnvelopeInput): Promise<Envelope> {
    // ...
  }
  ```

---

## Good First Issues

Looking for a place to start? Try these:

### Easy

- **Add field type:** Implement a new field type (e.g., `phone`, `url`)
- **Improve validation:** Add more validation rules for existing fields
- **Documentation:** Improve API docs, add examples
- **Tests:** Add tests for uncovered code

### Medium

- **Notification templates:** Design new email templates
- **UI improvements:** Enhance the signing UI (accessibility, mobile)
- **Export formats:** Add new audit trail export formats (CSV, XML)
- **Localization:** Add internationalization support (i18n)

### Challenging

- **OAuth integration:** Add OAuth 2.0 support for user authentication
- **Advanced routing:** Implement conditional routing based on field values
- **RBAC:** Add role-based access control for multi-tenant deployments
- **Real-time updates:** Add WebSocket support for live signing progress

**Check the issue tracker for more:** [github.com/sendsign/sendsign/issues?q=is:issue+is:open+label:"good+first+issue"](https://github.com/sendsign/sendsign/issues?q=is:issue+is:open+label:%22good+first+issue%22)

---

## Questions?

- **GitHub Discussions:** [github.com/sendsign/sendsign/discussions](https://github.com/sendsign/sendsign/discussions)
- **Discord:** (coming soon)
- **Email:** contribute@sendsign.dev

---

## License

By contributing to SendSign, you agree that your contributions will be licensed under the BSD 3-Clause License with Branding Protection. See [LICENSE](./LICENSE) for details.

---

Thank you for contributing to SendSign! 🎉
