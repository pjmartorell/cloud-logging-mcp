# Release Process

This document describes the release process for cloud-logging-mcp following [Semantic Versioning](https://semver.org/).

## Version Numbers

We use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (incompatible API changes)
- **MINOR**: New features (backward-compatible)
- **PATCH**: Bug fixes (backward-compatible)

### Examples:
- `1.0.0` → `2.0.0`: Breaking change (e.g., changed tool input schema)
- `1.0.0` → `1.1.0`: New feature (e.g., added new MCP tool)
- `1.0.0` → `1.0.1`: Bug fix (e.g., fixed protobuf decoding)

## Release Checklist

### 1. Prepare the Release

```bash
# Ensure main branch is up to date
git checkout main
git pull origin main

# Ensure all tests pass
npm run check:all  # Includes E2E tests

# Check for security vulnerabilities
npm audit
```

### 2. Update CHANGELOG.md

Edit `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [Unreleased]

## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes
```

Move items from `[Unreleased]` to the new version section.

**Commit the CHANGELOG**:
```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for vX.Y.Z release"
```

### 3. Bump Version

Use npm's built-in version command (creates commit + tag automatically):

```bash
# For a patch release (1.0.0 → 1.0.1)
npm version patch -m "chore: release v%s"

# For a minor release (1.0.0 → 1.1.0)
npm version minor -m "chore: release v%s"

# For a major release (1.0.0 → 2.0.0)
npm version major -m "chore: release v%s"
```

This will:
- Update `package.json` version
- Create a git commit with message "chore: release vX.Y.Z"
- Create a git tag `vX.Y.Z`

### 4. Push to GitHub

```bash
# Push commits and tags
git push origin main --follow-tags
```

### 5. Create GitHub Release

1. Go to https://github.com/pjmartorell/cloud-logging-mcp/releases/new
2. Select the tag you just created (e.g., `v1.0.1`)
3. Title: `v1.0.1` (same as tag)
4. Description: Copy the relevant section from `CHANGELOG.md`
5. Check "Set as the latest release"
6. Click "Publish release"

### 6. Publish to npm (Optional)

If publishing to npm registry:

```bash
# Build the package
npm run build

# Publish (will run prepublishOnly script automatically)
npm publish

# Or for a pre-release version
npm publish --tag beta
```

## Release Automation (Future)

Consider using [Release Please](https://github.com/googleapis/release-please) for fully automated releases based on conventional commits.

## Emergency Hotfix Process

For critical security fixes:

1. Create hotfix branch from latest release tag:
   ```bash
   git checkout -b hotfix/v1.0.1 v1.0.0
   ```

2. Apply fix and test thoroughly:
   ```bash
   # Make changes
   git commit -m "fix: critical security issue"
   npm run check:all
   ```

3. Follow normal release process but from hotfix branch:
   ```bash
   # Update CHANGELOG
   git add CHANGELOG.md
   git commit -m "docs: update CHANGELOG for v1.0.1 hotfix"
   
   # Bump version
   npm version patch -m "chore: release v%s (hotfix)"
   
   # Push
   git push origin hotfix/v1.0.1 --follow-tags
   ```

4. Merge hotfix back to main:
   ```bash
   git checkout main
   git merge hotfix/v1.0.1
   git push origin main
   ```

5. Create GitHub release as usual

## Version History

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

## Questions?

For questions about the release process, open a GitHub Discussion.
