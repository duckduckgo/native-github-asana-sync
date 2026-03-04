import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

const githubRequest =
  jest.fn<(...args: unknown[]) => Promise<{ data: unknown }>>()
const fetchMock = jest.fn<
  (
    url: string,
    init?: RequestInit
  ) => Promise<{
    ok: boolean
    status: number
    json: () => Promise<unknown>
  }>
>()

const githubContext = {
  repo: {
    owner: 'acme',
    repo: 'repo'
  },
  payload: {
    action: 'opened',
    review: {
      state: 'approved',
      user: { login: 'reviewer' }
    },
    pull_request: {
      number: 123,
      title: 'Feature PR',
      state: 'open',
      merged: false,
      draft: false,
      user: { login: 'author' },
      assignees: [{ login: 'reviewer' }],
      requested_reviewers: [],
      html_url: 'https://github.com/acme/repo/pull/123',
      body: 'Task/Issue URL: https://app.asana.com/0/111111/222222/f'
    },
    issue: {
      title: 'A bug',
      body: 'Issue body',
      html_url: 'https://github.com/acme/repo/issues/456'
    }
  }
}

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => ({
  context: githubContext
}))
jest.unstable_mockModule('@octokit/core', () => ({
  Octokit: class {
    request = githubRequest
  }
}))

const { run } = await import('../src/main.js')

