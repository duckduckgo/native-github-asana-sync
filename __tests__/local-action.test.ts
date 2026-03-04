import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

function runLocalActionWithEnvLines(envLines: string[]): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'local-action-'))
  const envPath = join(tmpDir, '.tmp.env')
  writeFileSync(envPath, `${envLines.join('\n')}\n`, 'utf8')

  try {
    return execFileSync(
      'npx',
      ['@github/local-action', '.', 'src/main.ts', envPath],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    )
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

describe('local-action', () => {
  it('runs smoke test for find-asana-task-id', () => {
    const output = runLocalActionWithEnvLines([
      'ACTIONS_STEP_DEBUG=true',
      'INPUT_ACTION=find-asana-task-id',
      'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
      'GITHUB_EVENT_NAME=pull_request',
      'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
    ])

    expect(output).toContain('::info::Calling action: find-asana-task-id')
    expect(output).toContain('::set-output name=asanaTaskId::1213329940926579')
  })

  const runIntegrationMatrix =
    process.env.LOCAL_ACTION_RUN_INTEGRATION === 'true'

  ;(runIntegrationMatrix ? describe : describe.skip)(
    'integration matrix (all actions)',
    () => {
      const asanaPat = process.env.ASANA_PAT ?? ''
      const asanaProjectId = process.env.ASANA_PROJECT_ID ?? ''
      const asanaWorkspaceId = process.env.ASANA_WORKSPACE_ID ?? ''
      const asanaSectionId = process.env.ASANA_SECTION_ID ?? ''
      const asanaTaskId = process.env.ASANA_TASK_ID ?? ''
      const asanaAssigneeId = process.env.ASANA_ASSIGNEE_ID ?? ''
      const githubPat = process.env.GITHUB_PAT ?? ''
      const githubOrg = process.env.GITHUB_ORG ?? ''
      const githubRepository = process.env.GITHUB_REPOSITORY ?? ''
      const githubPr = process.env.GITHUB_PR ?? ''
      const mmToken = process.env.MM_TOKEN ?? ''
      const mmTeamId = process.env.MM_TEAM_ID ?? ''
      const mmChannelName = process.env.MM_CHANNEL_NAME ?? ''
      const mmMessage = process.env.MM_MESSAGE ?? ''
      const mmUrl = process.env.MM_URL ?? 'https://chat.duckduckgo.com'

      const cases: Array<{
        name: string
        action: string
        envLines: string[]
      }> = [
        {
          name: 'pr-asana-sync',
          action: 'pr-asana-sync',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_GITHUB-PAT=${githubPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            `INPUT_ASANA-WORKSPACE-ID=${asanaWorkspaceId}`,
            'INPUT_RANDOMIZED-REVIEWERS=reviewer',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request_opened.json'
          ]
        },
        {
          name: 'pr-asana-sync-assign-pr-author',
          action: 'pr-asana-sync',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_GITHUB-PAT=${githubPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            `INPUT_ASANA-WORKSPACE-ID=${asanaWorkspaceId}`,
            'INPUT_ASSIGN-PR-AUTHOR=true',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request_opened.json'
          ]
        },
        {
          name: 'create-asana-task',
          action: 'create-asana-task',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            'INPUT_ASANA-TASK-NAME=Local Action Test Task',
            'INPUT_ASANA-TASK-DESCRIPTION=Created from automated local-action matrix.'
          ]
        },
        {
          name: 'post-comment-asana-task',
          action: 'post-comment-asana-task',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`,
            'INPUT_ASANA-TASK-COMMENT=Local-action matrix comment',
            'INPUT_ASANA-TASK-COMMENT-PINNED=false',
            'INPUT_ASANA-TASK-COMMENT-IS-HTML=false'
          ]
        },
        {
          name: 'get-asana-task-permalink',
          action: 'get-asana-task-permalink',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`
          ]
        },
        {
          name: 'mark-asana-task-complete',
          action: 'mark-asana-task-complete',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`,
            'INPUT_IS-COMPLETE=true'
          ]
        },
        {
          name: 'assign-asana-task',
          action: 'assign-asana-task',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`,
            `INPUT_ASANA-ASSIGNEE=${asanaAssigneeId}`
          ]
        },
        {
          name: 'search-asana-task-by-name',
          action: 'search-asana-task-by-name',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            'INPUT_ASANA-TASK-NAME=Local Action Test Task',
            `INPUT_ASANA-SECTION=${asanaSectionId}`
          ]
        },
        {
          name: 'create-asana-issue-task',
          action: 'create-asana-issue-task',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            'GITHUB_EVENT_NAME=issues',
            'GITHUB_EVENT_PATH=__fixtures__/events/issues.json'
          ]
        },
        {
          name: 'find-asana-task-id',
          action: 'find-asana-task-id',
          envLines: [
            'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
          ]
        },
        {
          name: 'find-asana-task-ids',
          action: 'find-asana-task-ids',
          envLines: [
            'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
          ]
        },
        {
          name: 'add-asana-comment',
          action: 'add-asana-comment',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
            'INPUT_IS-PINNED=true',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
          ]
        },
        {
          name: 'notify-pr-approved',
          action: 'notify-pr-approved',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
          ]
        },
        {
          name: 'notify-pr-merged',
          action: 'notify-pr-merged',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            'INPUT_TRIGGER-PHRASE=Task/Issue URL:',
            'INPUT_IS-COMPLETE=true',
            'GITHUB_EVENT_NAME=pull_request',
            'GITHUB_EVENT_PATH=__fixtures__/events/pull_request.json'
          ]
        },
        {
          name: 'add-task-asana-project',
          action: 'add-task-asana-project',
          envLines: [
            `INPUT_ASANA-PAT=${asanaPat}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            `INPUT_ASANA-SECTION=${asanaSectionId}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`
          ]
        },
        {
          name: 'add-task-pr-description',
          action: 'add-task-pr-description',
          envLines: [
            `INPUT_GITHUB-PAT=${githubPat}`,
            `INPUT_GITHUB-ORG=${githubOrg}`,
            `INPUT_GITHUB-REPOSITORY=${githubRepository}`,
            `INPUT_GITHUB-PR=${githubPr}`,
            `INPUT_ASANA-PROJECT=${asanaProjectId}`,
            `INPUT_ASANA-TASK-ID=${asanaTaskId}`
          ]
        },
        {
          name: 'send-mattermost-message',
          action: 'send-mattermost-message',
          envLines: [
            `INPUT_MATTERMOST-TOKEN=${mmToken}`,
            `INPUT_MATTERMOST-TEAM-ID=${mmTeamId}`,
            `INPUT_MATTERMOST-CHANNEL-NAME=${mmChannelName}`,
            `INPUT_MATTERMOST-MESSAGE=${mmMessage}`,
            `INPUT_MATTERMOST-URL=${mmUrl}`
          ]
        }
      ]

      for (const testCase of cases) {
        it(`runs ${testCase.name}`, () => {
          const output = runLocalActionWithEnvLines([
            'ACTIONS_STEP_DEBUG=true',
            `INPUT_ACTION=${testCase.action}`,
            ...testCase.envLines
          ])

          expect(output).toContain(`::info::Calling action: ${testCase.action}`)
          expect(output).not.toContain('::error::')
        })
      }
    }
  )
})
