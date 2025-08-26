# Notion TUI Client

A terminal user interface (TUI) client for viewing Notion tasks organized by status.

## Features

- View tasks organized by status columns
- Navigate between columns with arrow keys or vim keys (h/l)
- Navigate tasks within columns with up/down arrows or vim keys (j/k)
- **Search tasks** with `/` key - searches titles, assignees, priorities, and all properties
- **Create new tasks** with Ctrl+N - auto-assigned to selected status column
- **View task details in terminal** with Enter key
- **Edit task content** with Ctrl+E (syncs back to Notion automatically)
- Open tasks in browser with Ctrl+O
- Refresh data with 'r' (clears cache and fetches fresh data)
- **Local disk cache** - 10-minute cache for faster loading
- Shows task priority, assignee, due dates, creation/update times
- Display enhanced task details including bug type, hours, reference, description, screenshot URL
- Color-coded priorities and due date warnings
- Display full task content and all properties
- Horizontal scrolling for many status columns
- Unicode support for proper arrow display

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Notion integration:
   - Go to <https://www.notion.so/my-integrations>
   - Create a new integration
   - Copy the integration token

3. Share your database with the integration:
   - Open your Notion database
   - Click Share → Invite
   - Select your integration

4. Get your database ID:
   - Open your database in Notion
   - Copy the ID from the URL: `https://www.notion.so/{workspace}/{database_id}?v=...`

5. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your values:
# NOTION_TOKEN=your_integration_token
# NOTION_DATABASE_ID=your_database_id
```

## Usage

Run the application:

```bash
node index.js
```

### Keyboard Shortcuts

#### Main View

- **q**: Quit application
- **r**: Refresh data from Notion (clears cache)
- **/**: Open search mode - search across all task properties
- **Ctrl+N**: Create new task (assigned to selected status)
- **←/→** or **h/l**: Navigate between status columns
- **↑/↓** or **j/k**: Navigate tasks within a column
- **Enter**: View task details in terminal
- **Ctrl+E**: Edit task content in your system editor
- **Ctrl+O**: Open selected task in browser
- **Esc**: Clear search results (when search is active) or quit

#### Detail View

- **Esc**: Close detail view and return to board
- **↑/↓** or **j/k**: Scroll content up/down
- **PageUp/PageDown**: Scroll content by page
- **Ctrl+E**: Edit task content in your system editor
- **Ctrl+O**: Open task in browser

## Important Notes

### Search Functionality

The **/** key opens a search input that allows you to quickly find tasks:

- Searches across task titles, assignees, priorities, and all properties
- Case-insensitive search
- Shows only matching tasks with match count in status bar
- Navigation works within search results
- Press **Esc** to clear search and return to full task list
- Search is preserved during navigation until cleared

### Task Creation

The **Ctrl+N** feature creates new tasks directly from the TUI:

- Opens your system editor (uses `$EDITOR` environment variable)
- Template includes title, status, and content sections
- New task is automatically assigned to the currently selected status column
- Content supports full markdown (headings, lists, code blocks, quotes, etc.)
- Task appears immediately after creation with automatic cache refresh

### Content Editing

The **Ctrl+E** feature allows you to edit task content in your system editor and **automatically syncs changes back to Notion**. The app uses the Notion API's block update capabilities to replace the page content with your edited version.

**Features:**

- Full markdown support (headings, lists, code blocks, quotes, etc.)
- Automatic backup files saved locally for safety
- Real-time sync status in the TUI
- Fallback to local saving if Notion sync fails

### Local Cache

The application uses a local disk cache to improve performance:

- **Location**: `~/.notion-tui-cache/tasks-{database-id}.json`
- **Duration**: 10 minutes before automatic expiration
- **Status**: Shows cache age in status bar (e.g., "cached 2m ago")
- **Refresh**: Press 'r' to force refresh and clear cache
- **Benefits**: Instant startup for repeated use, reduced API calls

## Requirements

- Node.js 14+
- A Notion account with a database containing tasks
- Database must have a "Status" property (select or status type)

## Database Properties

### Required Properties

- **Title/Name/Task**: Task title (any title-type property)
- **Status**: Task status (select or status type property)

### Optional Properties

The TUI will display these properties if they exist in your database:

#### Main Task Details

- **Priority**: Task priority (will be color-coded)
- **Assignee/Person**: Task assignee
- **Due Date/Due/Date**: Task due date (with overdue warnings)

#### Enhanced Task Details

- **Bug Type/Type**: Type of task or issue
- **Hours/# Hours/Estimated Hours**: Time estimate for the task
- **Reference/Ref/Link**: Reference links or documentation
- **Description/Summary**: Task description or summary
- **Screenshot/Screenshot URL/Image**: Screenshot or image URLs

#### Automatic Metadata

- **Created**: Shows when the task was created (automatically detected)
- **Updated**: Shows when the task was last modified (automatically detected)

All properties are automatically detected by their names and will be displayed in the task details if they contain values.
