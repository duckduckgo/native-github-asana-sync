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

/**
 * Return array of project GIDs configured to prevent auto-closing subtasks.
 */
function getNoAutocloseProjectList() {
    return getArrayFromInput(core.getInput('NO_AUTOCLOSE_PROJECTS') || '');
}

/**
 * Check whether a task belongs to any project in NO_AUTOCLOSE_PROJECTS.
 * Returns true if the task is in one of those projects, false otherwise.
 */
async function isTaskInNoAutocloseProjects(client, taskId) {
    const noAutocloseList = getNoAutocloseProjectList();
    if (!noAutocloseList || noAutocloseList.length === 0) return false;

    try {
        const resp = await client.tasks.getTask(taskId, { opt_fields: 'memberships.project.gid' });
        const memberships = (resp && resp.data && resp.data.memberships) || [];
        const projectIds = memberships.map(m => (m.project && m.project.gid) || null).filter(Boolean);
        return projectIds.some(id => noAutocloseList.includes(id));
    } catch (err) {
        console.warn(`Unable to inspect memberships for task ${taskId}: ${err.message}`);
        // Fail-open: if we can't determine membership, allow auto-close
        return false;
    }
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
        const body = {
            data: {
                text,
                is_pinned: isPinned,
            },
        };
        const opts = {};
        return await client.stories.createStoryForTask(body, taskId, opts);
    } catch (error) {
        console.error('rejecting promise', error);
    }
}

async function createSubtask(client, parentTaskId, subtaskId) {
    try {
        const body = {
            data: {
                parent: parentTaskId,
            },
        };
        const opts = {};
        return await client.tasks.updateTask(body, subtaskId, opts);
    } catch (error) {
        console.error('Error creating subtask relationship:', error);
        throw error;
    }
}

