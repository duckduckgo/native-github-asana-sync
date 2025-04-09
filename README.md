
# Github-Asana action

This action integrates asana with github.

### Prerequisites

- Asana account with the permission on the particular project you want to integrate with.
- For creating tasks in Asana, you must provide the Asana project where the issues will be added to.
- For adding PR link to Asana, you must provide the task url in the PR description.

## Required Inputs

### `asana-pat`

**Required** Your public access token of asana, you can find it in [asana docs](https://developers.asana.com/docs/#authentication-basics).

### `action`

**required** The action to be performed. Possible values are
* `create-asana-issue-task` to create a task based on the Github Issue
* `notify-pr-approved` to add a comment to the Asana task when the PR has been approved
* `notify-pr-merged` to complete the Asana task when a PR has been merged
* `check-pr-membership` checks the PR sender membership in the organisation that owns the repo
* `add-asana-comment` adds a comment to the Asana task with the link to the Pull Request
* `add-task-asana-project` adds a task to a project / section in Asana
* `create-asana-pr-task` to create a task in Asana based on the Github Pull Request
* `get-latest-repo-release` to find the latest release version of a Github Repository
* `create-asana-task` to create a task in Asana
* `get-asana-user-id` to return the Asana User Id of a given Github actor
* `find-asana-task-id` searches in the PR description for an Asana Task, given a prefix
* `post-comment-asana-task` to post a comment in an Asana task
* `get-asana-task-permalink` to get the permalink for a given Asana Task ID

### Create Asana task from Github Issue
When a Github Issue has been added, it will create an Asana task with the Issue title, description and link.
### `asana-project`

**Required** The Asana project ID where the new task will be added i.e ASANA PROJECT: https://app.asana.com/0/1174433894299346

#### Example Usage

```yaml
on:
  issues:
    types: [opened, reopened]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          asana-pat: 'Your PAT'
          asana-project: 'Asana Project Id'
          action: 'create-asana-issue-task'
```
### Comment on Asana task when PR has been reviewed
When a Pull Request has been reviewed, it will look for an Asana task in the PR description and comment on it.
### `trigger-phrase`

**Optional** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/. If not provided, any Asana URL in the text will be matched.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  pr-reviewed:
    if: github.event.review.state == 'approved'
    runs-on: ubuntu-latest
    steps:
      - name: Update Asana task -> PR approved
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          asana-pat: 'Your PAT'
          trigger-phrase: 'Your Trigger Phrase'
          action: 'notify-pr-approved'
```

### Complete Asana task when Github PR merged
When a Github Pull Request has been closed, it will look for an Asana task in the PR description and close it.
### `is-complete`
**optional** Close the Asana task after Github PR merged when set to `true`
#### Example Usage

```yaml
on:
  pull_request:
    types: [closed]

jobs:
  add-pr-merged-comment:
    runs-on: ubuntu-latest
    steps:
      - uses: duckduckgo/native-github-asana-sync@v1.1
        if: github.event.pull_request.merged
        with:
          asana-pat: 'Your PAT'
          trigger-phrase: 'Your Trigger Phrase'
          action: 'notify-pr-merged'
          is-complete: true
```

### Check membership of the PR author in the repo organisation
When a Github Pull Request has been opened, it will check if the sender is a member of the organisation.
This is one of the step of a bigger workflow, that process PRs differently depending if it's a community PR or not.
**Required** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/.
### `github-pat`

**Required** Github public access token
#### Example Usage

```yaml
on:
  pull_request:
    types: [opened, reopened]

jobs:
  validate-pr:
    name: Validate Pull Request
    runs-on: ubuntu-latest
    outputs:
      output1: ${{ steps.step1.outputs.external }}
    steps:
      - name: Checking Pull Request sender membership
        id: step1
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          github-pat: 'Your Github PAT'
          action: 'check-pr-membership'
```

### Comment on Asana task when PR has been opened
For PRs that are opened by members of the organisation, it will look for an Asana task in the PR description and comment on it with the PR link.
### `trigger-phrase`
**Optional** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/. If not provided, any Asana URL in the text will be matched.

### `asana-project`
**optional** If provided, only Asana tasks in this specific project will be considered.

### `is-pinned`
**optional** Pinned the PR comment when set to `true`

#### Sample PR Description
``
Asana Task: https://app.asana.com/0/1/2

#### Example Usage

```yaml
on:
  pull_request:
    types: [opened, reopened]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Add comment in Asana task
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          asana-pat: 'Your PAT'
          trigger-phrase: 'Your Trigger Phrase'
          action: 'add-asana-comment'
```

### Add task(s) to an Asana project
Adds one or more tasks to an Asana project and section. The action will look for Asana task(s) in the PR description.
### `trigger-phrase`
**Optional** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/. If not provided, any Asana URL in the text will be matched.
### `asana-project`
**Required** Id of the Asana project that the task will be added to. Task will be added to the top of the project.
### `asana-section`
**optional** Id of the Asana section in the Asana project. Task will be added to the top of the section.

#### Example Usage
```yaml
on:
  pull_request:
    types: [opened, reopened]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Add Asana task to Project
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          trigger-phrase: 'Your Trigger Phrase'
          asana-project: 'Asana Project Id'
          asana-section: 'Asana Section Id'
          action: 'add-task-asana-project'
```

### Create Asana task from Github Pull Request
When a Github Pull Request has been added by a community contributor, it will create an Asana task with the Pull Request title, description and link.
### `asana-project`

**Required** The Asana project ID where the new task will be added i.e ASANA PROJECT: https://app.asana.com/0/1174433894299346

#### Example Usage

```yaml
on:
  issues:
    types: [opened, reopened]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Create Asana task in Asana Project
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          asana-project: 'Asana Project Id'
          action: 'create-asana-pr-task'
```

### Find the lastest release version of a Github Repositoryu
Finds the latest release version of a Github Repository.

### `github-repository`
**Required** Repository to check for the latest version.

### `github-org`
**Required** Organisation that owns the Repository.

#### Example Usage

```yaml
on:
  workflow_dispatch:

jobs:
  find-latest-version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.latest-release.outputs.version }}
    steps:
      - name: Find latest release of content scope scripts
        id: latest-release
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          github-pat: 'Your Github PAT'
          github-repository: 'Github Repository'
          github-org: 'Github Organisation'
          action: 'get-latest-repo-release'
