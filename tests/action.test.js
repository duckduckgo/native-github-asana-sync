const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/core'); // Use named import if possible
const asana = require('asana');
const yaml = require('js-yaml');
const { Client4 } = require('@mattermost/client');

// Import the function to test
const { action } = require('../action');

// --- Mock Data ---

const mockGithubContextPayload = {
    pull_request: {
        html_url: 'https://github.com/test-owner/test-repo/pull/123',
        title: 'Test Pull Request',
        body: 'This PR fixes bugs.\n\nCloses https://app.asana.com/0/1111/2222\nFixes https://app.asana.com/0/project/1111/task/3333/f\nRelated: https://app.asana.com/0/1111/4444',
        user: { login: 'test-user' },
        base: { repo: { owner: { login: 'test-owner' } } },
        head: { user: { login: 'test-user' } }, // Internal user example
    },
    issue: {
        html_url: 'https://github.com/test-owner/test-repo/issues/456',
        title: 'Test Issue',
        body: 'This is a test issue description.',
        user: { login: 'test-user' },
    },
};

const mockAsanaTask = {
    gid: '2222',
    name: 'Mock Asana Task',
    permalink_url: 'https://app.asana.com/0/1111/2222/f',
};

const mockAsanaCreatedTask = {
    gid: '5555',
    name: 'Newly Created Task',
    permalink_url: 'https://app.asana.com/0/1111/5555/f',
};

const mockAsanaStory = {
    gid: 'story-1',
    text: 'Mock story comment',
};

const mockAsanaProject = '1111';
const mockAsanaSection = 'section-123';
const mockAsanaUserId = 'asana-user-123';
const mockAsanaTagId = 'tag-456';
const mockAsanaCollaboratorId = 'collab-789';

const mockGithubRelease = {
    data: {
        tag_name: 'v1.2.3',
    },
};

const mockGithubPrData = {
    data: {
        body: 'Original PR body.',
    },
};

const mockUserMap = {
    'test-user': mockAsanaUserId,
    'another-user': 'another-asana-id',
};

const mockMattermostChannel = {
    id: 'channel-abc',
    name: 'test-channel',
};
const mockMattermostTeamId = 'team-xyz';

// --- Mocks ---

// Mock @actions/core
jest.mock('@actions/core', () => ({
    getInput: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
    context: {
        payload: {}, // Will be overridden in tests
    },
}));

// Mock asana
const mockAsanaClient = {
    stories: {
        createStoryForTask: jest.fn().mockResolvedValue(mockAsanaStory),
    },
    tasks: {
        createTask: jest.fn().mockResolvedValue(mockAsanaCreatedTask),
        addProjectForTask: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        getTasksForSection: jest.fn().mockResolvedValue({ data: [] }), // Default: no existing tasks
        getTask: jest.fn().mockResolvedValue(mockAsanaTask),
    },
    sections: {
        addTaskForSection: jest.fn().mockResolvedValue({}),
    },
};
const mockAsanaAuthorize = jest.fn().mockResolvedValue(mockAsanaClient); // Mock authorize separately
const mockAsanaUseAccessToken = jest.fn(() => ({
    // Mock chained call
    authorize: mockAsanaAuthorize,
}));
jest.mock('asana', () => ({
    Client: {
        create: jest.fn(() => ({
            useAccessToken: mockAsanaUseAccessToken,
        })),
    },
    ApiClient: {
        instance: {
            authentications: {
                token: { accessToken: null },
            },
            defaultHeaders: {},
        },
    },
    TasksApi: jest.fn(() => mockAsanaClient.tasks),
    StoriesApi: jest.fn(() => mockAsanaClient.stories),
    SectionsApi: jest.fn(() => mockAsanaClient.sections),
    UsersApi: jest.fn(() => ({})),
}));

// Mock @octokit/core
const mockOctokitRequest = jest.fn();
jest.mock('@octokit/core', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        request: mockOctokitRequest,
    })),
}));

// Mock js-yaml
jest.mock('js-yaml', () => ({
    load: jest.fn(),
}));

