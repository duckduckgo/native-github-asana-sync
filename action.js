const core = require('@actions/core');
const github = require('@actions/github');
const octokit = require('@octokit/core');
const asana = require('asana');
const yaml = require('js-yaml');
const { Client4 } = require('@mattermost/client');

function buildAsanaClient() {
    const ASANA_PAT = core.getInput('asana-pat');
    return asana.Client.create({
        defaultHeaders: { 'asana-enable': 'new-sections,string_ids' },
        logAsanaChangeWarnings: false
    }).useAccessToken(ASANA_PAT).authorize();
}

function buildGithubClient(githubPAT){
    return new octokit.Octokit({
        auth: githubPAT
      })
}

function buildMattermostClient(){
    const MATTERMOST_TOKEN = core.getInput('mattermost-token');
    const MATTERMOST_URL = 'https://chat.duckduckgo.com';

    const client = new Client4();
    client.setUrl(MATTERMOST_URL);
    client.setToken(MATTERMOST_TOKEN);

    return client
}

function getArrayFromInput(input) {
    return input ? input.split(',') : [];
}

function findAsanaTasks(){
    const
        TRIGGER_PHRASE = core.getInput('trigger-phrase'),
        PULL_REQUEST = github.context.payload.pull_request,
        REGEX_STRING = `${TRIGGER_PHRASE} https:\\/\\/app.asana.com\\/(\\d+)\\/(?<project>\\d+)\\/(?<task>\\d+).*?`,
        REGEX = new RegExp(REGEX_STRING, 'g');
 
    console.info('looking for asana task link in body', PULL_REQUEST.body, 'regex', REGEX_STRING);
    let foundTasks = [];
    while((parseAsanaUrl = REGEX.exec(PULL_REQUEST.body)) !== null) {
        const taskId = parseAsanaUrl.groups.task;
        if (!taskId) {
            core.error(`Invalid Asana task URL after trigger-phrase ${TRIGGER_PHRASE}`);
            continue;
        }
        foundTasks.push(taskId);
    }
    console.info(`found ${foundTasks.length} tasksIds:`, foundTasks.join(','));
    return foundTasks
}

async function createStory(client, taskId, text, isPinned) {
    try {
        return await client.stories.createStoryForTask(taskId, {
            text: text,
            is_pinned: isPinned,
        });
    } catch (error) {
        console.error('rejecting promise', error);
    }
}

async function createTaskWithComment(client, name, description, comment, projectId) {
    try {
        client.tasks.createTask({name: name, 
            notes: description, 
            projects: [projectId],        
            pretty: true})
            .then((result) => {
                console.log('task created', result.gid);
                return createStory(client, result.gid, comment, true)
            })
    } catch (error) {
        console.error('rejecting promise', error);
    }
}

async function createIssueTask(){
    const client = await buildAsanaClient();
    const ISSUE = github.context.payload.issue;
    const ASANA_PROJECT_ID = core.getInput('asana-project', {required: true});

    console.info('creating asana task from issue', ISSUE.title);

    const TASK_DESCRIPTION = `Description: ${ISSUE.body}`;
    const TASK_NAME = `Github Issue: ${ISSUE.title}`;
    const TASK_COMMENT = `Link to Issue: ${ISSUE.html_url}`;

    return createTaskWithComment(client, TASK_NAME, TASK_DESCRIPTION, TASK_COMMENT, ASANA_PROJECT_ID)
}


async function notifyPRApproved(){
    const client = await buildAsanaClient();
    const 
        PULL_REQUEST = github.context.payload.pull_request,
        TASK_COMMENT = `PR: ${PULL_REQUEST.html_url} has been approved`;

    const foundTasks = findAsanaTasks()

    const comments = [];
    for (const taskId of foundTasks) {
        const comment = createStory(client, taskId, TASK_COMMENT, false)
        comments.push(comment)
    }
    return comments;
}