async function createTaskWithComment(client, name, description, comment, projectId) {
    try {
        const body = {
            data: {
                name,
                notes: description,
                is_rendered_as_separator: false,
                projects: [projectId],
            },
        };
        const opts = {};

        client.tasks.createTask(body, opts).then((result) => {
            console.log('task created', result.data.gid);
            return createStory(client, result.data.gid, comment, true);
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
            const body = {
                data: {
                    project: projectId,
                    insert_after: null,
                },
            };
            const opts = {};
            return await client.tasks.addProjectForTask(body, taskId, opts);
        } catch (error) {
            console.error('rejecting promise', error);
        }
    } else {
        console.info(`adding asana task to top of section ${sectionId} in project ${projectId}`);
        try {
            const body = {
                data: {
                    project: projectId,
                    section: sectionId,
                },
            };
            const opts = {};
            return await client.tasks.addProjectForTask(body, taskId, opts);
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

async function createPRTask() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const asanaProjectId = core.getInput('asana-project', { required: true });
    const asanaSectionId = core.getInput('asana-section');

    console.info('creating asana task for pull request', pullRequest.title);

    const taskName = pullRequest.title;
    
    // Create task description with prelude
    const prelude = `**Note:** This description is automatically updated from Github. **Changes will be LOST**.

PR: ${pullRequest.html_url}

`;
    const taskDescription = prelude + (pullRequest.body || 'No description provided');
    const tags = getArrayFromInput(core.getInput('asana-tags'));
    const collaborators = getArrayFromInput(core.getInput('asana-collaborators'));
    const assignee = core.getInput('asana-task-assignee');
    const customFields = core.getInput('asana-task-custom-fields');

    // Check for referenced Asana tasks in PR description
    const referencedTaskIds = findAsanaTasks();
    let parentTaskId = null;
    
    if (referencedTaskIds.length > 0) {
        parentTaskId = referencedTaskIds[0];
        console.info(`Found referenced Asana task ${parentTaskId}, creating PR task as subtask`);
    } else {
        console.info('No referenced Asana tasks found, creating standalone PR task');
    }

    // Get Asana user ID for PR author
    let prAuthorAsanaId = null;
    if (core.getInput('github-pat')) {
        prAuthorAsanaId = await getAsanaUserID(pullRequest.user.login);
    }

    // Add PR link as a comment
    const taskComment = `GitHub PR: ${pullRequest.html_url}`;

    const taskId = await createTask(
        client,
        taskName,
        taskDescription,
        asanaProjectId,
        asanaSectionId,
        tags,
        collaborators,
        prAuthorAsanaId || assignee, // Use PR author as assignee if found, otherwise use input assignee
        customFields
    );

    // If we found a referenced task, make this PR task a subtask
    if (taskId && taskId !== '0' && parentTaskId) {
        try {
            await createSubtask(client, parentTaskId, taskId);
            console.info(`Created PR task ${taskId} as subtask of ${parentTaskId}`);
        } catch (error) {
            console.error(`Failed to create subtask relationship: ${error.message}`);
            // Continue execution - the task was still created successfully
        }
    }

    // Add PR link as a comment to the created task
    if (taskId && taskId !== '0') {
        await createStory(client, taskId, taskComment, true);
        core.setOutput('asanaTaskId', taskId);
        if (parentTaskId) {
            core.setOutput('parentTaskId', parentTaskId);
        }
        console.info(`Created Asana task ${taskId} for PR ${pullRequest.number}`);
    }

    return taskId;
}

async function updatePRTask() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const asanaProjectId = core.getInput('asana-project', { required: true });

    console.info('updating asana task for pull request', pullRequest.title);

    // Find the Asana task for this PR by looking for the PR URL in task comments
    const taskId = await findPRTaskByURL(client, pullRequest.html_url, asanaProjectId);
    
    if (!taskId) {
        console.warn(`No Asana task found for PR ${pullRequest.number}`);
        core.setOutput('taskUpdated', false);
        return;
    }

    try {
        // Update the task name and description to match the PR
        const prelude = `**Note:** This description is automatically updated from Github. **Changes will be LOST**.

PR: ${pullRequest.html_url}

`;
        const taskDescription = prelude + (pullRequest.body || 'No description provided');
        
        const body = {
            data: {
                name: pullRequest.title,
                notes: taskDescription,
            },
        };
        const opts = {};
        
        await client.tasks.updateTask(body, taskId, opts);
        
        // Add a comment about the update
        const comment = `PR updated - Title: ${pullRequest.title}`;
        await createStory(client, taskId, comment, false);
        
        core.setOutput('asanaTaskId', taskId);
        core.setOutput('taskUpdated', true);
        console.info(`Updated Asana task ${taskId} - Title: ${pullRequest.title}`);
        
    } catch (error) {
        console.error(`Failed to update task: ${error.message}`);
        core.setFailed(`Failed to update Asana task: ${error.message}`);
    }
}

async function findPRTaskByURL(client, prURL, projectId) {
    try {
        // Get all tasks in the project
        const response = await client.tasks.getTasksForProject(projectId, {});
        const tasks = response.data;
        
        // Look for a task that has a comment containing the PR URL
        for (const task of tasks) {
            try {
                const storiesResponse = await client.stories.getStoriesForTask(task.gid, {});
                const stories = storiesResponse.data;
                
                // Check if any story contains the PR URL
                const hasPRURL = stories.some(story => 
                    story.text && story.text.includes(prURL)
                );
                
                if (hasPRURL) {
                    console.info(`Found Asana task ${task.gid} for PR ${prURL}`);
                    return task.gid;
                }
            } catch (storyError) {
                // Continue searching if we can't get stories for this task
                console.debug(`Could not get stories for task ${task.gid}: ${storyError.message}`);
            }
        }
        
        console.info(`No Asana task found with PR URL: ${prURL}`);
        return null;
        
    } catch (error) {
        console.error(`Error searching for PR task: ${error.message}`);
        return null;
    }
}

async function checkForApprovedReviews(pullRequest) {
    const githubPAT = core.getInput('github-pat');
    if (!githubPAT) {
        console.warn('GitHub PAT not provided, cannot check review status');
        return false;
    }

    try {
        const githubClient = buildGithubClient(githubPAT);
        const owner = pullRequest.base.repo.owner.login;
        const repo = pullRequest.base.repo.name;
        const prNumber = pullRequest.number;

        // Get all reviews for the PR
        const response = await githubClient.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
            owner,
            repo,
            pull_number: prNumber,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        const reviews = response.data;
        
        // Check if any review has state 'approved'
        const hasApprovedReview = reviews.some(review => review.state === 'approved');
        
        console.info(`PR ${prNumber} has ${reviews.length} reviews, approved: ${hasApprovedReview}`);
        return hasApprovedReview;
        
    } catch (error) {
        console.error(`Error checking reviews: ${error.message}`);
        return false;
    }
}

async function updatePRState() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const asanaProjectId = core.getInput('asana-project', { required: true });
    const customFieldId = core.getInput('asana-review-custom-field', { required: true });

    console.info('updating PR state for pull request', pullRequest.title);

    // Find the Asana task for this PR
    const taskId = await findPRTaskByURL(client, pullRequest.html_url, asanaProjectId);
    
    if (!taskId) {
        console.warn(`No Asana task found for PR ${pullRequest.number}`);
        core.setOutput('stateUpdated', false);
        return;
    }

    try {
        // Determine PR state
        let prState = 'Open';
        if (pullRequest.state === 'closed') {
            if (pullRequest.merged) {
                prState = 'Merged';
            } else {
                prState = 'Closed';
            }
        } else if (pullRequest.draft) {
            prState = 'Draft';
        } else {
            // Check if PR has approved reviews
            const hasApprovedReviews = await checkForApprovedReviews(pullRequest);
            if (hasApprovedReviews) {
                prState = 'Approved';
            }
        }

        console.info(`PR state determined as: ${prState}`);

        // Update the custom field with PR state
        const body = {
            data: {
                custom_fields: {
                    [customFieldId]: prState
                }
            },
        };
        const opts = {};
        
        await client.tasks.updateTask(body, taskId, opts);
        
        // Add a comment about the state change
        const comment = `PR state updated to: ${prState}`;
        await createStory(client, taskId, comment, false);
        
        core.setOutput('asanaTaskId', taskId);
        core.setOutput('prState', prState);
        core.setOutput('stateUpdated', true);
        console.info(`Updated Asana task ${taskId} PR state to: ${prState}`);
        
    } catch (error) {
        console.error(`Failed to update PR state: ${error.message}`);
        core.setFailed(`Failed to update PR state: ${error.message}`);
    }
}

async function createReviewSubtasks() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const asanaProjectId = core.getInput('asana-project', { required: true });
    const asanaSectionId = core.getInput('asana-section');

    console.info('creating review subtasks for pull request', pullRequest.title);

    // Find the main PR task
    const prTaskId = await findPRTaskByURL(client, pullRequest.html_url, asanaProjectId);
    
    if (!prTaskId) {
        console.warn(`No Asana task found for PR ${pullRequest.number}`);
        core.setOutput('reviewSubtasksCreated', false);
        return;
    }

    try {
        // Check if we should only assign to PR author
        const assignPrAuthor = core.getInput('assign-pr-author') === 'true';
        
        if (assignPrAuthor) {
            console.info('ASSIGN_PR_AUTHOR is true - creating single subtask for PR author only');
            await createSingleAuthorSubtask(client, prTaskId, pullRequest, asanaProjectId, asanaSectionId);
            return;
        }

        // Get requested reviewers and assignees
        const requestedReviewers = pullRequest.requested_reviewers || [];
        const requestedTeams = pullRequest.requested_teams || [];
        const assignees = pullRequest.assignees || [];
        
        console.info(`Found ${requestedReviewers.length} requested reviewers, ${requestedTeams.length} requested teams, and ${assignees.length} assignees`);

        const createdSubtasks = [];
        const processedUsers = new Set(); // Track users to avoid duplicates

        // Create subtasks for individual reviewers
        for (const reviewer of requestedReviewers) {
            const subtaskName = `Code review for PR #${pullRequest.number}: ${pullRequest.title}`;
            
            // Create subtask description with prelude
            const prelude = `${pullRequest.user.login} requested your code review of ${pullRequest.html_url}.

NOTE:
* This task will be automatically closed when the review is completed in Github
* Do not add this task to another public projects
* Do not reassign to someone else
* Adjust due date as needed

See parent task for more information

`;
            const subtaskDescription = prelude + (pullRequest.body || 'No description provided');
            
            // Get Asana user ID for reviewer
            let reviewerAsanaId = null;
            if (core.getInput('github-pat')) {
                reviewerAsanaId = await getAsanaUserID(reviewer.login);
            }
            
            const subtaskId = await createTask(
                client,
                subtaskName,
                subtaskDescription,
                asanaProjectId,
                asanaSectionId,
                ['review', 'pending'],
                [],
                reviewerAsanaId || '',
                ''
            );

            if (subtaskId && subtaskId !== '0') {
                // Make it a subtask of the PR task
                await createSubtask(client, prTaskId, subtaskId);
                
                // Add comment with reviewer info
                const comment = `Review requested from @${reviewer.login}`;
                await createStory(client, subtaskId, comment, true);
                
                createdSubtasks.push({
                    id: subtaskId,
                    user: reviewer.login,
                    type: 'reviewer'
                });
                
                processedUsers.add(reviewer.login);
                console.info(`Created review subtask ${subtaskId} for ${reviewer.login}`);
            }
        }

        // Create subtasks for assignees (if not already processed as reviewers)
        for (const assignee of assignees) {
            if (processedUsers.has(assignee.login)) {
                console.info(`Skipping ${assignee.login} - already has review subtask`);
                continue;
            }

            const subtaskName = `Code review for PR #${pullRequest.number}: ${pullRequest.title}`;
            
            // Create subtask description with prelude
            const prelude = `${pullRequest.user.login} requested your code review of ${pullRequest.html_url}.

NOTE:
* This task will be automatically closed when the review is completed in Github
* Do not add this task to another public projects
* Do not reassign to someone else
* Adjust due date as needed

See parent task for more information

`;
            const subtaskDescription = prelude + (pullRequest.body || 'No description provided');
            
            // Get Asana user ID for assignee
            let assigneeAsanaId = null;
            if (core.getInput('github-pat')) {
                assigneeAsanaId = await getAsanaUserID(assignee.login);
            }
            
            const subtaskId = await createTask(
                client,
                subtaskName,
                subtaskDescription,
                asanaProjectId,
                asanaSectionId,
                ['assigned', 'pending'],
                [],
                assigneeAsanaId || '',
                ''
            );

            if (subtaskId && subtaskId !== '0') {
                // Make it a subtask of the PR task
                await createSubtask(client, prTaskId, subtaskId);
                
                // Add comment with assignee info
                const comment = `Assigned to @${assignee.login}`;
                await createStory(client, subtaskId, comment, true);
                
                createdSubtasks.push({
                    id: subtaskId,
                    user: assignee.login,
                    type: 'assignee'
                });
                
                processedUsers.add(assignee.login);
                console.info(`Created assignment subtask ${subtaskId} for ${assignee.login}`);
            }
        }

        // Create subtasks for team reviewers
        for (const team of requestedTeams) {
            const subtaskName = `Code review for PR #${pullRequest.number}: ${pullRequest.title}`;
            
            // Create subtask description with prelude
            const prelude = `${pullRequest.user.login} requested your code review of ${pullRequest.html_url}.

NOTE:
* This task will be automatically closed when the review is completed in Github
* Do not add this task to another public projects
* Do not reassign to someone else
* Adjust due date as needed

See parent task for more information

`;
            const subtaskDescription = prelude + (pullRequest.body || 'No description provided');
            
            const subtaskId = await createTask(
                client,
                subtaskName,
                subtaskDescription,
                asanaProjectId,
                asanaSectionId,
                ['review', 'pending', 'team'],
                [],
                '',
                ''
            );

            if (subtaskId && subtaskId !== '0') {
                // Make it a subtask of the PR task
                await createSubtask(client, prTaskId, subtaskId);
                
                // Add comment with team info
                const comment = `Review requested from team @${team.name}`;
                await createStory(client, subtaskId, comment, true);
                
                createdSubtasks.push({
                    id: subtaskId,
                    reviewer: team.name,
                    type: 'team'
                });
                
                console.info(`Created review subtask ${subtaskId} for team ${team.name}`);
            }
        }

        core.setOutput('asanaTaskId', prTaskId);
        core.setOutput('reviewSubtasksCreated', true);
        core.setOutput('createdSubtasks', JSON.stringify(createdSubtasks));
        console.info(`Created ${createdSubtasks.length} review subtasks for PR ${pullRequest.number}`);

    } catch (error) {
        console.error(`Failed to create review subtasks: ${error.message}`);
        core.setFailed(`Failed to create review subtasks: ${error.message}`);
    }
}

