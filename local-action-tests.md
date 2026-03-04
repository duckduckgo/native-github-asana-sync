# Local Action Repro Tests

This file contains reproducible `@github/local-action` runs for all actions in
`src/main.ts`, using values from `env`.

## Prerequisites

- Install dependencies:

```bash
npm install
```

- Fill required values in `env` (all `INPUT_*` values and event paths you need).
- Ensure fixture payloads exist:
  - `__fixtures__/events/pull_request_opened.json`
  - `__fixtures__/events/pull_request_closed.json`
  - `__fixtures__/events/pull_request_unassigned.json`
  - `__fixtures__/events/pull_request_review_approved.json`
  - `__fixtures__/events/pull_request_review_changes_requested.json`
  - `__fixtures__/events/pull_request_review_commented.json`
  - `__fixtures__/events/issues.json`

Each command below is standalone (no helper required):

```bash
cp env .tmp.env && printf '%s\n' "<overrides>" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

---

## 1) find-asana-task-id

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=find-asana-task-id" "INPUT_ASANA-PROJECT=" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 2) find-asana-task-ids

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=find-asana-task-ids" "INPUT_ASANA-PROJECT=" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 3) create-asana-task

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=create-asana-task" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 4) post-comment-asana-task

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=post-comment-asana-task" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 5) get-asana-task-permalink

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=get-asana-task-permalink" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 6) mark-asana-task-complete

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=mark-asana-task-complete" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 7) assign-asana-task

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=assign-asana-task" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 8) search-asana-task-by-name

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=search-asana-task-by-name" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 9) create-asana-issue-task

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=create-asana-issue-task" "GITHUB_EVENT_NAME=issues" "GITHUB_EVENT_PATH=__fixtures__/events/issues.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 10) add-asana-comment

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=add-asana-comment" "INPUT_ASANA-PROJECT=" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 11) notify-pr-approved

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=notify-pr-approved" "INPUT_ASANA-PROJECT="  "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 12) notify-pr-merged

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=notify-pr-merged" "INPUT_ASANA-PROJECT="  "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 13) add-task-asana-project

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=add-task-asana-project" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 14) add-task-pr-description

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=add-task-pr-description" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 15) send-mattermost-message

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=send-mattermost-message" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 16) pr-asana-sync (pull_request opened)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_opened.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 17) pr-asana-sync (pull_request_review approved)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request_review" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_review_approved.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 18) pr-asana-sync (pull_request assigned)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_assigned.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 19) get-asana-user-id

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=get-asana-user-id" "INPUT_GITHUB-USERNAME=malmstein" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 20) pr-asana-sync (pull_request closed)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_closed.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 21) pr-asana-sync (pull_request_review changes_requested)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request_review" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_review_changes_requested.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 22) pr-asana-sync (pull_request_review commented)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request_review" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_review_commented.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 23) pr-asana-sync (pull_request unassigned)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_unassigned.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

## 24) pr-asana-sync (assign PR author)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=pr-asana-sync" "INPUT_ASSIGN-PR-AUTHOR=true" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request_opened.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```

---

## Quick smoke test (no external API calls)

```bash
cp env .tmp.env && printf '%s\n' "INPUT_ACTION=find-asana-task-id" "INPUT_ASANA-PROJECT=" "GITHUB_EVENT_NAME=pull_request" "GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json" >> .tmp.env && npx @github/local-action . src/main.ts .tmp.env && rm -f .tmp.env
```
