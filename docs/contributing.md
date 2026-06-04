# Contributing Guide

This document defines the repository conventions for branches, commits, pull requests, and merge flow.

## Branches

Branch naming convention:

- Feature branches: `feature/<name>`
- Hotfix branches: `hotfix/<name>`

Branch rules:

- Always branch from `dev` for feature work.
- Always branch from `main` for hotfix work.
- Use short, descriptive, lowercase branch names with hyphens.

Examples:

- `feature/add-github-pr-rules`
- `feature/improve-sandbox-validation`
- `hotfix/fix-login-timeout`

Recommended commands:

```bash
# Feature branch
git checkout dev
git pull origin dev
git checkout -b feature/<name>

# Hotfix branch
git checkout main
git pull origin main
git checkout -b hotfix/<name>
```

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<scope>): <short description>
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `ci`
- `style`
- `perf`

Common scopes:

- `api`
- `app`
- `auth`
- `infra`
- `ui`
- `core`
- `docker`
- `ci`
- `mobile`

Examples:

- `feat(api): add password reset endpoint`
- `fix(app): prevent double submit on login form`
- `docs(auth): add troubleshooting section for token refresh`
- `refactor(infra): extract email service interface`
- `chore(docker): update postgres to 16.2`

Commit rules:

- Keep the subject line at or under 72 characters.
- Use lowercase in the subject line.
- Do not end the subject line with a period.
- Use the imperative mood, for example `add` instead of `added`.
- Prefer one logical change per commit.
- Avoid mixing refactors and behavior changes in the same commit unless necessary.
- Do not add `Co-Authored-By` trailers unless explicitly required.

## Pull Requests

Keep the PR title short and descriptive, ideally under 70 characters. Put the details in the body, not the title.

The PR description should be understandable to a reviewer with no prior context.

Use this structure:

- Summary: what changed and why in 1 to 3 bullet points
- Key decisions: important design or implementation choices, if any
- How to test: commands or manual steps to verify the change

Example:

```md
## Summary
- add a dedicated contribution guide for branch, commit, and PR conventions
- link the guide from the main documentation entry points

## Key decisions
- keep repository-wide policy in docs/contributing.md
- keep agent-only workflow rules in AGENTS.md

## How to test
- open README.md and verify the new documentation link is present
- open AGENTS.md and verify the contribution rules reference is present
```

## Merge Flow

- Feature work: create `feature/<name>` from `dev`, then open a PR to `dev`.
- Release flow: open a PR from `dev` to `main`.
- Hotfix work: create `hotfix/<name>` from `main`, then open a PR to `main`.
- Merge only after the required CI checks pass.

For GitHub branch protection, required checks, and hotfix back-merge automation, see [docs/github-ci-setup.md](github-ci-setup.md).