async function addTaskToAsanaProject(){
    const client = await buildAsanaClient();

    const projectId = core.getInput('asana-project', {required: true});
    const sectionId = core.getInput('asana-section');
    const taskId = core.getInput('asana-task-id', {required: true});

    addTaskToProject(client, taskId, projectId, sectionId)     
}

async function addTaskToProject(client, taskId, projectId, sectionId){
    if (!sectionId){
        console.info('adding asana task to project', projectId);
        try {
            return await client.tasks.addProjectForTask(taskId, {
                project: projectId,        
                insert_after: null
            });
        } catch (error) {
            console.error('rejecting promise', error);
        }
    } else {
        console.info(`adding asana task to top of section ${sectionId} in project ${projectId}`);
        try {
            return await client.tasks.addProjectForTask(taskId, {
                project: projectId                
            })
            .then((result) => {
                client.sections.addTaskForSection(sectionId, {task: taskId})
                .then((result) => {
                    console.log(result);
                });
            });
        } catch (error) {
            console.error('rejecting promise', error);
        }
    }
}

async function addCommentToPRTask(){
    const 
        PULL_REQUEST = github.context.payload.pull_request,
        TASK_COMMENT = `PR: ${PULL_REQUEST.html_url}`,
        isPinned = core.getInput('is-pinned') === 'true';

    const client = await buildAsanaClient();

    const foundTasks = findAsanaTasks()

    const comments = [];
    for (const taskId of foundTasks) {
        const comment = createStory(client, taskId, TASK_COMMENT, isPinned)
        comments.push(comment)
    }
    return comments;
}

async function createPullRequestTask(){
    const client = await buildAsanaClient();
    const PULL_REQUEST = github.context.payload.pull_request;
    const ASANA_PROJECT_ID = core.getInput('asana-project', {required: true});

    console.info('creating asana task from pull request', PULL_REQUEST.title);

    const TASK_DESCRIPTION = `Description: ${PULL_REQUEST.body}`;
    const TASK_NAME = `Community Pull Request: ${PULL_REQUEST.title}`;
    const TASK_COMMENT = `Link to Pull Request: ${PULL_REQUEST.html_url}`;

    return createTaskWithComment(client, TASK_NAME, TASK_DESCRIPTION, TASK_COMMENT, ASANA_PROJECT_ID)
}

async function completePRTask(){
    const client = await buildAsanaClient();
    const isComplete = core.getInput('is-complete') === 'true';

    const foundTasks = findAsanaTasks()

    const taskIds = [];
    for(const taskId of foundTasks) {
        console.info("marking task", taskId, isComplete ? 'complete' : 'incomplete');
        try {
            await client.tasks.update(taskId, {
                completed: isComplete
            });
        } catch (error) {
            console.error('rejecting promise', error);
        }
        taskIds.push(taskId);
    }
    return taskIds;
}

async function checkPRMembership(){
    const 
        PULL_REQUEST = github.context.payload.pull_request,
        ORG = PULL_REQUEST.base.repo.owner.login,
        USER = PULL_REQUEST.user.login;
        HEAD = PULL_REQUEST.head.user.login

        console.info(`PR opened/reopened by ${USER}, checking membership in ${ORG}`); 
        if (HEAD === ORG){
            console.log(author, `belongs to duckduckgo}`)
            core.setOutput('external', false)
          } else {
            console.log(author, `does not belong to duckduckgo}`)
            core.setOutput('external', true)
          }          
}

async function getLatestRepositoryRelease(){
    const 
        GITHUB_PAT = core.getInput('github-pat', {required: true}),
        githubClient = buildGithubClient(GITHUB_PAT),
        ORG = core.getInput('github-org', {required: true}),
        REPO = core.getInput('github-repository', {required: true});
        
    try {
        await githubClient.request('GET /repos/{owner}/{repo}/releases/latest', {
            owner: ORG,
            repo: REPO,
            headers: {
            'X-GitHub-Api-Version': '2022-11-28'
            }
        }).then((response) => {
            const version = response.data.tag_name
            console.log(REPO, `latest version is ${version}`)
            core.setOutput('version', version)
        });
    } catch (error) {
        console.log(REPO, `can't find latest version ${error}`)
        core.setFailed(`can't find latest version for ${REPO}`);
    }
}

