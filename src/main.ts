import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'

type AsanaTask = {
  gid: string
  name?: string
  permalink_url?: string
  notes?: string
  html_notes?: string
  completed?: boolean
  assignee?: { gid?: string; name?: string } | null
  due_on?: string | null
  approval_status?: string
  custom_fields?: Array<{
    gid: string
    name?: string
    display_value?: string
    enum_options?: Array<{ gid: string; name: string }>
  }>
  projects?: Array<{ gid: string }>
}

type AsanaTaskCollectionResponse = { data?: AsanaTask[] }
type AsanaTaskResponse = { data?: AsanaTask }
type AsanaCustomField = {
  gid: string
  name: string
  enum_options?: Array<{ gid: string; name: string }>
}
type AsanaCustomFieldCollectionResponse = {
  data?: AsanaCustomField[]
  next_page?: { offset?: string | null } | null
}

type AsanaTasksApi = {
  createTask: (body: unknown, opts: unknown) => Promise<AsanaTaskResponse>
  addProjectForTask: (
    body: unknown,
    taskId: string,
    opts: unknown
  ) => Promise<unknown>
  getTask: (
    taskId: string,
    opts?: { opt_fields?: string }
  ) => Promise<AsanaTaskResponse>
  updateTask: (body: unknown, taskId: string, opts: unknown) => Promise<unknown>
  getTasksForSection: (
    sectionId: string,
    optFields?: string
  ) => Promise<AsanaTaskCollectionResponse>
  getTasksForProject: (
    projectId: string,
    optFields?: string
  ) => Promise<AsanaTaskCollectionResponse>
  searchTasksInWorkspace: (
    workspaceId: string,
    query: Record<string, string>
  ) => Promise<AsanaTaskCollectionResponse>
  getSubtasksForTask: (
    taskId: string,
    optFields?: string
  ) => Promise<AsanaTaskCollectionResponse>
}

type AsanaStoriesApi = {
  createStoryForTask: (
    body: unknown,
    taskId: string,
    opts: unknown
  ) => Promise<unknown>
}

type AsanaClient = {
  tasks: AsanaTasksApi
  stories: AsanaStoriesApi
  customFields: {
    getCustomFieldsForWorkspace: (
      workspaceId: string
    ) => Promise<AsanaCustomFieldCollectionResponse>
  }
  sections: {
    addTaskForSection: (sectionId: string, taskId: string) => Promise<unknown>
  }
}

function buildAsanaClient(): AsanaClient {
  const asanaPat = core.getInput('asana-pat', { required: true })
  const baseUrl = 'https://app.asana.com/api/1.0'
  const headers = {
    Authorization: `Bearer ${asanaPat}`,
    'Content-Type': 'application/json',
    'asana-enable': 'new-sections,string_ids'
  }

  const request = async (
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown
  ): Promise<unknown> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(
        `Asana API request failed (${response.status}) for ${path}${errorBody ? `: ${errorBody}` : ''}`
      )
    }

    return (await response.json()) as unknown
  }

  return {
    tasks: {
      createTask: async (
        body: unknown,
        _opts: unknown
      ): Promise<AsanaTaskResponse> => {
        void _opts
        return (await request('POST', '/tasks', body)) as AsanaTaskResponse
      },
      addProjectForTask: async (
        body: unknown,
        taskId: string,
        _opts: unknown
      ): Promise<unknown> => {
        void _opts
        return request(
          'POST',
          `/tasks/${encodeURIComponent(taskId)}/addProject`,
          body
        )
      },
      getTask: async (
        taskId: string,
        opts?: { opt_fields?: string }
      ): Promise<AsanaTaskResponse> => {
        const params = opts?.opt_fields
          ? `?opt_fields=${encodeURIComponent(opts.opt_fields)}`
          : ''
        return (await request(
          'GET',
          `/tasks/${encodeURIComponent(taskId)}${params}`
        )) as AsanaTaskResponse
      },
      updateTask: async (
        body: unknown,
        taskId: string,
        _opts: unknown
      ): Promise<unknown> => {
        void _opts
        return request('PUT', `/tasks/${encodeURIComponent(taskId)}`, body)
      },
      getTasksForSection: async (
        sectionId: string,
        optFields?: string
      ): Promise<AsanaTaskCollectionResponse> => {
        const query = optFields
          ? `?opt_fields=${encodeURIComponent(optFields)}`
          : ''
        return (await request(
          'GET',
          `/sections/${encodeURIComponent(sectionId)}/tasks${query}`
        )) as AsanaTaskCollectionResponse
      },
      getTasksForProject: async (
        projectId: string,
        optFields?: string
      ): Promise<AsanaTaskCollectionResponse> => {
        const query = optFields
          ? `?opt_fields=${encodeURIComponent(optFields)}`
          : ''
        return (await request(
          'GET',
          `/projects/${encodeURIComponent(projectId)}/tasks${query}`
        )) as AsanaTaskCollectionResponse
      },
      searchTasksInWorkspace: async (
        workspaceId: string,
        query: Record<string, string>
      ): Promise<AsanaTaskCollectionResponse> => {
        const params = new URLSearchParams(query).toString()
        return (await request(
          'GET',
          `/workspaces/${encodeURIComponent(workspaceId)}/tasks/search?${params}`
        )) as AsanaTaskCollectionResponse
      },
      getSubtasksForTask: async (
        taskId: string,
        optFields = 'name,completed,assignee,custom_fields,permalink_url'
      ): Promise<AsanaTaskCollectionResponse> =>
        (await request(
          'GET',
          `/tasks/${encodeURIComponent(taskId)}/subtasks?opt_fields=${encodeURIComponent(
            optFields
          )}`
        )) as AsanaTaskCollectionResponse
    },
    stories: {
      createStoryForTask: async (
        body: unknown,
        taskId: string,
        _opts: unknown
      ): Promise<unknown> => {
        void _opts
        return request(
          'POST',
          `/tasks/${encodeURIComponent(taskId)}/stories`,
          body
        )
      }
    },
    customFields: {
      getCustomFieldsForWorkspace: async (
        workspaceId: string
      ): Promise<AsanaCustomFieldCollectionResponse> => {
        const fields: AsanaCustomField[] = []
        let offset: string | null | undefined

        do {
          const query = new URLSearchParams({
            limit: '100'
          })
          if (offset) query.set('offset', offset)
          const page = (await request(
            'GET',
            `/workspaces/${encodeURIComponent(workspaceId)}/custom_fields?${query.toString()}`
          )) as AsanaCustomFieldCollectionResponse
          fields.push(...(page.data ?? []))
          offset = page.next_page?.offset
        } while (offset)

        return { data: fields }
      }
    },
    sections: {
      addTaskForSection: async (
        sectionId: string,
        taskId: string
      ): Promise<unknown> =>
        request('POST', `/sections/${encodeURIComponent(sectionId)}/addTask`, {
          data: { task: taskId }
        })
    }
  }
}