describe('main.ts action router', () => {
  const baseInputs: Record<string, string> = {
    action: 'create-asana-task',
    'asana-pat': 'pat-token',
    'asana-project': '111111',
    'asana-section': '',
    'asana-task-name': 'Task name',
    'asana-task-description': 'Task desc',
    'asana-task-id': '222222',
    'asana-task-comment': 'hello',
    'asana-task-comment-pinned': 'false',
    'asana-task-comment-is-html': 'false',
    'asana-tags': '',
    'asana-collaborators': '',
    'asana-assignee': 'user-1',
    'asana-task-assignee': '',
    'asana-task-custom-fields': '',
    'trigger-phrase': 'Task/Issue URL:',
    'is-complete': 'true',
    'is-pinned': 'false',
    'mattermost-token': 'mm-token',
    'mattermost-team-id': 'team',
    'mattermost-channel-name': 'release',
    'mattermost-message': 'hello world',
    'mattermost-url': 'https://chat.example.com',
    'github-pat': 'gh-pat',
    'github-org': 'acme',
    'github-repository': 'repo',
    'github-pr': '123',
    'github-token': 'gh-token',
    'asana-workspace-id': 'workspace-1',
    'asana-in-progress-section-id': '',
    'randomized-reviewers': '',
    'assign-pr-author': 'false',
    'no-autoclose-projects': '',
    'skipped-users': ''
  }

  function useInputs(overrides: Record<string, string> = {}): void {
    const merged = { ...baseInputs, ...overrides }
    core.getInput.mockImplementation((name: string) => merged[name] ?? '')
  }

  beforeEach(() => {
    jest.resetAllMocks()
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true
    })
    useInputs()

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/workspaces/workspace-1/custom_fields')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: 'cf-url', name: 'Github URL' },
              {
                gid: 'cf-status',
                name: 'Github Status',
                enum_options: [
                  { gid: 'st-open', name: 'Open' },
                  { gid: 'st-draft', name: 'Draft' },
                  { gid: 'st-closed', name: 'Closed' },
                  { gid: 'st-merged', name: 'Merged' }
                ]
              }
            ]
          })
        }
      }
      if (url.includes('/workspaces/workspace-1/tasks/search')) {
        return { ok: true, status: 200, json: async () => ({ data: [] }) }
      }
      if (url.includes('/tasks') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { gid: '333333' } })
        }
      }
      if (url.includes('/tasks/222222?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '222222',
              permalink_url: 'https://app.asana.com/0/111111/222222/f',
              projects: [{ gid: '111111' }]
            }
          })
        }
      }
      if (url.includes('/tasks/222222') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '222222',
              permalink_url: 'https://app.asana.com/0/111111/222222/f'
            }
          })
        }
      }
      if (url.includes('/tasks/333333') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '333333',
              permalink_url: 'https://app.asana.com/0/111111/333333/f'
            }
          })
        }
      }
      if (url.includes('/projects/project-1/tasks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: '222222', name: 'Task name' },
              { gid: '999999', name: 'Another task' }
            ]
          })
        }
      }
      if (url.includes('/teams/team/channels/name/release')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'channel-id' })
        }
      }
      if (url.includes('/api/v4/posts')) {
        return { ok: true, status: 201, json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })
    githubRequest.mockResolvedValue({ data: { body: 'Old PR body' } })
  })

  it('creates an Asana task and sets taskId output', async () => {
    await run()

    expect(fetchMock).toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('taskId', '333333')
    expect(core.setOutput).toHaveBeenCalledWith('duplicate', false)
  })

  it('finds Asana task ID from pull request body', async () => {
    useInputs({
      action: 'find-asana-task-id',
      'asana-project': ''
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '222222')
  })

  it('finds multiple Asana task IDs from pull request body', async () => {
    useInputs({
      action: 'find-asana-task-ids',
      'asana-project': ''
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '222222')
  })

  it('assigns an Asana task', async () => {
    useInputs({
      action: 'assign-asana-task',
      'asana-task-id': '222222',
      'asana-assignee': 'user-2'
    })

    await run()

    expect(fetchMock).toHaveBeenCalled()
  })

  it('creates issue-based Asana task', async () => {
    useInputs({
      action: 'create-asana-issue-task'
    })

    await run()

    expect(fetchMock).toHaveBeenCalled()
  })

  it('posts comment to explicit Asana task IDs', async () => {
    useInputs({
      action: 'post-comment-asana-task',
      'asana-task-id': '222222,333333',
      'asana-task-comment': 'Deployed',
      'asana-task-comment-pinned': 'true'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('gets Asana task permalink', async () => {
    useInputs({
      action: 'get-asana-task-permalink',
      'asana-task-id': '222222'
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'asanaTaskPermalink',
      'https://app.asana.com/0/111111/222222/f'
    )
  })

  it('gets Asana user ID from GitHub username mapping', async () => {
    useInputs({
      action: 'get-asana-user-id',
      'github-pat': 'gh-pat',
      'github-username': 'reviewer'
    })
    githubRequest.mockResolvedValueOnce({
      data: 'author: asana-author\nreviewer: asana-reviewer\n'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('asanaUserId', 'asana-reviewer')
  })

  it('marks Asana task complete', async () => {
    useInputs({
      action: 'mark-asana-task-complete',
      'asana-task-id': '222222',
      'is-complete': 'true'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('searches Asana task by exact name', async () => {
    useInputs({
      action: 'search-asana-task-by-name',
      'asana-project': 'project-1',
      'asana-task-name': 'Task name'
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '222222')
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '222222')
  })

  it('adds PR link as comment to Asana task', async () => {
    useInputs({
      action: 'add-asana-comment',
      'asana-project': ''
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskFound', true)
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '222222')
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '222222')
  })

  it('notifies Asana task on PR approved', async () => {
    useInputs({
      action: 'notify-pr-approved',
      'asana-project': ''
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskFound', true)
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '222222')
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '222222')
  })

  it('notifies Asana task on PR merged', async () => {
    useInputs({
      action: 'notify-pr-merged',
      'asana-project': '',
      'is-complete': 'true'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskFound', true)
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '222222')
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '222222')
  })

  it('outputs empty task info when no Asana task is found', async () => {
    useInputs({
      action: 'add-asana-comment',
      'asana-project': '',
      'trigger-phrase': 'Not present in PR body:'
    })

    await run()

    expect(core.warning).toHaveBeenCalledWith(
      'No Asana tasks found for action: add-asana-comment'
    )
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskFound', false)
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '')
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('adds Asana task to project and section', async () => {
    useInputs({
      action: 'add-task-asana-project',
      'asana-project': '111111',
      'asana-section': 'section-1',
      'asana-task-id': '222222'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('adds Asana task URL to pull request description', async () => {
    useInputs({
      action: 'add-task-pr-description',
      'github-org': 'acme',
      'github-repository': 'repo',
      'github-pr': '123',
      'asana-project': '111111',
      'asana-task-id': '222222'
    })
    githubRequest
      .mockResolvedValueOnce({ data: { body: 'Old PR body' } })
      .mockResolvedValueOnce({ data: { body: 'updated' } })

    await run()

    expect(githubRequest).toHaveBeenCalledTimes(2)
  })

  it('sends Mattermost message', async () => {
    useInputs({
      action: 'send-mattermost-message',
      'mattermost-token': 'token',
      'mattermost-team-id': 'team',
      'mattermost-channel-name': 'release',
      'mattermost-message': 'Hello'
    })

    await run()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v4/teams/team/channels/name/release'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v4/posts'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('fails when action is unknown', async () => {
    core.getInput.mockImplementation((name: string) =>
      name === 'action' ? 'unknown-action' : ''
    )

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Unexpected action: unknown-action'
    )
  })

  it('syncs PR to Asana and creates task when missing', async () => {
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111'
    })
    githubRequest.mockResolvedValueOnce({
      data: 'author: asana-author\nreviewer: asana-reviewer\n'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('result', 'created')
    expect(core.setOutput).toHaveBeenCalledWith(
      'task-url',
      'https://app.asana.com/0/111111/333333/f'
    )
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '333333')
    const updateCall = fetchMock.mock.calls.find((call) => {
      return call[0].includes('/tasks/333333') && call[1]?.method === 'PUT'
    })
    expect(updateCall).toBeDefined()
    expect(updateCall?.[1]?.body).toContain('"assignee":"asana-reviewer"')
  })

  it('assigns PR task to PR author when assign-pr-author is true', async () => {
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111',
      'assign-pr-author': 'true'
    })
    githubRequest.mockResolvedValueOnce({
      data: 'author: asana-author\nreviewer: asana-reviewer\n'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    const updateCall = fetchMock.mock.calls.find((call) => {
      return call[0].includes('/tasks/333333') && call[1]?.method === 'PUT'
    })
    expect(updateCall).toBeDefined()
    expect(updateCall?.[1]?.body).toContain('"assignee":"asana-author"')
  })

  it('syncs PR to existing Asana task when already linked', async () => {
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111'
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/workspace-1/custom_fields')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: 'cf-url', name: 'Github URL' },
              {
                gid: 'cf-status',
                name: 'Github Status',
                enum_options: [
                  { gid: 'st-open', name: 'Open' },
                  { gid: 'st-draft', name: 'Draft' },
                  { gid: 'st-closed', name: 'Closed' },
                  { gid: 'st-merged', name: 'Merged' }
                ]
              }
            ]
          })
        }
      }
      if (url.includes('/workspaces/workspace-1/tasks/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                gid: '777777',
                permalink_url: 'https://app.asana.com/0/111111/777777/f',
                projects: [{ gid: '111111' }]
              }
            ]
          })
        }
      }
      if (url.includes('/tasks/777777') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '777777',
              permalink_url: 'https://app.asana.com/0/111111/777777/f'
            }
          })
        }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('result', 'updated')
    expect(core.setOutput).toHaveBeenCalledWith(
      'task-url',
      'https://app.asana.com/0/111111/777777/f'
    )
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '777777')
  })

  it('marks PR sync task complete when PR is closed', async () => {
    githubContext.payload.action = 'closed'
    githubContext.payload.pull_request.state = 'closed'
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111'
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/workspace-1/custom_fields')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: 'cf-url', name: 'Github URL' },
              {
                gid: 'cf-status',
                name: 'Github Status',
                enum_options: [
                  { gid: 'st-open', name: 'Open' },
                  { gid: 'st-draft', name: 'Draft' },
                  { gid: 'st-closed', name: 'Closed' },
                  { gid: 'st-merged', name: 'Merged' }
                ]
              }
            ]
          })
        }
      }
      if (url.includes('/workspaces/workspace-1/tasks/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                gid: '888888',
                permalink_url: 'https://app.asana.com/0/111111/888888/f',
                projects: [{ gid: '111111' }]
              }
            ]
          })
        }
      }
      if (url.includes('/tasks/888888') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '888888',
              permalink_url: 'https://app.asana.com/0/111111/888888/f'
            }
          })
        }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })

    await run()

    const updateCalls = fetchMock.mock.calls.filter((call) => {
      return call[0].includes('/tasks/888888') && call[1]?.method === 'PUT'
    })
    expect(updateCalls).toHaveLength(2)
    const updateBodies = updateCalls.map((call) => String(call[1]?.body ?? ''))
    expect(
      updateBodies.some((body) => body.includes('"approval_status":"rejected"'))
    ).toBe(true)
    expect(updateBodies.some((body) => body.includes('"completed":true'))).toBe(
      true
    )
    expect(
      updateBodies.some(
        (body) =>
          body.includes('"approval_status":"rejected"') &&
          body.includes('"completed":true')
      )
    ).toBe(false)
    expect(core.setOutput).toHaveBeenCalledWith('result', 'updated')

    githubContext.payload.action = 'opened'
    githubContext.payload.pull_request.state = 'open'
  })

  it('syncs PR to Asana for pull_request_review submitted changes_requested', async () => {
    githubContext.payload.action = 'submitted'
    githubContext.payload.review.state = 'changes_requested'
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111'
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/workspace-1/custom_fields')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: 'cf-url', name: 'Github URL' },
              {
                gid: 'cf-status',
                name: 'Github Status',
                enum_options: [
                  { gid: 'st-open', name: 'Open' },
                  { gid: 'st-draft', name: 'Draft' },
                  { gid: 'st-closed', name: 'Closed' },
                  { gid: 'st-merged', name: 'Merged' }
                ]
              }
            ]
          })
        }
      }
      if (url.includes('/workspaces/workspace-1/tasks/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                gid: '999999',
                permalink_url: 'https://app.asana.com/0/111111/999999/f',
                projects: [{ gid: '111111' }]
              }
            ]
          })
        }
      }
      if (url.includes('/tasks/999999') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '999999',
              permalink_url: 'https://app.asana.com/0/111111/999999/f'
            }
          })
        }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('result', 'updated')
    expect(core.setOutput).toHaveBeenCalledWith(
      'task-url',
      'https://app.asana.com/0/111111/999999/f'
    )
    expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '999999')
    const updateCall = fetchMock.mock.calls.find((call) => {
      return call[0].includes('/tasks/999999') && call[1]?.method === 'PUT'
    })
    expect(updateCall).toBeDefined()
    expect(updateCall?.[1]?.body).toContain('"cf-status":"st-open"')
    expect(updateCall?.[1]?.body).toContain(
      '"approval_status":"changes_requested"'
    )

    githubContext.payload.action = 'opened'
    githubContext.payload.review.state = 'approved'
  })

  it('unassigns Asana task for pull_request unassigned', async () => {
    githubContext.payload.action = 'unassigned'
    githubContext.payload.pull_request.assignees = []
    useInputs({
      action: 'pr-asana-sync',
      'asana-workspace-id': 'workspace-1',
      'asana-project': '111111'
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/workspace-1/custom_fields')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              { gid: 'cf-url', name: 'Github URL' },
              {
                gid: 'cf-status',
                name: 'Github Status',
                enum_options: [
                  { gid: 'st-open', name: 'Open' },
                  { gid: 'st-draft', name: 'Draft' },
                  { gid: 'st-closed', name: 'Closed' },
                  { gid: 'st-merged', name: 'Merged' }
                ]
              }
            ]
          })
        }
      }
      if (url.includes('/workspaces/workspace-1/tasks/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                gid: '121212',
                permalink_url: 'https://app.asana.com/0/111111/121212/f',
                projects: [{ gid: '111111' }]
              }
            ]
          })
        }
      }
      if (url.includes('/tasks/121212') && !url.includes('?opt_fields=')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              gid: '121212',
              permalink_url: 'https://app.asana.com/0/111111/121212/f'
            }
          })
        }
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) }
    })

    await run()

    const updateCall = fetchMock.mock.calls.find((call) => {
      return call[0].includes('/tasks/121212') && call[1]?.method === 'PUT'
    })
    expect(updateCall).toBeDefined()
    expect(updateCall?.[1]?.body).toContain('"assignee":null')
    expect(core.setOutput).toHaveBeenCalledWith('result', 'updated')

    githubContext.payload.action = 'opened'
    githubContext.payload.pull_request.assignees = [{ login: 'reviewer' }]
  })
})
