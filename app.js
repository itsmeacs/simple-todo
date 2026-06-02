class TaskManager {
    constructor() {
        this.currentWeekOffset = 0;
        this.tasks = {};
        this.init();
    }

    async init() {
        // Load tasks from server
        await this.loadTasks();

        this.updateWeekDisplay();
        this.renderAllTasks();
        this.attachEventListeners();
        this.setupNotifications();
    }

    async setupNotifications() {
        if ('Notification' in window) {
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }

            if (Notification.permission === 'granted') {
                // Send notification immediately on load if there are high priority tasks
                this.sendHighPriorityNotification();

                // Set up hourly notifications
                setInterval(() => {
                    this.sendHighPriorityNotification();
                }, 60 * 60 * 1000); // Every hour
            }
        }
    }

    sendHighPriorityNotification() {
        // Only send notifications for current week
        if (this.currentWeekOffset !== 0) return;

        const weekTasks = this.getCurrentWeekTasks();
        const highPriorityTasks = [];

        // Collect all red priority tasks from non-completed lists
        ['todo', 'in-progress', 'follow-up'].forEach(status => {
            const redTasks = weekTasks[status].filter(task => task.priority === 'red');
            highPriorityTasks.push(...redTasks.map(task => ({
                text: task.text,
                status: status
            })));
        });

        if (highPriorityTasks.length === 0) return;

        // Get top 3 highest priority tasks
        const topTasks = highPriorityTasks.slice(0, 3);
        const taskList = topTasks.map((task, i) => `${i + 1}. ${task.text}`).join('\n');

        const notification = new Notification('High Priority Tasks', {
            body: `You have ${highPriorityTasks.length} high priority task(s):\n\n${taskList}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23f56565"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="white">!</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23f56565"/></svg>',
            tag: 'high-priority-tasks',
            requireInteraction: false
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }

    getWeekKey() {
        const date = new Date();
        date.setDate(date.getDate() + (this.currentWeekOffset * 7));
        const weekStart = this.getWeekStart(date);
        return `week-${weekStart.toISOString().split('T')[0]}`;
    }

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
        return new Date(d.setDate(diff));
    }

    getWeekEnd(weekStart) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return weekEnd;
    }

    updateWeekDisplay() {
        const date = new Date();
        date.setDate(date.getDate() + (this.currentWeekOffset * 7));
        const weekStart = this.getWeekStart(date);
        const weekEnd = this.getWeekEnd(weekStart);

        const formatDate = (d) => {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        };

        const weekText = `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
        document.getElementById('current-week').textContent = weekText;
    }

    async loadTasks() {
        try {
            const response = await fetch('/api/tasks');
            if (response.ok) {
                this.tasks = await response.json();
            } else {
                console.error('Failed to load tasks from server');
                this.tasks = {};
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.tasks = {};
        }
    }

    async saveTasks() {
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.tasks)
            });

            if (!response.ok) {
                console.error('Failed to save tasks to server');
            }
        } catch (error) {
            console.error('Error saving tasks:', error);
        }
    }

    getCurrentWeekTasks() {
        const weekKey = this.getWeekKey();
        if (!this.tasks[weekKey]) {
            this.tasks[weekKey] = {
                'todo': [],
                'in-progress': [],
                'follow-up': [],
                'completed': []
            };
        }
        return this.tasks[weekKey];
    }

    addTask(status, text, priority = 'green') {
        if (!text.trim()) return;

        const task = {
            id: Date.now().toString(),
            text: text.trim(),
            status: status,
            priority: priority,
            subtasks: [],
            createdAt: new Date().toISOString()
        };

        const weekTasks = this.getCurrentWeekTasks();
        weekTasks[status].push(task);
        this.saveTasks();
        this.renderTaskList(status);
    }

    addSubtask(status, parentTaskId, text, priority = 'green') {
        if (!text.trim()) return;

        const weekTasks = this.getCurrentWeekTasks();
        const parentTask = weekTasks[status].find(t => t.id === parentTaskId);

        if (!parentTask) return;

        if (!parentTask.subtasks) {
            parentTask.subtasks = [];
        }

        const subtask = {
            id: `${Date.now()}-sub-${Math.random()}`,
            text: text.trim(),
            priority: priority,
            createdAt: new Date().toISOString()
        };

        parentTask.subtasks.push(subtask);
        this.saveTasks();
        this.renderTaskList(status);
    }

    deleteSubtask(status, parentTaskId, subtaskId) {
        const weekTasks = this.getCurrentWeekTasks();
        const parentTask = weekTasks[status].find(t => t.id === parentTaskId);

        if (!parentTask || !parentTask.subtasks) return;

        parentTask.subtasks = parentTask.subtasks.filter(st => st.id !== subtaskId);
        this.saveTasks();
        this.renderTaskList(status);
    }

    updateSubtask(status, parentTaskId, subtaskId, newText) {
        const weekTasks = this.getCurrentWeekTasks();
        const parentTask = weekTasks[status].find(t => t.id === parentTaskId);

        if (!parentTask || !parentTask.subtasks) return;

        const subtask = parentTask.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.text = newText.trim();
            this.saveTasks();
            this.renderTaskList(status);
        }
    }

    setSubtaskPriority(status, parentTaskId, subtaskId, priority) {
        const weekTasks = this.getCurrentWeekTasks();
        const parentTask = weekTasks[status].find(t => t.id === parentTaskId);

        if (!parentTask || !parentTask.subtasks) return;

        const subtask = parentTask.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.priority = priority;
            this.saveTasks();
            this.renderTaskList(status);
        }
    }

    showSubtaskInput(status, parentTaskId) {
        const existingInput = document.querySelector('.add-subtask-input');
        if (existingInput) {
            existingInput.remove();
        }

        const taskElement = document.querySelector(`[data-task-id="${parentTaskId}"]`);
        if (!taskElement) return;

        let subtasksContainer = taskElement.querySelector('.subtasks-container');
        if (!subtasksContainer) {
            subtasksContainer = document.createElement('div');
            subtasksContainer.className = 'subtasks-container';
            taskElement.appendChild(subtasksContainer);
        }

        const inputContainer = document.createElement('div');
        inputContainer.className = 'subtask-input-container';
        inputContainer.innerHTML = `
            <input type="text" class="add-subtask-input" placeholder="Add subtask..." autofocus>
            <button class="save-btn">Add</button>
            <button class="cancel-btn">Cancel</button>
        `;

        subtasksContainer.insertBefore(inputContainer, subtasksContainer.firstChild);

        const input = inputContainer.querySelector('.add-subtask-input');
        const saveBtn = inputContainer.querySelector('.save-btn');
        const cancelBtn = inputContainer.querySelector('.cancel-btn');

        const save = () => {
            if (input.value.trim()) {
                this.addSubtask(status, parentTaskId, input.value);
            }
            inputContainer.remove();
        };

        const cancel = () => {
            inputContainer.remove();
        };

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
        });

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', cancel);

        input.focus();
    }

    deleteTask(status, taskId) {
        const weekTasks = this.getCurrentWeekTasks();
        weekTasks[status] = weekTasks[status].filter(task => task.id !== taskId);
        this.saveTasks();
        this.renderTaskList(status);
    }

    updateTask(status, taskId, newText) {
        const weekTasks = this.getCurrentWeekTasks();
        const task = weekTasks[status].find(t => t.id === taskId);
        if (task) {
            task.text = newText.trim();
            this.saveTasks();
            this.renderTaskList(status);
        }
    }

    moveTask(fromStatus, toStatus, taskId) {
        const weekTasks = this.getCurrentWeekTasks();
        const taskIndex = weekTasks[fromStatus].findIndex(t => t.id === taskId);

        if (taskIndex !== -1) {
            const task = weekTasks[fromStatus][taskIndex];
            task.status = toStatus;
            weekTasks[fromStatus].splice(taskIndex, 1);
            weekTasks[toStatus].push(task);
            this.saveTasks();
            this.renderTaskList(fromStatus);
            this.renderTaskList(toStatus);
        }
    }

    renderTaskList(status) {
        const weekTasks = this.getCurrentWeekTasks();
        let tasks = weekTasks[status] || [];

        // Ensure all tasks have required fields (for backwards compatibility)
        tasks = tasks.map(task => ({
            ...task,
            priority: task.priority || 'green',
            subtasks: task.subtasks || []
        }));

        // Sort tasks: red first (by creation time), then yellow, then green
        const priorityOrder = { 'red': 0, 'yellow': 1, 'green': 2 };
        tasks.sort((a, b) => {
            if (a.priority !== b.priority) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            // Within same priority, sort by creation time (oldest first for red)
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        const listElement = document.getElementById(`${status}-list`);
        const column = document.querySelector(`[data-status="${status}"]`);
        const countElement = column.querySelector('.task-count');

        countElement.textContent = tasks.length;

        listElement.innerHTML = tasks.map(task => {
            const createdDate = new Date(task.createdAt);
            const formattedDate = createdDate.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            // Render subtasks
            const subtasksHtml = (task.subtasks && task.subtasks.length > 0) ? `
                <div class="subtasks-container">
                    ${task.subtasks.map(subtask => {
                        const subCreatedDate = new Date(subtask.createdAt);
                        const subFormattedDate = subCreatedDate.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        });

                        return `
                        <div class="subtask-item priority-${subtask.priority}" data-subtask-id="${subtask.id}" data-parent-id="${task.id}" title="Created: ${subFormattedDate}">
                            <div class="subtask-content">
                                <div class="subtask-text">${this.escapeHtml(subtask.text)}</div>
                                <div class="subtask-actions">
                                    <div class="priority-selector">
                                        <button class="priority-btn priority-red ${subtask.priority === 'red' ? 'active' : ''}" onclick="taskManager.setSubtaskPriority('${status}', '${task.id}', '${subtask.id}', 'red')" title="High Priority"></button>
                                        <button class="priority-btn priority-yellow ${subtask.priority === 'yellow' ? 'active' : ''}" onclick="taskManager.setSubtaskPriority('${status}', '${task.id}', '${subtask.id}', 'yellow')" title="Medium Priority"></button>
                                        <button class="priority-btn priority-green ${subtask.priority === 'green' ? 'active' : ''}" onclick="taskManager.setSubtaskPriority('${status}', '${task.id}', '${subtask.id}', 'green')" title="Low Priority"></button>
                                    </div>
                                    <button class="task-btn edit-btn" onclick="taskManager.editSubtask('${status}', '${task.id}', '${subtask.id}')">✏️</button>
                                    <button class="task-btn delete-btn" onclick="taskManager.deleteSubtask('${status}', '${task.id}', '${subtask.id}')">🗑️</button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            ` : '';

            return `
            <div class="task-item priority-${task.priority}" draggable="true" data-task-id="${task.id}" data-status="${status}" title="Created: ${formattedDate}">
                <div class="task-priority-bar"></div>
                <div class="task-content">
                    <div class="task-text">${this.escapeHtml(task.text)}</div>
                    <div class="task-actions">
                        <button class="add-subtask-btn" onclick="taskManager.showSubtaskInput('${status}', '${task.id}')" title="Add subtask">+</button>
                        <div class="priority-selector">
                            <button class="priority-btn priority-red ${task.priority === 'red' ? 'active' : ''}" onclick="taskManager.setPriority('${status}', '${task.id}', 'red')" title="High Priority"></button>
                            <button class="priority-btn priority-yellow ${task.priority === 'yellow' ? 'active' : ''}" onclick="taskManager.setPriority('${status}', '${task.id}', 'yellow')" title="Medium Priority"></button>
                            <button class="priority-btn priority-green ${task.priority === 'green' ? 'active' : ''}" onclick="taskManager.setPriority('${status}', '${task.id}', 'green')" title="Low Priority"></button>
                        </div>
                        <button class="task-btn edit-btn" onclick="taskManager.editTask('${status}', '${task.id}')">✏️</button>
                        <button class="task-btn delete-btn" onclick="taskManager.deleteTask('${status}', '${task.id}')">🗑️</button>
                    </div>
                </div>
                ${subtasksHtml}
            </div>
        `;
        }).join('');

        this.attachDragListeners();
    }


    editTask(status, taskId) {
        const weekTasks = this.getCurrentWeekTasks();
        const task = weekTasks[status].find(t => t.id === taskId);
        if (!task) return;

        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        const taskContent = taskElement.querySelector('.task-content');

        taskContent.innerHTML = `
            <div class="edit-mode">
                <input type="text" class="edit-input" value="${this.escapeHtml(task.text)}" id="edit-input-${taskId}">
                <button class="save-btn" onclick="taskManager.saveEdit('${status}', '${taskId}')">Save</button>
                <button class="cancel-btn" onclick="taskManager.renderTaskList('${status}')">Cancel</button>
            </div>
        `;

        document.getElementById(`edit-input-${taskId}`).focus();
    }

    saveEdit(status, taskId) {
        const input = document.getElementById(`edit-input-${taskId}`);
        if (input && input.value.trim()) {
            this.updateTask(status, taskId, input.value);
        }
    }

    editSubtask(status, parentTaskId, subtaskId) {
        const weekTasks = this.getCurrentWeekTasks();
        const parentTask = weekTasks[status].find(t => t.id === parentTaskId);
        if (!parentTask || !parentTask.subtasks) return;

        const subtask = parentTask.subtasks.find(st => st.id === subtaskId);
        if (!subtask) return;

        const subtaskElement = document.querySelector(`[data-subtask-id="${subtaskId}"]`);
        const subtaskContent = subtaskElement.querySelector('.subtask-content');

        subtaskContent.innerHTML = `
            <div class="edit-mode">
                <input type="text" class="edit-input" value="${this.escapeHtml(subtask.text)}" id="edit-input-${subtaskId}">
                <button class="save-btn" onclick="taskManager.saveSubtaskEdit('${status}', '${parentTaskId}', '${subtaskId}')">Save</button>
                <button class="cancel-btn" onclick="taskManager.renderTaskList('${status}')">Cancel</button>
            </div>
        `;

        document.getElementById(`edit-input-${subtaskId}`).focus();
    }

    saveSubtaskEdit(status, parentTaskId, subtaskId) {
        const input = document.getElementById(`edit-input-${subtaskId}`);
        if (input && input.value.trim()) {
            this.updateSubtask(status, parentTaskId, subtaskId, input.value);
        }
    }

    renderAllTasks() {
        ['todo', 'in-progress', 'follow-up', 'completed'].forEach(status => {
            this.renderTaskList(status);
        });
    }

    attachEventListeners() {
        // Add task buttons
        document.querySelectorAll('.task-column').forEach(column => {
            const status = column.dataset.status;
            const input = column.querySelector('.task-input');
            const addBtn = column.querySelector('.add-btn');

            addBtn.addEventListener('click', () => {
                this.addTask(status, input.value);
                input.value = '';
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask(status, input.value);
                    input.value = '';
                }
            });
        });

        // Week navigation
        document.getElementById('prev-week').addEventListener('click', () => {
            this.currentWeekOffset--;
            this.updateWeekDisplay();
            this.renderAllTasks();
        });

        document.getElementById('next-week').addEventListener('click', () => {
            const previousWeekOffset = this.currentWeekOffset;
            this.currentWeekOffset++;
            this.carryForwardTasks(previousWeekOffset);
            this.updateWeekDisplay();
            this.renderAllTasks();
        });

        // Simulation
        document.getElementById('simulate-week-btn').addEventListener('click', () => this.simulateWeek());
        document.getElementById('sim-stop-btn').addEventListener('click', () => this.stopSimulation());

        // Import/Export
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));

        // Notes Import
        document.getElementById('import-notes-btn').addEventListener('click', () => this.openNotesImportModal());
        document.querySelector('.close-modal').addEventListener('click', () => this.closeNotesImportModal());
        document.getElementById('cancel-import').addEventListener('click', () => this.closeNotesImportModal());
        document.getElementById('process-import').addEventListener('click', () => this.processNotesImport());

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // File selection
        document.getElementById('select-files-btn').addEventListener('click', () => {
            document.getElementById('import-notes-files').click();
        });

        document.getElementById('select-folder-btn').addEventListener('click', () => {
            document.getElementById('import-notes-folder').click();
        });

        document.getElementById('import-notes-files').addEventListener('change', (e) => {
            this.handleFileSelection(e);
        });

        document.getElementById('import-notes-folder').addEventListener('change', (e) => {
            this.handleFileSelection(e);
        });

        // Close modal on outside click
        document.getElementById('notes-import-modal').addEventListener('click', (e) => {
            if (e.target.id === 'notes-import-modal') {
                this.closeNotesImportModal();
            }
        });
    }

    attachDragListeners() {
        const taskItems = document.querySelectorAll('.task-item');

        taskItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', item.innerHTML);
                e.dataTransfer.setData('taskId', item.dataset.taskId);
                e.dataTransfer.setData('fromStatus', item.dataset.status);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            // Support drag over other items for reordering
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = document.querySelector('.dragging');
                const afterElement = this.getDragAfterElement(item.parentElement, e.clientY);

                if (dragging && dragging !== item) {
                    if (afterElement == null) {
                        item.parentElement.appendChild(dragging);
                    } else {
                        item.parentElement.insertBefore(dragging, afterElement);
                    }
                }
            });
        });

        const taskLists = document.querySelectorAll('.task-list');

        taskLists.forEach(list => {
            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const dragging = document.querySelector('.dragging');
                const afterElement = this.getDragAfterElement(list, e.clientY);

                if (dragging && afterElement == null) {
                    list.appendChild(dragging);
                } else if (dragging && afterElement) {
                    list.insertBefore(dragging, afterElement);
                }
            });

            list.addEventListener('drop', (e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData('taskId');
                const fromStatus = e.dataTransfer.getData('fromStatus');
                const toStatus = list.id.replace('-list', '');

                if (fromStatus !== toStatus) {
                    // Moving to different list
                    this.moveTask(fromStatus, toStatus, taskId);
                } else {
                    // Reordering within same list
                    this.reorderTasks(toStatus);
                }
            });
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    reorderTasks(status) {
        const weekTasks = this.getCurrentWeekTasks();
        const listElement = document.getElementById(`${status}-list`);
        const taskElements = listElement.querySelectorAll('.task-item');

        // Get current order from DOM
        const newOrder = Array.from(taskElements).map(el => el.dataset.taskId);

        // Reorder tasks array to match DOM order
        const reorderedTasks = newOrder.map(id =>
            weekTasks[status].find(t => t.id === id)
        ).filter(t => t); // Filter out any nulls

        weekTasks[status] = reorderedTasks;
        this.saveTasks();
    }

    simulateWeek() {
        if (this._simInterval) return; // already running

        const TOTAL_MS = 60 * 1000;
        const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const startTime = Date.now();

        const bar = document.getElementById('sim-bar');
        const fill = document.getElementById('sim-progress-fill');
        const dayLabel = document.getElementById('sim-day-label');
        const countdown = document.getElementById('sim-countdown');
        const simBtn = document.getElementById('simulate-week-btn');

        bar.style.display = 'flex';
        simBtn.disabled = true;

        this._simInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const pct = Math.min(elapsed / TOTAL_MS, 1);
            const dayIndex = Math.min(Math.floor(pct * 7), 6);
            const remaining = Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));

            fill.style.width = `${pct * 100}%`;
            dayLabel.textContent = DAYS[dayIndex];
            countdown.textContent = `${remaining}s`;

            if (elapsed >= TOTAL_MS) {
                this.stopSimulation();
                // Advance to next week and carry over non-completed tasks
                const previousWeekOffset = this.currentWeekOffset;
                this.currentWeekOffset++;
                this.carryForwardTasks(previousWeekOffset);
                this.updateWeekDisplay();
                this.renderAllTasks();
            }
        }, 500);
    }

    stopSimulation() {
        if (this._simInterval) {
            clearInterval(this._simInterval);
            this._simInterval = null;
        }
        document.getElementById('sim-bar').style.display = 'none';
        document.getElementById('sim-progress-fill').style.width = '0%';
        document.getElementById('simulate-week-btn').disabled = false;
    }

    carryForwardTasks(previousWeekOffset) {
        // Get previous week's tasks
        const tempOffset = this.currentWeekOffset;
        this.currentWeekOffset = previousWeekOffset;
        const previousWeekKey = this.getWeekKey();
        const previousWeekTasks = this.tasks[previousWeekKey];

        // Restore current week offset
        this.currentWeekOffset = tempOffset;

        if (!previousWeekTasks) return;

        const currentWeekTasks = this.getCurrentWeekTasks();
        const currentWeekKey = this.getWeekKey();

        // Check if we've already carried forward from this specific week
        const alreadyCarriedFromThisWeek = ['todo', 'in-progress', 'follow-up'].some(status =>
            (currentWeekTasks[status] || []).some(task => task.carriedFrom === previousWeekKey)
        );

        if (alreadyCarriedFromThisWeek) {
            console.log('Tasks already carried forward from', previousWeekKey, 'to', currentWeekKey);
            return;
        }

        // Copy incomplete tasks (not completed) to new week
        let carriedCount = 0;
        ['todo', 'in-progress', 'follow-up'].forEach(status => {
            const tasksToCarry = previousWeekTasks[status] || [];
            tasksToCarry.forEach(task => {
                const newTask = {
                    id: `${Date.now()}-${Math.random()}`,
                    text: task.text,
                    status: status,
                    priority: task.priority || 'green',
                    subtasks: (task.subtasks || []).map(st => ({
                        ...st,
                        id: `${Date.now()}-sub-${Math.random()}`
                    })),
                    createdAt: new Date().toISOString(),
                    carriedFrom: previousWeekKey
                };
                currentWeekTasks[status].push(newTask);
                carriedCount++;
            });
        });

        this.saveTasks();

        if (carriedCount > 0) {
            console.log(`Carried forward ${carriedCount} tasks from ${previousWeekKey} to ${currentWeekKey}`);
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.tasks, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `task-manager-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (confirm('This will replace all existing data. Continue?')) {
                    this.tasks = imported;
                    this.saveTasks();
                    this.renderAllTasks();
                    alert('Data imported successfully!');
                }
            } catch (error) {
                alert('Error importing data. Please check the file format.');
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    setPriority(status, taskId, priority) {
        const weekTasks = this.getCurrentWeekTasks();
        const task = weekTasks[status].find(t => t.id === taskId);
        if (task) {
            task.priority = priority;
            this.saveTasks();
            this.renderTaskList(status);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openNotesImportModal() {
        const modal = document.getElementById('notes-import-modal');
        modal.classList.add('active');
        this.switchTab('paste');
        this.selectedFiles = null;
        document.getElementById('notes-textarea').focus();
    }

    closeNotesImportModal() {
        const modal = document.getElementById('notes-import-modal');
        modal.classList.remove('active');
        document.getElementById('notes-textarea').value = '';
        document.getElementById('clear-existing').checked = false;
        document.getElementById('import-notes-files').value = '';
        document.getElementById('import-notes-folder').value = '';
        document.getElementById('files-selected').innerHTML = 'No files selected';
        document.getElementById('files-selected').classList.remove('has-files');
        this.selectedFiles = null;
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
    }

    handleFileSelection(event) {
        const files = Array.from(event.target.files).filter(f => f.name.endsWith('.txt'));

        if (files.length === 0) {
            alert('No .txt files found. Please select text files exported from Notes app.');
            return;
        }

        this.selectedFiles = files;

        const filesInfo = document.getElementById('files-selected');
        filesInfo.classList.add('has-files');
        filesInfo.innerHTML = `
            <strong>${files.length} file(s) selected:</strong>
            <ul class="file-list">
                ${files.slice(0, 10).map(f => `<li>${f.name}</li>`).join('')}
                ${files.length > 10 ? `<li>... and ${files.length - 10} more</li>` : ''}
            </ul>
        `;
    }

    parseNotesText(text) {
        if (!text.trim()) return [];

        const lines = text.split('\n');
        const tasks = [];

        for (let line of lines) {
            // Trim whitespace
            line = line.trim();

            // Skip empty lines
            if (!line) continue;

            // Remove common bullet points and list markers
            // Supports: -, •, *, ◦, ▪, ▫, –, —, numbered lists (1. 2. etc), checkboxes [ ] [x]
            const cleaned = line
                .replace(/^[-•*◦▪▫–—]\s+/, '')           // Bullet points
                .replace(/^\d+[\.\)]\s+/, '')              // Numbered lists (1. or 1))
                .replace(/^[☐☑✓✔✗✘☒]\s+/, '')            // Checkboxes
                .replace(/^\[\s*[xX✓✔]?\s*\]\s+/, '')    // Markdown checkboxes [ ] [x]
                .replace(/^>\s+/, '')                      // Quote marks
                .trim();

            if (cleaned) {
                tasks.push(cleaned);
            }
        }

        return tasks;
    }

    processNotesImport() {
        if (this.currentTab === 'paste') {
            this.processPasteImport();
        } else if (this.currentTab === 'files') {
            this.processFilesImport();
        }
    }

    processPasteImport() {
        const textarea = document.getElementById('notes-textarea');
        const targetList = document.getElementById('target-list').value;
        const clearExisting = document.getElementById('clear-existing').checked;

        const parsedTasks = this.parseNotesText(textarea.value);

        if (parsedTasks.length === 0) {
            alert('No tasks found. Please paste your notes and try again.');
            return;
        }

        // Confirm import
        const message = clearExisting
            ? `Import ${parsedTasks.length} tasks and clear existing tasks in "${targetList.replace('-', ' ')}"?`
            : `Import ${parsedTasks.length} tasks to "${targetList.replace('-', ' ')}"?`;

        if (!confirm(message)) {
            return;
        }

        const weekTasks = this.getCurrentWeekTasks();

        // Clear existing if requested
        if (clearExisting) {
            weekTasks[targetList] = [];
        }

        // Add new tasks
        let addedCount = 0;
        parsedTasks.forEach(taskText => {
            const task = {
                id: `${Date.now()}-${addedCount}`,
                text: taskText,
                status: targetList,
                priority: 'green',
                subtasks: [],
                createdAt: new Date().toISOString()
            };
            weekTasks[targetList].push(task);
            addedCount++;
        });

        this.saveTasks();
        this.renderTaskList(targetList);
        this.closeNotesImportModal();

        alert(`Successfully imported ${addedCount} tasks!`);
    }

    async processFilesImport() {
        if (!this.selectedFiles || this.selectedFiles.length === 0) {
            alert('Please select files first.');
            return;
        }

        const autoDetectWeek = document.getElementById('auto-detect-week').checked;
        const mergeWithExisting = document.getElementById('merge-with-existing').checked;

        try {
            let totalImported = 0;
            const filesProcessed = [];

            for (const file of this.selectedFiles) {
                const content = await this.readFileAsText(file);
                const result = this.parseStructuredNotes(content, autoDetectWeek);

                if (result.tasks > 0) {
                    filesProcessed.push({ file: file.name, ...result });
                    totalImported += result.tasks;
                }
            }

            if (totalImported === 0) {
                alert('No tasks found in the selected files.');
                return;
            }

            // Confirm import
            const message = `Import ${totalImported} tasks from ${filesProcessed.length} file(s)?`;
            if (!confirm(message)) {
                return;
            }

            // Process imports
            for (const result of filesProcessed) {
                this.importStructuredTasks(result, mergeWithExisting);
            }

            this.saveTasks();
            this.renderAllTasks();
            this.closeNotesImportModal();

            alert(`Successfully imported ${totalImported} tasks from ${filesProcessed.length} file(s)!`);

        } catch (error) {
            alert('Error importing files: ' + error.message);
            console.error(error);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    parseStructuredNotes(content, autoDetectWeek = true) {
        // Handle case where Notes export removes all line breaks
        // First try to detect if content is on a single line and split it properly
        let processedContent = content;

        // If content has very few line breaks but is long, it's likely concatenated
        const lineCount = content.split('\n').filter(l => l.trim()).length;
        if (lineCount <= 2 && content.length > 100) {
            // Split on section markers to restore structure
            processedContent = content
                .replace(/TODO LIST/gi, '\nTODO LIST')
                .replace(/TODO\s*\(/gi, '\nTODO (')
                .replace(/\bTasks\b/gi, '\nTasks')
                .replace(/\bINPR\b/gi, '\nINPR\n')
                .replace(/\bIn Progress\b/gi, '\nIn Progress\n')
                .replace(/\bFOLL\b/gi, '\nFOLL\n')
                .replace(/\bFollow[- ]?Up\b/gi, '\nFollow Up\n')
                .replace(/\bDONE\b/gi, '\nDONE\n')
                .replace(/\bCompleted\b/gi, '\nCompleted\n')
                // Split on common task patterns that clearly indicate a new task
                .replace(/([a-z0-9])(BAN-\d+)/gi, '$1\n$2') // Ticket numbers like BAN-29128
                .replace(/([a-z])([A-Z][a-z]+(?:ing|ed|s)\s)/g, '$1\n$2') // Action words: "Review", "Update", "polling"
                .replace(/\b(review|update|check|create|implement|fix|debug|test|deploy|add|remove|refactor)\b/gi, '\n$1'); // Common task verbs
        }

        const lines = processedContent.split('\n');
        const result = {
            weekKey: null,
            dateRange: null,
            sections: {
                'todo': [],
                'in-progress': [],
                'follow-up': [],
                'completed': []
            },
            tasks: 0
        };

        let currentSection = null;

        for (let line of lines) {
            const trimmed = line.trim();

            // Skip empty lines
            if (!trimmed) continue;

            // Detect date range - supports multiple formats:
            // "TODO (04/13 - 04/17)" or "TODO List (Mar 31-Apr 4)"
            let dateMatch = null;

            // Try standard MM/DD format first
            dateMatch = trimmed.match(/\((\d{1,2}\/\d{1,2})\s*-\s*(\d{1,2}\/\d{1,2})\)/);
            if (dateMatch && autoDetectWeek) {
                result.dateRange = {
                    start: dateMatch[1],
                    end: dateMatch[2]
                };
                result.weekKey = this.getWeekKeyFromDateRange(dateMatch[1], dateMatch[2]);
            }

            // Try "Mar 31-Apr 4" format
            if (!dateMatch) {
                dateMatch = trimmed.match(/\((\w{3})\s+(\d{1,2})\s*-\s*(\w{3})\s+(\d{1,2})\)/);
                if (dateMatch && autoDetectWeek) {
                    const monthMap = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                                      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 };
                    const m1 = monthMap[dateMatch[1].toLowerCase()];
                    const d1 = dateMatch[2];
                    const m2 = monthMap[dateMatch[3].toLowerCase()];
                    const d2 = dateMatch[4];

                    if (m1 && m2) {
                        result.dateRange = {
                            start: `${m1}/${d1}`,
                            end: `${m2}/${d2}`
                        };
                        result.weekKey = this.getWeekKeyFromDateRange(`${m1}/${d1}`, `${m2}/${d2}`);
                    }
                }
            }

            // Skip title lines that just have the date (like "TODO List (Mar 31-Apr 4)")
            if (trimmed.match(/^TODO\s*(?:LIST)?\s*\(/i) || trimmed.match(/^Week.*\(/i)) {
                continue;
            }

            // Skip generic "Tasks" header
            if (trimmed.match(/^Tasks\s*$/i)) {
                // Keep current section or default to todo
                if (!currentSection) currentSection = 'todo';
                continue;
            }

            // Detect section headers - more flexible matching
            // Match "TODO", "TODO List", etc. but NOT the title line with dates
            if (trimmed.match(/^TODO(?:\s+List)?\s*$/i) || trimmed.match(/^TODO\s*$/i)) {
                currentSection = 'todo';
                continue;
            } else if (trimmed.match(/^(INPR|In\s+Progress)\s*$/i)) {
                currentSection = 'in-progress';
                continue;
            } else if (trimmed.match(/^(FOLL|Follow\s*-?\s*[Uu]p)\s*$/i)) {
                currentSection = 'follow-up';
                continue;
            } else if (trimmed.match(/^(DONE|Completed)\s*$/i)) {
                currentSection = 'completed';
                continue;
            }

            // Parse task if we're in a section
            if (currentSection) {
                // Remove common bullet points and list markers
                let taskText = trimmed
                    .replace(/^[-•*◦▪▫–—]\s+/, '')
                    .replace(/^\d+[\.\)]\s+/, '')
                    .replace(/^[☐☑✓✔✗✘☒]\s+/, '')
                    .replace(/^\[\s*[xX✓✔]?\s*\]\s+/, '')
                    .trim();

                // If no bullet point but looks like a task (has content), accept it
                // Skip very short lines that are likely noise
                if (taskText && taskText.length > 2) {
                    // Skip common non-task lines
                    if (!taskText.match(/^(TODO|INPR|FOLL|DONE|Tasks|In Progress|Follow Up|Completed)\s*$/i)) {
                        result.sections[currentSection].push(taskText);
                        result.tasks++;
                    }
                }
            }
        }

        return result;
    }

    getWeekKeyFromDateRange(startDate, endDate) {
        try {
            // Parse date like "04/13" with current year
            const currentYear = new Date().getFullYear();
            const [month, day] = startDate.split('/').map(n => parseInt(n));

            // Create date for the start of the week
            const date = new Date(currentYear, month - 1, day);

            // Adjust if the date is in the future (might be from previous year)
            const now = new Date();
            if (date > now) {
                date.setFullYear(currentYear - 1);
            }

            const weekStart = this.getWeekStart(date);
            return `week-${weekStart.toISOString().split('T')[0]}`;
        } catch (error) {
            console.error('Error parsing date range:', error);
            return null;
        }
    }

    importStructuredTasks(result, mergeWithExisting) {
        const weekKey = result.weekKey || this.getWeekKey();

        // Initialize week if it doesn't exist
        if (!this.tasks[weekKey]) {
            this.tasks[weekKey] = {
                'todo': [],
                'in-progress': [],
                'follow-up': [],
                'completed': []
            };
        }

        const weekTasks = this.tasks[weekKey];

        // Import tasks for each section
        ['todo', 'in-progress', 'follow-up', 'completed'].forEach(section => {
            if (!mergeWithExisting) {
                weekTasks[section] = [];
            }

            result.sections[section].forEach((taskText, index) => {
                const task = {
                    id: `${Date.now()}-${section}-${index}-${Math.random()}`,
                    text: taskText,
                    status: section,
                    priority: 'green',
                    subtasks: [],
                    createdAt: new Date().toISOString()
                };
                weekTasks[section].push(task);
            });
        });
    }
}

// Initialize the app
const taskManager = new TaskManager();
