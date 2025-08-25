const { Client } = require('@notionhq/client');
require('dotenv').config();

class NotionClient {
  constructor() {
    if (!process.env.NOTION_TOKEN) {
      throw new Error('NOTION_TOKEN environment variable is required');
    }
    if (!process.env.NOTION_DATABASE_ID) {
      throw new Error('NOTION_DATABASE_ID environment variable is required');
    }

    this.notion = new Client({
      auth: process.env.NOTION_TOKEN,
    });
    this.databaseId = process.env.NOTION_DATABASE_ID;
  }

  async getTasksByStatus() {
    try {
      let allResults = [];
      let hasMore = true;
      let startCursor = undefined;

      // Fetch all pages
      while (hasMore) {
        const response = await this.notion.databases.query({
          database_id: this.databaseId,
          start_cursor: startCursor,
          page_size: 100,
          sorts: [
            {
              property: 'Status',
              direction: 'ascending',
            },
          ],
        });

        allResults = allResults.concat(response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      const tasksByStatus = {};

      for (const page of allResults) {
        const title = this.getTitle(page);
        const status = this.getStatus(page);
        const priority = this.getPriority(page);
        const assignee = this.getAssignee(page);
        const dueDate = this.getDueDate(page);
        const properties = this.getAllProperties(page);

        if (!tasksByStatus[status]) {
          tasksByStatus[status] = [];
        }

        tasksByStatus[status].push({
          id: page.id,
          title,
          status,
          priority,
          assignee,
          dueDate,
          url: page.url,
          properties,
          createdTime: page.created_time,
        });
      }

      return tasksByStatus;
    } catch (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }
  }

  async getPageContent(pageId) {
    try {
      const blocks = await this.notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      });

      const content = [];
      
      for (const block of blocks.results) {
        const text = this.extractTextFromBlock(block);
        if (text) {
          content.push(text);
        }
      }

      return content.join('\n');
    } catch (error) {
      return 'Unable to fetch page content';
    }
  }

  extractTextFromBlock(block) {
    const type = block.type;
    const blockData = block[type];

    if (!blockData) return null;

    switch (type) {
      case 'paragraph':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'quote':
      case 'callout':
        return this.getRichText(blockData.rich_text || blockData.text || []);
      
      case 'bulleted_list_item':
      case 'numbered_list_item':
        return `• ${this.getRichText(blockData.rich_text || blockData.text || [])}`;
      
      case 'to_do':
        const checked = blockData.checked ? '☑' : '☐';
        return `${checked} ${this.getRichText(blockData.rich_text || blockData.text || [])}`;
      
      case 'toggle':
        return `▸ ${this.getRichText(blockData.rich_text || blockData.text || [])}`;
      
      case 'code':
        const code = this.getRichText(blockData.rich_text || blockData.text || []);
        const lang = blockData.language || '';
        return `\`\`\`${lang}\n${code}\n\`\`\``;
      
      case 'divider':
        return '---';
      
      default:
        return null;
    }
  }

  getRichText(richTextArray) {
    if (!Array.isArray(richTextArray)) return '';
    return richTextArray.map(text => text.plain_text || '').join('');
  }

  async updatePageContent(pageId, newContent) {
    try {
      // First, get all existing blocks to delete them
      const existingBlocks = await this.notion.blocks.children.list({
        block_id: pageId,
        page_size: 100
      });

      // Delete all existing blocks
      for (const block of existingBlocks.results) {
        if (block.type !== 'unsupported') {
          try {
            await this.notion.blocks.delete({
              block_id: block.id
            });
          } catch (deleteError) {
            console.error(`Failed to delete block ${block.id}: ${deleteError.message}`);
          }
        }
      }

      // Parse the new content and convert to Notion blocks
      const blocks = this.parseContentToBlocks(newContent);

      // Add new blocks
      if (blocks.length > 0) {
        await this.notion.blocks.children.append({
          block_id: pageId,
          children: blocks
        });
      }

      return { success: true, message: 'Content updated successfully' };
    } catch (error) {
      console.error('Update error:', error);
      return { success: false, message: error.message };
    }
  }