function buildGithubClient(githubPat: string): Octokit {
  return new Octokit({ auth: githubPat })
}

function getArrayFromInput(input: string): string[] {
  return input
    ? input
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    : []
}

function parseBooleanInput(name: string, defaultValue = false): boolean {
  const value = core.getInput(name)
  if (!value) return defaultValue
  return value.toLowerCase() === 'true'
}

function ensureString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(errorMessage)
  }
  return value
}

function extractAsanaTaskRefs(
  text: string
): Array<{ taskId: string; projectId?: string }> {
  const refs: Array<{ taskId: string; projectId?: string }> = []
  const urlRegex = /https:\/\/app\.asana\.com\/[^\s)>\]]+/g
  const matches = text.match(urlRegex) ?? []

  for (const rawUrl of matches) {
    const cleanUrl = rawUrl.replace(/[)>.,]+$/, '')

    try {
      const url = new URL(cleanUrl)
      const numericSegments = url.pathname
        .split('/')
        .filter((segment) => /^\d+$/.test(segment))

      const taskMatch = url.pathname.match(/\/task\/(\d+)/)
      const taskId = taskMatch?.[1] ?? numericSegments.at(-1)
      const projectId =
        numericSegments.length >= 2
          ? numericSegments[numericSegments.length - 2]
          : undefined

      if (taskId) refs.push({ taskId, projectId })
    } catch {
      // Ignore malformed URLs in free text.
    }
  }

  return refs
}

function getPullRequestBody(): string {
  const pullRequest = github.context.payload.pull_request
  if (!pullRequest || typeof pullRequest.body !== 'string') {
    throw new Error(
      'Pull request payload with a body is required for this action'
    )
  }
  return pullRequest.body
}

type PrState = 'Open' | 'Closed' | 'Merged' | 'Draft'

type PrUser = {
  login: string
}

type PrPayload = {
  action?: string
  review?: {
    state?: string
    user?: PrUser
  }
  pull_request?: {
    number?: number
    html_url?: string
    title?: string
    body?: string
    state?: string
    merged?: boolean
    draft?: boolean
    user?: PrUser
    assignee?: PrUser | null
    assignees?: PrUser[]
    requested_reviewers?: PrUser[]
    head?: { ref?: string }
  }
}

type PrSyncCustomFields = {
  url: AsanaCustomField
  status: AsanaCustomField
}

const GITHUB_ASANA_USER_MAP = {
  owner: 'duckduckgo',
  repo: 'internal-github-asana-utils',
  path: 'user_map.yml'
} as const

let cachedGithubAsanaUserMap: Record<string, string> | null = null
let cachedGithubAsanaUserMapToken = ''

const PR_SYNC_CUSTOM_FIELDS = {
  url: 'Github URL',
  status: 'Github Status'
} as const

const PR_SYNC_PULL_REQUEST_ACTIONS = new Set([
  'opened',
  'edited',
  'closed',
  'reopened',
  'synchronize',
  'assigned',
  'unassigned',
  'ready_for_review',
  'labeled',
  'submitted',
  'dismissed'
])

function getDueOn(workingDays: number): string {
  if (workingDays < 0) {
    throw new Error('getDueOn is not supported for past dates')
  }

  let date = new Date()
  const weekends = Math.floor(workingDays / 5)
  const dueOnDay = date.getDay() + weekends * 2 + workingDays
  const additionalDays = weekends * 2 + ((dueOnDay % 7) % 6 === 0 ? 2 : 0)

  date.setDate(date.getDate() + workingDays + additionalDays)
  const offset = date.getTimezoneOffset()
  date = new Date(date.getTime() - offset * 60 * 1000)
  return date.toISOString().split('T')[0]
}

function parseGithubAsanaUserMap(rawYaml: string): Record<string, string> {
  const userMap: Record<string, string> = {}
  for (const rawLine of rawYaml.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator < 1) continue

    const githubUsername = line
      .slice(0, separator)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    const asanaUserId = line
      .slice(separator + 1)
      .trim()
      .replace(/\s+#.*$/, '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (githubUsername && asanaUserId) {
      userMap[githubUsername] = asanaUserId
    }
  }
  return userMap
}

