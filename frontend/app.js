const API_BASE = 'http://localhost:5000/api';

// ===== STATE =====
let allTasks = [];
let allMembers = [];
let allProjects = [];
let currentProject = null;
let currentFilters = {};

// ===== TOAST NOTIFICATION SYSTEM =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  toast.innerHTML = `
    <div class="toast-message">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getPriorityIcon(priority) {
  const icons = {
    'low': '🟢',
    'medium': '🟡',
    'high': '🔴'
  };
  return icons[priority] || '⚪';
}

function generateTaskId(index) {
  return `TASK-${String(index + 1).padStart(3, '0')}`;
}

// ===== CSV IMPORT/EXPORT =====
function exportToCSV() {
  if (allTasks.length === 0) {
    showToast('No tasks to export', 'error');
    return;
  }

  // CSV headers
  const headers = ['Task ID', 'Title', 'Description', 'Status', 'Priority', 'Assignee', 'Tags'];

  // Convert tasks to CSV rows
  const rows = allTasks.map((task, index) => {
    const taskId = generateTaskId(index);
    const assigneeName = task.assigneeId ?
      (allMembers.find(m => m._id === task.assigneeId)?.name || task.assigneeId) : '';
    const tags = (task.tags || []).join(';');

    return [
      taskId,
      task.title || '',
      task.description || '',
      task.status || 'todo',
      task.priority || 'medium',
      assigneeName,
      tags
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
  });

  // Combine headers and rows
  const csv = [headers.join(','), ...rows].join('\n');

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `tasks_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`✅ Exported ${allTasks.length} tasks to CSV`, 'success');
}

function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  // Parse rows
  const tasks = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));

    if (values.length >= 2) {
      const task = {
        title: values[1] || `Imported Task ${i}`,
        description: values[2] || '',
        status: values[3] || 'todo',
        priority: values[4] || 'medium',
        assigneeId: '', // Will need to match by name if provided
        tags: values[6] ? values[6].split(';').map(t => t.trim()).filter(Boolean) : []
      };

      // Validate status
      if (!['todo', 'in_progress', 'done', 'blocked'].includes(task.status)) {
        task.status = 'todo';
      }

      // Validate priority
      if (!['low', 'medium', 'high'].includes(task.priority)) {
        task.priority = 'medium';
      }

      tasks.push(task);
    }
  }

  return tasks;
}

async function importFromCSV(file) {
  try {
    const text = await file.text();
    const tasks = parseCSV(text);

    if (tasks.length === 0) {
      showToast('No valid tasks found in CSV', 'error');
      return;
    }

    showToast(`Importing ${tasks.length} tasks...`, 'info');

    let successCount = 0;
    let errorCount = 0;

    for (const task of tasks) {
      try {
        await createTask(
          task.title,
          task.description,
          task.priority,
          task.assigneeId,
          task.tags,
          task.status
        );
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error importing task:', error);
      }
    }

    await loadTasks();

    if (errorCount > 0) {
      showToast(`⚠️ Imported ${successCount} tasks, ${errorCount} failed`, 'error');
    } else {
      showToast(`✅ Successfully imported ${successCount} tasks`, 'success');
    }
  } catch (error) {
    showToast(`Error importing CSV: ${error.message}`, 'error');
    console.error('CSV import error:', error);
  }
}

// ===== PROJECTS API =====
async function fetchProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return res.json();
  } catch (error) {
    showToast('Error loading projects', 'error');
    return [];
  }
}

async function createProject(name, key, description) {
  try {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, key, description })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to create project');
    }
    showToast(`✨ Project "${name}" created`, 'success');
    return res.json();
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

async function loadProjects() {
  allProjects = await fetchProjects();
  renderProjectsList();
  
  // If no project selected, select the first one
  if (!currentProject && allProjects.length > 0) {
    selectProject(allProjects[0]);
  } else if (allProjects.length === 0) {
    // No projects, show empty state
    showToast('👋 Welcome! Create your first project to get started', 'info');
  }
}

function selectProject(project) {
  currentProject = project;
  renderProjectsList(); // Update active state
  
  // Update header
  const headerTitle = document.querySelector('.header-left h1');
  headerTitle.textContent = project.name;
  const headerSubtitle = document.querySelector('.header-left .muted');
  headerSubtitle.textContent = `${project.key} • Kanban Board`;
  
  loadTasks();
}

function renderProjectsList() {
  const list = document.getElementById('projectsList');
  list.innerHTML = '';
  
  if (allProjects.length === 0) {
    list.innerHTML = '<div class="empty-state"><p class="empty-state-description">No projects yet</p></div>';
    return;
  }
  
  allProjects.forEach(p => {
    const div = document.createElement('div');
    div.className = `project-item ${currentProject && currentProject._id === p._id ? 'active' : ''}`;
    div.onclick = () => selectProject(p);
    
    div.innerHTML = `
      <div class="project-icon material-icons-round">folder</div>
      <div class="project-info">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-key">${escapeHtml(p.key)}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

// ===== MEMBERS API =====
async function fetchMembers() {
  try {
    const res = await fetch(`${API_BASE}/members`);
    if (!res.ok) throw new Error('Failed to fetch members');
    return res.json();
  } catch (error) {
    showToast('Error loading members', 'error');
    return [];
  }
}

async function addMember(name, email) {
  try {
    const res = await fetch(`${API_BASE}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    if (!res.ok) throw new Error('Failed to add member');
    showToast(`✨ Member "${name}" added`, 'success');
    return res.json();
  } catch (error) {
    showToast('Error adding member', 'error');
    throw error;
  }
}

async function deleteMember(id) {
  try {
    await fetch(`${API_BASE}/members/${id}`, { method: 'DELETE' });
    showToast('🗑️ Member deleted', 'success');
    await loadMembers();
    await loadTasks();
  } catch (error) {
    showToast('Error deleting member', 'error');
  }
}

async function loadMembers() {
  allMembers = await fetchMembers();
  const sel = document.getElementById('assigneeSelect');
  const filterSel = document.getElementById('filterAssignee');
  sel.innerHTML = '<option value="">— Unassigned —</option>';
  filterSel.innerHTML = '<option value="">All</option>';
  const list = document.getElementById('membersList');
  list.innerHTML = '';

  if (allMembers.length === 0) {
    list.innerHTML = '<div class="empty-state"><p class="empty-state-description">No members yet</p></div>';
    return;
  }

  allMembers.forEach(m => {
    const o = document.createElement('option');
    o.value = m._id;
    o.textContent = m.name;
    sel.appendChild(o);
    const f = o.cloneNode(true);
    filterSel.appendChild(f);

    const div = document.createElement('div');
    div.className = 'memberItem';
    div.innerHTML = `
      <div class="member-avatar">${getInitials(m.name)}</div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-email">${escapeHtml(m.email || 'No email')}</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.className = 'danger small';
    btn.onclick = () => {
      if (confirm(`Delete ${m.name}?`)) deleteMember(m._id);
    };
    div.appendChild(btn);
    list.appendChild(div);
  });
}

// ===== TASKS API =====
async function createTask(title, description, priority, assigneeId, tags, status = 'todo') {
  if (!currentProject) {
    showToast('Please select or create a project first', 'error');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        title, 
        description, 
        priority, 
        assigneeId, 
        tags, 
        status,
        projectId: currentProject._id
      })
    });
    if (!res.ok) throw new Error('Failed to create task');
    showToast(`✨ Task "${title}" created`, 'success');
    return res.json();
  } catch (error) {
    showToast('Error creating task', 'error');
    throw error;
  }
}