async function createSingleAuthorSubtask(client, prTaskId, pullRequest, asanaProjectId, asanaSectionId) {
    const subtaskName = `Code review for PR #${pullRequest.number}: ${pullRequest.title}`;
    
    // Create subtask description with prelude
    const prelude = `${pullRequest.user.login} requested your code review of ${pullRequest.html_url}.

NOTE:
* This task will be automatically closed when the review is completed in Github
* Do not add this task to another public projects
* Do not reassign to someone else
* Adjust due date as needed

See parent task for more information

`;
    const subtaskDescription = prelude + (pullRequest.body || 'No description provided');
    
    // Get Asana user ID for PR author
    let authorAsanaId = null;
    if (core.getInput('github-pat')) {
        authorAsanaId = await getAsanaUserID(pullRequest.user.login);
    }
    
    const subtaskId = await createTask(
        client,
        subtaskName,
        subtaskDescription,
        asanaProjectId,
        asanaSectionId,
        ['review', 'author'],
        [],
        authorAsanaId || '',
        ''
    );

    if (subtaskId && subtaskId !== '0') {
        // Make it a subtask of the PR task
        await createSubtask(client, prTaskId, subtaskId);
        
        // Add comment with author info
        const comment = `Code review task assigned to PR author @${pullRequest.user.login}`;
        await createStory(client, subtaskId, comment, true);
        
        core.setOutput('asanaTaskId', prTaskId);
        core.setOutput('reviewSubtasksCreated', true);
        core.setOutput('createdSubtasks', JSON.stringify([{
            id: subtaskId,
            user: pullRequest.user.login,
            type: 'author'
        }]));
        console.info(`Created single author subtask ${subtaskId} for ${pullRequest.user.login}`);
    }
}