async function loadGithubAsanaUserMap(
  githubPat: string
): Promise<Record<string, string>> {
  if (cachedGithubAsanaUserMap && cachedGithubAsanaUserMapToken === githubPat) {
    return cachedGithubAsanaUserMap
  }

  const githubClient = buildGithubClient(githubPat)
  const response = (await githubClient.request(
    'GET /repos/{owner}/{repo}/contents/{path}',
    {
      owner: GITHUB_ASANA_USER_MAP.owner,
      repo: GITHUB_ASANA_USER_MAP.repo,
      path: GITHUB_ASANA_USER_MAP.path,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
        Accept: 'application/vnd.github.raw+json'
      }
    }
  )) as { data: unknown }

  let rawYaml: string
  if (typeof response.data === 'string') {
    rawYaml = response.data
  } else if (
    response.data &&
    typeof response.data === 'object' &&
    'content' in response.data &&
    typeof (response.data as { content?: unknown }).content === 'string'
  ) {
    const encoded = (
      (response.data as { content: string }).content ?? ''
    ).replace(/\n/g, '')
    rawYaml = Buffer.from(encoded, 'base64').toString('utf8')
  } else {
    throw new Error('Unable to read GitHub-Asana user map content')
  }

  const parsed = parseGithubAsanaUserMap(rawYaml)
  cachedGithubAsanaUserMap = parsed
  cachedGithubAsanaUserMapToken = githubPat
  return parsed
}

async function resolveAsanaUserIdFromGithubUsername(
  githubUsername: string,
  options: { requireGithubPat?: boolean; failIfMissing?: boolean } = {}
): Promise<string | undefined> {
  const githubPat = core.getInput('github-pat')
  if (!githubPat) {
    if (options.requireGithubPat) {
      throw new Error('Input required and not supplied: github-pat')
    }
    core.info('pr-asana-sync: github-pat not provided, skipping user id lookup')
    return undefined
  }

  let userMap: Record<string, string>
  try {
    userMap = await loadGithubAsanaUserMap(githubPat)
  } catch (error) {
    if (options.requireGithubPat) throw error
    core.warning(
      `pr-asana-sync: failed loading GitHub-Asana user map: ${error instanceof Error ? error.message : String(error)}`
    )
    return undefined
  }

  const asanaUserId = userMap[githubUsername]
  if (!asanaUserId) {
    if (options.failIfMissing) {
      throw new Error(
        `User ${githubUsername} not found in GitHub-Asana user map`
      )
    }
    core.info(
      `pr-asana-sync: no Asana user mapping found for GitHub user ${githubUsername}`
    )
    return undefined
  }
  return asanaUserId
}

function getPrState(pr: NonNullable<PrPayload['pull_request']>): PrState {
  if (pr.merged) return 'Merged'
  if (pr.state === 'open') {
    if (pr.draft) return 'Draft'
    return 'Open'
  }
  return 'Closed'
}

function getPrSyncStatusName(
  action: string,
  reviewState: string | undefined,
  prState: PrState
): string {
  void action
  void reviewState
  return prState
}

function getApprovalStatusFromReview(
  action: string,
  reviewState: string | undefined
): 'approved' | 'changes_requested' | undefined {
  if (action !== 'submitted') return undefined
  if (reviewState === 'approved') return 'approved'
  if (reviewState === 'changes_requested') return 'changes_requested'
  return undefined
}

function getApprovalStatusFromPrState(
  prState: PrState
): 'rejected' | undefined {
  if (prState === 'Closed') return 'rejected'
  return undefined
}

function getParentTaskIdFromPrBody(body: string): string | null {
  for (const line of body.split('\n')) {
    const phraseIndex = line.indexOf('Task/Issue URL:')
    if (phraseIndex < 0) continue
    const refs = extractAsanaTaskRefs(line.slice(phraseIndex + 15))
    if (refs.length > 0) return refs[0].taskId
  }
  return null
}

async function findPrSyncCustomFields(
  client: AsanaClient,
  workspaceId: string
): Promise<PrSyncCustomFields> {
  const response =
    await client.customFields.getCustomFieldsForWorkspace(workspaceId)
  const fields = response.data ?? []
  const url = fields.find((field) => field.name === PR_SYNC_CUSTOM_FIELDS.url)
  const status = fields.find(
    (field) => field.name === PR_SYNC_CUSTOM_FIELDS.status
  )
  if (!url || !status) {
    throw new Error(
      `Custom fields "${PR_SYNC_CUSTOM_FIELDS.url}" and "${PR_SYNC_CUSTOM_FIELDS.status}" are required`
    )
  }
  return { url, status }
}

