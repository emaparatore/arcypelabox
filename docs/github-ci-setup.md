# GitHub CI Setup

This guide describes how to configure GitHub so that:

- PRs targeting `main` and `dev` run CI
- merge is allowed only if CI passes
- `main` and `dev` branches are kept up-to-date via PRs
- hotfixes merged into `main` automatically open a back-merge PR to `dev`

## Important GitHub ruleset limitation

In GitHub rulesets, `Restrict updates` blocks any branch update, including PR merges.

So on a personal repository, if you enable `Restrict updates` on `main` or `dev` without proper bypass:

- direct pushes are blocked
- PR merges are also blocked

For this reason, branches are protected in this configuration with:

- `Require a pull request before merging`
- `Require status checks to pass`
- `Block force pushes`

but without `Restrict updates`.

## Workflows in this repository

- `.github/workflows/ci.yml`
  - triggered on `pull_request` to `main` and `dev`
  - triggered on `push` to `main` and `dev`
  - final required check: `ci-success`
- `.github/workflows/hotfix-backmerge.yml`
  - when a `hotfix/* -> main` PR is merged, it opens a `main -> dev` PR

## Quick checklist

1. Verify that the workflows exist in the repository's default branch.
2. Open `Settings -> Rules -> Rulesets` in the GitHub repository.
3. Create a ruleset for `main`.
4. Create a ruleset for `dev`.
5. Enable pull request requirement for both.
6. Set `ci-success` as the required status check for both.
7. Enable `Block force pushes` for both.
8. Do not enable `Restrict updates`, otherwise PR merges are blocked.
9. Verify the flow with a test PR `feature/* -> dev`.
10. Verify the hotfix flow with a test PR `hotfix/* -> main`.

## Ruleset configuration for `main`

1. Open `Settings -> Rules -> Rulesets`.
2. Click `New ruleset`.
3. Choose `New branch ruleset`.
4. Recommended name: `Protect main`.
5. Under `Enforcement status`, select `Active`.
6. Under `Target branches`, add `main`.
7. Enable `Restrict deletions`.
8. Leave `Restrict updates` disabled.
9. Enable `Require a pull request before merging`.
10. Inside the pull request section, configure:
    - `Required approvals`: `0` if you want to be able to merge your own PRs
    - optional: `Dismiss stale pull request approvals when new commits are pushed`
    - optional: `Require review from code owners`, only if you will use a `CODEOWNERS` file
11. Enable `Require status checks to pass`.
12. Add `ci-success` as a required check.
13. Enable `Block force pushes`.
14. Save the ruleset.

## Ruleset configuration for `dev`

1. Open `Settings -> Rules -> Rulesets`.
2. Click `New ruleset`.
3. Choose `New branch ruleset`.
4. Recommended name: `Protect dev`.
5. Under `Enforcement status`, select `Active`.
6. Under `Target branches`, add `dev`.
7. Enable `Restrict deletions`.
8. Leave `Restrict updates` disabled.
9. Enable `Require a pull request before merging`.
10. Inside the pull request section, configure:
    - `Required approvals`: `0` if you want to be able to merge your own PRs
    - optional: `Dismiss stale pull request approvals when new commits are pushed`
11. Enable `Require status checks to pass`.
12. Add `ci-success` as a required check.
13. Enable `Block force pushes`.
14. Save the ruleset.

## Why the required check is `ci-success`

The `ci.yml` workflow uses a final job called `ci-success` as a single gate.

This avoids issues when the actual verification job is skipped due to path filtering. In that case:

- `verify` may result in `skipped`
- `ci-success` still passes
- the PR is not blocked by missing or unreported checks

For this reason, the only required check to configure on GitHub should be `ci-success`.

## Feature flow

1. Create a branch `feature/<name>` from `dev`.
2. Open a PR `feature/<name> -> dev`.
3. Wait for CI to run.
4. Merge only when `ci-success` is green.

## Release flow

1. Open a PR `dev -> main`.
2. Wait for CI to run.
3. Merge only when `ci-success` is green.

## Hotfix flow

1. Create a branch `hotfix/<name>` from `main`.
2. Open a PR `hotfix/<name> -> main`.
3. Wait for CI to run.
4. Merge only when `ci-success` is green.
5. After the merge, GitHub Actions automatically creates a `main -> dev` PR.

## Recommended verification after configuration

1. Open a test PR `feature/test-ci -> dev`.
   - expected result: the `CI` workflow runs
   - expected result: the `ci-success` check appears
2. Try to merge before checks finish.
   - expected result: merge is blocked
3. Merge the PR when `ci-success` is green.
   - expected result: merge is allowed
4. Open a test PR `hotfix/test-fix -> main`.
5. After the hotfix PR is merged, verify that a `main -> dev` PR is created.

## Troubleshooting

### The `ci-success` check does not appear among the required checks

1. Make sure the `CI` workflow has run at least once on the repository.
2. If needed, open a test PR to `dev` to make the check appear in the GitHub list.

### PR merge is blocked with `Cannot update this protected ref`

1. Verify that `Restrict updates` is disabled on the target branch.
2. If `Restrict updates` is active, GitHub considers a PR merge as a branch update.

### The back-merge PR is not created

1. Verify that the merged PR's source branch was named `hotfix/*`.
2. Verify that the merge target was `main`.
3. Check the `Actions` tab for the `Hotfix Back-Merge` workflow execution.
4. Verify that there is not already an open `main -> dev` PR.