async function findTaskInSection(client, sectionId, name) {
    let existingTaskId = "0"
    try {
        console.log('searching tasks in section', sectionId);
        await client.tasks.getTasksForSection(sectionId).then((result) => {
            const task = result.data.find(task => task.name === name);
            if (!task){
                console.log("task not found")
                existingTaskId = "0"
            } else {
                console.info('task found', task.gid);
                existingTaskId = task.gid
            }            
        });
    } catch (error) {
        console.error('rejecting promise', error);
    }
    return existingTaskId
}

async function createTask(client, name, description, projectId, sectionId = '', tags = [], collaborators = []) {
    const taskOpts = {
        name: name, 
        notes: description, 
        projects: [projectId],
        tags,
        followers: collaborators,
        pretty: true
    };

    if (sectionId != '') {
        console.log('checking for duplicate task before creating a new one', name);
        let existingTaskId = await findTaskInSection(client, sectionId, name)
        if (existingTaskId != "0") {
            console.log("task already exists, skipping")
            core.setOutput('taskId', existingTaskId)
            core.setOutput('duplicate', true)
            return existingTaskId;
        }

        taskOpts.memberships = [{project: projectId, section: sectionId}];
    }

    console.log(`creating new task with options:='${JSON.stringify(taskOpts)}'`);
    let createdTaskId = "0"
    try {
        await client.tasks.createTask(taskOpts)
            .then((result) => {
                createdTaskId = result.gid
                console.log('task created', createdTaskId);
                core.setOutput('taskId', createdTaskId);
                core.setOutput('duplicate', false);
            })
    } catch (error) {
        console.error('rejecting promise', error);
    }
    return createdTaskId
}

async function createAsanaTask(){
    const client = await buildAsanaClient();

    const 
        projectId = core.getInput('asana-project', {required: true}),
        sectionId = core.getInput('asana-section'),
        taskName = core.getInput('asana-task-name', {required: true}),
        taskDescription = core.getInput('asana-task-description', {required: true}),
        tags = getArrayFromInput(core.getInput('asana-tags')),
        collaborators = getArrayFromInput(core.getInput('asana-collaborators'));

    return createTask(client, taskName, taskDescription, projectId, sectionId, tags, collaborators); 
}

async function addTaskPRDescription(){
    const 
        GITHUB_PAT = core.getInput('github-pat'),
        githubClient = buildGithubClient(GITHUB_PAT),
        ORG = core.getInput('github-org', {required: true}),
        REPO = core.getInput('github-repository', {required: true}),
        PR = core.getInput('github-pr', {required: true}),
        projectId = core.getInput('asana-project', {required: true}),
        taskId = core.getInput('asana-task-id', {required: true});   

        githubClient.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
            owner: ORG,
            repo: REPO,
            pull_number: PR,
            headers: {
            'X-GitHub-Api-Version': '2022-11-28'
            }
            }).then((response) => {
                console.log(response.data.body);
                const body = response.data.body;
                const asanaTaskMessage = `Task/Issue URL: https://app.asana.com/0/${projectId}/${taskId}/f`;        
                const updatedBody = `${asanaTaskMessage} \n\n ----- \n${body}`;
        
                githubClient.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
                    owner: ORG,
                    repo: REPO,
                    pull_number: PR,
                    body: updatedBody,
                    headers: {
                        'X-GitHub-Api-Version': '2022-11-28'
                        }
                    })
                    .catch((error) => core.error(error));
        
            });
      
}