async function findPrTask(
  client: AsanaClient,
  workspaceId: string,
  projectId: string,
  prUrl: string,
  customFields: PrSyncCustomFields
): Promise<AsanaTask | null> {
  core.info('pr-asana-sync: searching workspace for existing task by PR URL')
  const search = await client.tasks.searchTasksInWorkspace(workspaceId, {
    [`custom_fields.${customFields.url.gid}.value`]: prUrl,
    opt_fields: 'name,permalink_url,completed,projects,custom_fields'
  })
  const searchedTasks = Array.isArray(search.data) ? search.data : []
  const searchedTask = searchedTasks[0]
  if (searchedTask) {
    core.info(
      `pr-asana-sync: found existing task via workspace search (${searchedTask.gid})`
    )
    return searchedTask
  }

  core.info(
    'pr-asana-sync: workspace search had no match, scanning project task list'
  )
  const projectTasks = await client.tasks.getTasksForProject(
    projectId,
    'name,permalink_url,completed,projects,custom_fields'
  )
  const projectTaskList = Array.isArray(projectTasks.data)
    ? projectTasks.data
    : []
  core.info(
    `pr-asana-sync: scanning ${projectTaskList.length} project tasks for URL match`
  )
  for (const task of projectTaskList) {
    for (const field of task.custom_fields ?? []) {
      if (field.gid === customFields.url.gid && field.display_value === prUrl) {
        core.info(
          `pr-asana-sync: found existing task via project scan (${task.gid})`
        )
        return task
      }
    }
  }
  core.info('pr-asana-sync: no existing task found')
  return null
}

function findFirstReviewLogin(
  pr: NonNullable<PrPayload['pull_request']>
): string | undefined {
  const author = pr.user?.login
  const assignee = (pr.assignees ?? []).find((user) => user.login !== author)
  if (assignee) return assignee.login
  const requested = (pr.requested_reviewers ?? []).find(
    (user) => user.login !== author
  )
  if (requested) return requested.login
  return undefined
}

function buildPrTaskName(pr: NonNullable<PrPayload['pull_request']>): string {
  const number = typeof pr.number === 'number' ? pr.number : 0
  const title = ensureString(pr.title, 'Pull request title is required')
  return `Code review for PR #${number}: ${title}`
}

function buildPrTaskNotes(pr: NonNullable<PrPayload['pull_request']>): string {
  const prUrl = ensureString(pr.html_url, 'Pull request URL is required')
  const body =
    typeof pr.body === 'string' && pr.body.trim() !== ''
      ? pr.body
      : 'Empty description'
  const truncatedBody = (
    body.length > 5000 ? `${body.slice(0, 5000)}...` : body
  ).replace(/^---$[\s\S]*/gm, '')
  return `PR: ${prUrl}\n\n${truncatedBody}`
}

async function maybeAssignRandomReviewer(
  pr: NonNullable<PrPayload['pull_request']>,
  reviewerPool: string[]
): Promise<string | undefined> {
  const author = pr.user?.login ?? ''
  const candidates = reviewerPool.filter(
    (reviewer) => reviewer.trim() !== '' && reviewer.trim() !== author
  )
  if (candidates.length === 0) return undefined

  const reviewer =
    candidates[Math.floor(Math.random() * candidates.length)]?.trim()
  if (!reviewer) return undefined

  const token = core.getInput('github-token')
  if (!token) return undefined

  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const pullNumber = pr.number
  if (!owner || !repo || typeof pullNumber !== 'number') return undefined

  const githubClient = buildGithubClient(token)
  await githubClient.request(
    'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
    {
      owner,
      repo,
      pull_number: pullNumber,
      reviewers: [reviewer],
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    }
  )
  await githubClient.request(
    'POST /repos/{owner}/{repo}/issues/{issue_number}/assignees',
    {
      owner,
      repo,
      issue_number: pullNumber,
      assignees: [reviewer],
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    }
  )
  core.info(`PR is assigned to randomized reviewer: ${reviewer}`)
  return reviewer
}

async function resolvePrAssigneeLogin(
  pr: NonNullable<PrPayload['pull_request']>,
  reviewerPool: string[]
): Promise<string | undefined> {
  const existing = findFirstReviewLogin(pr)
  if (existing) return existing
  return maybeAssignRandomReviewer(pr, reviewerPool)
}

function shouldSkipPrSync(author: string): boolean {
  const skippedUsers = new Set(
    getArrayFromInput(core.getInput('skipped-users'))
  )
  if (skippedUsers.has(author)) return true
  return false
}

function shouldClosePrTask(
  state: PrState,
  task: AsanaTask,
  noAutocloseProjects: Set<string>
): boolean {
  if (!['Closed', 'Merged'].includes(state)) return false
  if (noAutocloseProjects.size === 0) return true
  return !(task.projects ?? []).some((project) =>
    noAutocloseProjects.has(project.gid)
  )
}

