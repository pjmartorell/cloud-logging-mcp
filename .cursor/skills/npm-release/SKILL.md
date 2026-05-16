---
name: npm-release
description: Release a new version of the cloud-logging-mcp npm package. Covers version bumping, building, smoke testing, publishing to npm, tagging GitHub releases, and keeping Release Please in sync. Use when the user asks to release, publish, cut a new version, or bump the package version.
---

# npm Release Workflow

Prefer the automated Release Please path. Manual releases are for urgent fixes or when Release Please is unavailable.

## Release Types

| Change | Version bump | When |
|---|---|---|
| New feature | `minor` | New tool, new auth method, new parameter |
| Bug fix | `patch` | Fix existing behavior |
| Breaking change | `major` | Remove/rename tools, incompatible config changes |

---

## Standard Release: Release Please

Release Please watches `main` for conventional commits and opens a release PR automatically:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `docs:`, `chore:`, `test:` -> no bump, unless configured for changelog-only entries

**Normal workflow:**

1. Review the Release Please PR.
2. Verify the generated `CHANGELOG.md` entries look complete before merging.
3. Confirm CI is green.
4. Merge the Release Please PR.
5. Release Please creates the GitHub release automatically.
6. `publish.yml` publishes to npm from that GitHub release using the `NPM_TOKEN` secret.

Do not run `npm publish` locally after merging a Release Please PR. The GitHub release triggers the publish workflow.

---

## Manual Release

Use this only when the automated Release Please path is not suitable. This path still lets GitHub Actions publish to npm, so do not run `npm publish` locally.

```bash
# 1. Start clean on main
git checkout main
git pull --ff-only
git status --short

# 2. Verify the current code and generated package output
npm run check
npm run clean
npm run build:stdio
npm run test:build
npm run test:npx

# 3. Bump files without creating npm's default commit/tag
npm version patch --no-git-tag-version  # or: minor / major

# 4. Update release bookkeeping
# - Update .release-please-manifest.json to the same X.Y.Z version.
# - Add a CHANGELOG.md entry for X.Y.Z following the existing format.

# 5. Rebuild and re-run smoke tests after the version/changelog edits
npm run clean
npm run build:stdio
npm run test:build
npm run test:npx

# 6. Commit with the repo's required commitlint body format
git add package.json package-lock.json .release-please-manifest.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: release vX.Y.Z

Prepare the vX.Y.Z package release.

# Overview
- Bumped package metadata to vX.Y.Z
- Updated release manifest and changelog

# Background
This manual release keeps npm package metadata, Release Please state, and the changelog aligned before publishing through the GitHub release workflow.
EOF
)"

# 7. Push the commit and tag, then create the GitHub release
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z - <short description>" --notes "..."
```

Creating the GitHub release triggers `.github/workflows/publish.yml`, which runs `npm publish`. Do not also publish locally, or the workflow will attempt to publish the same version again.

---

## Local Publish Exception

Only publish locally if the GitHub publish workflow cannot be used. If you do this, do not create a normal GitHub release afterward unless you first disable or intentionally skip the publish workflow trigger.

```bash
npm run check
npm run clean
npm run build:stdio
npm run test:build
npm run test:npx
npm publish
```

After a local publish, make sure `.release-please-manifest.json`, `package.json`, `package-lock.json`, and `CHANGELOG.md` are committed on `main` at the released version. Otherwise Release Please can re-include already-shipped commits in the next PR.

---

## Smoke Tests

Two levels of protection must run before every publish:

| Script | What it checks |
|---|---|
| `npm run test:build` | Module imports without crashing (`dist/main.js` loads cleanly) |
| `npm run test:npx` | Full MCP handshake via `.bin` symlink; catches `isMain` regressions |

Always run `npm run clean && npm run build:stdio` before these smoke tests. Both scripts read `dist/main.js`, so running them against stale build output is not enough.

If either smoke test fails, do not publish. Fix the root cause first.

---

## CHANGELOG.md

Release Please updates it automatically on merge. For manual releases, add entries following the existing format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Fixed
- Description of the fix

### Added
- Description of the new feature
```

---

## Common Mistakes

- **Double publishing**: `gh release create` triggers `publish.yml`, which runs `npm publish`; do not also run `npm publish` locally.
- **Using bare `npm version patch`**: it creates npm's default release commit/tag and runs `postversion`, which pushes before publish success and does not satisfy this repo's commit body format.
- **Testing stale build output**: run `npm run clean && npm run build:stdio` before `npm run test:build` and `npm run test:npx`.
- **Forgetting `.release-please-manifest.json`**: manual releases must update it to `{ ".": "X.Y.Z" }`.
- **Using `--otp` with a granular token**: granular tokens go in `npm config set //registry.npmjs.org/:_authToken=<token>`; `--otp` expects a 6-digit TOTP code.
- **Stale npx cache after publishing**: run `rm -rf ~/.npm/_npx` to force users to re-download; document this in the GitHub release notes if a breaking version was previously cached.
