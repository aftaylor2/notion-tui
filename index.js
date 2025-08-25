#!/usr/bin/env node

const NotionClient = require('./lib/notion-client');
const NotionTUI = require('./lib/tui');

async function main() {
  let notionClient;
  let tui;

  try {
    // Set terminal environment for better compatibility
    process.env.TERM = process.env.TERM || 'xterm-256color';
    
    notionClient = new NotionClient();
    tui = new NotionTUI(notionClient);

    tui.updateStatus('Connecting to Notion...');
    tui.render();

    const loadTasks = async () => {
      try {
        tui.updateStatus('Fetching tasks from Notion...');
        const tasksByStatus = await notionClient.getTasksByStatus();
        tui.updateTasks(tasksByStatus);
      } catch (error) {
        tui.showError(error);
        tui.updateStatus(`Error: ${error.message}`);
      }
    };

    tui.onRefresh = loadTasks;

    await loadTasks();

  } catch (error) {
    if (error.message.includes('NOTION_TOKEN')) {
      console.error('\n❌ Missing Notion configuration!');
      console.error('\nPlease set up your environment variables:');
      console.error('1. Copy .env.example to .env');
      console.error('2. Add your Notion integration token to NOTION_TOKEN');
      console.error('3. Add your database ID to NOTION_DATABASE_ID');
      console.error('\nTo get these values:');
      console.error('- Integration token: https://www.notion.so/my-integrations');
      console.error('- Database ID: Share your database and copy the ID from the URL');
      console.error('\nExample:');
      console.error('  cp .env.example .env');
      console.error('  # Edit .env with your values');
      console.error('  node index.js\n');
      process.exit(1);
    } else {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});