async function listTasks(filter) {
  if (!currentProject) return [];
  try {
    const query = { ...filter, projectId: currentProject._id };
    const q = new URLSearchParams(query).toString();
    const res = await fetch(`${API_BASE}/tasks?${q}`);
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  } catch (error) {
    showToast('Error loading tasks', 'error');
    return [];
  }
}

async function updateTask(id, data) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update task');
    return res.json();
  } catch (error) {
    showToast('Error updating task', 'error');
    throw error;
  }
}

async function deleteTask(id) {
  try {
    await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
    showToast('🗑️ Task deleted', 'success');
    loadTasks();
  } catch (error) {
    showToast('Error deleting task', 'error');
  }
}

async function updateTaskStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Failed to update status');

    if (newStatus === 'done') {
      showToast('🎉 Task completed!', 'success');
    } else {
      showToast('✅ Task moved', 'success');
    }
    return res.json();
  } catch (error) {
    showToast('Error updating status', 'error');
    throw error;
  }
}

// ===== UI EVENT HANDLERS =====
document.getElementById('addMember').addEventListener('click', async () => {
  const name = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim();
  if (!name) {
    showToast('⚠️ Please enter a name', 'error');
    return;
  }
  await addMember(name, email);
  document.getElementById('memberName').value = '';
  document.getElementById('memberEmail').value = '';
  loadMembers();
});