```


### Create Asana task
Creates an Asana task with the properties defined below.

### `asana-project`
**Required** The Asana project ID where the new task will be added i.e ASANA PROJECT: https://app.asana.com/0/1174433894299346
### `asana-section`
The Asana section ID in the Asana Project
### `asana-task-name`
**Required** Name of the Asana task
### `asana-task-description`
**Required** Description of the Asana task
### `asana-tags`
Comma-separated IDs of Asana tags to be added to the task i.e. https://app.asana.com/0/1208613272217946/
### `asana-collaborators`
Comma-separated Asana user IDs to be added as collaborators to the task
### `asana-assignee`
GID of user to assign the task to
### `asana-task-custom-fields`
Asana task custom fields hash, encoded as a JSON string i.e. '{"XXXXX":"YYYYY"}'

* Note: you can use https://app.asana.com/api/1.0/users/me to find your ID. Replace `me` with an email to find someone else's

#### Example Usage

```yaml
on:
  issues:
    types: [opened, reopened]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Create Asana task in Asana Project
        uses: duckduckgo/native-github-asana-sync@v1.1
        with:
          asana-project: 'Asana Project Id'
          asana-section: 'Asana Section Id'
          asana-task-name: 'Asana Task Name'
          asana-task-description: 'Asana Task Description'
          asana-tag: 'Tag Id'
          action: 'create-asana-task'
```

### Get Asana user ID
Returns Asana user ID for a provided Github username

### `github-pat`
**Required** Github public access token
### `github-username`
Github user to lookup; PR author by default

#### Example Usage

```yaml
on:
  pull_request:
    types: [ labeled ]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Get PR author Asana ID
        uses: ./actions
        id: get-author-asana-id
        with:
          github-pat: ${{ secrets.github_pat }}
          action: 'get-asana-user-id'

      - name: Use Asana ID from above step
        with:
          asana-collaborators: '${{ steps.get-author-asana-id.outputs.asanaUserId }}'
