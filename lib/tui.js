const blessed = require('blessed');
const contrib = require('blessed-contrib');

class NotionTUI {
  constructor(notionClient) {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Notion Tasks TUI',
      fullUnicode: true,
      dockBorders: false,
      ignoreLocked: ['C-c'],
      terminal: 'xterm-256color',
      forceUnicode: true
    });

    this.notionClient = notionClient;
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });
    this.statusColumns = {};
    this.tasksByStatus = {};
    this.selectedStatus = null;
    this.selectedIndex = 0;
    this.detailView = null;
    this.isDetailViewOpen = false;
    this.columnOffset = 0; // For horizontal scrolling
    this.isEditorOpen = false; // Track if external editor is open
    this.isSearchMode = false; // Track if search mode is active
    this.searchQuery = ''; // Current search query
    this.searchInput = null; // Search input box
    this.filteredTasks = null; // Filtered tasks based on search
    this.blockEnterKey = false; // Temporarily block enter key after search
    
    this.setupUI();
    this.setupKeyBindings();
  }

  setupUI() {
    this.titleBox = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: ' Notion Tasks Board - q:quit | r:refresh | /:search | ←→:columns | ↑↓:tasks | Enter:details | Ctrl+O:browser | Ctrl+E:edit | Esc:close ',
      style: {
        fg: 'white',
        bg: 'blue',
        bold: true
      }
    });

    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.box, {
      content: ' Loading... ',
      style: {
        fg: 'white',
        bg: 'black'
      }
    });

    this.boardContainer = this.grid.set(1, 0, 10, 12, blessed.box, {
      label: ' Task Board ',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    });
  }

  setupKeyBindings() {
    // Single escape handler at screen level
    this.screen.on('keypress', (ch, key) => {
      if (this.isEditorOpen) return; // Ignore all keys when editor is open
      
      if (key && key.name === 'escape') {
        if (this.isDetailViewOpen) {
          this.closeDetailView();
        } else if (this.filteredTasks) {
          this.clearSearch();
        } else {
          process.exit(0);
        }
      }
    });

    this.screen.key(['q', 'C-c'], () => {
      if (this.isEditorOpen) return;
      if (!this.isDetailViewOpen) {
        process.exit(0);
      }
    });

    this.screen.key(['r', 'R'], () => {
      if (this.isEditorOpen) return;
      if (!this.isDetailViewOpen && this.onRefresh) {
        this.onRefresh();
      }
    });

    this.screen.key(['/'], () => {
      if (this.isEditorOpen) return;
      if (!this.isDetailViewOpen && !this.isSearchMode) {
        this.openSearchMode();
      }
    });

    this.screen.key(['left', 'h'], () => {
      if (this.isEditorOpen) return;
      if (!this.isDetailViewOpen) {
        this.navigateColumns(-1);
      }
    });

    this.screen.key(['right', 'l'], () => {
      if (this.isEditorOpen) return;
      if (!this.isDetailViewOpen) {
        this.navigateColumns(1);
      }
    });

    this.screen.key(['up', 'k'], () => {
      if (this.isEditorOpen) return;
      if (this.isDetailViewOpen) {
        this.scrollDetailView(-1);
      } else {
        this.navigateTasks(-1);
      }
    });

    this.screen.key(['down', 'j'], () => {
      if (this.isEditorOpen) return;
      if (this.isDetailViewOpen) {
        this.scrollDetailView(1);
      } else {
        this.navigateTasks(1);
      }
    });

    this.screen.key(['pageup'], () => {
      if (this.isEditorOpen) return;
      if (this.isDetailViewOpen) {
        this.scrollDetailView(-10);
      }
    });

    this.screen.key(['pagedown'], () => {
      if (this.isEditorOpen) return;
      if (this.isDetailViewOpen) {
        this.scrollDetailView(10);
      }
    });

    this.screen.key(['enter', 'return'], () => {
      if (this.isEditorOpen) return;
      if (this.isSearchMode) return; // Don't open task details when search input is open
      if (this.blockEnterKey) return; // Don't open task details right after search
      if (!this.isDetailViewOpen) {
        this.showTaskDetails();
      }
    });

    this.screen.key(['C-o'], () => {
      if (this.isEditorOpen) return;
      this.openSelectedTaskInBrowser();
    });

    this.screen.key(['C-e'], () => {
      if (this.isEditorOpen) return;
      this.editSelectedTask();
    });
  }

  async showTaskDetails() {
    if (!this.selectedStatus) return;
    
    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const tasks = currentTasks[this.selectedStatus];
    if (!tasks || tasks.length === 0) return;
    
    const task = tasks[this.selectedIndex];
    if (!task) return;

    // Mark as open immediately
    this.isDetailViewOpen = true;
    this.updateStatus('Loading task details...');
    
    const content = await this.notionClient.getPageContent(task.id);
    
    this.detailView = blessed.box({
      parent: this.screen,
      label: ` ${task.title} `,
      top: 'center',
      left: 'center',
      width: '90%',
      height: '90%',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'yellow'
        },
        label: {
          fg: 'yellow',
          bold: true
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'cyan'
        },
        style: {
          inverse: true
        }
      },
      tags: true
    });

    let detailContent = [];
    
    detailContent.push('{yellow-fg}{bold}=== Task Details ==={/}');
    detailContent.push('');
    
    detailContent.push(`{cyan-fg}Title:{/} ${task.title}`);
    detailContent.push(`{cyan-fg}Status:{/} ${task.status}`);
    
    if (task.createdTime) {
      const createdDate = new Date(task.createdTime);
      const formattedDate = createdDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      detailContent.push(`{cyan-fg}Created:{/} ${formattedDate}`);
    }
    
    if (task.lastEditedTime) {
      const updatedDate = new Date(task.lastEditedTime);
      const formattedDate = updatedDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      detailContent.push(`{cyan-fg}Updated:{/} ${formattedDate}`);
    }
    
    if (task.priority) {
      const color = this.getPriorityColor(task.priority);
      detailContent.push(`{cyan-fg}Priority:{/} {${color}-fg}${task.priority}{/}`);
    }
    
    if (task.assignee) {
      detailContent.push(`{cyan-fg}Assignee:{/} ${task.assignee}`);
    }
    
    if (task.dueDate) {
      const dueInfo = this.formatDueDate(task.dueDate);
      detailContent.push(`{cyan-fg}Due Date:{/} {${dueInfo.color}-fg}${task.dueDate} ${dueInfo.text}{/}`);
    }
    
    // Additional optional fields
    if (task.properties) {
      // Bug Type
      const bugType = task.properties['Bug Type'] || task.properties['Bug type'] || task.properties['Type'];
      if (bugType) {
        detailContent.push(`{cyan-fg}Bug Type:{/} ${bugType}`);
      }
      
      // Hours
      const hours = task.properties['Hours'] || task.properties['# Hours'] || task.properties['Estimated Hours'];
      if (hours) {
        detailContent.push(`{cyan-fg}Hours:{/} ${hours}`);
      }
      
      // Reference
      const reference = task.properties['Reference'] || task.properties['Ref'] || task.properties['Link'];
      if (reference) {
        detailContent.push(`{cyan-fg}Reference:{/} ${reference}`);
      }
      
      // Description (if it's a separate field from content)
      const description = task.properties['Description'] || task.properties['Summary'];
      if (description) {
        detailContent.push(`{cyan-fg}Description:{/} ${description}`);
      }
      
      // Screenshot URL
      const screenshot = task.properties['Screenshot'] || task.properties['Screenshot URL'] || task.properties['Image'];
      if (screenshot) {
        detailContent.push(`{cyan-fg}Screenshot:{/} ${screenshot}`);
      }
    }

    if (task.properties) {
      detailContent.push('');
      detailContent.push('{yellow-fg}{bold}=== Properties ==={/}');
      detailContent.push('');
      
      const excludedFields = [
        'Status', 'Title', 'Name', 'Task',
        'Priority', 'Assignee', 'Person', 
        'Due Date', 'Due', 'Date',
        'Bug Type', 'Bug type', 'Type',
        'Hours', '# Hours', 'Estimated Hours',
        'Reference', 'Ref', 'Link',
        'Description', 'Summary',
        'Screenshot', 'Screenshot URL', 'Image'
      ];
      
      for (const [key, value] of Object.entries(task.properties)) {
        if (value && !excludedFields.includes(key)) {
          detailContent.push(`{cyan-fg}${key}:{/} ${value}`);
        }
      }
    }

    if (content && content !== 'Unable to fetch page content') {
      detailContent.push('');
      detailContent.push('{yellow-fg}{bold}=== Content ==={/}');
      detailContent.push('');
      detailContent.push(content);
    }

    detailContent.push('');
    detailContent.push('{gray-fg}Press Esc to close, Ctrl+O to open in browser, Ctrl+E to edit, ↑↓ or j/k to scroll{/}');

    this.detailView.setContent(detailContent.join('\n'));
    this.detailView.setFront();
    this.detailView.focus();
    this.screen.render();
    
    this.updateStatus(`Viewing: ${task.title}`);
  }

  closeDetailView() {
    if (!this.detailView) return;
    
    this.isDetailViewOpen = false;
    this.detailView.hide();
    this.detailView.destroy();
    this.detailView = null;
    
    // Force full re-render of the board
    this.renderBoard();
    
    // Refocus on selected column
    if (this.selectedStatus && this.statusColumns[this.selectedStatus]) {
      this.statusColumns[this.selectedStatus].focus();
    }
    
    this.updateStatus('Ready');
  }

  async refreshDetailView(task) {
    if (!this.detailView || !this.isDetailViewOpen) return;
    
    try {
      // Fetch fresh content from Notion
      const content = await this.notionClient.getPageContent(task.id);
      
      let detailContent = [];
      
      detailContent.push('{yellow-fg}{bold}=== Task Details ==={/}');
      detailContent.push('');
      
      detailContent.push(`{cyan-fg}Title:{/} ${task.title}`);
      detailContent.push(`{cyan-fg}Status:{/} ${task.status}`);
      
      if (task.createdTime) {
        const createdDate = new Date(task.createdTime);
        const formattedDate = createdDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        detailContent.push(`{cyan-fg}Created:{/} ${formattedDate}`);
      }
      
      if (task.lastEditedTime) {
        const updatedDate = new Date(task.lastEditedTime);
        const formattedDate = updatedDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        detailContent.push(`{cyan-fg}Updated:{/} ${formattedDate}`);
      }
      
      if (task.priority) {
        const color = this.getPriorityColor(task.priority);
        detailContent.push(`{cyan-fg}Priority:{/} {${color}-fg}${task.priority}{/}`);
      }
      
      if (task.assignee) {
        detailContent.push(`{cyan-fg}Assignee:{/} ${task.assignee}`);
      }
      
      if (task.dueDate) {
        const dueInfo = this.formatDueDate(task.dueDate);
        detailContent.push(`{cyan-fg}Due Date:{/} {${dueInfo.color}-fg}${task.dueDate} ${dueInfo.text}{/}`);
      }
      
      // Additional optional fields
      if (task.properties) {
        // Bug Type
        const bugType = task.properties['Bug Type'] || task.properties['Bug type'] || task.properties['Type'];
        if (bugType) {
          detailContent.push(`{cyan-fg}Bug Type:{/} ${bugType}`);
        }
        
        // Hours
        const hours = task.properties['Hours'] || task.properties['# Hours'] || task.properties['Estimated Hours'];
        if (hours) {
          detailContent.push(`{cyan-fg}Hours:{/} ${hours}`);
        }
        
        // Reference
        const reference = task.properties['Reference'] || task.properties['Ref'] || task.properties['Link'];
        if (reference) {
          detailContent.push(`{cyan-fg}Reference:{/} ${reference}`);
        }
        
        // Description (if it's a separate field from content)
        const description = task.properties['Description'] || task.properties['Summary'];
        if (description) {
          detailContent.push(`{cyan-fg}Description:{/} ${description}`);
        }
        
        // Screenshot URL
        const screenshot = task.properties['Screenshot'] || task.properties['Screenshot URL'] || task.properties['Image'];
        if (screenshot) {
          detailContent.push(`{cyan-fg}Screenshot:{/} ${screenshot}`);
        }
      }

      if (task.properties) {
        detailContent.push('');
        detailContent.push('{yellow-fg}{bold}=== Properties ==={/}');
        detailContent.push('');
        
        const excludedFields = [
          'Status', 'Title', 'Name', 'Task',
          'Priority', 'Assignee', 'Person', 
          'Due Date', 'Due', 'Date',
          'Bug Type', 'Bug type', 'Type',
          'Hours', '# Hours', 'Estimated Hours',
          'Reference', 'Ref', 'Link',
          'Description', 'Summary',
          'Screenshot', 'Screenshot URL', 'Image'
        ];
        
        for (const [key, value] of Object.entries(task.properties)) {
          if (value && !excludedFields.includes(key)) {
            detailContent.push(`{cyan-fg}${key}:{/} ${value}`);
          }
        }
      }

      if (content && content !== 'Unable to fetch page content') {
        detailContent.push('');
        detailContent.push('{yellow-fg}{bold}=== Content ==={/}');
        detailContent.push('');
        detailContent.push(content);
      }

      detailContent.push('');
      detailContent.push('{gray-fg}Press Esc to close, Ctrl+O to open in browser, Ctrl+E to edit, ↑↓ or j/k to scroll{/}');

      this.detailView.setContent(detailContent.join('\n'));
      this.screen.render();
    } catch (error) {
      // If refresh fails, keep the old content
      console.error('Failed to refresh detail view:', error);
    }
  }

  scrollDetailView(lines) {
    if (this.detailView) {
      if (lines > 0) {
        for (let i = 0; i < Math.abs(lines); i++) {
          this.detailView.scroll(1);
        }
      } else {
        for (let i = 0; i < Math.abs(lines); i++) {
          this.detailView.scroll(-1);
        }
      }
      this.screen.render();
    }
  }

  openSelectedTaskInBrowser() {
    if (!this.selectedStatus) return;
    
    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const tasks = currentTasks[this.selectedStatus];
    if (!tasks || tasks.length === 0) return;
    
    const task = tasks[this.selectedIndex];
    if (task && task.url) {
      const { exec } = require('child_process');
      const command = process.platform === 'darwin' ? 'open' : 
                     process.platform === 'win32' ? 'start' : 'xdg-open';
      
      exec(`${command} "${task.url}"`, (error) => {
        if (error) {
          this.updateStatus(`Error opening task: ${error.message}`);
        } else {
          this.updateStatus(`Opened in browser: ${task.title}`);
        }
      });
    }
  }

  async editSelectedTask() {
    if (!this.selectedStatus) return;
    
    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const tasks = currentTasks[this.selectedStatus];
    if (!tasks || tasks.length === 0) return;
    
    const task = tasks[this.selectedIndex];
    if (!task) return;

    this.updateStatus('Fetching task content for editing...');
    
    try {
      const content = await this.notionClient.getPageContent(task.id);
      
      // Create temporary file
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { spawn } = require('child_process');
      
      const tmpFile = path.join(os.tmpdir(), `notion-task-${task.id.replace(/-/g, '')}.md`);
      
      // Prepare content for editing
      let editableContent = `# ${task.title}\n\n`;
      editableContent += `Status: ${task.status}\n`;
      if (task.priority) editableContent += `Priority: ${task.priority}\n`;
      if (task.assignee) editableContent += `Assignee: ${task.assignee}\n`;
      if (task.dueDate) editableContent += `Due Date: ${task.dueDate}\n`;
      editableContent += '\n---\n\n';
      
      if (content && content !== 'Unable to fetch page content') {
        editableContent += content;
      } else {
        editableContent += '(No content available for editing)';
      }
      
      // Write to temp file
      fs.writeFileSync(tmpFile, editableContent);
      
      // Get editor from environment
      const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
      
      this.updateStatus(`Opening ${task.title} in ${editor}...`);
      
      // Set editor open flag to disable key handlers
      this.isEditorOpen = true;
      
      // Completely suspend blessed input handling
      this.screen.program.pause();
      this.screen.program.normalBuffer();
      this.screen.program.showCursor();
      process.stdin.setRawMode(false);
      
      // Spawn editor
      const editorProcess = spawn(editor, [tmpFile], {
        stdio: 'inherit'
      });
      
      editorProcess.on('close', async (code) => {
        // Restore TUI properly
        process.stdin.setRawMode(true);
        this.screen.program.alternateBuffer();
        this.screen.program.hideCursor();
        this.screen.program.resume();
        
        // Force complete redraw
        this.screen.program.clear();
        this.screen.alloc();
        this.screen.realloc();
        
        this.isEditorOpen = false;
        this.screen.render();
        
        if (code === 0) {
          try {
            // Read the edited content
            const editedContent = fs.readFileSync(tmpFile, 'utf8');
            
            // Extract just the content part (after the --- separator)
            const contentMatch = editedContent.split('\n---\n');
            
            if (contentMatch.length > 1) {
              const newContent = contentMatch.slice(1).join('\n---\n').trim();
              
              // Check if content actually changed
              if (newContent !== (content || '')) {
                try {
                  this.updateStatus('Syncing changes to Notion...');
                  
                  // Update content in Notion
                  const updateResult = await this.notionClient.updatePageContent(task.id, newContent);
                  
                  if (updateResult.success) {
                    // Also save local backup
                    const timestamp = Date.now();
                    const shortTitle = task.title.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 30).trim().replace(/\s+/g, '-');
                    const localFile = path.join(process.cwd(), `notion-backup-${shortTitle}-${timestamp}.md`);
                    const saveContent = `# ${task.title}\n\nTask ID: ${task.id}\nStatus: ${task.status}\nUpdated: ${new Date().toISOString()}\n\n## Updated Content:\n${newContent}`;
                    
                    fs.writeFileSync(localFile, saveContent);
                    
                    // Refresh detail view if it's open for this task
                    if (this.isDetailViewOpen && this.detailView) {
                      this.refreshDetailView(task);
                    }
                    
                    setImmediate(() => {
                      this.updateStatus(`✓ Content updated in Notion! Backup saved: ${path.basename(localFile)}`);
                    });
                  } else {
                    // Fall back to local save if Notion update fails
                    const timestamp = Date.now();
                    const shortTitle = task.title.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 30).trim().replace(/\s+/g, '-');
                    const localFile = path.join(process.cwd(), `notion-edit-failed-${shortTitle}-${timestamp}.md`);
                    const saveContent = `# ${task.title}\n\nTask ID: ${task.id}\nStatus: ${task.status}\nError: ${updateResult.message}\n\n## Edited Content:\n${newContent}`;
                    
                    fs.writeFileSync(localFile, saveContent);
                    
                    setImmediate(() => {
                      this.updateStatus(`⚠ Notion sync failed: ${updateResult.message}. Saved locally: ${path.basename(localFile)}`);
                    });
                  }
                } catch (saveError) {
                  this.updateStatus(`Error updating content: ${saveError.message}`);
                }
              } else {
                setImmediate(() => {
                  this.updateStatus('No changes detected in edited content');
                });
              }
            } else {
              setImmediate(() => {
                this.updateStatus('Editor closed - no content section found (missing --- separator)');
              });
            }
            
            // Clean up temp file
            fs.unlinkSync(tmpFile);
          } catch (error) {
            this.updateStatus(`Error processing edited file: ${error.message}`);
          }
        } else {
          setImmediate(() => {
            this.updateStatus('Editor closed without saving');
          });
          // Clean up temp file
          try {
            fs.unlinkSync(tmpFile);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
      
      editorProcess.on('error', (error) => {
        // Restore TUI properly
        process.stdin.setRawMode(true);
        this.screen.program.alternateBuffer();
        this.screen.program.hideCursor();
        this.screen.program.resume();
        
        // Force complete redraw
        this.screen.program.clear();
        this.screen.alloc();
        this.screen.realloc();
        
        this.isEditorOpen = false;
        this.screen.render();
        
        this.updateStatus(`Error opening editor: ${error.message}`);
        
        // Clean up temp file
        try {
          fs.unlinkSync(tmpFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      
    } catch (error) {
      this.updateStatus(`Error fetching task content: ${error.message}`);
    }
  }

  updateTasks(tasksByStatus) {
    this.tasksByStatus = tasksByStatus;
    this.renderBoard();
    
    const totalTasks = Object.values(tasksByStatus).reduce((sum, tasks) => sum + tasks.length, 0);
    const statusNames = Object.keys(tasksByStatus);
    this.updateStatus(`Loaded ${totalTasks} tasks across ${statusNames.length} statuses`);
  }

  renderBoard() {
    // Destroy all existing columns
    Object.values(this.statusColumns).forEach(col => {
      col.hide();
      col.destroy();
    });
    this.statusColumns = {};

    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const statuses = Object.keys(currentTasks);
    if (statuses.length === 0) {
      if (this.filteredTasks !== null) {
        this.updateStatus(`No tasks match: "${this.searchQuery}"`);
      } else {
        this.updateStatus('No tasks found');
      }
      this.screen.render();
      return;
    }

    // Single row layout - all categories visible with scrolling
    const numStatuses = statuses.length;
    let columnWidth;
    
    // Determine column width based on number of statuses
    if (numStatuses <= 3) {
      columnWidth = 4;  // Wide columns for few statuses
    } else if (numStatuses <= 4) {
      columnWidth = 3;  // Medium columns
    } else if (numStatuses <= 6) {
      columnWidth = 2;  // Narrower columns
    } else {
      // Many statuses - minimum width but keep single row
      columnWidth = Math.max(2, Math.floor(12 / Math.min(numStatuses, 8)));
    }
    
    // Keep single row
    const rowHeight = 10;

    // Track visible columns (we can show up to 12 grid units worth)
    const maxVisibleColumns = Math.floor(12 / columnWidth);
    
    // Apply horizontal scrolling offset
    const startIdx = this.columnOffset;
    const endIdx = Math.min(startIdx + maxVisibleColumns, statuses.length);
    const visibleStatuses = statuses.slice(startIdx, endIdx);

    visibleStatuses.forEach((status, displayIndex) => {
      const tasks = currentTasks[status];
      const isSelected = this.selectedStatus === status;
      
      const colIndex = displayIndex * columnWidth;
      
      // Adjust width for last visible column to use remaining space
      const isLastVisible = (displayIndex === visibleStatuses.length - 1);
      const actualWidth = isLastVisible ? (12 - colIndex) : columnWidth;
      
      const columnBox = this.grid.set(1, colIndex, rowHeight, actualWidth, blessed.list, {
        label: ` ${status} (${tasks.length}) `,
        border: {
          type: 'line'
        },
        style: {
          border: {
            fg: isSelected ? 'yellow' : 'white'
          },
          selected: {
            bg: 'blue',
            fg: 'white',
            bold: true
          }
        },
        keys: false,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
          ch: ' ',
          track: {
            bg: 'cyan'
          },
          style: {
            inverse: true
          }
        },
        tags: true
      });

      const items = tasks.map((task) => {
        let taskLine = task.title;
        
        // Calculate approximate character width for the column
        // Each grid unit is roughly 13-15 characters wide on average terminals
        const charWidth = actualWidth * 13 - 2; // Account for borders and padding
        
        // Only show priority if column is wide enough
        let prefixLength = 0;
        if (actualWidth >= 2 && task.priority) {
          const priorityColor = this.getPriorityColor(task.priority);
          const priorityLabel = task.priority.substring(0, 1).toUpperCase();
          const prefix = `{${priorityColor}-fg}[${priorityLabel}]{/} `;
          taskLine = prefix + taskLine;
          prefixLength = 4; // "[P] " takes 4 characters
        }
        
        // Truncate title if needed (considering priority prefix)
        const maxTitleLength = charWidth - prefixLength;
        if (task.title.length > maxTitleLength && maxTitleLength > 0) {
          // Re-build the line with truncated title (no ellipsis)
          const truncatedTitle = task.title.substring(0, maxTitleLength);
          if (actualWidth >= 2 && task.priority) {
            const priorityColor = this.getPriorityColor(task.priority);
            const priorityLabel = task.priority.substring(0, 1).toUpperCase();
            taskLine = `{${priorityColor}-fg}[${priorityLabel}]{/} ${truncatedTitle}`;
          } else {
            taskLine = truncatedTitle;
          }
        }
        
        return taskLine;
      });

      columnBox.setItems(items);
      
      if (isSelected) {
        columnBox.select(this.selectedIndex);
      }

      this.statusColumns[status] = columnBox;
    });

    if (!this.selectedStatus && statuses.length > 0) {
      this.selectedStatus = statuses[0];
      this.selectedIndex = 0;
      this.highlightSelectedColumn();
    }

    // Update status to show scroll position
    if (statuses.length > maxVisibleColumns) {
      const currentPosition = `${startIdx + 1}-${endIdx}`;
      const scrollIndicator = this.columnOffset > 0 ? '← ' : '  ';
      const scrollIndicatorRight = endIdx < statuses.length ? ' →' : '  ';
      this.updateStatus(`${scrollIndicator}Showing columns ${currentPosition} of ${statuses.length}${scrollIndicatorRight}`);
    }

    this.screen.render();
  }

  getPriorityColor(priority) {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes('high') || priorityLower.includes('urgent')) return 'red';
    if (priorityLower.includes('medium')) return 'yellow';
    if (priorityLower.includes('low')) return 'green';
    return 'white';
  }

  formatDueDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let color = 'white';
    let text = '';
    
    if (diffDays < 0) {
      color = 'red';
      text = `(${Math.abs(diffDays)}d overdue)`;
    } else if (diffDays === 0) {
      color = 'yellow';
      text = '(Today)';
    } else if (diffDays === 1) {
      color = 'yellow';
      text = '(Tomorrow)';
    } else if (diffDays <= 7) {
      color = 'cyan';
      text = `(${diffDays}d)`;
    } else {
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      text = `(${month} ${day})`;
    }
    
    return { color, text };
  }

  navigateColumns(direction) {
    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const statuses = Object.keys(currentTasks);
    if (statuses.length === 0) return;

    const currentIndex = statuses.indexOf(this.selectedStatus);
    let newIndex = currentIndex + direction;
    
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= statuses.length) newIndex = statuses.length - 1;
    
    this.selectedStatus = statuses[newIndex];
    this.selectedIndex = 0;
    
    // Calculate column width for scrolling
    let columnWidth = 2;
    if (statuses.length <= 3) columnWidth = 4;
    else if (statuses.length <= 4) columnWidth = 3;
    else if (statuses.length <= 6) columnWidth = 2;
    
    const maxVisibleColumns = Math.floor(12 / columnWidth);
    
    // Adjust scroll offset if needed
    if (newIndex < this.columnOffset) {
      // Scroll left
      this.columnOffset = newIndex;
    } else if (newIndex >= this.columnOffset + maxVisibleColumns) {
      // Scroll right
      this.columnOffset = newIndex - maxVisibleColumns + 1;
    }
    
    this.highlightSelectedColumn();
    this.renderBoard();
  }

  navigateTasks(direction) {
    if (!this.selectedStatus) return;
    
    // Use filtered tasks if search is active
    const currentTasks = this.filteredTasks || this.tasksByStatus;
    const tasks = currentTasks[this.selectedStatus];
    if (!tasks || tasks.length === 0) return;

    this.selectedIndex += direction;
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.selectedIndex >= tasks.length) this.selectedIndex = tasks.length - 1;

    const column = this.statusColumns[this.selectedStatus];
    if (column) {
      column.select(this.selectedIndex);
      this.screen.render();
    }
  }

  highlightSelectedColumn() {
    Object.entries(this.statusColumns).forEach(([status, column]) => {
      if (status === this.selectedStatus) {
        column.style.border.fg = 'yellow';
        column.focus();
      } else {
        column.style.border.fg = 'white';
      }
    });
  }

  updateStatus(message) {
    this.statusBar.setContent(` ${message} `);
    this.screen.render();
  }

  showError(error) {
    const errorBox = blessed.message({
      parent: this.screen,
      border: 'line',
      height: 'shrink',
      width: 'half',
      top: 'center',
      left: 'center',
      label: ' Error ',
      tags: true,
      style: {
        border: {
          fg: 'red'
        }
      }
    });

    errorBox.error(error.message || error, () => {
      this.screen.render();
    });
  }

  openSearchMode() {
    this.isSearchMode = true;
    this.searchQuery = '';
    
    // Create search input box
    this.searchInput = blessed.textbox({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 3,
      label: ' Search Tasks ',
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'yellow'
        },
        focus: {
          bg: 'black',
          border: {
            fg: 'green'
          }
        }
      },
      inputOnFocus: true,
      keys: true,
      mouse: true
    });
    
    // Handle search input
    this.searchInput.on('submit', (value) => {
      this.searchQuery = value;
      this.blockEnterKey = true; // Block enter key temporarily
      this.performSearch();
      this.closeSearchMode();
      // Unblock enter key after a short delay
      setTimeout(() => {
        this.blockEnterKey = false;
      }, 100);
    });
    
    // Handle cancel
    this.searchInput.key(['escape', 'C-c'], () => {
      this.closeSearchMode();
    });
    
    this.searchInput.focus();
    this.screen.render();
  }
  
  closeSearchMode() {
    if (this.searchInput) {
      this.searchInput.destroy();
      this.searchInput = null;
    }
    this.isSearchMode = false;
    this.screen.render();
  }
  
  performSearch() {
    if (!this.searchQuery) {
      this.filteredTasks = null;
      this.renderBoard();
      return;
    }
    
    const query = this.searchQuery.toLowerCase();
    this.filteredTasks = {};
    
    // Search through all tasks
    Object.entries(this.tasksByStatus).forEach(([status, tasks]) => {
      const matchingTasks = tasks.filter(task => {
        // Search in title
        if (task.title && task.title.toLowerCase().includes(query)) return true;
        
        // Search in assignee
        if (task.assignee && task.assignee.toLowerCase().includes(query)) return true;
        
        // Search in priority
        if (task.priority && task.priority.toLowerCase().includes(query)) return true;
        
        // Search in properties
        if (task.properties) {
          for (const [key, value] of Object.entries(task.properties)) {
            if (value && String(value).toLowerCase().includes(query)) {
              return true;
            }
          }
        }
        
        return false;
      });
      
      if (matchingTasks.length > 0) {
        this.filteredTasks[status] = matchingTasks;
      }
    });
    
    // Update status bar to show search results
    const totalMatches = Object.values(this.filteredTasks).reduce((sum, tasks) => sum + tasks.length, 0);
    this.updateStatus(`Search: "${this.searchQuery}" - ${totalMatches} matches found`);
    
    // Re-render board with filtered tasks
    this.renderBoardWithFilter();
  }
  
  renderBoardWithFilter() {
    // Just call renderBoard, it now handles filtered tasks internally
    this.renderBoard();
  }
  
  clearSearch() {
    this.searchQuery = '';
    this.filteredTasks = null;
    this.updateStatus('Ready');
    this.renderBoard();
  }
  
  render() {
    this.screen.render();
  }
}

module.exports = NotionTUI;