document.getElementById('createBtn').addEventListener('click', async () => {
  const title = document.getElementById('title').value.trim();
  if (!title) {
    showToast('⚠️ Please enter a title', 'error');
    return;
  }
  const description = document.getElementById('description').value.trim();
  const priority = document.getElementById('priority').value;
  const status = document.getElementById('status').value;
  const assigneeId = document.getElementById('assigneeSelect').value || '';
  const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await createTask(title, description, priority, assigneeId, tags, status);
  clearForm();
  closeModal();
  loadTasks();
});

document.getElementById('updateBtn').addEventListener('click', async () => {
  const id = document.getElementById('taskId').value;
  if (!id) return;
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const priority = document.getElementById('priority').value;
  const status = document.getElementById('status').value;
  const assigneeId = document.getElementById('assigneeSelect').value || '';
  const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await updateTask(id, { title, description, priority, status, assigneeId, tags });
  showToast('💾 Task updated', 'success');
  clearForm();
  closeModal();
  loadTasks();
});

document.getElementById('cancelEdit').addEventListener('click', () => {
  clearForm();
  closeModal();
});

document.getElementById('closeModal').addEventListener('click', () => {
  clearForm();
  closeModal();
});

document.getElementById('toggleTaskForm').addEventListener('click', () => {
  openModal();
});

document.getElementById('toggleSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('applyFilters').addEventListener('click', loadTasks);
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('filterPriority').value = '';
  document.getElementById('filterAssignee').value = '';
  loadTasks();
});

// Add task buttons in columns
document.querySelectorAll('.add-task-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const status = btn.dataset.status;
    document.getElementById('status').value = status;
    openModal();
  });
});

// CSV Import/Export buttons
document.getElementById('importCsvBtn').addEventListener('click', () => {
  document.getElementById('csvFileInput').click();
});

document.getElementById('csvFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    importFromCSV(file);
    e.target.value = ''; // Reset file input
  }
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  exportToCSV();
});

// Project Modal
const projectModal = document.getElementById('projectModal');
const createProjectBtn = document.getElementById('createProjectBtn');
const closeProjectModal = document.getElementById('closeProjectModal');
const submitProjectBtn = document.getElementById('submitProjectBtn');

createProjectBtn.addEventListener('click', () => {
  document.getElementById('projectName').value = '';
  document.getElementById('projectKey').value = '';
  document.getElementById('projectDescription').value = '';
  projectModal.style.display = 'flex';
});

closeProjectModal.addEventListener('click', () => {
  projectModal.style.display = 'none';
});

submitProjectBtn.addEventListener('click', async () => {
  const name = document.getElementById('projectName').value.trim();
  const key = document.getElementById('projectKey').value.trim().toUpperCase();
  const desc = document.getElementById('projectDescription').value.trim();
  
  if (!name || !key) {
    showToast('Name and Key are required', 'error');
    return;
  }
  
  try {
    const project = await createProject(name, key, desc);
    projectModal.style.display = 'none';
    await loadProjects();
    selectProject(project);
  } catch (e) {
    // Error handled in createProject
  }
});

// Modal functions
function openModal() {
  document.getElementById('taskFormModal').style.display = 'flex';
  document.getElementById('formTitle').textContent = document.getElementById('taskId').value ? 'Edit Task' : 'Create Task';
}

function closeModal() {
  document.getElementById('taskFormModal').style.display = 'none';
}

function clearForm() {
  document.getElementById('taskId').value = '';
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('priority').value = 'medium';
  document.getElementById('status').value = 'todo';
  document.getElementById('assigneeSelect').value = '';
  document.getElementById('tags').value = '';
  document.getElementById('createBtn').style.display = '';
  document.getElementById('updateBtn').style.display = 'none';
  document.getElementById('cancelEdit').style.display = 'none';
}

