# Asana Library v1 to v3 Migration

## Package Update
- Updated `package.json` from `"asana": "^1.0.2"` to `"asana": "^3.0.16"`

## Major API Breaking Changes

### 1. Client Initialization (`buildAsanaClient`)
**Before (v1):**
```javascript
const client = asana.Client.create().useAccessToken(asanaPAT);
```

**After (v3):**
```javascript
const client = asana.ApiClient.instance;
const token = client.authentications.token;
token.accessToken = asanaPAT;
client.defaultHeaders['asana-enable'] = 'new-sections,string_ids';

return {
    tasks: new asana.TasksApi(),
    stories: new asana.StoriesApi(),
    sections: new asana.SectionsApi(),
    users: new asana.UsersApi(),
};
```

### 2. Task Creation (`createTask`)
**Before (v1):**
```javascript
client.tasks.createTask(taskOptions)
```

**After (v3):**
```javascript
client.tasks.createTask({data: taskOptions}, opts)
// Response: result.data.gid instead of result.gid
```

### 3. Story Creation (`createStory`)
**Before (v1):**
```javascript
createStoryForTask(taskId, {text, is_pinned})
```

**After (v3):**
```javascript
createStoryForTask({data: {text, is_pinned}}, taskId, {})
```

### 4. Project Assignment (`addProjectForTask`)
**Before (v1):**
```javascript
addProjectForTask(taskId, {project, insert_after})
```

**After (v3):**
```javascript
addProjectForTask({data: {project, section}}, taskId, {})
```
- Replaced `insert_after` with `section` parameter
- Eliminated need for separate `addTaskForSection` calls

### 5. Task Updates (`updateTask`)
**Before (v1):**
```javascript
client.tasks.update(taskId, {completed})
```

**After (v3):**
```javascript
client.tasks.updateTask({data: {completed}}, taskId, {})
```

### 6. Task Retrieval (`getTask`)
**Before (v1):**
```javascript
const task = await client.tasks.getTask(taskId);
// Access: task.permalink_url
```

**After (v3):**
```javascript
const response = await client.tasks.getTask(taskId);
// Access: response.data.permalink_url
```

## New Features Added

### `mark-asana-task-complete` Action
- Added new action handler for marking individual tasks as complete/incomplete
- Extracted reusable `completeAsanaTask(taskId, completed)` helper function
- Supports `is-complete` parameter (defaults to `false` if omitted)

## Test Suite Updates
- Updated all test mocks from v1 to v3 API structure
- Changed `tasks.update` to `tasks.updateTask` in all test expectations
- Updated response mocks to include `data` wrapper for v3 API
- Added comprehensive tests for new `mark-asana-task-complete` action (3 test cases)
- **Total tests: 43 (all passing)**

## Documentation Updates
- Added `mark-asana-task-complete` to README.md action list
- Created full documentation section with parameters and example usage
- Follows existing README pattern and formatting

## Code Quality
- ✅ All 43 tests passing
- ✅ Build successful (`dist/index.js` compiled)
- ✅ Linting clean (ESLint + Prettier)
- ✅ Complete v3 API compliance achieved
- ✅ Backward compatibility maintained for existing workflows

## Breaking Changes
- **None for end users** - All existing GitHub Actions workflows continue to work unchanged
- Internal API calls updated but external interface remains the same

## Summary
This migration successfully transforms the entire Asana integration from v1 to v3 API while maintaining full functionality and adding new capabilities. 