async function updateReviewSubtaskStatus() {
    const client = await buildAsanaClient();
    const pullRequest = github.context.payload.pull_request;
    const review = github.context.payload.review;
    const asanaProjectId = core.getInput('asana-project', { required: true });

    console.info('updating review subtask status for pull request', pullRequest.title);

    // Find the main PR task
    const prTaskId = await findPRTaskByURL(client, pullRequest.html_url, asanaProjectId);
    
    if (!prTaskId) {
        console.warn(`No Asana task found for PR ${pullRequest.number}`);
        core.setOutput('reviewStatusUpdated', false);
        return;
    }

    try {
        // Get all subtasks of the PR task
        const subtasks = await getSubtasks(client, prTaskId);
        
        if (!review) {
            console.info('No review data available, checking if PR was merged');
            // Check if PR was merged and resolve all pending subtasks
            if (pullRequest.merged) {
                await resolveAllPendingSubtasks(client, subtasks, 'PR was merged');
                core.setOutput('reviewStatusUpdated', true);
                core.setOutput('action', 'merged');
            }
            return;
        }

        const reviewer = review.user.login;
        const reviewState = review.state;
        
        console.info(`Review by ${reviewer}: ${reviewState}`);

        // Find the corresponding subtask for this reviewer
        // Since all subtasks have the same name format, we need to find by description
        const subtask = subtasks.find(task => 
            task.name.includes(`Code review for PR #${pullRequest.number}:`) &&
            (task.name.includes(pullRequest.title)) &&
            (task.notes && task.notes.includes(`@${reviewer}`))
        );

        if (!subtask) {
            console.warn(`No subtask found for reviewer ${reviewer}`);
            core.setOutput('reviewStatusUpdated', false);
            return;
        }

        // Update subtask based on review state
        if (reviewState === 'approved') {
            await resolveReviewSubtask(client, subtask.gid, `Approved by @${reviewer}`);
            console.info(`Resolved review subtask ${subtask.gid} - approved by ${reviewer}`);
        } else if (reviewState === 'changes_requested') {
            await updateReviewSubtask(client, subtask.gid, 'Changes requested', `Changes requested by @${reviewer}`);
            console.info(`Updated review subtask ${subtask.gid} - changes requested by ${reviewer}`);
        } else if (reviewState === 'commented') {
            await updateReviewSubtask(client, subtask.gid, 'Commented', `Commented by @${reviewer}`);
            console.info(`Updated review subtask ${subtask.gid} - commented by ${reviewer}`);
        }

        core.setOutput('asanaTaskId', prTaskId);
        core.setOutput('reviewStatusUpdated', true);
        core.setOutput('reviewer', reviewer);
        core.setOutput('reviewState', reviewState);

    } catch (error) {
        console.error(`Failed to update review subtask status: ${error.message}`);
        core.setFailed(`Failed to update review subtask status: ${error.message}`);
    }
}