function startEdit(task) {
  document.getElementById('taskId').value = task._id;
  document.getElementById('title').value = task.title || '';
  document.getElementById('description').value = task.description || '';
  document.getElementById('priority').value = task.priority || 'medium';
  document.getElementById('status').value = task.status || 'todo';
  document.getElementById('assigneeSelect').value = task.assigneeId || '';
  document.getElementById('tags').value = (task.tags || []).join(',');
  document.getElementById('createBtn').style.display = 'none';
  document.getElementById('updateBtn').style.display = '';
  document.getElementById('cancelEdit').style.display = '';
  openModal();
}

// ===== RENDER KANBAN BOARD =====
function renderKanbanBoard(tasks) {
  const statuses = ['todo', 'in_progress', 'done', 'blocked'];

  // Group tasks by status
  const tasksByStatus = {
    'todo': [],
    'in_progress': [],
    'done': [],
    'blocked': []
  };

  tasks.forEach(task => {
    if (tasksByStatus[task.status]) {
      tasksByStatus[task.status].push(task);
    }
  });

  // Render each column
  statuses.forEach(status => {
    const column = document.getElementById(`column-${status}`);
    const count = document.getElementById(`count-${status}`);
    const columnTasks = tasksByStatus[status];

    count.textContent = columnTasks.length;
    column.innerHTML = '';

    if (columnTasks.length === 0) {
      column.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-description">No tasks</div>
        </div>
      `;
      return;
    }

    columnTasks.forEach(task => {
      const card = createTaskCard(task);
      column.appendChild(card);
    });
  });
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.taskId = task._id;

  // Drag events
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);

  // Card header
  const header = document.createElement('div');
  header.className = 'task-card-header';

  // Task ID (Jira-style)
  const taskIndex = allTasks.findIndex(t => t._id === task._id);
  const taskIdEl = document.createElement('div');
  taskIdEl.className = 'task-id';
  taskIdEl.textContent = generateTaskId(taskIndex >= 0 ? taskIndex : 0);
  card.appendChild(taskIdEl);

  const title = document.createElement('div');
  title.className = 'task-card-title';
  title.textContent = task.title;

  const menu = document.createElement('div');
  menu.className = 'task-card-menu';

  const historyBtn = document.createElement('button');
  historyBtn.textContent = '📜';
  historyBtn.title = 'View History';
  historyBtn.onclick = (e) => {
    e.stopPropagation();
    openHistoryModal(task);
  };

  const editBtn = document.createElement('button');
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit Task';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    startEdit(task);
  };

  menu.appendChild(historyBtn);
  menu.appendChild(editBtn);

  header.appendChild(title);
  header.appendChild(menu);
  card.appendChild(header);

  // Description
  if (task.description) {
    const desc = document.createElement('div');
    desc.className = 'task-card-description';
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  // Meta (priority + tags)
  const meta = document.createElement('div');
  meta.className = 'task-card-meta';

  const priorityBadge = document.createElement('span');
  priorityBadge.className = `badge priority-${task.priority}`;
  priorityBadge.textContent = `${getPriorityIcon(task.priority)} ${task.priority}`;
  meta.appendChild(priorityBadge);

  if (task.tags && task.tags.length) {
    task.tags.forEach(tag => {
      const tagEl = document.createElement('small');
      tagEl.className = 'tag';
      tagEl.textContent = tag;
      meta.appendChild(tagEl);
    });
  }

  // Date display
  if (task.createdAt) {
    const dateEl = document.createElement('div');
    dateEl.className = 'task-card-date';
    dateEl.innerHTML = `📅 ${new Date(task.createdAt).toLocaleDateString()}`;
    meta.appendChild(dateEl);
  }

  card.appendChild(meta);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'task-card-footer';

  const assignee = document.createElement('div');
  assignee.className = 'task-card-assignee';
  if (task.assigneeId) {
    const member = allMembers.find(m => m._id === task.assigneeId);
    if (member) {
      assignee.innerHTML = `
        <div class="member-avatar" style="width: 24px; height: 24px; font-size: 0.7rem;">${getInitials(member.name)}</div>
        <span>${escapeHtml(member.name)}</span>
      `;
    } else {
      assignee.textContent = '👤 Assigned';
    }
  } else {
    assignee.textContent = '👤 Unassigned';
  }

  const actions = document.createElement('div');
  actions.className = 'task-card-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑️';
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Delete "${task.title}"?`)) deleteTask(task._id);
  };
  actions.appendChild(deleteBtn);

  footer.appendChild(assignee);
  footer.appendChild(actions);
  card.appendChild(footer);

  return card;
}

