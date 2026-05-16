---
name: npm-release
description: Release a new version of the cloud-logging-mcp npm package. Covers version bumping, building, smoke testing, publishing to npm, tagging GitHub releases, and keeping Release Please in sync. Use when the user asks to release, publish, cut a new version, or bump the package version.
---

# npm Release Workflow

## Release types

| Change | Version bump | When |
|---|---|---|
| New feature | `minor` | New tool, new auth method, new parameter |
| Bug fix | `patch` | Fix existing behaviour |
| Breaking change | `major` | Remove/rename tools, incompatible config changes |

---

## Standard release (patch or minor)

```bash
# 1. Verify everything is green
npm run check          # typecheck + lint + unit tests + knip
npm run test:npx       # end-to-end smoke test via .bin symlink

# 2. Bump version (runs check again + stages files)
npm version patch      # or: minor / major

# 3. Publish (runs clean + build + test:build + test:npx automatically)
npm publish

# 4. Create GitHub release
git tag vX.Y.Z         # if not already created by npm version
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z — <short description>" --notes "..."
```

`npm version` runs the `version` hook (`npm run check && git add -A`) and the `postversion` hook (`git push origin main --follow-tags`) automatically.

---

## Smoke tests

Two levels of protection run before every publish:

| Script | What it checks |
|---|---|
| `npm run test:build` | Module imports without crashing (`dist/main.js` loads cleanly) |
| `npm run test:npx` | Full MCP handshake via `.bin` symlink — catches `isMain` regressions |

If either fails, **do not publish**. Fix the root cause first.

---

## Release Please (automated)

Release Please watches `main` for conventional commits and opens a PR automatically:

- `feat:` → minor bump
- `fix:` → patch bump  
- `docs:`, `chore:`, `test:` → no bump (but appear in changelog if configured)

**Workflow after merging Release Please PR:**
1. GitHub Release is created automatically
2. `publish.yml` workflow publishes to npm using the `NPM_TOKEN` secret

**Keeping the manifest in sync** — if you publish manually, update `.release-please-manifest.json`:

```json
{ ".": "X.Y.Z" }
```

Otherwise Release Please will re-include already-released commits in the next PR.

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

## Common mistakes

- **Publishing without running smoke tests** — always run `npm run test:npx` before `npm publish`; the `prepublishOnly` hook runs it automatically but verify locally first
- **Forgetting to update `.release-please-manifest.json`** after a manual release — causes the next Release Please PR to include already-shipped commits
- **Using `--otp` with a granular token** — granular tokens go in `npm config set //registry.npmjs.org/:_authToken=<token>`; `--otp` expects a 6-digit TOTP code
- **Stale npx cache after publishing** — run `rm -rf ~/.npm/_npx` to force users to re-download; document in the GitHub release notes if a breaking version was previously cached