// Mock @mattermost/client
const mockMattermostClientInstance = {
    setUrl: jest.fn(),
    setToken: jest.fn(),
    createPost: jest.fn().mockResolvedValue({ id: 'post-123' }),
    getChannelByName: jest.fn().mockResolvedValue(mockMattermostChannel),
};
jest.mock('@mattermost/client', () => ({
    Client4: jest.fn(() => mockMattermostClientInstance),
}));

// --- Test Suite ---

describe('GitHub Asana Sync Action', () => {
    // Helper function to set input mocks
    function mockGetInput(inputs) {
        core.getInput.mockImplementation((name, options) => {
            // Handle required option check if needed (basic version here)
            if (options?.required && !inputs[name]) {
                throw new Error(`Input required and not supplied: ${name}`);
            }
            return inputs[name] || '';
        });
    }

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Reset github context payload
        github.context.payload = JSON.parse(JSON.stringify(mockGithubContextPayload)); // Deep clone

        // Default mock implementations
        mockGetInput({
            'asana-pat': 'mock-asana-pat',
            'github-pat': 'mock-github-pat',
            'mattermost-token': 'mock-mattermost-token',
            'trigger-phrase': 'Closes',
        });
        mockOctokitRequest.mockResolvedValue({}); // Default success for Octokit
        yaml.load.mockReturnValue(mockUserMap); // Default user map
        mockAsanaClient.tasks.getTasksForSection.mockResolvedValue({ data: [] }); // Default: no tasks in section
        mockMattermostClientInstance.getChannelByName.mockResolvedValue(mockMattermostChannel); // Default: channel found
    });

    // --- Test Cases for each Action ---

    describe('action: create-asana-issue-task', () => {
        it('should create an Asana task from a GitHub issue', async () => {
            mockGetInput({
                action: 'create-asana-issue-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
            });
            github.context.payload.pull_request = undefined; // Ensure issue context is used

            await action();

            expect(asana.TasksApi).toHaveBeenCalled();
            expect(asana.StoriesApi).toHaveBeenCalled();

            expect(mockAsanaClient.tasks.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: `Github Issue: ${mockGithubContextPayload.issue.title}`,
                        notes: `Description: ${mockGithubContextPayload.issue.body}`,
                        projects: [mockAsanaProject],
                    }),
                }),
                {},
            );

            // Wait for the promise chain in createTaskWithComment
            await Promise.resolve(); // Allow microtasks to run

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith(
                mockAsanaCreatedTask.gid,
                expect.objectContaining({
                    text: `Link to Issue: ${mockGithubContextPayload.issue.html_url}`,
                    is_pinned: true,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: notify-pr-approved', () => {
        it('should add a comment to linked Asana tasks on PR approval', async () => {
            mockGetInput({
                action: 'notify-pr-approved',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': 'Closes', // Matches body
            });
            github.context.payload.issue = undefined; // Ensure PR context is used

            await action();

            expect(asana.StoriesApi).toHaveBeenCalled();
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(1); // Only 'Closes' matches trigger
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith(
                '2222', // Task ID from the 'Closes' link
                expect.objectContaining({
                    text: `PR: ${mockGithubContextPayload.pull_request.html_url} has been approved`,
                    is_pinned: false,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should respect the asana-project filter', async () => {
            mockGetInput({
                action: 'notify-pr-approved',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': 'Closes',
                'asana-project': '3333', // Project ID from the second 'Closes' link
            });
            github.context.payload.issue = undefined; // Ensure PR context is used
            github.context.payload.pull_request.body =
                'This PR fixes bugs.\n\nCloses https://app.asana.com/0/1111/2222\nCloses https://app.asana.com/0/project/3333/task/4444/f';

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(1);
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith(
                '4444', // Task ID from the second 'Closes' link
                expect.objectContaining({
                    text: `PR: ${mockGithubContextPayload.pull_request.html_url} has been approved`,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: notify-pr-merged', () => {
        it('should mark linked Asana tasks as complete', async () => {
            mockGetInput({
                action: 'notify-pr-merged',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': 'Closes',
                'is-complete': 'true',
            });
            github.context.payload.issue = undefined;

            await action();

            expect(asana.TasksApi).toHaveBeenCalled();
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledTimes(1);
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledWith('2222', {
                completed: true,
            });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should mark linked Asana tasks as incomplete', async () => {
            mockGetInput({
                action: 'notify-pr-merged',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': 'Closes',
                'is-complete': 'false', // Or omitted
            });
            github.context.payload.issue = undefined;

            await action();

            expect(asana.TasksApi).toHaveBeenCalled();
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledTimes(1);
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledWith('2222', {
                completed: false,
            });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should mark multiple Asana tasks as complete', async () => {
            mockGetInput({
                action: 'notify-pr-merged',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': '',
                'is-complete': 'true',
            });
            github.context.payload.issue = undefined;

            await action();

            expect(asana.TasksApi).toHaveBeenCalled();
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledTimes(3);
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledWith('2222', {
                completed: true,
            });
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledWith('3333', {
                completed: true,
            });
            expect(mockAsanaClient.tasks.update).toHaveBeenCalledWith('4444', {
                completed: true,
            });
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: check-pr-membership', () => {
        it('should output external=false for internal user', async () => {
            mockGetInput({ action: 'check-pr-membership' });
            // Use default payload where head.user.login matches base.repo.owner.login implies internal (adjust if logic differs)
            github.context.payload.pull_request.head.user.login = github.context.payload.pull_request.base.repo.owner.login;

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('external', false);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should output external=true for external user', async () => {
            mockGetInput({ action: 'check-pr-membership' });
            github.context.payload.pull_request.head.user.login = 'external-contributor';

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('external', true);
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: add-asana-comment', () => {
        it('should add a pinned comment to linked Asana tasks', async () => {
            mockGetInput({
                action: 'add-asana-comment',
                'asana-pat': 'mock-asana-pat',
                'trigger-phrase': 'Fixes',
                'is-pinned': 'true',
            });
            github.context.payload.issue = undefined;

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(1);
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith(
                '3333', // From 'Fixes' link
                expect.objectContaining({
                    text: `PR: ${mockGithubContextPayload.pull_request.html_url}`,
                    is_pinned: true,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: add-task-asana-project', () => {
        const taskIdsToAdd = 'task-abc, task-def';

        it('should add tasks to a project', async () => {
            mockGetInput({
                action: 'add-task-asana-project',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-task-id': taskIdsToAdd,
                // No section
            });

            await action();

            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledTimes(2);
            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledWith('task-abc', {
                project: mockAsanaProject,
                insert_after: null,
            });
            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledWith('task-def', {
                project: mockAsanaProject,
                insert_after: null,
            });
            expect(mockAsanaClient.sections.addTaskForSection).not.toHaveBeenCalled();
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should add tasks to a project section', async () => {
            mockGetInput({
                action: 'add-task-asana-project',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-section': mockAsanaSection,
                'asana-task-id': taskIdsToAdd,
            });

            await action();

            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledTimes(2);
            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledWith('task-abc', { project: mockAsanaProject });
            expect(mockAsanaClient.tasks.addProjectForTask).toHaveBeenCalledWith('task-def', { project: mockAsanaProject });

            // Wait for promise chain
            await Promise.resolve();
            await Promise.resolve(); // Might need more if timing is tight

            expect(mockAsanaClient.sections.addTaskForSection).toHaveBeenCalledTimes(2);
            expect(mockAsanaClient.sections.addTaskForSection).toHaveBeenCalledWith(mockAsanaSection, { task: 'task-abc' });
            expect(mockAsanaClient.sections.addTaskForSection).toHaveBeenCalledWith(mockAsanaSection, { task: 'task-def' });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if no task IDs are provided', async () => {
            mockGetInput({
                action: 'add-task-asana-project',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-task-id': ',', // Empty list
            });

            await action();

            expect(mockAsanaClient.tasks.addProjectForTask).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith('No valid task IDs provided');
        });
    });

    describe('action: create-asana-pr-task', () => {
        it('should create an Asana task from a GitHub PR', async () => {
            mockGetInput({
                action: 'create-asana-pr-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
            });
            github.context.payload.issue = undefined; // Ensure PR context is used

            await action();

            expect(asana.TasksApi).toHaveBeenCalled();
            expect(mockAsanaClient.tasks.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: `Community Pull Request: ${mockGithubContextPayload.pull_request.title}`,
                        notes: `Description: ${mockGithubContextPayload.pull_request.body}`,
                        projects: [mockAsanaProject],
                    }),
                }),
                {},
            );

            // Wait for promise chain
            await Promise.resolve();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith(
                mockAsanaCreatedTask.gid,
                expect.objectContaining({
                    text: `Link to Pull Request: ${mockGithubContextPayload.pull_request.html_url}`,
                    is_pinned: true,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: get-latest-repo-release', () => {
        const org = 'release-org';
        const repo = 'release-repo';

        it('should get the latest release tag and set output', async () => {
            mockGetInput({
                action: 'get-latest-repo-release',
                'github-pat': 'mock-github-pat',
                'github-org': org,
                'github-repository': repo,
            });
            mockOctokitRequest.mockResolvedValue(mockGithubRelease);

            await action();

            expect(Octokit).toHaveBeenCalledWith({ auth: 'mock-github-pat' });
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/releases/latest',
                expect.objectContaining({ owner: org, repo }),
            );
            expect(core.setOutput).toHaveBeenCalledWith('version', mockGithubRelease.data.tag_name);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if the request fails', async () => {
            mockGetInput({
                action: 'get-latest-repo-release',
                'github-pat': 'mock-github-pat',
                'github-org': org,
                'github-repository': repo,
            });
            const error = new Error('Not Found');
            mockOctokitRequest.mockRejectedValue(error);

            await action();

            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/releases/latest',
                expect.objectContaining({ owner: org, repo }),
            );
            expect(core.setOutput).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`can't find latest version for ${repo}`);
        });
    });

    describe('action: create-asana-task', () => {
        const taskName = 'My New Asana Task';
        const taskDescription = 'Detailed description here.';

        it('should create a basic task in a project', async () => {
            mockGetInput({
                action: 'create-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-task-name': taskName,
                'asana-task-description': taskDescription,
            });

            await action();

            expect(mockAsanaClient.tasks.getTasksForSection).not.toHaveBeenCalled(); // No section provided
            expect(mockAsanaClient.tasks.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: taskName,
                        notes: taskDescription,
                        projects: [mockAsanaProject],
                        tags: [],
                        followers: [],
                    }),
                }),
                {},
            );
            expect(core.setOutput).toHaveBeenCalledWith('taskId', mockAsanaCreatedTask.gid);
            expect(core.setOutput).toHaveBeenCalledWith('duplicate', false);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should create a task with tags, collaborators, assignee, and custom fields', async () => {
            const customFields = JSON.stringify({ 12345: 'field_value' });
            mockGetInput({
                action: 'create-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-task-name': taskName,
                'asana-task-description': taskDescription,
                'asana-tags': `${mockAsanaTagId}, tag-xyz`,
                'asana-collaborators': `${mockAsanaCollaboratorId}, collab-abc`,
                'asana-task-assignee': mockAsanaUserId,
                'asana-task-custom-fields': customFields,
            });

            await action();

            expect(mockAsanaClient.tasks.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: taskName,
                        notes: taskDescription,
                        projects: [mockAsanaProject],
                        tags: [mockAsanaTagId, 'tag-xyz'],
                        followers: [mockAsanaCollaboratorId, 'collab-abc'],
                        assignee: mockAsanaUserId,
                        custom_fields: { 12345: 'field_value' },
                    }),
                }),
                {},
            );
            expect(core.setOutput).toHaveBeenCalledWith('taskId', mockAsanaCreatedTask.gid);
            expect(core.setOutput).toHaveBeenCalledWith('duplicate', false);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should create a task in a specific section if no duplicate exists', async () => {
            mockGetInput({
                action: 'create-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-section': mockAsanaSection,
                'asana-task-name': taskName,
                'asana-task-description': taskDescription,
            });
            // Ensure findTaskInSection returns no existing task
            mockAsanaClient.tasks.getTasksForSection.mockResolvedValue({ data: [] });

            await action();

            expect(mockAsanaClient.tasks.getTasksForSection).toHaveBeenCalledWith(mockAsanaSection);
            expect(mockAsanaClient.tasks.createTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: taskName,
                        projects: [mockAsanaProject], // Projects still needed
                        memberships: [{ project: mockAsanaProject, section: mockAsanaSection }],
                    }),
                }),
                {},
            );
            expect(core.setOutput).toHaveBeenCalledWith('taskId', mockAsanaCreatedTask.gid);
            expect(core.setOutput).toHaveBeenCalledWith('duplicate', false);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should not create a task if a duplicate exists in the section', async () => {
            mockGetInput({
                action: 'create-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-project': mockAsanaProject,
                'asana-section': mockAsanaSection,
                'asana-task-name': taskName, // Same name as existing
                'asana-task-description': taskDescription,
            });
            // Ensure findTaskInSection returns an existing task
            mockAsanaClient.tasks.getTasksForSection.mockResolvedValue({
                data: [{ name: taskName, gid: 'existing-123' }],
            });

            await action();

            expect(mockAsanaClient.tasks.getTasksForSection).toHaveBeenCalledWith(mockAsanaSection);
            expect(mockAsanaClient.tasks.createTask).not.toHaveBeenCalled();
            expect(core.setOutput).toHaveBeenCalledWith('taskId', 'existing-123');
            expect(core.setOutput).toHaveBeenCalledWith('duplicate', true);
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: add-task-pr-description', () => {
        const org = 'pr-org';
        const repo = 'pr-repo';
        const prNumber = '99';
        const taskId = 'task-for-pr';

        it('should fetch PR body and prepend Asana task link', async () => {
            mockGetInput({
                action: 'add-task-pr-description',
                'github-pat': 'mock-github-pat',
                'github-org': org,
                'github-repository': repo,
                'github-pr': prNumber,
                'asana-project': mockAsanaProject,
                'asana-task-id': taskId,
            });
            // Mock the GET request first
            mockOctokitRequest.mockResolvedValueOnce(mockGithubPrData); // For GET
            // .mockResolvedValueOnce({}); // For PATCH (default is already this)

            await action();

            // Verify GET call
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/pulls/{pull_number}',
                expect.objectContaining({
                    owner: org,
                    repo,
                    pull_number: prNumber,
                }),
            );

            // Allow promises to resolve
            await Promise.resolve();

            // Verify PATCH call
            const expectedBody = `Task/Issue URL: https://app.asana.com/0/${mockAsanaProject}/${taskId}/f \n\n ----- \n${mockGithubPrData.data.body}`;
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PATCH /repos/{owner}/{repo}/pulls/{pull_number}',
                expect.objectContaining({
                    owner: org,
                    repo,
                    pull_number: prNumber,
                    body: expectedBody,
                }),
            );
            expect(core.setFailed).not.toHaveBeenCalled();
        });
    });

    describe('action: get-asana-user-id', () => {
        const ghUser = 'test-user';

        it('should get Asana user ID from map using input username', async () => {
            mockGetInput({
                action: 'get-asana-user-id',
                'github-pat': 'mock-github-pat',
                'github-username': ghUser,
            });
            // yaml.load already mocked to return mockUserMap

            await action();

            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/user_map.yml',
                expect.objectContaining({
                    owner: 'duckduckgo',
                    repo: 'internal-github-asana-utils',
                }),
            );
            expect(yaml.load).toHaveBeenCalled();
            expect(core.setOutput).toHaveBeenCalledWith('asanaUserId', mockUserMap[ghUser]);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should get Asana user ID from map using context username if input omitted', async () => {
            mockGetInput({
                action: 'get-asana-user-id',
                'github-pat': 'mock-github-pat',
                // No github-username input
            });
            // Context payload already has pull_request.user.login = 'test-user'

            await action();

            expect(mockOctokitRequest).toHaveBeenCalled();
            expect(yaml.load).toHaveBeenCalled();
            expect(core.setOutput).toHaveBeenCalledWith('asanaUserId', mockUserMap['test-user']);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if user not found in map', async () => {
            const unknownUser = 'unknown-gh-user';
            mockGetInput({
                action: 'get-asana-user-id',
                'github-pat': 'mock-github-pat',
                'github-username': unknownUser,
            });

            await action();

            expect(mockOctokitRequest).toHaveBeenCalled();
            expect(yaml.load).toHaveBeenCalled();
            expect(core.setOutput).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`User ${unknownUser} not found in user map`);
        });

        it('should fail if GitHub request fails', async () => {
            mockGetInput({
                action: 'get-asana-user-id',
                'github-pat': 'mock-github-pat',
                'github-username': 'test-user',
            });
            const error = new Error('API Error');
            mockOctokitRequest.mockRejectedValue(error);

            await action();

            expect(mockOctokitRequest).toHaveBeenCalled();
            expect(yaml.load).not.toHaveBeenCalled();
            expect(core.setOutput).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(error);
        });
    });

    describe('action: find-asana-task-id', () => {
        it('should find the first Asana task ID based on trigger phrase', async () => {
            mockGetInput({
                action: 'find-asana-task-id',
                'trigger-phrase': 'Closes', // Matches first link
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '2222');
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should find the first Asana task ID with project context', async () => {
            mockGetInput({
                action: 'find-asana-task-id',
                'trigger-phrase': 'Fixes', // Matches second link
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('asanaTaskId', '3333');
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if no task ID is found', async () => {
            mockGetInput({
                action: 'find-asana-task-id',
                'trigger-phrase': 'NonExistentPhrase',
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`Can't find an Asana task with the expected prefix`);
        });
    });

    describe('action: find-asana-task-ids', () => {
        it('should find all Asana task IDs based on trigger phrase', async () => {
            mockGetInput({
                action: 'find-asana-task-ids',
                'trigger-phrase': '', // Match all
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '2222,3333,4444');
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should find specific Asana task IDs based on trigger phrase', async () => {
            mockGetInput({
                action: 'find-asana-task-ids',
                'trigger-phrase': 'Fixes', // Matches only the second link
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).toHaveBeenCalledWith('asanaTaskIds', '3333');
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if no task IDs are found', async () => {
            mockGetInput({
                action: 'find-asana-task-ids',
                'trigger-phrase': 'NonExistentPhrase',
            });
            github.context.payload.issue = undefined;

            await action();

            expect(core.setOutput).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`Can't find any Asana tasks with the expected prefix`);
        });
    });

    describe('action: post-comment-asana-task', () => {
        const taskIds = 'task1, task2, task3';
        const comment = 'This is a test comment.';

        it('should post an unpinned comment to multiple tasks', async () => {
            mockGetInput({
                action: 'post-comment-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': taskIds,
                'asana-task-comment': comment,
                'asana-task-comment-pinned': 'false', // or omitted
            });

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(3);
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task1', { text: comment, is_pinned: false });
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task2', { text: comment, is_pinned: false });
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task3', { text: comment, is_pinned: false });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should post a pinned comment to multiple tasks', async () => {
            mockGetInput({
                action: 'post-comment-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': taskIds,
                'asana-task-comment': comment,
                'asana-task-comment-pinned': 'true',
            });

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(3);
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task1', { text: comment, is_pinned: true });
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task2', { text: comment, is_pinned: true });
            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledWith('task3', { text: comment, is_pinned: true });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if no task IDs are provided', async () => {
            mockGetInput({
                action: 'post-comment-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': '',
                'asana-task-comment': comment,
            });

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith('No valid task IDs provided');
        });

        it('should fail if any comment post fails', async () => {
            mockGetInput({
                action: 'post-comment-asana-task',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': taskIds,
                'asana-task-comment': comment,
            });
            // Mock one call to fail (resolve with null as per source code check)
            mockAsanaClient.stories.createStoryForTask
                .mockResolvedValueOnce(mockAsanaStory) // Success
                .mockResolvedValueOnce(null) // Failure!
                .mockResolvedValueOnce(mockAsanaStory); // Success

            await action();

            expect(mockAsanaClient.stories.createStoryForTask).toHaveBeenCalledTimes(3);
            expect(core.setFailed).toHaveBeenCalledWith('Failed to post comments to one or more Asana tasks');
        });
    });

    describe('action: send-mattermost-message', () => {
        const channelName = 'test-channel';
        const message = 'Hello Mattermost!';

        it('should send a message to the specified channel', async () => {
            mockGetInput({
                action: 'send-mattermost-message',
                'mattermost-token': 'mock-mm-token',
                'mattermost-channel-name': channelName,
                'mattermost-message': message,
                'mattermost-team-id': mockMattermostTeamId,
            });

            await action();

            expect(Client4).toHaveBeenCalled();
            expect(mockMattermostClientInstance.setUrl).toHaveBeenCalledWith('https://chat.duckduckgo.com');
            expect(mockMattermostClientInstance.setToken).toHaveBeenCalledWith('mock-mm-token');
            expect(mockMattermostClientInstance.getChannelByName).toHaveBeenCalledWith(mockMattermostTeamId, channelName);
            expect(mockMattermostClientInstance.createPost).toHaveBeenCalledWith({
                channel_id: mockMattermostChannel.id,
                message,
            });
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if the channel is not found', async () => {
            mockGetInput({
                action: 'send-mattermost-message',
                'mattermost-token': 'mock-mm-token',
                'mattermost-channel-name': channelName,
                'mattermost-message': message,
                'mattermost-team-id': mockMattermostTeamId,
            });
            mockMattermostClientInstance.getChannelByName.mockResolvedValue(null); // Channel not found

            await action();

            expect(mockMattermostClientInstance.getChannelByName).toHaveBeenCalledWith(mockMattermostTeamId, channelName);
            expect(mockMattermostClientInstance.createPost).not.toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`Channel "${channelName}" not found.`);
        });

        it('should fail if sending the message fails', async () => {
            mockGetInput({
                action: 'send-mattermost-message',
                'mattermost-token': 'mock-mm-token',
                'mattermost-channel-name': channelName,
                'mattermost-message': message,
                'mattermost-team-id': mockMattermostTeamId,
            });
            const error = new Error('MM API Error');
            mockMattermostClientInstance.createPost.mockRejectedValue(error);

            await action();

            expect(mockMattermostClientInstance.getChannelByName).toHaveBeenCalled();
            expect(mockMattermostClientInstance.createPost).toHaveBeenCalled();
            expect(core.setFailed).toHaveBeenCalledWith(`Error sending message`);
        });
    });

    describe('action: get-asana-task-permalink', () => {
        const taskId = 'task-to-link';

        it('should get the permalink for a task', async () => {
            mockGetInput({
                action: 'get-asana-task-permalink',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': taskId,
            });
            // Ensure getTask returns the mock task with a permalink
            mockAsanaClient.tasks.getTask.mockResolvedValue({
                ...mockAsanaTask,
                gid: taskId, // Match requested ID
                permalink_url: `https://app.asana.com/0/${mockAsanaProject}/${taskId}/f`,
            });

            await action();

            expect(mockAsanaClient.tasks.getTask).toHaveBeenCalledWith(taskId);
            expect(core.setOutput).toHaveBeenCalledWith('asanaTaskPermalink', `https://app.asana.com/0/${mockAsanaProject}/${taskId}/f`);
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should fail if getting the task fails', async () => {
            mockGetInput({
                action: 'get-asana-task-permalink',
                'asana-pat': 'mock-asana-pat',
                'asana-task-id': taskId,
            });
            const error = { value: { errors: [{ message: 'Not Found' }] } }; // Simulate Asana error structure
            mockAsanaClient.tasks.getTask.mockRejectedValue(error);

            await action();

            expect(mockAsanaClient.tasks.getTask).toHaveBeenCalledWith(taskId);
            expect(core.setOutput).not.toHaveBeenCalled();
            // Check that setFailed was called with a string containing the task ID and the stringified error
            expect(core.setFailed).toHaveBeenCalledWith(`Failed to retrieve task ${taskId}:`, JSON.stringify(error));
        });
    });

    describe('Invalid Action', () => {
        it('should fail for an unknown action', async () => {
            const unknownAction = 'unknown-action-name';
            mockGetInput({ action: unknownAction });

            await action();

            expect(core.setFailed).toHaveBeenCalledWith(`unexpected action ${unknownAction}`);
        });
    });
});