async function getSubtasks(client, parentTaskId) {
    try {
        const response = await client.tasks.getSubtasksForTask(parentTaskId, {});
        return response.data;
    } catch (error) {
        console.error(`Error getting subtasks: ${error.message}`);
        return [];
    }
}

async function resolveReviewSubtask(client, subtaskId, comment) {
    try {
        // Skip auto-closing if subtask belongs to NO_AUTOCLOSE_PROJECTS
        try {
            if (await isTaskInNoAutocloseProjects(client, subtaskId)) {
                console.info(`Skipping auto-complete for subtask ${subtaskId} because it belongs to NO_AUTOCLOSE_PROJECTS`);
                return;
            }
        } catch (checkErr) {
            console.warn(`Error checking NO_AUTOCLOSE_PROJECTS for ${subtaskId}: ${checkErr.message}`);
            // continue to resolve if the check fails
        }

        // Proceed to complete the subtask
        const body = {
            data: {
                completed: true,
            },
        };
        await client.tasks.updateTask(body, subtaskId, {});
        // Add resolution comment
        await createStory(client, subtaskId, comment, true);
    } catch (error) {
        console.error(`Error resolving subtask ${subtaskId}: ${error.message}`);
        throw error;
    }
}

async function updateReviewSubtask(client, subtaskId, newName, comment) {
    try {
        // Update task name and add comment
        const body = {
            data: {
                name: newName,
            },
        };
        await client.tasks.updateTask(body, subtaskId, {});
        
        // Add comment
        await createStory(client, subtaskId, comment, false);
        
    } catch (error) {
        console.error(`Error updating subtask ${subtaskId}: ${error.message}`);
        throw error;
    }
}

