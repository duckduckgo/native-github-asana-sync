## v1.0.0

First stable major release of the Asana GitHub Sync action set.

## Breaking Changes

- This release establishes the v1 major contract and may change behavior from pre-release development iterations.
- Review action inputs and workflow wiring before upgrading from unreleased or experimental revisions.

## New Features

- Added a dedicated PR Asana sync action flow to synchronize pull-request lifecycle events with Asana tasks.
- Added support for task creation and synchronization workflows across action steps.
- Added local action integration test support to validate workflows with fixture-driven events.

## Improvements

- Expanded automated test coverage and test organization across the action suite.
- Refined task creation behavior and sync execution paths for more predictable automation.
- Added planning and prompt scaffolding to support consistent repository workflows.

## Pull Requests Included

- #6 - Merge `feature/david/pr-sync` into `main`
- #4 - Merge `feature/david/phase_one` into `main`

## Upgrade Notes

1. Pin workflows to `v1` for major-version tracking or `v1.0.0` for an immutable release.
2. Validate required inputs in workflow configuration before rollout.
3. Run the action in a staging repository first to confirm expected Asana task/PR sync behavior.
