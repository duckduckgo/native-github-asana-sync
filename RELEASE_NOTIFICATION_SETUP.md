# Release Notification Setup Guide

This guide explains how to configure the automatic release notification workflow that creates Asana tasks for all teams when a new version is published.

## Required Configuration

### 1. Repository Secrets

Add these secrets in your repository settings (`Settings > Secrets and variables > Actions`):

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `ASANA_PAT` | Asana Personal Access Token with permissions to create tasks in all target projects | `1/1234567890abcdef...` |

### 2. Repository Variables

Add these variables in your repository settings (`Settings > Secrets and variables > Actions > Variables`):

#### Team Project IDs
| Variable Name | Description | How to Find |
|---------------|-------------|-------------|
| `ANDROID_ASANA_PROJECT_ID` | Android team's Asana project ID | From project URL: `https://app.asana.com/0/{PROJECT_ID}/...` |
| `IOS_ASANA_PROJECT_ID` | iOS team's Asana project ID | From project URL: `https://app.asana.com/0/{PROJECT_ID}/...` |
| `WEB_ASANA_PROJECT_ID` | Web team's Asana project ID | From project URL: `https://app.asana.com/0/{PROJECT_ID}/...` |
| `DEVOPS_ASANA_PROJECT_ID` | DevOps team's Asana project ID | From project URL: `https://app.asana.com/0/{PROJECT_ID}/...` |
| `QA_ASANA_PROJECT_ID` | QA team's Asana project ID | From project URL: `https://app.asana.com/0/{PROJECT_ID}/...` |

#### Team Section IDs (Optional)
| Variable Name | Description | How to Find |
|---------------|-------------|-------------|
| `ANDROID_ASANA_SECTION_ID` | Section within Android project for notifications | Use Asana API or inspect network requests |
| `IOS_ASANA_SECTION_ID` | Section within iOS project for notifications | Use Asana API or inspect network requests |
| `WEB_ASANA_SECTION_ID` | Section within Web project for notifications | Use Asana API or inspect network requests |
| `DEVOPS_ASANA_SECTION_ID` | Section within DevOps project for notifications | Use Asana API or inspect network requests |
| `QA_ASANA_SECTION_ID` | Section within QA project for notifications | Use Asana API or inspect network requests |

#### Team Collaborators (Optional)
| Variable Name | Description | Format |
|---------------|-------------|--------|
| `ANDROID_TEAM_ASANA_IDS` | Comma-separated Asana user IDs for Android team | `user1,user2,user3` |
| `IOS_TEAM_ASANA_IDS` | Comma-separated Asana user IDs for iOS team | `user1,user2,user3` |
| `WEB_TEAM_ASANA_IDS` | Comma-separated Asana user IDs for Web team | `user1,user2,user3` |
| `DEVOPS_TEAM_ASANA_IDS` | Comma-separated Asana user IDs for DevOps team | `user1,user2,user3` |
| `QA_TEAM_ASANA_IDS` | Comma-separated Asana user IDs for QA team | `user1,user2,user3` |

#### Tags (Optional)
| Variable Name | Description | How to Find |
|---------------|-------------|-------------|
| `GITHUB_ACTION_UPDATE_TAG_ID` | Asana tag ID for GitHub Action updates | From tag URL or Asana API |

## How to Find Asana IDs

### Project IDs
1. Navigate to the Asana project
2. Look at the URL: `https://app.asana.com/0/{PROJECT_ID}/...`
3. The PROJECT_ID is the number after `/0/`

### Section IDs
1. Use the Asana API: `GET /projects/{project_id}/sections`
2. Or inspect network requests in browser dev tools when viewing the project

### User IDs
1. Use the Asana API: `GET /users/me` (for yourself)
2. Use the existing `get-asana-user-id` action in this repository
3. Or inspect network requests in browser dev tools

### Tag IDs
1. Use the Asana API: `GET /tags`
2. Or inspect network requests when viewing tags

## Customization

### Adding More Teams
To add additional teams, copy one of the existing team steps and modify:

```yaml
- name: Create Asana task for [TEAM_NAME] team
  uses: ./
  with:
    asana-pat: ${{ secrets.ASANA_PAT }}
    asana-project: ${{ vars.[TEAM]_ASANA_PROJECT_ID }}
    asana-section: ${{ vars.[TEAM]_ASANA_SECTION_ID }}
    asana-task-name: "📢 GitHub Action Update: ${{ github.repository }} ${{ steps.release-info.outputs.version }}"
    asana-task-description: ${{ steps.task-description.outputs.description }}
    asana-tags: ${{ vars.GITHUB_ACTION_UPDATE_TAG_ID }}
    asana-collaborators: ${{ vars.[TEAM]_TEAM_ASANA_IDS }}
    action: 'create-asana-task'
  continue-on-error: true
```

### Customizing Task Content
Modify the "Create task description" step to change:
- Task description format
- Links included
- Action items
- Emojis and formatting

### Changing Trigger
The workflow currently triggers on `release.published`. You can modify the trigger to:
- `release.created` - When a release is created (including drafts)
- `release.prereleased` - For pre-releases only
- Manual trigger with `workflow_dispatch`

## Testing

1. Create a test release (you can delete it afterward)
2. Check that tasks are created in the expected Asana projects
3. Verify the task content includes the release information
4. Confirm collaborators are added correctly

## Troubleshooting

### Common Issues
1. **Tasks not created**: Check that the Asana PAT has permissions for all target projects
2. **Missing variables**: Ensure all required variables are set in repository settings
3. **Wrong project**: Verify project IDs are correct
4. **Permission errors**: Asana PAT needs task creation permissions

### Debugging
- Check the workflow run logs in GitHub Actions
- Use `continue-on-error: true` to prevent one team's failure from stopping others
- Test with a single team first, then add others

## Security Notes

- Store the Asana PAT as a secret, never in code
- Use repository variables for non-sensitive configuration
- Consider using environment-specific configurations for different deployment stages 