// ===== DRAG AND DROP =====
let draggedTask = null;

function handleDragStart(e) {
  draggedTask = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedTask = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (!draggedTask) return false;

  // Get the status from the column-content element
  let dropTarget = e.currentTarget;
  let newStatus = dropTarget.dataset.status;

  // If dropped on column itself, find the column-content
  if (!newStatus) {
    const columnContent = dropTarget.querySelector('.column-content');
    if (columnContent) {
      newStatus = columnContent.dataset.status;
    }
  }

  if (!newStatus) {
    console.error('Could not determine target status');
    return false;
  }

  const taskId = draggedTask.dataset.taskId;

  if (taskId && newStatus) {
    updateTaskStatus(taskId, newStatus).then(() => {
      loadTasks();
    }).catch(err => {
      console.error('Error updating task status:', err);
    });
  }

  return false;
}

function setupDragAndDrop() {
  // Setup drop zones on column-content elements
  document.querySelectorAll('.column-content').forEach(column => {
    // Add data-status attribute
    const status = column.id.replace('column-', '');
    column.dataset.status = status;

    // Remove old listeners if any
    column.removeEventListener('dragover', handleDragOver);
    column.removeEventListener('drop', handleDrop);

    // Add new listeners
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
  });

  // Also make the whole column a drop zone
  document.querySelectorAll('.kanban-column').forEach(column => {
    const content = column.querySelector('.column-content');
    if (content) {
      const status = content.id.replace('column-', '');
      column.dataset.status = status;

      column.removeEventListener('dragover', handleDragOver);
      column.removeEventListener('drop', handleDrop);

      column.addEventListener('dragover', handleDragOver);
      column.addEventListener('drop', handleDrop);
    }
  });
}

