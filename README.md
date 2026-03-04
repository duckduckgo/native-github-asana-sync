# Github-Asana action

This action integrates Asana with GitHub workflows.

## Prerequisites

- Asana account with access to the project(s) you want to update.
- Asana personal access token.
- For PR-based actions, a pull request body that includes Asana task URL(s).

## Required inputs

### `action`

Required. Action to run:

- `create-asana-task`
- `post-comment-asana-task`
- `get-asana-task-permalink`
- `mark-asana-task-complete`
- `assign-asana-task`
- `search-asana-task-by-name`
- `create-asana-issue-task`
- `find-asana-task-id`
- `find-asana-task-ids`
- `add-asana-comment`
- `notify-pr-approved`
- `notify-pr-merged`
- `pr-asana-sync`
- `add-task-asana-project`
- `add-task-pr-description`
- `send-mattermost-message`

### `asana-pat`

Required for all Asana API actions.

## Install, test, and package for distribution

### Install

```bash
npm install
```

### Test

```bash
npm test
```

Run the complete local validation sequence:

```bash
npm run all
```

### Package for distribution

Build bundled output in `dist/`:

```bash
npm run package
```

Or run format + package:

```bash
npm run bundle
```

The action runs from `dist/index.js` in workflows, so packaging is required
before publishing.

## Local testing

```bash
npx @github/local-action . src/main.ts env
```

`env` is gitignored and should contain local test-only values.

## Actions

### Create Asana task

Creates an Asana task from explicit input values.

Required inputs:

- `asana-project`
- `asana-task-name`
- `asana-task-description`

Optional inputs:

- `asana-section`
- `asana-tags`
- `asana-collaborators`
- `asana-assignee` or `asana-task-assignee`
- `asana-task-custom-fields`

#### Example usage

```yaml
steps:
  - uses: <owner>/asana-github-sync@v1
    with:
      action: create-asana-task
      asana-pat: ${{ secrets.ASANA_ACCESS_TOKEN }}
      asana-project: '123456789'
      asana-task-name: 'Release preparation'
      asana-task-description: 'Finalize changelog and checklist'
```

### Post comment in Asana task

Posts a comment to one or more task IDs.

Required inputs:

- `asana-task-id`
- `asana-task-comment`

Optional inputs:

- `asana-task-comment-pinned`
- `asana-task-comment-is-html`

### Get Asana task permalink

Returns permalink for a task.

Required inputs:

- `asana-task-id`

### Mark Asana task complete/incomplete

Updates completion status for a task.

Required inputs:

- `asana-task-id`

Optional inputs:

- `is-complete`

### Assign Asana task

Assigns a task to a user.

Required inputs:

- `asana-task-id`
- `asana-assignee`

### Search Asana task by name

Searches tasks by exact name in a project, optionally section-scoped.

Required inputs:

- `asana-task-name`
- `asana-project`

Optional inputs:

- `asana-section`

### Create Asana task from GitHub issue

Creates an Asana task from issue title/body and appends issue URL as task story.

Required inputs:

- `asana-project`

### Find Asana task ID(s) in PR description

Scans PR body for Asana URL(s).

Supported actions:

- `find-asana-task-id`
- `find-asana-task-ids`

Optional inputs:

- `trigger-phrase`
- `asana-project` (project filter)

### Add PR link to Asana task(s)

Finds task(s) from PR body and adds PR URL comment.

Action: `add-asana-comment`

Optional inputs:

- `trigger-phrase`
- `is-pinned`

### Notify Asana on PR approved

Action: `notify-pr-approved`

Optional inputs:

- `trigger-phrase`
- `asana-project`

### Notify Asana on PR merged

Action: `notify-pr-merged`

Optional inputs:

- `trigger-phrase`
- `asana-project`
- `is-complete`

### PR Asana sync

Action: `pr-asana-sync`

Creates or updates an Asana PR review task linked to the current pull request,
syncing PR title/body/state, and emitting task URL/result outputs.

Required inputs:

- `asana-pat`
- `asana-workspace-id`
- `asana-project`

Optional inputs:

- `github-pat` (required for GitHub username -> Asana user ID lookup)
- `github-token` (required only for randomized reviewer assignment)
- `randomized-reviewers`
- `assign-pr-author` (if `true`, assign the Asana PR task to the PR author)
- `asana-in-progress-section-id`
- `no-autoclose-projects`
- `skipped-users`

#### Workflow trigger example

```yaml
on:
  pull_request:
    types:
      - opened
      - edited
      - closed
      - reopened
      - synchronize
      - assigned
      - ready_for_review
      - labeled

jobs:
  sync-pr-asana:
    runs-on: ubuntu-latest
    steps:
      - uses: <owner>/asana-github-sync@v1
        with:
          action: pr-asana-sync
          asana-pat: ${{ secrets.ASANA_ACCESS_TOKEN }}
          github-pat: ${{ secrets.GITHUB_PAT }}
          asana-workspace-id: ${{ secrets.ASANA_WORKSPACE_ID }}
          asana-project: ${{ vars.ASANA_PR_PROJECT_ID }}
```

### Get Asana user ID

Action: `get-asana-user-id`

Returns Asana user ID for a provided GitHub username using
`duckduckgo/internal-github-asana-utils/user_map.yml`.

Required inputs:

- `github-pat`

Optional inputs:

- `github-username` (defaults to PR author when available)

### Add task(s) to Asana project/section

Action: `add-task-asana-project`

Required inputs:

- `asana-project`

Optional inputs:

- `asana-section`
- `asana-task-id` (if omitted, action parses PR body)

### Add Asana task URL to PR description

Action: `add-task-pr-description`

Required inputs:

- `github-pat`
- `github-org`
- `github-repository`
- `github-pr`
- `asana-project`
- `asana-task-id`

### Send Mattermost message

Action: `send-mattermost-message`

Required inputs:

- `mattermost-token`
- `mattermost-team-id`
- `mattermost-channel-name`
- `mattermost-message`

Optional inputs:

- `mattermost-url` (defaults to `https://chat.duckduckgo.com`)

## Outputs

- `taskId`
- `duplicate`
- `asanaTaskId`
- `asanaTaskIds`
- `asanaTaskFound`
- `asanaTaskPermalink`
- `task-url`
- `result`