async function resolveAllPendingSubtasks(client, subtasks, reason) {
    if (!Array.isArray(subtasks)) subtasks = [subtasks];

    const results = [];
    for (const subtask of subtasks) {
        const id = subtask && (subtask.gid || subtask.id) ? (subtask.gid || subtask.id) : subtask;
        try {
            if (!id) continue;

            // Skip if subtask is in NO_AUTOCLOSE_PROJECTS
            if (await isTaskInNoAutocloseProjects(client, id)) {
                console.info(`Skipping auto-complete for subtask ${id} (NO_AUTOCLOSE_PROJECTS)`);
                results.push({ id, skipped: true });
                continue;
            }

            // Attempt to resolve subtask
            await resolveReviewSubtask(client, id, reason);
            results.push({ id, skipped: false, success: true });
        } catch (err) {
            console.error(`Error resolving subtask ${id}: ${err.message}`);
            results.push({ id, skipped: false, success: false, error: err.message });
        }
    }

    return results;
}

async function completePRTask() {
    const isComplete = core.getInput('is-complete') === 'true';

    const foundTasks = findAsanaTasks();

    const taskIds = [];
    for (const taskId of foundTasks) {
        console.info('marking task', taskId, isComplete ? 'complete' : 'incomplete');
        await completeAsanaTask(taskId, isComplete);
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

    const body = { data: taskOpts };
    const opts = {};

    console.log(`creating new task with options:='${JSON.stringify(taskOpts)}'`);
    let createdTaskId = '0';
    try {
        await client.tasks.createTask(body, opts).then((result) => {
            createdTaskId = result.data.gid;
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

async function getAsanaUserID(ghUsername = null) {
    const username = ghUsername || core.getInput('github-username') || github.context.payload.pull_request.user.login;
    const githubPAT = core.getInput('github-pat', { required: true });
    const githubClient = buildGithubClient(githubPAT);
    const org = 'duckduckgo';
    const repo = 'internal-github-asana-utils';

    console.log(`Looking up Asana user ID for ${username}`);
    try {
        const response = await githubClient
            .request('GET /repos/{owner}/{repo}/contents/user_map.yml', {
                owner: org,
                repo,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28',
                    Accept: 'application/vnd.github.raw+json',
                },
            });
        
        const userMap = yaml.load(response.data);
        if (username in userMap) {
            console.log(`Found Asana user ID for ${username}: ${userMap[username]}`);
            return userMap[username];
        } else {
            console.warn(`User ${username} not found in user map`);
            return null;
        }
    } catch (error) {
        console.error(`Error looking up Asana user ID for ${username}: ${error.message}`);
        return null;
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
        const response = await client.tasks.getTask(asanaTaskId);
        if (response && response.data) {
            core.setOutput('asanaTaskPermalink', response.data.permalink_url);
            console.log(`Task permalink: ${response.data.permalink_url}`);
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

async function markAsanaTaskComplete() {
    const taskId = core.getInput('asana-task-id', { required: true });
    const isComplete = core.getInput('is-complete') === 'true';

    return completeAsanaTask(taskId, isComplete);
}

async function completeAsanaTask(taskId, completed) {
    const client = await buildAsanaClient();
    const body = {
        data: {
            completed,
        },
    };
    const opts = {};
    try {
        await client.tasks.updateTask(body, taskId, opts);
    } catch (error) {
        console.error('Error completing task:', JSON.stringify(error));
        core.setFailed(`Error completing task ${taskId}: ${error.message}`);
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

async function asanaPRSync() {
    const eventName = github.context.eventName;
    const pullRequest = github.context.payload.pull_request;
    const review = github.context.payload.review;
    
    console.info(`GitHub event: ${eventName}`);
    
    if (!pullRequest) {
        core.setFailed('This action only works with pull request events');
        return;
    }

    try {
        if (eventName === 'pull_request') {
            await handlePullRequestEvent(pullRequest);
        } else if (eventName === 'pull_request_review') {
            await handlePullRequestReviewEvent(pullRequest, review);
        } else {
            core.setFailed(`Unsupported event type: ${eventName}`);
        }
    } catch (error) {
        console.error(`Error in asana-pr-sync: ${error.message}`);
        core.setFailed(`Asana PR sync failed: ${error.message}`);
    }
}

async function handlePullRequestEvent(pullRequest) {
    const action = github.context.payload.action;
    console.info(`PR action: ${action}`);
    
    switch (action) {
        case 'opened':
            console.info('PR opened - creating task and subtasks');
            await createPRTask();
            await createReviewSubtasks();
            break;
            
        case 'edited':
            console.info('PR edited - updating task');
            await updatePRTask();
            break;
            
        case 'closed':
            console.info('PR closed - updating state and resolving subtasks');
            await updatePRState();
            await updateReviewSubtaskStatus();
            break;
            
        case 'review_requested':
            console.info('Review requested - creating review subtasks');
            await createReviewSubtasks();
            break;
            
        case 'assigned':
            console.info('PR assigned - creating assignment subtasks');
            await createReviewSubtasks();
            break;
            
        default:
            console.info(`PR action ${action} - updating state only`);
            await updatePRState();
    }
}

async function handlePullRequestReviewEvent(pullRequest, review) {
    console.info(`PR review event - updating subtask status`);
    await updateReviewSubtaskStatus();
}

async function action() {
    const action = core.getInput('action', { required: true });
    console.info('calling', action);

    switch (action) {
        case 'asana-pr-sync': {
            await asanaPRSync();
            break;
        }
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
        case 'create-pr-task': {
            await createPRTask();
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
        case 'mark-asana-task-complete': {
            await markAsanaTaskComplete();
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