async function getAsanaUserID() {
    const 
    ghUsername = core.getInput('github-username') || github.context.payload.pull_request.user.login,
    GITHUB_PAT = core.getInput('github-pat', {required: true}),
    githubClient = buildGithubClient(GITHUB_PAT),
    ORG = 'duckduckgo',
    REPO = 'internal-github-asana-utils';
    
    console.log(`Looking up Asana user ID for ${ghUsername}`);
    try {
        await githubClient.request('GET /repos/{owner}/{repo}/contents/user_map.yml', {
            owner: ORG,
            repo: REPO,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28',
                'Accept': 'application/vnd.github.raw+json'
            }
        }).then((response) => {
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

async function findAsanaTaskId(){
    const foundTasks = findAsanaTasks()

    if (foundTasks.length > 0) {
        core.setOutput('asanaTaskId', foundTasks[0]);
    } else {
        core.setFailed(`Can't find an Asana task with the expected prefix`);
    }
}

async function postCommentAsanaTask(){
    const client = await buildAsanaClient();

    const
        TASK_ID = core.getInput('asana-task-id'),
        TASK_COMMENT = core.getInput('asana-task-comment')
        IS_PINNED = core.getInput('asana-task-comment-pinned')

    const comment = createStory(client, TASK_ID, TASK_COMMENT, IS_PINNED)
    if (comment != null){
        console.info('Comment added to Asana task');
    } else {
        core.setFailed(`Can't post comment in Asana task`);
    }
   
}

async function sendMessage(client, channelId, message) {
    try {
        const response = await client.createPost({
            channel_id: channelId,
            message: message,
        });
        console.log('Message sent:', response);
    } catch (error) {
        console.error('Error sending message:', error);
        process.exit(1);
    }
}

async function sendMattermostMessage(){
    const
        CHANNEL_NAME = core.getInput('mattermost-channel-name'),    
        MESSAGE = core.getInput('mattermost-message')
        TEAM_ID = core.getInput('mattermost-team-id')

    const client = buildMattermostClient()

    const channel = await client.getChannelByName(TEAM_ID, CHANNEL_NAME);
    if (channel) {
        console.log(`Channel "${channel.id}" found.`);
        await sendMessage(client, channel.id, MESSAGE);
    } else {
        console.log(`Channel "${CHANNEL_NAME}" not found.`);
        console.error(`Channel "${CHANNEL_NAME}" not found.`);
        process.exit(1);
    }
}

async function action() {
    const ACTION = core.getInput('action', {required: true});
    console.info('calling', ACTION);

    switch (ACTION) {
        case 'create-asana-issue-task': {
            createIssueTask();
            break;
        }
        case 'notify-pr-approved': {
            notifyPRApproved();
            break;
        }
        case 'notify-pr-merged': {
            completePRTask()
            break;
        }
        case 'check-pr-membership': {
            checkPRMembership();
            break;
        }
        case 'add-asana-comment': {
            addCommentToPRTask();
            break;
        }
        case 'add-task-asana-project': {
            addTaskToAsanaProject();
            break;
        }
        case 'create-asana-pr-task': {
            createPullRequestTask();
            break;
        }
        case 'get-latest-repo-release': {
            getLatestRepositoryRelease();
            break;
        }
        case 'create-asana-task': {
            createAsanaTask();
            break;
        }
        case 'add-task-pr-description': {
            addTaskPRDescription();
            break;
        }
        case 'get-asana-user-id': {
            getAsanaUserID();
            break;
        }
        case 'find-asana-task-id': {
            findAsanaTaskId();
            break;
        }
        case 'post-comment-asana-task': {
            postCommentAsanaTask();
            break;
        }
        case 'send-mattermost-message': {
            sendMattermostMessage();
            break;
        }
        default:
            core.setFailed(`unexpected action ${ACTION}`);
    }
}

module.exports = {
    action,
    default: action,
};