async function prAsanaSync(): Promise<void> {
  const payload = github.context.payload as PrPayload
  const action = payload.action ?? ''
  core.info(`pr-asana-sync: received event action "${action}"`)
  if (!PR_SYNC_PULL_REQUEST_ACTIONS.has(action)) {
    core.info(`Skipping pr-asana-sync for pull_request action "${action}"`)
    core.setOutput('result', 'skipped')
    return
  }

  const pr = payload.pull_request
  if (!pr) throw new Error('Pull request payload is required for pr-asana-sync')
  core.info(`pr-asana-sync: processing PR #${pr.number ?? 'unknown'}`)

  const workspaceId = core.getInput('asana-workspace-id', { required: true })
  const projectId = core.getInput('asana-project', { required: true })
  core.info(
    `pr-asana-sync: loaded required inputs (workspace=${workspaceId}, project=${projectId})`
  )
  const client = buildAsanaClient()
  core.info('pr-asana-sync: loading required Asana custom fields')
  const customFields = await findPrSyncCustomFields(client, workspaceId)
  const prUrl = ensureString(pr.html_url, 'Pull request URL is required')
  const prState = getPrState(pr)
  const statusName = getPrSyncStatusName(action, payload.review?.state, prState)
  const approvalStatus =
    getApprovalStatusFromReview(action, payload.review?.state) ??
    getApprovalStatusFromPrState(prState)
  core.info(`pr-asana-sync: derived PR state "${prState}"`)
  core.info(`pr-asana-sync: resolved status name "${statusName}"`)
  core.info(
    `pr-asana-sync: resolved approval status "${approvalStatus ?? 'unchanged'}"`
  )
  const statusGid =
    customFields.status.enum_options?.find((opt) => opt.name === statusName)
      ?.gid ?? ''
  if (!statusGid) {
    throw new Error(`No enum option found for Github Status "${statusName}"`)
  }
  core.info(`pr-asana-sync: resolved status option gid ${statusGid}`)

  const author = ensureString(pr.user?.login, 'Pull request author is required')
  if (shouldSkipPrSync(author)) {
    core.info(`Skipping Asana sync for pull request author: ${author}`)
    core.setOutput('result', 'skipped')
    core.setOutput('task-url', '')
    return
  }

  const title = buildPrTaskName(pr)
  const notes = buildPrTaskNotes(pr)
  const authorAsanaUserId = await resolveAsanaUserIdFromGithubUsername(author)
  const followers = authorAsanaUserId ? [authorAsanaUserId] : undefined
  const parentTaskId = getParentTaskIdFromPrBody(pr.body ?? '')
  core.info(
    `pr-asana-sync: parent task in PR body ${parentTaskId ? `found (${parentTaskId})` : 'not found'}`
  )

  core.info('pr-asana-sync: finding existing PR task')
  let task = await findPrTask(
    client,
    workspaceId,
    projectId,
    prUrl,
    customFields
  )
  if (!task) {
    core.info('pr-asana-sync: creating new PR task')
    const createData: Record<string, unknown> = {
      resource_subtype: 'approval',
      custom_fields: {
        [customFields.url.gid]: prUrl,
        [customFields.status.gid]: statusGid
      },
      name: title,
      notes,
      projects: [projectId]
    }
    if (parentTaskId) createData.parent = parentTaskId
    if (followers && followers.length > 0) createData.followers = followers
    if (!pr.draft) createData.due_on = getDueOn(1)
    if (approvalStatus) createData.approval_status = approvalStatus

    const created = await client.tasks.createTask({ data: createData }, {})
    const taskId = ensureString(
      created.data?.gid,
      'Failed to create PR Asana task'
    )
    task = created.data ?? { gid: taskId }
    core.setOutput('result', 'created')
    core.info(`pr-asana-sync: created task ${task.gid}`)
  } else {
    core.setOutput('result', 'updated')
    core.info(`pr-asana-sync: updating existing task ${task.gid}`)
  }

  const reviewerPool = getArrayFromInput(core.getInput('randomized-reviewers'))
  const assignPrAuthor = parseBooleanInput('assign-pr-author', false)
  core.info(
    `pr-asana-sync: reviewer pool contains ${reviewerPool.length} users (assign-pr-author=${String(assignPrAuthor)})`
  )
  let assigneeLogin: string | undefined
  let assignee: string | null | undefined
  if (action === 'unassigned') {
    assignee = null
  } else if (assignPrAuthor) {
    assigneeLogin = author
    assignee = await resolveAsanaUserIdFromGithubUsername(assigneeLogin)
  } else {
    assigneeLogin = await resolvePrAssigneeLogin(pr, reviewerPool)
    assignee = assigneeLogin
      ? await resolveAsanaUserIdFromGithubUsername(assigneeLogin)
      : undefined
  }
  core.info(
    `pr-asana-sync: assignee resolution -> login=${assigneeLogin ?? 'none'}, asana=${assignee ?? 'none'}`
  )

  const updateData: Record<string, unknown> = {
    custom_fields: {
      [customFields.url.gid]: prUrl,
      [customFields.status.gid]: statusGid
    },
    name: title,
    notes
  }
  if (assignee === null) {
    updateData.assignee = null
  } else if (assignee) {
    updateData.assignee = assignee
  }
  if (action === 'ready_for_review') {
    updateData.due_on = getDueOn(1)
  }
  if (approvalStatus) {
    updateData.approval_status = approvalStatus
  }

  const noAutocloseProjects = new Set(
    getArrayFromInput(core.getInput('no-autoclose-projects'))
  )
  const shouldClose = shouldClosePrTask(prState, task, noAutocloseProjects)
  core.info(`pr-asana-sync: should mark task complete = ${String(shouldClose)}`)
  if (shouldClose) {
    updateData.completed = true
  }

  const sectionId = core.getInput('asana-in-progress-section-id')
  if (sectionId && ['assigned', 'ready_for_review'].includes(action)) {
    core.info(
      `pr-asana-sync: moving task ${task.gid} to in-progress section ${sectionId}`
    )
    await client.sections.addTaskForSection(sectionId, task.gid)
  }

  const hasCompletionUpdate = updateData.completed === true
  const hasApprovalStatusUpdate = typeof updateData.approval_status === 'string'
  if (hasCompletionUpdate && hasApprovalStatusUpdate) {
    core.info(
      `pr-asana-sync: sending split task updates for ${task.gid} (approval_status and completed)`
    )
    const completionValue = updateData.completed
    delete updateData.completed
    await client.tasks.updateTask({ data: updateData }, task.gid, {})
    await client.tasks.updateTask(
      { data: { completed: completionValue } },
      task.gid,
      {}
    )
  } else {
    core.info(`pr-asana-sync: sending task update for ${task.gid}`)
    await client.tasks.updateTask({ data: updateData }, task.gid, {})
  }
  core.info(`pr-asana-sync: fetching refreshed task ${task.gid}`)
  const refreshedTask = await client.tasks.getTask(task.gid)
  core.setOutput(
    'task-url',
    refreshedTask.data?.permalink_url ?? task.permalink_url ?? ''
  )
  core.setOutput('asanaTaskId', task.gid)
  core.info(`pr-asana-sync: completed successfully for task ${task.gid}`)
}

