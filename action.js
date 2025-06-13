const core = require('@actions/core');
const github = require('@actions/github');
const octokit = require('@octokit/core');
const asana = require('asana');
const yaml = require('js-yaml');
const { Client4 } = require('@mattermost/client');

function buildAsanaClient() {
    const asanaPAT = core.getInput('asana-pat');

    // Use v3 API pattern
    const client = asana.ApiClient.instance;
    const token = client.authentications.token;
    token.accessToken = asanaPAT;

    // Add default headers for v3 API
    client.defaultHeaders['asana-enable'] = 'new-sections,string_ids';

    // Return an object that mimics the v1 API structure for backward compatibility
    return {
        tasks: new asana.TasksApi(),
        stories: new asana.StoriesApi(),
        sections: new asana.SectionsApi(),
        users: new asana.UsersApi(),
    };
}

function buildGithubClient(githubPAT) {
    return new octokit.Octokit({
        auth: githubPAT,
    });
}

function buildMattermostClient() {
    const mattermostToken = core.getInput('mattermost-token');
    const mattermostUrl = 'https://chat.duckduckgo.com';

    const client = new Client4();
    client.setUrl(mattermostUrl);
    client.setToken(mattermostToken);

    return client;
}

function getArrayFromInput(input) {
    return input
        ? input
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item !== '')
        : [];
}

function findAsanaTasks() {
    const triggerPhrase = core.getInput('trigger-phrase');
    const pullRequest = github.context.payload.pull_request;
    const regexString = `${triggerPhrase}\\s*https:\\/\\/app.asana.com\\/(\\d+)\\/((\\d+)\\/)?(project\\/)?(?<project>\\d+)(\\/task)?\\/(?<task>\\d+).*?`;
    const specifiedProjectId = core.getInput('asana-project');
    const regex = new RegExp(regexString, 'g');

    console.info('Looking for asana task link in body:\n', pullRequest.body, 'regex:\n', regexString);
    const foundTasks = [];
    let parseAsanaUrl;
    while ((parseAsanaUrl = regex.exec(pullRequest.body)) !== null) {
        const taskId = parseAsanaUrl.groups.task;
        const projectId = parseAsanaUrl.groups.project;

        if (!taskId) {
            core.error(`Invalid Asana task URL${triggerPhrase ? ` after trigger-phrase ${triggerPhrase}` : ''}`);
            continue;
        }

        if (specifiedProjectId && specifiedProjectId !== projectId) {
            console.info(`Skipping ${taskId} as it is not in project ${specifiedProjectId}`);
            continue;
        }

        foundTasks.push(taskId);
    }
    console.info(`found ${foundTasks.length} tasksIds:`, foundTasks.join(','));
    return foundTasks;
}

async function createStory(client, taskId, text, isPinned) {
    try {
        return await client.stories.createStoryForTask(taskId, {
            text,
            is_pinned: isPinned,
        });
    } catch (error) {
        console.error('rejecting promise', error);
    }
}

async function createTaskWithComment(client, name, description, comment, projectId) {
    try {
        client.tasks.createTask({ name, notes: description, projects: [projectId], pretty: true }).then((result) => {
            console.log('task created', result.gid);
            return createStory(client, result.gid, comment, true);
        });
    } catch (error) {
        console.error('rejecting promise', error);
    }
}

async function createIssueTask() {
    const client = await buildAsanaClient();
    const issue = github.context.payload.issue;
    const asanaProjectId = core.getInput('asana-project', { required: true });

    console.info('creating asana task from issue', issue.title);

    const taskDescription = `Description: ${issue.body}`;
    const taskName = `Github Issue: ${issue.title}`;
    const taskComment = `Link to Issue: ${issue.html_url}`;

    return createTaskWithComment(client, taskName, taskDescription, taskComment, asanaProjectId);
}

async function notifyPRApproved() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const taskComment = `PR: ${pullRequest.html_url} has been approved`;

    const foundTasks = findAsanaTasks();

    const comments = [];
    for (const taskId of foundTasks) {
        const comment = createStory(client, taskId, taskComment, false);
        comments.push(comment);
    }
    return comments;
}

