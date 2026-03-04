## v1.0.1

Patch release with incremental improvements to user mapping and pull request
sync handling.

## Improvements

- Added `get-asana-user-id` action to resolve an Asana user ID from a GitHub
  username via `duckduckgo/internal-github-asana-utils/user_map.yml`.
- Expanded PR sync event support and behavior checks for assignment and review
  transitions.
- Improved fixture-driven test coverage for PR lifecycle scenarios, including
  assignment, unassignment, open/close, and review-state changes.

## Internal Updates

- Updated `action.yml` output definitions to include `asanaUserId`.
- Refined `src/main.ts` logic for user resolution and PR sync behavior.
- Rebuilt distribution artifacts in `dist/` to align with source changes.

## Pull Requests Included

- N/A (changes introduced directly on `main` in commit `085c98e`)

## Upgrade Notes

1. Continue pinning workflows to `v1` for major tracking or `v1.0.1` for
   immutable pinning.
2. Ensure the `github-pat` used with `get-asana-user-id` can access
   `duckduckgo/internal-github-asana-utils/user_map.yml`.
3. If you rely on PR assignee/review sync behavior, validate against your
   repository event configuration after upgrading.
