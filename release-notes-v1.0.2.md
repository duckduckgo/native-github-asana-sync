## v1.0.2

Patch release focused on PR sync assignee controls and local test coverage.

## Improvements

- Added `assign-pr-author` input for `pr-asana-sync` to assign the Asana PR task
  to the GitHub PR author when enabled.
- Improved local-action integration coverage for PR sync author-assignment
  flows.
- Updated PR fixture data used by local-action runs to align with mapped GitHub
  users.

## Internal Updates

- Updated action metadata and README documentation for the new
  `assign-pr-author` option.
- Added/updated unit and local-action test coverage for assignee selection
  behavior.
- Rebuilt distribution artifacts in `dist/` to match source changes.

## Pull Requests Included

- N/A (changes introduced directly on `main` after `v1.0.1`)

## Upgrade Notes

1. Set `assign-pr-author: 'true'` in `pr-asana-sync` workflows to prefer PR
   author assignment.
2. Ensure the PR author login is present in
   `duckduckgo/internal-github-asana-utils/user_map.yml` so Asana assignment can
   be resolved.
3. Keep using `v1` for major tracking or pin `v1.0.2` for an immutable version.