async function addTaskToAsanaProject() {
    const client = await buildAsanaClient();

    const projectId = core.getInput('asana-project', { required: true });
    const sectionId = core.getInput('asana-section');
    const taskIds = getArrayFromInput(core.getInput('asana-task-id', { required: true }));

    if (taskIds.length === 0) {
        core.setFailed(`No valid task IDs provided`);
        return;
    }

    for (const taskId of taskIds) {
        console.info(`Adding task ${taskId} to project ${projectId}`);
        await addTaskToProject(client, taskId, projectId, sectionId);
    }
}

async function addTaskToProject(client, taskId, projectId, sectionId) {
    if (!sectionId) {
        console.info('adding asana task to project', projectId);
        try {
            return await client.tasks.addProjectForTask(taskId, {
                project: projectId,
                insert_after: null,
            });
        } catch (error) {
            console.error('rejecting promise', error);
        }
    } else {
        console.info(`adding asana task to top of section ${sectionId} in project ${projectId}`);
        try {
            return await client.tasks
                .addProjectForTask(taskId, {
                    project: projectId,
                })
                .then((result) => {
                    client.sections.addTaskForSection(sectionId, { task: taskId }).then((result) => {
                        console.log(result);
                    });
                });
        } catch (error) {
            console.error('rejecting promise', error);
        }
    }
}

async function addCommentToPRTask() {
    const pullRequest = github.context.payload.pull_request;
    const taskComment = `PR: ${pullRequest.html_url}`;
    const isPinned = core.getInput('is-pinned') === 'true';

    const client = await buildAsanaClient();

    const foundTasks = findAsanaTasks();

    const comments = [];
    for (const taskId of foundTasks) {
        const comment = createStory(client, taskId, taskComment, isPinned);
        comments.push(comment);
    }
    return comments;
}

async function createPullRequestTask() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const asanaProjectId = core.getInput('asana-project', { required: true });

    console.info('creating asana task from pull request', pullRequest.title);

    const taskDescription = `Description: ${pullRequest.body}`;
    const taskName = `Community Pull Request: ${pullRequest.title}`;
    const taskComment = `Link to Pull Request: ${pullRequest.html_url}`;

    return createTaskWithComment(client, taskName, taskDescription, taskComment, asanaProjectId);
}

async function completePRTask() {
    const client = await buildAsanaClient();
    const isComplete = core.getInput('is-complete') === 'true';

    const foundTasks = findAsanaTasks();

    const taskIds = [];
    for (const taskId of foundTasks) {
        console.info('marking task', taskId, isComplete ? 'complete' : 'incomplete');
        try {
            await client.tasks.update(taskId, {
                completed: isComplete,
            });
        } catch (error) {
            console.error('rejecting promise', error);
        }
        taskIds.push(taskId);
    }
    return taskIds;
}

async function checkPRMembership() {
    const pullRequest = github.context.payload.pull_request;
    const org = pullRequest.base.repo.owner.login;
    const user = pullRequest.user.login;
    const head = pullRequest.head.user.login;

    console.info(`PR opened/reopened by ${user}, checking membership in ${org}`);
    if (head === org) {
        console.log(user, `belongs to duckduckgo}`);
        core.setOutput('external', false);
    } else {
        console.log(user, `does not belong to duckduckgo}`);
        core.setOutput('external', true);
    }
}

async function getLatestRepositoryRelease() {
    const githubPAT = core.getInput('github-pat', { required: true });
    const githubClient = buildGithubClient(githubPAT);
    const org = core.getInput('github-org', { required: true });
    const repo = core.getInput('github-repository', { required: true });

    try {
        await githubClient
            .request('GET /repos/{owner}/{repo}/releases/latest', {
                owner: org,
                repo,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            })
            .then((response) => {
                const version = response.data.tag_name;
                console.log(repo, `latest version is ${version}`);
                core.setOutput('version', version);
            });
    } catch (error) {
        console.log(repo, `can't find latest version ${error}`);
        core.setFailed(`can't find latest version for ${repo}`);
    }
}

async function findTaskInSection(client, sectionId, name) {
    let existingTaskId = '0';
    try {
        console.log('searching tasks in section', sectionId);
        await client.tasks.getTasksForSection(sectionId).then((result) => {
            const task = result.data.find((task) => task.name === name);
            if (!task) {
                console.log('task not found');
                existingTaskId = '0';
            } else {
                console.info('task found', task.gid);
                existingTaskId = task.gid;
            }
        });
    } catch (error) {
        console.error('rejecting promise', error);
    }
    return existingTaskId;
}