```

### Find Asana task Id in PR description
Searches for an Asana URL in the PR description, given a prefix. Returns the Asana Task Id if found.

### `trigger-phrase`
**Optional** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/. If not provided, any Asana URL in the text will be matched.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Find Asana Task in PR description
        uses: ./actions
        id: find-asana-task-id
        with:
          action: 'find-asana-task-id'
          trigger-phrase: 'Task/Issue URL:'

      - name: Use Asana Task ID from above step
        with:
          asana-task-id: '${{ steps.find-asana-task-id.outputs.asanaTaskId }}'
```

### Find multiple Asana task Ids in PR description
Searches for Asana URLs in the PR description, given a prefix. Returns a comma-separated list of Asana Task Ids if found. The action will fail if no tasks are found.

### `trigger-phrase`
**Optional** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/. If not provided, any Asana URL in the text will be matched.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Find Asana Tasks in PR description
        uses: ./actions
        id: find-asana-task-ids
        with:
          action: 'find-asana-task-ids'
          trigger-phrase: 'Task/Issue URL:'

      - name: Use Asana Task IDs from above step
        with:
          asana-task-id: '${{ steps.find-asana-task-ids.outputs.asanaTaskIds }}'
```

### Post comment in Asana task
Posts a comment in a given Asana Task

### `asana-pat`
**Required** Asana public access token
### `asana-task-id`
**Required** Id of the task(s) to write the comment on. Can be a single ID or a comma-separated list of IDs.
### `asana-task-comment`
**Required** Comment to be posted.
### `asana-task-comment-pinned`
**Required** Is the comment pinned or not.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Add Approved Comment to Asana Task
        if: github.event.review.state == 'approved'
        uses: ./actions
        id: post-comment-pr-approved
        with:
          action: 'post-comment-asana-task'
          asana-pat: ${{ secrets.asana_pat }}
          asana-task-id: ${{ steps.find-asana-task-id.outputs.asanaTaskId }}
          asana-task-comment: 'PR: ${{ github.event.pull_request.html_url }} has been approved.'
          asana-task-comment-pinned: true
```

### Send a message in Mattermost
Sends a message to Mattermost

### `mattermost-token`
**Required** Token to use for the Mattermost connection.
### `mattermost-team-id`
**Required** Team ID to use for the Mattermost connection.
### `mattermost-message`
**Required** Message to send.
### `mattermost-channel-name`
**Required** Name of the channel to send the message to.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Send test message
        id: send-test-message
        uses: duckduckgo/native-github-asana-sync@v1.5
        with:
          mattermost-token: ${{ env.MM_AUTH_TOKEN }}
          mattermost-team-id: ${{ env.MM_TEAM_ID }}
          mattermost-channel-name: 'channel'
          mattermost-message: ${{env.emoji_start}}'" Android Release ${{ env.APP_VERSION }} started by @${{ github.actor }}. https://github.com/duckduckgo/Android/actions/runs/${{ github.run_id }}
          action: 'send-mattermost-message'

```

* `get-asana-task-permalink` to

### Get permalink for a given Asana Task ID
Get permalink for a given Asana Task ID

### `mattermost-token`
**Required** Token to use for the Mattermost connection.
### `mattermost-team-id`
**Required** Team ID to use for the Mattermost connection.
### `mattermost-message`
**Required** Message to send.
### `mattermost-channel-name`
**Required** Name of the channel to send the message to.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  test-job:
    runs-on: ubuntu-latest
    steps:
      - name: Get permalink to Asana Task
        uses: ./actions
        id: get-task-permalink
        continue-on-error: true
        with:
          action: 'get-asana-task-permalink'
          asana-pat: ${{ secrets.asana_pat }}
          asana-task-id: ${{ steps.find-asana-task-id.outputs.asanaTaskId }}

```

## Building
Run once: `npm i -g @vercel/ncc`

Run before pushing changes: `ncc build index.js`

More info: https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-javascript-action#commit-tag-and-push-your-action-to-github