// ===== HISTORY API =====
async function fetchHistory(taskId) {
  try {
    const res = await fetch(`${API_BASE}/history/${taskId}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  } catch (error) {
    showToast('Error loading history', 'error');
    return [];
  }
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state"><p class="empty-state-description">No history yet</p></div>';
    return;
  }

  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';

    let icon = '📝';
    if (item.action === 'create') icon = '✨';
    if (item.action === 'status_change') icon = '🔄';
    if (item.action === 'update') icon = '✏️';

    div.innerHTML = `
      <div class="history-icon">${icon}</div>
      <div class="history-content">
        <div class="history-details">${escapeHtml(item.details)}</div>
        <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
      </div>
    `;
    list.appendChild(div);
  });
}

async function openHistoryModal(task) {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="empty-state"><p class="empty-state-description">Loading...</p></div>';
  modal.style.display = 'flex';

  const history = await fetchHistory(task._id);
  renderHistory(history);
}

document.getElementById('closeHistoryModal').addEventListener('click', () => {
  document.getElementById('historyModal').style.display = 'none';
});

// ===== LOAD TASKS =====
async function loadTasks() {
  const priority = document.getElementById('filterPriority').value;
  const assignee = document.getElementById('filterAssignee').value;
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;

  const filter = {};
  if (priority) filter.priority = priority;
  if (assignee) filter.assigneeId = assignee;
  if (startDate) filter.startDate = startDate;
  if (endDate) filter.endDate = endDate;

  allTasks = await listTasks(filter);
  renderKanbanBoard(allTasks);

  // Setup drag and drop after rendering
  setupDragAndDrop();
}

// ===== DASHBOARD =====
let dashboardCharts = {
  status: null,
  priority: null,
  assignee: null,
  completion: null
};

function toggleDashboard() {
  const dashboard = document.getElementById('dashboardView');
  const board = document.getElementById('boardContainer');
  
  if (dashboard.style.display === 'none') {
    dashboard.style.display = 'block';
    board.style.display = 'none';
    renderDashboard();
  } else {
    dashboard.style.display = 'none';
    board.style.display = 'block';
  }
}

function renderDashboard() {
  if (!currentProject || allTasks.length === 0) {
    showToast('No data to display. Create some tasks first!', 'info');
    return;
  }
  
  // Update stats cards
  const stats = {
    todo: allTasks.filter(t => t.status === 'todo').length,
    in_progress: allTasks.filter(t => t.status === 'in_progress').length,
    done: allTasks.filter(t => t.status === 'done').length,
    blocked: allTasks.filter(t => t.status === 'blocked').length
  };
  
  document.getElementById('stat-todo').textContent = stats.todo;
  document.getElementById('stat-progress').textContent = stats.in_progress;
  document.getElementById('stat-done').textContent = stats.done;
  document.getElementById('stat-blocked').textContent = stats.blocked;
  
  // Render charts
  renderStatusChart(stats);
  renderPriorityChart();
  renderAssigneeChart();
  renderCompletionChart(stats);
}

function renderStatusChart(stats) {
  const ctx = document.getElementById('statusChart');
  
  // Destroy existing chart
  if (dashboardCharts.status) {
    dashboardCharts.status.destroy();
  }
  
  dashboardCharts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['To Do', 'In Progress', 'Done', 'Blocked'],
      datasets: [{
        data: [stats.todo, stats.in_progress, stats.done, stats.blocked],
        backgroundColor: [
          '#6366f1',
          '#0ea5e9',
          '#10b981',
          '#ef4444'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: {
              size: 12,
              family: 'Inter'
            }
          }
        }
      }
    }
  });
}

function renderPriorityChart() {
  const ctx = document.getElementById('priorityChart');
  
  const priorityStats = {
    low: allTasks.filter(t => t.priority === 'low').length,
    medium: allTasks.filter(t => t.priority === 'medium').length,
    high: allTasks.filter(t => t.priority === 'high').length
  };
  
  if (dashboardCharts.priority) {
    dashboardCharts.priority.destroy();
  }
  
  dashboardCharts.priority = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Low Priority', 'Medium Priority', 'High Priority'],
      datasets: [{
        data: [priorityStats.low, priorityStats.medium, priorityStats.high],
        backgroundColor: [
          '#10b981',
          '#f59e0b',
          '#ef4444'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: {
              size: 12,
              family: 'Inter'
            }
          }
        }
      }
    }
  });
}

function renderAssigneeChart() {
  const ctx = document.getElementById('assigneeChart');
  
  // Count tasks per assignee
  const assigneeMap = {};
  allTasks.forEach(task => {
    if (task.assigneeId) {
      const member = allMembers.find(m => m._id === task.assigneeId);
      const name = member ? member.name : 'Unknown';
      assigneeMap[name] = (assigneeMap[name] || 0) + 1;
    } else {
      assigneeMap['Unassigned'] = (assigneeMap['Unassigned'] || 0) + 1;
    }
  });
  
  const labels = Object.keys(assigneeMap);
  const data = Object.values(assigneeMap);
  
  if (dashboardCharts.assignee) {
    dashboardCharts.assignee.destroy();
  }
  
  dashboardCharts.assignee = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#6366f1',
          '#8b5cf6',
          '#ec4899',
          '#f43f5e',
          '#f59e0b',
          '#10b981',
          '#0ea5e9',
          '#06b6d4'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: {
              size: 12,
              family: 'Inter'
            }
          }
        }
      }
    }
  });
}

function renderCompletionChart(stats) {
  const ctx = document.getElementById('completionChart');
  
  const total = allTasks.length;
  const completed = stats.done;
  const incomplete = total - completed;
  
  if (dashboardCharts.completion) {
    dashboardCharts.completion.destroy();
  }
  
  dashboardCharts.completion = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Completed', 'Incomplete'],
      datasets: [{
        data: [completed, incomplete],
        backgroundColor: [
          '#10b981',
          '#e5e7eb'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 15,
            font: {
              size: 12,
              family: 'Inter'
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// Dashboard event listeners
document.getElementById('toggleDashboard').addEventListener('click', toggleDashboard);
document.getElementById('closeDashboard').addEventListener('click', toggleDashboard);

// ===== INITIALIZATION =====
(async function init() {
  await loadMembers();
  await loadProjects();
  // Tasks loaded via selectProject -> loadTasks
  
  // Close modal on outside click
  document.getElementById('taskFormModal').addEventListener('click', (e) => {
    if (e.target.id === 'taskFormModal') {
      clearForm();
      closeModal();
    }
  });

  document.getElementById('historyModal').addEventListener('click', (e) => {
    if (e.target.id === 'historyModal') {
      document.getElementById('historyModal').style.display = 'none';
    }
  });
})();