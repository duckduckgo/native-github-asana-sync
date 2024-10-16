
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

**Required** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/.

#### Example Usage

```yaml
on:
  pull_request_review:
    types: [submitted]

jobs:
  pr-reviewed:
    runs-on: ubuntu-latest
    steps:
      - name: Update Asana task -> PR approved
      - uses: duckduckgo/native-github-asana-sync@v1.1
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
**Required** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/.

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

### Add task to an Asana project
Adds a task to an Asana project and section. The action will look for an Asana task in the PR description.
### `trigger-phrase`
**Required** Prefix before the task i.e ASANA TASK: https://app.asana.com/1/2/3/.
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
          action: 'create-asana-task'
```