async function createTask(
    client,
    name,
    description,
    projectId,
    sectionId = '',
    tags = [],
    collaborators = [],
    assignee = '',
    customFields = '',
) {
    const taskOpts = {
        name,
        notes: description,
        projects: [projectId],
        tags,
        followers: collaborators,
        pretty: true,
    };

    if (assignee) {
        taskOpts.assignee = assignee;
    }

    if (customFields) {
        try {
            taskOpts.custom_fields = JSON.parse(customFields);
        } catch (error) {
            console.error(`Invalid custom fields JSON: ${customFields}`);
        }
    }

    if (sectionId) {
        console.log('checking for duplicate task before creating a new one', name);
        const existingTaskId = await findTaskInSection(client, sectionId, name);
        if (existingTaskId !== '0') {
            console.log('task already exists, skipping');
            core.setOutput('taskId', existingTaskId);
            core.setOutput('duplicate', true);
            return existingTaskId;
        }

        taskOpts.memberships = [{ project: projectId, section: sectionId }];
    }

    console.log(`creating new task with options:='${JSON.stringify(taskOpts)}'`);
    let createdTaskId = '0';
    try {
        await client.tasks.createTask(taskOpts).then((result) => {
            createdTaskId = result.gid;
            console.log('task created', createdTaskId);
            core.setOutput('taskId', createdTaskId);
            core.setOutput('duplicate', false);
        });
    } catch (error) {
        console.error('rejecting promise', JSON.stringify(error));
    }
    return createdTaskId;
}

async function createAsanaTask() {
    const client = await buildAsanaClient();

    const projectId = core.getInput('asana-project', { required: true });
    const sectionId = core.getInput('asana-section');
    const taskName = core.getInput('asana-task-name', { required: true });
    const taskDescription = core.getInput('asana-task-description', { required: true });
    const tags = getArrayFromInput(core.getInput('asana-tags'));
    const collaborators = getArrayFromInput(core.getInput('asana-collaborators'));
    const assignee = core.getInput('asana-task-assignee');
    const customFields = core.getInput('asana-task-custom-fields');

    return createTask(client, taskName, taskDescription, projectId, sectionId, tags, collaborators, assignee, customFields);
}

async function addTaskPRDescription() {
    const githubPAT = core.getInput('github-pat');
    const githubClient = buildGithubClient(githubPAT);
    const org = core.getInput('github-org', { required: true });
    const repo = core.getInput('github-repository', { required: true });
    const pr = core.getInput('github-pr', { required: true });
    const projectId = core.getInput('asana-project', { required: true });
    const taskId = core.getInput('asana-task-id', { required: true });

    githubClient
        .request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
            owner: org,
            repo,
            pull_number: pr,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28',
            },
        })
        .then((response) => {
            console.log(response.data.body);
            const body = response.data.body;
            const asanaTaskMessage = `Task/Issue URL: https://app.asana.com/0/${projectId}/${taskId}/f`;
            const updatedBody = `${asanaTaskMessage} \n\n ----- \n${body}`;

            githubClient
                .request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
                    owner: org,
                    repo,
                    pull_number: pr,
                    body: updatedBody,
                    headers: {
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                })
                .catch((error) => core.error(error));
        });
}

async function getAsanaUserID() {
    const ghUsername = core.getInput('github-username') || github.context.payload.pull_request.user.login;
    const githubPAT = core.getInput('github-pat', { required: true });
    const githubClient = buildGithubClient(githubPAT);
    const org = 'duckduckgo';
    const repo = 'internal-github-asana-utils';

    console.log(`Looking up Asana user ID for ${ghUsername}`);
    try {
        await githubClient
            .request('GET /repos/{owner}/{repo}/contents/user_map.yml', {
                owner: org,
                repo,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28',
                    Accept: 'application/vnd.github.raw+json',
                },
            })
            .then((response) => {
                const userMap = yaml.load(response.data);
                if (ghUsername in userMap) {
                    core.setOutput('asanaUserId', userMap[ghUsername]);
                } else {
                    core.setFailed(`User ${ghUsername} not found in user map`);
                }
            });
    } catch (error) {
        core.setFailed(error);
    }
}