  parseContentToBlocks(content) {
    const lines = content.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      
      if (!line) {
        i++;
        continue;
      }

      // Handle different block types
      if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: line.substring(2) } }]
          }
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: line.substring(3) } }]
          }
        });
      } else if (line.startsWith('### ')) {
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.substring(4) } }]
          }
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: line.substring(2) } }]
          }
        });
      } else if (line.match(/^\d+\. /)) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\. /, '') } }]
          }
        });
      } else if (line.startsWith('> ')) {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: line.substring(2) } }]
          }
        });
      } else if (line.startsWith('```')) {
        // Code block
        i++;
        let codeContent = [];
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeContent.push(lines[i]);
          i++;
        }
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: codeContent.join('\n') } }],
            language: 'plain text'
          }
        });
      } else if (line === '---') {
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
      } else {
        // Regular paragraph
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: line } }]
          }
        });
      }
      
      i++;
    }

    return blocks;
  }

  getAllProperties(page) {
    const properties = {};
    
    for (const [key, value] of Object.entries(page.properties)) {
      if (value.type === 'title') {
        properties[key] = this.getRichText(value.title);
      } else if (value.type === 'rich_text') {
        properties[key] = this.getRichText(value.rich_text);
      } else if (value.type === 'number') {
        properties[key] = value.number;
      } else if (value.type === 'select') {
        properties[key] = value.select?.name;
      } else if (value.type === 'multi_select') {
        properties[key] = value.multi_select.map(s => s.name).join(', ');
      } else if (value.type === 'status') {
        properties[key] = value.status?.name;
      } else if (value.type === 'date') {
        properties[key] = value.date?.start;
      } else if (value.type === 'people') {
        properties[key] = value.people.map(p => p.name || p.person?.email).filter(Boolean).join(', ');
      } else if (value.type === 'checkbox') {
        properties[key] = value.checkbox ? 'Yes' : 'No';
      } else if (value.type === 'url') {
        properties[key] = value.url;
      } else if (value.type === 'email') {
        properties[key] = value.email;
      } else if (value.type === 'phone_number') {
        properties[key] = value.phone_number;
      }
    }
    
    return properties;
  }

  getTitle(page) {
    const titleProperty = page.properties.Name || page.properties.Title || page.properties.Task;
    if (!titleProperty) {
      const firstTextProperty = Object.entries(page.properties).find(
        ([_, value]) => value.type === 'title'
      );
      if (firstTextProperty) {
        return firstTextProperty[1].title[0]?.plain_text || 'Untitled';
      }
      return 'Untitled';
    }
    return titleProperty.title[0]?.plain_text || 'Untitled';
  }

  getStatus(page) {
    const statusProperty = page.properties.Status;
    if (!statusProperty) return 'No Status';
    
    if (statusProperty.type === 'select') {
      return statusProperty.select?.name || 'No Status';
    } else if (statusProperty.type === 'status') {
      return statusProperty.status?.name || 'No Status';
    }
    return 'No Status';
  }

  getPriority(page) {
    const priorityProperty = page.properties.Priority;
    if (!priorityProperty) return null;
    
    if (priorityProperty.type === 'select') {
      return priorityProperty.select?.name || null;
    }
    return null;
  }

  getAssignee(page) {
    const assigneeProperty = page.properties.Assignee || page.properties.Person;
    if (!assigneeProperty) return null;
    
    if (assigneeProperty.type === 'people' && assigneeProperty.people.length > 0) {
      return assigneeProperty.people[0].name || assigneeProperty.people[0].person?.email || null;
    }
    return null;
  }

  getDueDate(page) {
    const dueDateProperty = page.properties['Due Date'] || page.properties.Due || page.properties.Date;
    if (!dueDateProperty) return null;
    
    if (dueDateProperty.type === 'date' && dueDateProperty.date) {
      return dueDateProperty.date.start;
    }
    return null;
  }
}

module.exports = NotionClient;