async function getAsanaUserId(): Promise<void> {
  const githubUsername =
    core.getInput('github-username') ||
    (github.context.payload as PrPayload).pull_request?.user?.login ||
    github.context.actor

  if (!githubUsername) {
    throw new Error(
      'github-username is required when no pull_request user or github.actor is available'
    )
  }

  core.info(`Resolving Asana user id for GitHub user ${githubUsername}`)
  const asanaUserId = await resolveAsanaUserIdFromGithubUsername(
    githubUsername,
    {
      requireGithubPat: true,
      failIfMissing: true
    }
  )
  core.setOutput('asanaUserId', asanaUserId)
}

async function isTaskInProject(
  taskId: string,
  projectId: string
): Promise<boolean> {
  const client = buildAsanaClient()
  try {
    const response = await client.tasks.getTask(taskId, {
      opt_fields: 'projects.gid'
    })
    return (
      response.data?.projects?.some((project) => project.gid === projectId) ??
      false
    )
  } catch (error) {
    core.warning(
      `Failed to verify task ${taskId} project membership: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}

async function findAsanaTasks(): Promise<string[]> {
  const body = getPullRequestBody()
  const triggerPhrase = core.getInput('trigger-phrase')
  const specifiedProjectId = core.getInput('asana-project')
  const refs: Array<{ taskId: string; projectId?: string }> = []

  if (triggerPhrase) {
    for (const line of body.split('\n')) {
      const phraseIndex = line.indexOf(triggerPhrase)
      if (phraseIndex < 0) continue
      refs.push(
        ...extractAsanaTaskRefs(line.slice(phraseIndex + triggerPhrase.length))
      )
    }
  } else {
    refs.push(...extractAsanaTaskRefs(body))
  }

  const foundTaskIds: string[] = []
  for (const ref of refs) {
    if (!specifiedProjectId) {
      foundTaskIds.push(ref.taskId)
      continue
    }

    if (ref.projectId === specifiedProjectId) {
      foundTaskIds.push(ref.taskId)
      continue
    }

    const inProject = await isTaskInProject(ref.taskId, specifiedProjectId)
    if (inProject) foundTaskIds.push(ref.taskId)
  }

  return [...new Set(foundTaskIds)]
}

async function createStory(
  client: AsanaClient,
  taskId: string,
  text: string,
  isPinned: boolean,
  isHtml = false
): Promise<void> {
  const storyData = isHtml ? { html_text: text } : { text }
  const body = { data: { ...storyData, is_pinned: isPinned } }

  try {
    await client.stories.createStoryForTask(body, taskId, {})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!isPinned || !message.includes('(400)')) {
      throw error
    }

    core.warning(
      `Asana rejected pinned comment for task ${taskId}; retrying without pinning`
    )
    await client.stories.createStoryForTask({ data: storyData }, taskId, {})
  }
}

async function addTaskToProject(
  client: AsanaClient,
  taskId: string,
  projectId: string,
  sectionId?: string
): Promise<void> {
  const data = sectionId
    ? {
        project: projectId,
        section: sectionId
      }
    : {
        project: projectId,
        insert_after: null
      }
  await client.tasks.addProjectForTask({ data }, taskId, {})
}

async function findTaskInSection(
  client: AsanaClient,
  sectionId: string,
  name: string
): Promise<string | null> {
  const result = await client.tasks.getTasksForSection(sectionId)
  const existing = result.data?.find((task) => task.name === name)
  return existing?.gid ?? null
}

async function createAsanaTask(): Promise<void> {
  const client = buildAsanaClient()
  const projectId = core.getInput('asana-project', { required: true })
  const sectionId = core.getInput('asana-section')
  const taskName = core.getInput('asana-task-name', { required: true })
  const taskDescription = core.getInput('asana-task-description', {
    required: true
  })
  const tags = getArrayFromInput(core.getInput('asana-tags'))
  const collaborators = getArrayFromInput(core.getInput('asana-collaborators'))
  const assignee =
    core.getInput('asana-task-assignee') || core.getInput('asana-assignee')
  const customFields = core.getInput('asana-task-custom-fields')

  if (sectionId) {
    const existingTaskId = await findTaskInSection(client, sectionId, taskName)
    if (existingTaskId) {
      core.setOutput('taskId', existingTaskId)
      core.setOutput('duplicate', true)
      return
    }
  }

  const data: Record<string, unknown> = {
    name: taskName,
    notes: taskDescription,
    projects: [projectId],
    tags,
    followers: collaborators
  }

  if (assignee) data.assignee = assignee
  if (sectionId) data.memberships = [{ project: projectId, section: sectionId }]

  if (customFields) {
    try {
      data.custom_fields = JSON.parse(customFields) as Record<string, string>
    } catch {
      throw new Error('Invalid JSON in input asana-task-custom-fields')
    }
  }

  const created = await client.tasks.createTask({ data }, {})
  const taskId = ensureString(created.data?.gid, 'Failed to create Asana task')
  core.setOutput('taskId', taskId)
  core.setOutput('duplicate', false)
}

async function createAsanaIssueTask(): Promise<void> {
  const client = buildAsanaClient()
  const issue = github.context.payload.issue
  const asanaProjectId = core.getInput('asana-project', { required: true })
  const title = ensureString(issue?.title, 'Issue title is required')
  const body = typeof issue?.body === 'string' ? issue.body : ''
  const issueUrl = ensureString(issue?.html_url, 'Issue URL is required')

  const created = await client.tasks.createTask(
    {
      data: {
        name: `Github Issue: ${title}`,
        notes: `Description: ${body}`,
        is_rendered_as_separator: false,
        projects: [asanaProjectId]
      }
    },
    {}
  )

  const taskId = ensureString(
    created.data?.gid,
    'Failed to create Asana issue task'
  )
  await createStory(client, taskId, `Link to Issue: ${issueUrl}`, true)
  core.setOutput('taskId', taskId)
}

async function postCommentAsanaTask(): Promise<void> {
  const client = buildAsanaClient()
  const taskIds = getArrayFromInput(
    core.getInput('asana-task-id', { required: true })
  )
  const taskComment = core.getInput('asana-task-comment', { required: true })
  const isPinned = parseBooleanInput('asana-task-comment-pinned', false)
  const isHtml = parseBooleanInput('asana-task-comment-is-html', false)

  if (taskIds.length === 0)
    throw new Error('No valid task IDs provided in asana-task-id')

  for (const taskId of taskIds) {
    await createStory(client, taskId, taskComment, isPinned, isHtml)
  }
}

async function getTaskPermalink(): Promise<void> {
  const client = buildAsanaClient()
  const taskId = core.getInput('asana-task-id', { required: true })
  const response = await client.tasks.getTask(taskId)
  const permalink = ensureString(
    response.data?.permalink_url,
    `No permalink returned for task ${taskId}`
  )
  core.setOutput('asanaTaskPermalink', permalink)
}

async function completeAsanaTask(
  taskId: string,
  completed: boolean
): Promise<void> {
  const client = buildAsanaClient()
  await client.tasks.updateTask({ data: { completed } }, taskId, {})
}

async function markAsanaTaskComplete(): Promise<void> {
  const taskId = core.getInput('asana-task-id', { required: true })
  const isComplete = parseBooleanInput('is-complete', false)
  await completeAsanaTask(taskId, isComplete)
}

async function assignAsanaTask(): Promise<void> {
  const client = buildAsanaClient()
  const taskId = core.getInput('asana-task-id', { required: true })
  const assignee = core.getInput('asana-assignee', { required: true })
  await client.tasks.updateTask({ data: { assignee } }, taskId, {})
}

async function searchAsanaTaskByName(): Promise<void> {
  const client = buildAsanaClient()
  const taskName = core.getInput('asana-task-name', { required: true })
  const projectId = core.getInput('asana-project', { required: true })
  const sectionId = core.getInput('asana-section')

  const tasks = sectionId
    ? await client.tasks.getTasksForSection(sectionId)
    : await client.tasks.getTasksForProject(projectId)
  const matches = (tasks.data ?? [])
    .filter((task) => task.name === taskName)
    .map((task) => task.gid)

  if (matches.length === 0) {
    throw new Error(`No task found with exact name "${taskName}"`)
  }

  core.setOutput('asanaTaskId', matches[0])
  core.setOutput('asanaTaskIds', matches.join(','))
}

async function findAsanaTaskId(): Promise<void> {
  const tasks = await findAsanaTasks()
  if (tasks.length === 0)
    throw new Error("Can't find an Asana task with the expected prefix")
  core.setOutput('asanaTaskId', tasks[0])
}

async function findAsanaTaskIds(): Promise<void> {
  const tasks = await findAsanaTasks()
  if (tasks.length === 0)
    throw new Error("Can't find any Asana tasks with the expected prefix")
  core.setOutput('asanaTaskIds', tasks.join(','))
}

function setAsanaTaskOutputs(taskIds: string[], actionName: string): void {
  if (taskIds.length === 0) {
    core.warning(`No Asana tasks found for action: ${actionName}`)
    core.setOutput('asanaTaskFound', false)
    core.setOutput('asanaTaskId', '')
    core.setOutput('asanaTaskIds', '')
    return
  }

  core.setOutput('asanaTaskFound', true)
  core.setOutput('asanaTaskId', taskIds[0])
  core.setOutput('asanaTaskIds', taskIds.join(','))
}

async function addCommentToPRTask(): Promise<void> {
  const client = buildAsanaClient()
  const pullRequest = github.context.payload.pull_request
  const prUrl = ensureString(
    pullRequest?.html_url,
    'Pull request URL is required'
  )
  const isPinned = parseBooleanInput('is-pinned', false)
  const taskIds = await findAsanaTasks()
  for (const taskId of taskIds) {
    await createStory(client, taskId, `PR: ${prUrl}`, isPinned)
  }
  setAsanaTaskOutputs(taskIds, 'add-asana-comment')
}

async function notifyPRApproved(): Promise<void> {
  const client = buildAsanaClient()
  const pullRequest = github.context.payload.pull_request
  const prUrl = ensureString(
    pullRequest?.html_url,
    'Pull request URL is required'
  )
  const taskIds = await findAsanaTasks()
  for (const taskId of taskIds) {
    await createStory(client, taskId, `PR: ${prUrl} has been approved`, false)
  }
  setAsanaTaskOutputs(taskIds, 'notify-pr-approved')
}

async function completePRTask(): Promise<void> {
  const isComplete = parseBooleanInput('is-complete', false)
  const taskIds = await findAsanaTasks()
  for (const taskId of taskIds) {
    await completeAsanaTask(taskId, isComplete)
  }
  setAsanaTaskOutputs(taskIds, 'notify-pr-merged')
}

async function addTaskToAsanaProject(): Promise<void> {
  const client = buildAsanaClient()
  const projectId = core.getInput('asana-project', { required: true })
  const sectionId = core.getInput('asana-section')
  const providedTaskIds = getArrayFromInput(core.getInput('asana-task-id'))
  const taskIds =
    providedTaskIds.length > 0 ? providedTaskIds : await findAsanaTasks()

  if (taskIds.length === 0) throw new Error('No valid task IDs found')

  for (const taskId of taskIds) {
    await addTaskToProject(client, taskId, projectId, sectionId)
  }
}

async function addTaskPRDescription(): Promise<void> {
  const githubPat = core.getInput('github-pat', { required: true })
  const githubClient = buildGithubClient(githubPat)
  const org = core.getInput('github-org', { required: true })
  const repo = core.getInput('github-repository', { required: true })
  const pr = core.getInput('github-pr', { required: true })
  const projectId = core.getInput('asana-project', { required: true })
  const taskId = core.getInput('asana-task-id', { required: true })

  const prNumber = Number(pr)
  if (Number.isNaN(prNumber)) throw new Error('github-pr must be a number')

  const response = await githubClient.request(
    'GET /repos/{owner}/{repo}/pulls/{pull_number}',
    {
      owner: org,
      repo,
      pull_number: prNumber,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    }
  )

  const existingBody =
    typeof response.data.body === 'string' ? response.data.body : ''
  const asanaTaskMessage = `Task/Issue URL: https://app.asana.com/0/${projectId}/${taskId}/f`
  const updatedBody = `${asanaTaskMessage}\n\n-----\n${existingBody}`

  await githubClient.request(
    'PATCH /repos/{owner}/{repo}/pulls/{pull_number}',
    {
      owner: org,
      repo,
      pull_number: prNumber,
      body: updatedBody,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' }
    }
  )
}

async function sendMattermostMessage(): Promise<void> {
  const mattermostToken = core.getInput('mattermost-token', { required: true })
  const mattermostUrl =
    core.getInput('mattermost-url') || 'https://chat.duckduckgo.com'
  const channelName = core.getInput('mattermost-channel-name', {
    required: true
  })
  const message = core.getInput('mattermost-message', { required: true })
  const teamId = core.getInput('mattermost-team-id', { required: true })

  const headers = {
    Authorization: `Bearer ${mattermostToken}`,
    'Content-Type': 'application/json'
  }

  const channelResponse = await fetch(
    `${mattermostUrl}/api/v4/teams/${encodeURIComponent(teamId)}/channels/name/${encodeURIComponent(channelName)}`,
    { method: 'GET', headers }
  )

  if (!channelResponse.ok) {
    throw new Error(
      `Failed to resolve Mattermost channel "${channelName}" (${channelResponse.status})`
    )
  }

  const channel = (await channelResponse.json()) as { id?: string }
  if (!channel.id) {
    throw new Error(`Channel "${channelName}" not found`)
  }

  const postResponse = await fetch(`${mattermostUrl}/api/v4/posts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      channel_id: channel.id,
      message
    })
  })

  if (!postResponse.ok) {
    throw new Error(
      `Failed to send Mattermost message (${postResponse.status})`
    )
  }
}

/**
 * The main function for the action.
 */
export async function run(): Promise<void> {
  try {
    const action = core.getInput('action', { required: true })
    core.info(`Calling action: ${action}`)

    switch (action) {
      case 'create-asana-task':
        await createAsanaTask()
        break
      case 'post-comment-asana-task':
        await postCommentAsanaTask()
        break
      case 'get-asana-task-permalink':
        await getTaskPermalink()
        break
      case 'mark-asana-task-complete':
        await markAsanaTaskComplete()
        break
      case 'assign-asana-task':
        await assignAsanaTask()
        break
      case 'search-asana-task-by-name':
        await searchAsanaTaskByName()
        break
      case 'create-asana-issue-task':
        await createAsanaIssueTask()
        break
      case 'find-asana-task-id':
        await findAsanaTaskId()
        break
      case 'find-asana-task-ids':
        await findAsanaTaskIds()
        break
      case 'add-asana-comment':
        await addCommentToPRTask()
        break
      case 'notify-pr-approved':
        await notifyPRApproved()
        break
      case 'notify-pr-merged':
        await completePRTask()
        break
      case 'pr-asana-sync':
        await prAsanaSync()
        break
      case 'add-task-asana-project':
        await addTaskToAsanaProject()
        break
      case 'add-task-pr-description':
        await addTaskPRDescription()
        break
      case 'send-mattermost-message':
        await sendMattermostMessage()
        break
      case 'get-asana-user-id':
        await getAsanaUserId()
        break
      default:
        throw new Error(`Unexpected action: ${action}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
      return
    }
    core.setFailed(String(error))
  }
}