async function findAsanaTaskId() {
    const foundTasks = findAsanaTasks();

    if (foundTasks.length > 0) {
        core.setOutput('asanaTaskId', foundTasks[0]);
    } else {
        core.setFailed(`Can't find an Asana task with the expected prefix`);
    }
}

async function getTaskPermalink() {
    const asanaTaskId = core.getInput('asana-task-id', { required: true });
    const client = await buildAsanaClient();

    console.log('Getting permalink for task', asanaTaskId);
    try {
        const task = await client.tasks.getTask(asanaTaskId);
        if (task) {
            core.setOutput('asanaTaskPermalink', task.permalink_url);
            console.log(`Task permalink: ${task.permalink_url}`);
        }
    } catch (error) {
        core.setFailed(`Failed to retrieve task ${asanaTaskId}:`, JSON.stringify(error));
    }
}

async function findAsanaTaskIds() {
    const foundTasks = findAsanaTasks();

    if (foundTasks.length > 0) {
        core.setOutput('asanaTaskIds', foundTasks.join(','));
    } else {
        core.setFailed(`Can't find any Asana tasks with the expected prefix`);
    }
}

async function postCommentAsanaTask() {
    const client = await buildAsanaClient();

    const taskIds = getArrayFromInput(core.getInput('asana-task-id'));
    const taskComment = core.getInput('asana-task-comment');
    const isPinned = core.getInput('asana-task-comment-pinned') === 'true';

    if (taskIds.length === 0) {
        core.setFailed(`No valid task IDs provided`);
        return;
    }

    let success = true;
    for (const taskId of taskIds) {
        console.info(`Adding comment to Asana task ${taskId}`);
        const comment = await createStory(client, taskId, taskComment, isPinned);
        if (comment == null) {
            console.error(`Failed to add comment to task ${taskId}`);
            success = false;
        }
    }

    if (success) {
        console.info(`Comments added to ${taskIds.length} Asana task(s)`);
    } else {
        core.setFailed(`Failed to post comments to one or more Asana tasks`);
    }
}

async function sendMessage(client, channelId, message) {
    try {
        const response = await client.createPost({
            channel_id: channelId,
            message,
        });
        console.log('Message sent:', response);
    } catch (error) {
        core.setFailed(`Error sending message`);
    }
}

async function sendMattermostMessage() {
    const channelName = core.getInput('mattermost-channel-name');
    const message = core.getInput('mattermost-message');
    const teamId = core.getInput('mattermost-team-id');

    const client = buildMattermostClient();

    const channel = await client.getChannelByName(teamId, channelName);
    if (channel) {
        console.log(`Channel "${channel.id}" found.`);
        await sendMessage(client, channel.id, message);
    } else {
        core.setFailed(`Channel "${channelName}" not found.`);
    }
}

async function action() {
    const action = core.getInput('action', { required: true });
    console.info('calling', action);

    switch (action) {
        case 'create-asana-issue-task': {
            await createIssueTask();
            break;
        }
        case 'notify-pr-approved': {
            await notifyPRApproved();
            break;
        }
        case 'notify-pr-merged': {
            await completePRTask();
            break;
        }
        case 'check-pr-membership': {
            await checkPRMembership();
            break;
        }
        case 'add-asana-comment': {
            await addCommentToPRTask();
            break;
        }
        case 'add-task-asana-project': {
            await addTaskToAsanaProject();
            break;
        }
        case 'create-asana-pr-task': {
            await createPullRequestTask();
            break;
        }
        case 'get-latest-repo-release': {
            await getLatestRepositoryRelease();
            break;
        }
        case 'create-asana-task': {
            await createAsanaTask();
            break;
        }
        case 'add-task-pr-description': {
            await addTaskPRDescription();
            break;
        }
        case 'get-asana-user-id': {
            await getAsanaUserID();
            break;
        }
        case 'find-asana-task-id': {
            await findAsanaTaskId();
            break;
        }
        case 'find-asana-task-ids': {
            await findAsanaTaskIds();
            break;
        }
        case 'post-comment-asana-task': {
            await postCommentAsanaTask();
            break;
        }
        case 'send-mattermost-message': {
            await sendMattermostMessage();
            break;
        }
        case 'get-asana-task-permalink': {
            await getTaskPermalink();
            break;
        }
        default:
            core.setFailed(`unexpected action ${action}`);
    }
}

module.exports = {
    action,
    default: action,
};
