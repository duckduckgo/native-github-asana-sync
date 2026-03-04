---
name: Major Release Runbook
overview: Prepare and execute a major release using the existing `script/release` flow, with explicit preflight checks, version/tag preparation, release-note generation, and post-release verification.
todos:
  - id: preflight-checks
    content: Check git cleanliness, branch, and latest release context
    status: pending
  - id: set-target-version
    content: Select major target tag and set package.json version to matching vX.X.X
    status: pending
  - id: draft-release-notes
    content: Produce major-release notes with breaking changes and upgrade guidance
    status: pending
  - id: run-validation
    content: Run repository quality checks before tagging
    status: pending
  - id: execute-release-script
    content: Run script/release and complete prompts for major release
    status: pending
  - id: verify-remote-state
    content: Confirm remote tags/branch/release notes are correct
    status: pending
isProject: false
---

# Major Release Runbook

## Scope

Use the existing release automation in `[/Users/malmstein/dev/repos/asana-github-sync/script/release](/Users/malmstein/dev/repos/asana-github-sync/script/release)` to cut a **major** release, and produce release notes with the template in `[/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md](/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md)`.

Per your preference, `package.json` will use `**vX.X.X` format** for this release (matching script confirmation wording).

## Release Flow

```mermaid
flowchart TD
  preflight[PreflightChecks] --> prep[VersionAndReleaseNotesPrep]
  prep --> validate[QualityValidation]
  validate --> tagRun[RunScriptRelease]
  tagRun --> verify[PostReleaseVerification]
  verify --> publish[PublishReleaseNotes]
```



## Steps

- Confirm clean working tree and target branch before release execution; if there are pending changes, decide whether to include or defer.
- Choose the target major tag (for example `v1.0.0`) and update `[/Users/malmstein/dev/repos/asana-github-sync/package.json](/Users/malmstein/dev/repos/asana-github-sync/package.json)` `version` to the exact same `vX.X.X` value.
- Draft release notes from merged changes since the previous release using the template in `[/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md](/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md)`, with a dedicated breaking-changes section for major release impact.
- Run project validation commands (format/lint/tests/bundle as appropriate for this repo) so the release tag points at a verified commit.
- Execute `[/Users/malmstein/dev/repos/asana-github-sync/script/release](/Users/malmstein/dev/repos/asana-github-sync/script/release)`: provide the new tag when prompted, confirm version alignment, and let it create/push `vX.X.X`, `vX`, and `releases/vX` (for a major release).
- Verify remote results: tags exist and point to expected commit, `releases/vX` branch exists, and release notes are published in the release entry.

## Notes / Risk Checks

- The script force-updates the major tag for non-major releases; for this major release it should create a fresh major tag and branch.
- If this is the first tag in the repository, the script path handles it as first major release automatically.
- Keep the release commit atomic (version + any final docs/changelog updates) to simplify rollback/audit.

## Key Files

- `[/Users/malmstein/dev/repos/asana-github-sync/script/release](/Users/malmstein/dev/repos/asana-github-sync/script/release)`
- `[/Users/malmstein/dev/repos/asana-github-sync/package.json](/Users/malmstein/dev/repos/asana-github-sync/package.json)`
- `[/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md](/Users/malmstein/dev/repos/asana-github-sync/.github/prompts/create-release-notes.prompt.md)`

