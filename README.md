# Notion TUI Client

A terminal user interface (TUI) client for viewing Notion tasks organized by status.

## Features

- View tasks organized by status columns
- Navigate between columns with arrow keys or vim keys (h/l)
- Navigate tasks within columns with up/down arrows or vim keys (j/k)
- **View task details in terminal** with Enter key
- **Edit task content** with Ctrl+E (syncs back to Notion automatically)
- Open tasks in browser with Ctrl+O
- Refresh data with 'r'
- Shows task priority, assignee, and due dates
- Color-coded priorities and due date warnings
- Display full task content and all properties
- Horizontal scrolling for many status columns

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
- **r**: Refresh data from Notion
- **←/→** or **h/l**: Navigate between status columns
- **↑/↓** or **j/k**: Navigate tasks within a column
- **Enter**: View task details in terminal
- **Ctrl+E**: Edit task content in your system editor
- **Ctrl+O**: Open selected task in browser

#### Detail View

- **Esc**: Close detail view and return to board
- **↑/↓** or **j/k**: Scroll content up/down
- **PageUp/PageDown**: Scroll content by page
- **Ctrl+E**: Edit task content in your system editor
- **Ctrl+O**: Open task in browser

## Important Notes

### Content Editing

The **Ctrl+E** feature allows you to edit task content in your system editor and **automatically syncs changes back to Notion**. The app uses the Notion API's block update capabilities to replace the page content with your edited version.

**Features:**

- Full markdown support (headings, lists, code blocks, quotes, etc.)
- Automatic backup files saved locally for safety
- Real-time sync status in the TUI
- Fallback to local saving if Notion sync fails

## Requirements

- Node.js 14+
- A Notion account with a database containing tasks
- Database must have a "Status" property (select or status type)

## Optional Database Properties

The TUI will display these properties if they exist:

- **Title/Name/Task**: Task title (required)
- **Status**: Task status (required)
- **Priority**: Task priority (will be color-coded)
- **Assignee/Person**: Task assignee
- **Due Date/Due/Date**: Task due date
