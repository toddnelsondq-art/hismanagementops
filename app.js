const baseTasks = [
  { id: 'sanitize', name: 'Sanitize all prep surfaces' },
  { id: 'coolers', name: 'Check cooler and freezer doors', photo: true },
  { id: 'labels', name: 'Verify food labels and dates' },
  { id: 'floors', name: 'Sweep and mop kitchen floors', photo: true },
  { id: 'cash', name: 'Count and record opening cash' }
];

const defaultTemperatureItems = {
  'Grill Area': ['Hamburger patties', 'Chicken breast', 'Grilled fish', 'Hot holding'],
  'Chill Area': ['Walk-in cooler', 'Prep cooler', 'Dairy products', 'Prepared foods']
};

const taskSections = ['All Day', 'Opening', 'Mid-shift', 'Closing'];
const tempSessions = ['Day', 'Afternoon'];
const dateKey = new Date().toISOString().slice(0, 10);
const $ = selector => document.querySelector(selector);
let locations = [{ id: 'store-01', name: 'Store 1' }];
let currentLocationId = localStorage.getItem('dailyops-current-location') || 'store-01';
let day = { locationId: currentLocationId, tasks: baseTasks.map(task => ({ ...task, done: false })), temps: [], complete: false };
let history = [];
let overdue = [];
let temperatureItems = defaultTemperatureItems;
let users = [{ id: 'alex-rivera', name: 'Alex Rivera', role: 'Manager', locationId: 'store-01' }];
let currentUserId = localStorage.getItem('dailyops-current-user') || 'alex-rivera';
let historyScope = localStorage.getItem('dailyops-history-scope') || 'location';
let photoTask = null;
let apiOnline = false;
let selectedReportDate = null;
let selectedReportLocationId = null;
let maintenance = { locations: [], equipment: [], workOrders: [], pmSchedule: [], vendors: [], lists: {} };
let maintenanceLocationId = localStorage.getItem('maintenance-location') || 'all';
let maintenanceFilter = 'open';
let selectedTaskSection = localStorage.getItem('dailyops-task-section') || 'Opening';
let selectedTempSession = localStorage.getItem('dailyops-temp-session') || 'Day';

$('#todayLabel').textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
}).toUpperCase();

function setupDailyOpsLayout() {
  const todayView = $('#todayView');
  if (!todayView || $('#taskListsView')) return;

  const formCard = todayView.querySelector('.form-card');
  const progress = todayView.querySelector('.progress');
  const tempCard = todayView.querySelector('.temp-card');
  const sectionTitle = todayView.querySelector('.section-title');
  const taskList = $('#taskList');
  const finishBtn = $('#finishBtn');

  todayView.querySelector('.status').id = 'dailyOpsBadge';
  $('#dailyOpsBadge').textContent = 'Task Lists + Temp Logs';

  const opsGrid = document.createElement('div');
  opsGrid.className = 'hub-grid ops-grid';
  opsGrid.innerHTML = `
    <button class="hub-tile" data-section-view="taskListsView">
      <span class="icon">✓</span>
      <div>
        <b>Task Lists</b>
        <p>Work opening, mid-shift, closing, and all-day cleaning tasks.</p>
      </div>
    </button>
    <button class="hub-tile" data-section-view="tempLogsView">
      <span class="icon">◒</span>
      <div>
        <b>Temperature Logs</b>
        <p>Record Day and Afternoon product/equipment temperatures.</p>
      </div>
    </button>
  `;
  formCard.after(opsGrid);

  const taskListsView = document.createElement('section');
  taskListsView.id = 'taskListsView';
  taskListsView.className = 'view';
  taskListsView.innerHTML = `
    <div class="date">
      <div>
        <p>TASK LISTS</p>
        <h2>Choose a list to work on</h2>
      </div>
      <span class="status" id="progressBadge">0 of 5 done</span>
    </div>
    <div id="taskSectionTabs" class="pill-row"></div>
  `;

  const tempLogsView = document.createElement('section');
  tempLogsView.id = 'tempLogsView';
  tempLogsView.className = 'view';
  tempLogsView.innerHTML = `
    <div class="date">
      <div>
        <p>TEMPERATURE LOGS</p>
        <h2>Choose a temp log session</h2>
      </div>
      <span class="status" id="tempRequirementBadge">Day + Afternoon</span>
    </div>
    <div id="tempSessionTabs" class="pill-row"></div>
  `;

  todayView.after(tempLogsView);
  todayView.after(taskListsView);

  taskListsView.append(progress);
  sectionTitle.querySelector('h3').id = 'taskSectionTitle';
  taskListsView.append(sectionTitle, taskList, finishBtn);
  tempLogsView.append(tempCard);

  const newTaskLabel = $('#newTask')?.closest('label');
  if (newTaskLabel && !$('#newTaskSection')) {
    newTaskLabel.insertAdjacentHTML('afterend', `
      <label>Task list
        <select id="newTaskSection">
          ${taskSections.map(section => `<option>${section}</option>`).join('')}
        </select>
      </label>
    `);
  }

  const tempItemLabel = $('#tempItem')?.closest('label');
  if (tempItemLabel && !$('#tempSession')) {
    tempItemLabel.insertAdjacentHTML('afterend', `
      <label>Session
        <select id="tempSession">
          ${tempSessions.map(session => `<option>${session}</option>`).join('')}
        </select>
      </label>
    `);
  }
}

setupDailyOpsLayout();

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  if (window.dailyOpsAuthReady) await window.dailyOpsAuthReady;
  const authToken = window.dailyOpsAuth?.token;
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function currentUser() {
  return users.find(user => user.id === currentUserId) || users[0];
}

function currentLocation() {
  return locations.find(location => location.id === currentLocationId) || locations[0];
}

function isAboveStore(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
}

function isFullAccess(user = currentUser()) {
  return ['Director of Operations', 'Owner'].includes(user.role);
}

function canUseHistory(user = currentUser()) {
  return user.role !== 'Employee';
}

function canUseManage(user = currentUser()) {
  return user.role !== 'Employee';
}

function canUseHub(user = currentUser()) {
  return user.role !== 'Employee';
}

function canEditLocations(user = currentUser()) {
  return isFullAccess(user);
}

function userLocationIds(user = currentUser()) {
  if (user.locationIds?.length) return user.locationIds;
  return [user.locationId || 'store-01'];
}

function accessibleLocationIds(user = currentUser()) {
  return isFullAccess(user) ? locations.map(location => location.id) : userLocationIds(user);
}

function maintenanceAllowedLocationIds(user = currentUser()) {
  if (isFullAccess(user)) return maintenance.locations.map(location => String(location['Location ID']));
  return userLocationIds(user).map(id => {
    const match = String(id).match(/store-(\d+)/);
    if (!match) return null;
    const index = Number(match[1]) - 1;
    return maintenance.locations[index] ? String(maintenance.locations[index]['Location ID']) : null;
  }).filter(Boolean);
}

function filterScopedRecords() {
  const allowed = accessibleLocationIds();
  history = history.filter(report => allowed.includes(report.locationId || report.day.locationId || currentLocationId));
  overdue = overdue.filter(item => allowed.includes(item.locationId));
}

function canEditUser(targetUser, actor = currentUser()) {
  if (isFullAccess(actor)) return true;
  if (targetUser.id === actor.id) return true;
  if (!allowedAssignableRoles(actor).includes(targetUser.role)) return false;
  const actorLocations = userLocationIds(actor);
  const targetLocations = userLocationIds(targetUser);
  if (actor.role === 'Area Manager') return targetLocations.some(locationId => actorLocations.includes(locationId));
  if (actor.role === 'Manager') return targetLocations.includes(actorLocations[0]);
  return false;
}

function manageableUsers(actor = currentUser()) {
  return users.filter(user => canEditUser(user, actor));
}

function allowedAssignableRoles(actor = currentUser()) {
  if (isFullAccess(actor)) return ['Employee', 'Manager', 'Area Manager', 'Director of Operations', 'Owner'];
  if (actor.role === 'Area Manager') return ['Employee', 'Manager', 'Area Manager'];
  if (actor.role === 'Manager') return ['Employee', 'Manager'];
  return [];
}

async function loadState() {
  try {
    const state = await api(`/api/state?date=${dateKey}&locationId=${currentLocationId}&historyScope=${historyScope}`);
    day = state.day;
    history = state.history;
    overdue = state.overdue || [];
    temperatureItems = state.temperatureItems || defaultTemperatureItems;
    users = state.users?.length ? state.users : users;
    locations = state.locations?.length ? state.locations : locations;
    if (window.dailyOpsAuth?.profile?.id) currentUserId = window.dailyOpsAuth.profile.id;
    if (!users.some(user => user.id === currentUserId)) currentUserId = users[0].id;
    if (!locations.some(location => location.id === currentLocationId)) currentLocationId = locations[0].id;
    apiOnline = true;
  } catch {
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.days ??= {};
    fallback.days[currentLocationId] ??= {};
    fallback.days[currentLocationId][dateKey] ??= {
      locationId: currentLocationId,
      tasks: baseTasks.map(task => ({ ...task, done: false })),
      temps: [],
      complete: false
    };
    day = fallback.days[currentLocationId][dateKey];
    users = fallback.users || users;
    locations = fallback.locations || locations;
    history = Object.entries(fallback.days[currentLocationId] || {})
      .filter(([, entry]) => entry.complete)
      .map(([date, entry]) => ({ locationId: currentLocationId, date, day: entry }));
    overdue = [];
    apiOnline = false;
    toast('Backend not running — using this browser only');
  }

  const user = currentUser();
  const allowedLocations = userLocationIds(user);
  if (!isAboveStore(user) && allowedLocations[0] && currentLocationId !== allowedLocations[0]) {
    currentLocationId = allowedLocations[0];
    localStorage.setItem('dailyops-current-location', currentLocationId);
    if (apiOnline) return loadState();
  }

  filterScopedRecords();
  await loadMaintenanceState();
  render();
}

async function loadMaintenanceState() {
  if (!apiOnline) return;
  try {
    if (maintenanceLocationId === 'all' && currentUser().role === 'Manager') maintenanceLocationId = 'assigned';
    const queryLocation = maintenanceLocationId === 'assigned' ? 'all' : maintenanceLocationId;
    maintenance = await api(`/api/maintenance/state?locationId=${queryLocation}`);
    filterMaintenanceScope();
  } catch {
    maintenance = { locations: [], equipment: [], workOrders: [], pmSchedule: [], vendors: [], lists: {} };
  }
}

function filterMaintenanceScope() {
  if (!maintenance.locations.length) return;
  const allowed = maintenanceAllowedLocationIds();
  if (!isFullAccess() && maintenanceLocationId === 'all') maintenanceLocationId = 'assigned';
  if (!isFullAccess() && maintenanceLocationId !== 'assigned' && !allowed.includes(String(maintenanceLocationId))) maintenanceLocationId = allowed[0] || 'assigned';
  if (maintenanceLocationId === 'assigned') {
    maintenance.workOrders = maintenance.workOrders.filter(row => allowed.includes(String(row['Location ID'])));
    maintenance.equipment = maintenance.equipment.filter(row => allowed.includes(String(row['Location ID'])));
    maintenance.pmSchedule = maintenance.pmSchedule.filter(row => allowed.includes(String(row['Location ID'])));
  }
  maintenance.locations = isFullAccess() ? maintenance.locations : maintenance.locations.filter(row => allowed.includes(String(row['Location ID'])));
}

async function saveDay() {
  day.locationId = currentLocationId;
  if (!apiOnline) {
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.days ??= {};
    fallback.days[currentLocationId] ??= {};
    fallback.days[currentLocationId][dateKey] = day;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
    return;
  }

  const saved = await api('/api/day', {
    method: 'POST',
    body: JSON.stringify({ locationId: currentLocationId, date: dateKey, day })
  });
  history = historyScope === 'location' ? saved.history : (await api(`/api/state?date=${dateKey}&locationId=${currentLocationId}&historyScope=all`)).history;
  overdue = saved.overdue || overdue;
}

async function persistAndRender(message) {
  await saveDay();
  render();
  if (message) toast(message);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function locationName(locationId) {
  return locations.find(location => location.id === locationId)?.name || locationId || 'Unknown location';
}

function prettyDate(date) {
  return new Date(`${date}T12:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

function fullPhotoUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url}`;
}

function normalizeDailyOps() {
  day.tasks = (day.tasks || []).map(task => ({
    ...task,
    section: task.section || task.list || (task.pushed ? 'All Day' : 'Opening')
  }));
  day.temps = day.temps || [];
}

function readingSession(reading) {
  return reading.session || 'Day';
}

function tempRequirementComplete() {
  return Object.entries(temperatureItems).every(([area, items]) =>
    items.every(item =>
      tempSessions.every(session =>
        day.temps.some(temp => temp.area === area && temp.item === item && readingSession(temp) === session)
      )
    )
  );
}

function render() {
  const activeUser = currentUser();
  const aboveStore = isAboveStore(activeUser);
  const allowedLocationIds = userLocationIds(activeUser);
  const visibleLocations = aboveStore
    ? locations.filter(location => isFullAccess(activeUser) || allowedLocationIds.includes(location.id))
    : locations.filter(location => location.id === allowedLocationIds[0]);
  if (!visibleLocations.some(location => location.id === currentLocationId)) currentLocationId = visibleLocations[0]?.id || currentLocationId;

  $('#greeting').textContent = `Good morning, ${activeUser.name.split(' ')[0]}`;
  $('#homeGreeting').textContent = `Welcome, ${activeUser.name.split(' ')[0]}`;
  $('#currentUser').innerHTML = users.map(user => `<option value="${user.id}" ${user.id === currentUserId ? 'selected' : ''}>${user.name} — ${user.role}</option>`).join('');
  $('#currentLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}" ${location.id === currentLocationId ? 'selected' : ''}>${location.name}</option>`).join('');
  $('#locationChooser').style.display = aboveStore ? 'block' : 'none';
  if (!canUseHistory(activeUser)) historyScope = 'location';
  $('#historyScope').value = historyScope;
  $('#historyScope').disabled = !aboveStore;
  $('#teamAvatar').textContent = initials(activeUser.name);
  $('#teamName').textContent = `${activeUser.name} · ${locationName(currentLocationId)}`;
  applyRoleAccess(activeUser);
  normalizeDailyOps();

  $('#taskSectionTabs').innerHTML = taskSections.map(section => `
    <button class="${section === selectedTaskSection ? 'active' : ''}" data-task-section="${escapeHtml(section)}">${escapeHtml(section)}</button>
  `).join('');
  const visibleTasks = day.tasks.filter(task => task.section === selectedTaskSection);
  $('#taskSectionTitle').textContent = `${selectedTaskSection} checklist`;
  $('#taskList').innerHTML = visibleTasks.length ? visibleTasks.map(task => `
    <article class="card task ${task.done ? 'done' : ''} ${task.pushed ? 'urgent' : ''}">
      <input type="checkbox" data-check="${task.id}" ${task.done ? 'checked' : ''} ${task.photo && !task.photoUrl && !task.photoData ? 'disabled' : ''}>
      <div>
        <div class="task-name">${escapeHtml(task.name)}</div>
        ${task.pushed ? '<span class="urgent-label">MANAGER ADDED</span>' : ''}
      </div>
      ${task.photo ? `<button class="photo-btn ${task.photoUrl || task.photoData ? 'photo-ok' : ''}" data-photo="${task.id}">${task.photoUrl || task.photoData ? '✓ Photo' : '📷 Required'}</button>` : ''}
    </article>
  `).join('') : `<article class="card"><p class="hint">No ${escapeHtml(selectedTaskSection.toLowerCase())} tasks yet.</p></article>`;

  $('#tempSessionTabs').innerHTML = tempSessions.map(session => `
    <button class="${session === selectedTempSession ? 'active' : ''}" data-temp-session="${escapeHtml(session)}">${escapeHtml(session)}</button>
  `).join('');
  $('#tempList').innerHTML = Object.entries(temperatureItems).map(([area, items]) => `
    <div class="temp-group">
      <h4>${escapeHtml(area)}</h4>
      ${items.map(item => {
        const readings = day.temps.filter(temp => temp.area === area && temp.item === item && readingSession(temp) === selectedTempSession);
        return `
          <button class="temp-entry temp-pick" data-temp-area="${escapeHtml(area)}" data-temp-item="${escapeHtml(item)}">
            <span>${escapeHtml(item)}</span>
            <b>${Math.min(readings.length, 1)}/1</b>
            <div class="reading-chips">
              ${readings.map(reading => `<span class="reading-chip">${escapeHtml(reading.value)}°F · ${escapeHtml(reading.time)}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</span>`).join('')}
              ${readings.length < 1 ? `<span class="reading-due">due for ${escapeHtml(selectedTempSession)}</span>` : ''}
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `).join('');

  const done = day.tasks.filter(task => task.done).length;
  const percent = Math.round(done / day.tasks.length * 100) || 0;
  $('#progressBadge').textContent = `${done} of ${day.tasks.length} done`;
  $('#taskCount').textContent = `${visibleTasks.filter(task => !task.done).length} remaining in this list`;
  $('#progressBar').style.width = `${percent}%`;
  $('#teamPct').textContent = `${percent}%`;
  $('#finishBtn').disabled = done !== day.tasks.length || !tempRequirementComplete();
  $('#tempRequirementBadge').textContent = tempRequirementComplete() ? 'Temps complete' : 'Temps due';
  $('#teamStatus').textContent = day.complete ? 'Completed today' : 'Checklist in progress';

  renderUsers();
  renderLocations();
  renderOverdue();
  renderHistory();
  renderMaintenance();
}

function maintenanceLocationOptions() {
  const allOption = isFullAccess() ? '<option value="all">All maintenance locations</option>' : (isAboveStore() ? '<option value="assigned">My assigned locations</option>' : '');
  return allOption + maintenance.locations.map(location => `<option value="${location['Location ID']}" ${String(location['Location ID']) === String(maintenanceLocationId) ? 'selected' : ''}>${escapeHtml(location['Location Name'])}</option>`).join('');
}

function renderMaintenance() {
  if (!$('#maintenanceLocation')) return;
  $('#maintenanceLocation').innerHTML = maintenanceLocationOptions();

  const openOrders = maintenance.workOrders.filter(order => !['Completed', 'Cancelled'].includes(order.Status));
  const emergency = openOrders.filter(order => order.Priority === 'Emergency');
  const high = openOrders.filter(order => order.Priority === 'High');
  const overduePm = maintenance.pmSchedule.filter(pm => ['Due', 'Overdue'].includes(pm.Status || 'Due'));
  const totalCost = maintenance.workOrders.reduce((sum, order) => sum + Number(order['Total Cost'] || 0), 0);

  $('#maintenanceMetrics').innerHTML = [
    ['open', 'Open WOs', openOrders.length],
    ['emergency', 'Emergency', emergency.length],
    ['high', 'High Priority', high.length],
    ['pm', 'PM Due', overduePm.length],
    ['cost', 'Total Cost', `$${totalCost.toLocaleString()}`]
  ].map(([filter, label, value]) => `<button class="card metric-card ${maintenanceFilter === filter ? 'active' : ''}" data-maint-filter="${filter}"><b>${value}</b><span>${label}</span></button>`).join('');

  const list = maintenance.lists || {};
  $('#woCategory').innerHTML = (list.categories || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#woPriority').innerHTML = (list.priorities || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#woVendor').innerHTML = '<option value="">No vendor selected</option>' + maintenance.vendors.map(vendor => `<option value="${vendor['Vendor ID']}">${escapeHtml(vendor['Vendor Name'])}</option>`).join('');
  $('#woEquipment').innerHTML = '<option value="">No specific equipment</option>' + maintenance.equipment.map(item => `<option value="${item['Equipment ID']}">${escapeHtml(item['Equipment Name'])} · ${escapeHtml(item['Location Name'])}</option>`).join('');
  $('#eqType').innerHTML = (list.equipmentTypes || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#pmFrequency').innerHTML = (list.pmFrequencies || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#pmEquipment').innerHTML = '<option value="">No specific equipment</option>' + maintenance.equipment.map(item => `<option value="${item['Equipment ID']}">${escapeHtml(item['Equipment Name'])} · ${escapeHtml(item['Location Name'])}</option>`).join('');

  const shownOrders = maintenanceFilter === 'emergency'
    ? emergency
    : maintenanceFilter === 'high'
      ? high
      : openOrders;
  $('#woCount').textContent = `${shownOrders.length} shown`;
  $('#workOrderList').innerHTML = shownOrders.length ? shownOrders.map(order => `
    <article class="card maintenance-row ${order.Priority === 'Emergency' ? 'urgent' : ''}">
      <div>
        <b>${escapeHtml(order['Work Order ID'])} · ${escapeHtml(order['Equipment Name'] || order.Category || 'General')}</b>
        <p>${escapeHtml(order['Location Name'] || '')} · ${escapeHtml(order.Category || '')} · ${escapeHtml(order.Priority || '')} · ${escapeHtml(order.Status || '')}</p>
        <p>${escapeHtml(order['Issue Description'] || '')}</p>
        <p>${order['Photo Link'] ? `<a href="${escapeHtml(fullPhotoUrl(order['Photo Link']))}" target="_blank">Photo</a>` : ''} ${order['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(order['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <div class="row-actions"><span class="status">${escapeHtml(order.Status || 'New')}</span><button data-edit-wo="${escapeHtml(order['Work Order ID'])}">Edit</button></div>
    </article>
  `).join('') : '<div class="empty">No open work orders for this view.</div>';

  $('#pmCount').textContent = `${overduePm.length} due`;
  $('#pmList').innerHTML = overduePm.length ? overduePm.map(pm => `
    <article class="card maintenance-row">
      <div>
        <b>${escapeHtml(pm.Task)}</b>
        <p>${escapeHtml(pm['Location Name'])} · ${escapeHtml(pm['Equipment Name'])} · ${escapeHtml(pm.Frequency || '')}</p>
        <p>${escapeHtml(pm['Instructions / Checklist'] || '')}</p>
        <p>${pm['Photo Link'] ? `<a href="${escapeHtml(fullPhotoUrl(pm['Photo Link']))}" target="_blank">Photo</a>` : ''} ${pm['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(pm['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <span class="status">${escapeHtml(pm.Status || 'Due')}</span>
    </article>
  `).join('') : '<div class="empty">No PM items due for this view.</div>';

  $('#equipmentCount').textContent = `${maintenance.equipment.length} items`;
  $('#equipmentList').innerHTML = maintenance.equipment.slice(0, 18).map(item => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(item['Equipment Name'])}</b>
        <p>${escapeHtml(item['Location Name'])} · ${escapeHtml(item['Equipment Type'] || '')} · ${escapeHtml(item.Manufacturer || '')}</p>
        <p>${item['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(item['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <span class="status">${escapeHtml(item['Equipment ID'])}</span>
    </article>
  `).join('') || '<div class="empty">No equipment loaded.</div>';

  $('#vendorCount').textContent = `${maintenance.vendors.length} vendors`;
  $('#vendorList').innerHTML = maintenance.vendors.map(vendor => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(vendor['Vendor Name'])}</b>
        <p>${escapeHtml(vendor.Category || '')} · ${escapeHtml(vendor['Service Area'] || '')}</p>
      </div>
      <span class="status">${escapeHtml(vendor.Preferred || '')}</span>
    </article>
  `).join('');
}

function closeMaintenancePanels() {
  document.querySelectorAll('.maint-panel').forEach(panel => panel.classList.remove('open'));
}

function openMaintenancePanel(panelId) {
  closeMaintenancePanels();
  const panel = $(`#${panelId}`);
  if (!panel) return;
  panel.classList.add('open');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : '';
}

function openWorkOrderDialog(workOrderId) {
  const order = maintenance.workOrders.find(row => row['Work Order ID'] === workOrderId);
  if (!order) return;
  const list = maintenance.lists || {};
  $('#editWoTitle').textContent = `${order['Work Order ID']} · ${order['Equipment Name'] || order.Category || 'Work Order'}`;
  $('#editWoId').value = order['Work Order ID'];
  $('#editWoLocationId').value = order['Location ID'];
  $('#editWoStatus').innerHTML = (list.statuses || ['New', 'Assigned', 'In Progress', 'Completed']).map(value => `<option ${order.Status === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  $('#editWoPriority').innerHTML = (list.priorities || ['Emergency', 'High', 'Medium', 'Low']).map(value => `<option ${order.Priority === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  $('#editWoVendor').innerHTML = '<option value="">No vendor selected</option>' + maintenance.vendors.map(vendor => `<option value="${vendor['Vendor ID']}" ${order['Vendor ID'] === vendor['Vendor ID'] ? 'selected' : ''}>${escapeHtml(vendor['Vendor Name'])}</option>`).join('');
  $('#editWoAssignedTo').value = order['Assigned To'] || '';
  $('#editWoIssue').value = order['Issue Description'] || '';
  $('#editWoResolution').value = order['Resolution Notes'] || '';
  $('#editWoTargetDate').value = toDateInput(order['Target Date']);
  $('#editWoCompletedDate').value = toDateInput(order['Date Completed']);
  $('#editWoLabor').value = order['Labor Hours'] || '';
  $('#editWoParts').value = order['Parts Cost'] || '';
  $('#editWoVendorCost').value = order['Vendor Cost'] || '';
  $('#editWoPhoto').value = '';
  $('#editWoManual').value = '';
  $('#workOrderDialog').showModal();
}

function applyRoleAccess(user) {
  const showHub = canUseHub(user);
  const showHistory = canUseHistory(user);
  const showManage = canUseManage(user);
  document.querySelector('[data-view="homeView"]').style.display = showHub ? '' : 'none';
  document.querySelector('[data-view="historyView"]').style.display = showHistory ? '' : 'none';
  document.querySelector('[data-view="manageView"]').style.display = showManage ? '' : 'none';
  $('#roleBtn').style.display = showManage ? '' : 'none';
  if (!showHub && ($('#homeView').classList.contains('active') || $('#maintenanceView').classList.contains('active'))) switchView('todayView');
  if (!showHistory && $('#historyView').classList.contains('active')) switchView('todayView');
  if (!showManage && $('#manageView').classList.contains('active')) switchView('todayView');

  const locationAdminDisplay = canEditLocations(user) ? '' : 'none';
  $('#locationAdminTitle').style.display = locationAdminDisplay;
  $('#locationAdminCard').style.display = locationAdminDisplay;
}

function renderLocations() {
  const editable = canEditLocations();
  $('#locationList').innerHTML = locations.map(location => `
    <div class="location-row">
      <b>${escapeHtml(location.id.replace('store-', 'Store '))}</b>
      <input data-location-name="${location.id}" value="${escapeHtml(location.name)}" ${editable ? '' : 'disabled'}>
      ${editable ? `<button data-location-save="${location.id}">Save</button>` : ''}
    </div>
  `).join('');
}

function renderOverdue() {
  const scopedOverdue = overdue.filter(item => accessibleLocationIds().includes(item.locationId));
  $('#overdueList').innerHTML = scopedOverdue.length
    ? scopedOverdue.map(item => `<div class="overdue-row"><b>${escapeHtml(item.locationName)}</b><span>${escapeHtml(item.status)}</span></div>`).join('')
    : '<p class="hint">All locations have completed today’s checklist.</p>';
}

function renderUsers() {
  const actor = currentUser();
  const visibleLocations = locations.filter(location => isFullAccess(actor) || userLocationIds(actor).includes(location.id));
  const roles = allowedAssignableRoles(actor);
  $('#newUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#newUserRole').innerHTML = roles.map(role => `<option>${role}</option>`).join('');
  renderNewUserLocationChecks();
  $('#addUserCard').style.display = roles.length ? '' : 'none';
  $('#usersTitle').style.display = canUseManage(actor) ? '' : 'none';
  $('#userList').style.display = canUseManage(actor) ? '' : 'none';
  $('#userList').innerHTML = manageableUsers(actor).map(user => `
    <article class="card user-row compact-user-row">
      <span class="avatar">${initials(user.name)}</span>
      <div>
        <b>${escapeHtml(user.name)}</b>
        <p>${escapeHtml(user.role)} · ${userLocationIds(user).map(locationName).join(', ')}</p>
      </div>
      <button data-user-edit="${user.id}">Edit</button>
    </article>
  `).join('');
}

function roleUsesMultipleLocations(role) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(role);
}

function renderNewUserLocationChecks() {
  if (!$('#newUserLocations')) return;
  const locationId = $('#newUserLocation').value;
  const selected = [...document.querySelectorAll('#newUserLocations input:checked')].map(input => input.value);
  const selectedIds = selected.length ? selected : [locationId].filter(Boolean);
  renderLocationChecks('#newUserLocations', selectedIds);
  $('#newUserLocationsWrap').style.display = roleUsesMultipleLocations($('#newUserRole').value) ? 'block' : 'none';
}

function renderLocationChecks(containerSelector, selectedIds) {
  const actor = currentUser();
  const visibleLocations = locations.filter(location => isFullAccess(actor) || userLocationIds(actor).includes(location.id));
  $(containerSelector).innerHTML = visibleLocations.map(location => `
    <label class="location-check"><input type="checkbox" value="${location.id}" ${selectedIds.includes(location.id) ? 'checked' : ''}> ${escapeHtml(location.name)}</label>
  `).join('');
}

function reportMarkup(report) {
  const { date, day: entry, locationId } = report;
  const completed = entry.completedAt ? new Date(entry.completedAt).toLocaleString() : 'Not recorded';
  const tempsByArea = entry.temps.reduce((groups, temp) => {
    groups[temp.area] ??= {};
    groups[temp.area][temp.item] ??= [];
    groups[temp.area][temp.item].push(temp);
    return groups;
  }, {});

  return `
    <article class="card report-card">
      <div class="report-head">
        <div>
          <p class="eyebrow">COMPLETED DAY · ${escapeHtml(locationName(locationId || entry.locationId))}</p>
          <h3>${escapeHtml(prettyDate(date))}</h3>
          <p>Completed by ${escapeHtml(entry.completedBy || 'Not recorded')} · ${escapeHtml(completed)}</p>
        </div>
        <span class="complete-mark">✓ Complete</span>
      </div>
    </article>
    <article class="card report-card">
      <h3>Checklist tasks</h3>
      ${entry.tasks.map(task => `
        <div class="report-line">
          <span>${task.done ? '✓' : '○'}</span>
          <div>
            <b>${escapeHtml(task.name)}</b>
            <p>${task.pushed ? 'Manager-added task' : 'Standard task'}${task.photo ? ` · Photo ${task.photoUrl || task.photoData ? 'attached' : 'required but missing'}` : ''}${task.photoBy ? ` · Photo by ${escapeHtml(task.photoBy)}` : ''}</p>
            ${task.photoUrl ? `<a href="${escapeHtml(fullPhotoUrl(task.photoUrl))}" target="_blank">View photo</a>` : ''}
          </div>
        </div>
      `).join('')}
    </article>
    <article class="card report-card">
      <h3>Temperature readings</h3>
      ${Object.keys(tempsByArea).length ? Object.entries(tempsByArea).map(([area, items]) => `
        <div class="report-temp-area">
          <h4>${escapeHtml(area)}</h4>
          ${Object.entries(items).map(([item, readings]) => `
            <div class="report-temp-item">
              <b>${escapeHtml(item)}</b>
              <div class="reading-chips">
                ${readings.map(reading => `<span class="reading-chip">${escapeHtml(reading.value)}°F · ${escapeHtml(reading.time)}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') : '<p class="hint">No temperature readings recorded.</p>'}
    </article>
  `;
}

function reportDocument(reports) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DailyOps reports</title><style>
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#19352e;background:#f7f5ef;margin:0;padding:28px}
    h1,h2,h3,h4,p{margin:0}h1{margin-bottom:18px}.card{background:#fff;border:1px solid #dfe5e1;border-radius:14px;padding:16px;margin:0 0 14px}.eyebrow{font-size:10px;font-weight:800;letter-spacing:1.4px;color:#28745f}.complete-mark{color:#28745f;font-weight:800}.report-head{display:flex;justify-content:space-between;gap:16px}.report-line{display:grid;grid-template-columns:26px 1fr;gap:8px;border-top:1px solid #dfe5e1;padding-top:9px;margin-top:9px}.report-line p,.hint{color:#6e7c77;font-size:13px}.report-temp-area{border-top:1px solid #dfe5e1;margin-top:12px;padding-top:12px}.report-temp-item{margin-top:8px}.reading-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.reading-chip{font-size:12px;background:#e7f2ed;color:#28745f;padding:4px 8px;border-radius:999px}.day-break{page-break-after:always;margin-bottom:28px}
  </style></head><body><h1>DailyOps reports</h1>${reports.map(report => `<section class="day-break">${reportMarkup(report)}</section>`).join('')}</body></html>`;
}

function downloadReports(keys) {
  const reports = keys.map(key => history.find(report => reportKey(report) === key)).filter(Boolean);
  if (!reports.length) return toast('Select at least one completed day');
  const blob = new Blob([reportDocument(reports)], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = reports.length === 1 ? `dailyops-${reports[0].locationId}-${reports[0].date}.html` : `dailyops-reports-${new Date().toISOString().slice(0, 10)}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast('Report export started');
}

function reportKey(report) {
  return `${report.locationId || report.day.locationId || currentLocationId}|${report.date}`;
}

function selectedHistoryKeys() {
  return [...document.querySelectorAll('[data-history-select]:checked')].map(input => input.value);
}

function openReport(key) {
  const report = history.find(entry => reportKey(entry) === key);
  if (!report) return;
  selectedReportDate = report.date;
  selectedReportLocationId = report.locationId || report.day.locationId || currentLocationId;
  $('#reportTitle').textContent = `${locationName(selectedReportLocationId)} · ${prettyDate(report.date)}`;
  $('#reportDetail').innerHTML = reportMarkup(report);
  switchView('reportView');
}

function switchView(viewId) {
  document.querySelectorAll('.view, nav button').forEach(entry => entry.classList.remove('active'));
  $(`#${viewId}`).classList.add('active');
  const navButton = document.querySelector(`nav button[data-view="${viewId}"]`);
  if (navButton) navButton.classList.add('active');
}

document.addEventListener('click', async event => {
  const sectionButton = event.target.closest('[data-section-view]');
  if (sectionButton) {
    const targetView = sectionButton.dataset.sectionView;
    if ((targetView === 'homeView' || targetView === 'maintenanceView') && !canUseHub()) return toast('Only managers and above can access this section');
    switchView(targetView);
  }

  const taskSectionButton = event.target.closest('[data-task-section]');
  if (taskSectionButton) {
    selectedTaskSection = taskSectionButton.dataset.taskSection;
    localStorage.setItem('dailyops-task-section', selectedTaskSection);
    render();
  }

  const tempSessionButton = event.target.closest('[data-temp-session]');
  if (tempSessionButton) {
    selectedTempSession = tempSessionButton.dataset.tempSession;
    localStorage.setItem('dailyops-temp-session', selectedTempSession);
    render();
  }

  const maintenanceSectionButton = event.target.closest('[data-maint-section]');
  if (maintenanceSectionButton) {
    openMaintenancePanel(maintenanceSectionButton.dataset.maintSection);
  }

  if (event.target.closest('[data-maint-close]')) {
    closeMaintenancePanels();
  }

  const maintenanceFilterButton = event.target.closest('[data-maint-filter]');
  if (maintenanceFilterButton) {
    maintenanceFilter = maintenanceFilterButton.dataset.maintFilter;
    renderMaintenance();
    const target = maintenanceFilter === 'pm' ? $('#pmList') : $('#workOrderList');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const editWorkOrderButton = event.target.closest('[data-edit-wo]');
  if (editWorkOrderButton) openWorkOrderDialog(editWorkOrderButton.dataset.editWo);

  const checkbox = event.target.closest('[data-check]');
  if (checkbox) {
    day.tasks.find(entry => entry.id === checkbox.dataset.check).done = checkbox.checked;
    await persistAndRender();
  }

  const photoButton = event.target.closest('[data-photo]');
  if (photoButton) {
    photoTask = day.tasks.find(entry => entry.id === photoButton.dataset.photo);
    $('#photoTaskName').textContent = photoTask.name;
    $('#photoPreview').style.display = 'none';
    $('#savePhotoBtn').disabled = true;
    $('#photoInput').value = '';
    $('#photoDialog').showModal();
  }

  const tempPick = event.target.closest('[data-temp-area][data-temp-item]');
  if (tempPick) openTempDialog(tempPick.dataset.tempArea, tempPick.dataset.tempItem);

  const historyButton = event.target.closest('[data-history-key]');
  if (historyButton) openReport(historyButton.dataset.historyKey);

  const saveButton = event.target.closest('[data-user-save]');
  if (saveButton) await saveExistingUser(saveButton.dataset.userSave);

  const editButton = event.target.closest('[data-user-edit]');
  if (editButton) openUserDialog(editButton.dataset.userEdit);

  const locationButton = event.target.closest('[data-location-save]');
  if (locationButton) {
    if (!canEditLocations()) return toast('Only Director or Owner can edit store names');
    await saveLocation(locationButton.dataset.locationSave);
  }
});

function fillTempItems() {
  const area = $('#tempArea').value;
  $('#tempItem').innerHTML = temperatureItems[area].map(item => `<option>${escapeHtml(item)}</option>`).join('');
}

function openTempDialog(area = $('#tempArea').value, item = null) {
  $('#tempValue').value = '';
  $('#tempArea').value = area;
  $('#tempSession').value = selectedTempSession;
  fillTempItems();
  if (item) $('#tempItem').value = item;
  $('#tempDialog').showModal();
  $('#tempValue').focus();
}

$('#tempArea').onchange = fillTempItems;
$('#addTempBtn').onclick = () => openTempDialog();
$('#newUserRole').onchange = renderNewUserLocationChecks;
$('#newUserLocation').onchange = renderNewUserLocationChecks;

$('#currentUser').onchange = async event => {
  currentUserId = event.target.value;
  localStorage.setItem('dailyops-current-user', currentUserId);
  const user = currentUser();
  if (!isAboveStore(user) && userLocationIds(user)[0]) {
    currentLocationId = userLocationIds(user)[0];
    localStorage.setItem('dailyops-current-location', currentLocationId);
    historyScope = 'location';
  }
  await loadState();
};

$('#currentLocation').onchange = async event => {
  currentLocationId = event.target.value;
  localStorage.setItem('dailyops-current-location', currentLocationId);
  await loadState();
};

$('#historyScope').onchange = async event => {
  historyScope = event.target.value;
  localStorage.setItem('dailyops-history-scope', historyScope);
  await loadState();
};

$('#maintenanceLocation').onchange = async event => {
  maintenanceLocationId = event.target.value;
  localStorage.setItem('maintenance-location', maintenanceLocationId);
  await loadMaintenanceState();
  renderMaintenance();
};

async function uploadMaintenanceFile(inputSelector, kind) {
  const file = $(inputSelector).files[0];
  if (!file) return '';
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const saved = await api('/api/maintenance/attachment', {
    method: 'POST',
    body: JSON.stringify({ kind, name: file.name, dataUrl })
  });
  return saved.url;
}

function selectedMaintenanceLocationForForm(equipment = {}) {
  const locationId = ['all', 'assigned'].includes(maintenanceLocationId)
    ? (equipment['Location ID'] || maintenance.locations[0]?.['Location ID'])
    : maintenanceLocationId;
  const location = maintenance.locations.find(item => String(item['Location ID']) === String(locationId));
  return { locationId, locationName: location?.['Location Name'] || equipment['Location Name'] };
}

$('#createWorkOrderBtn').onclick = async () => {
  const issueDescription = $('#woIssue').value.trim();
  if (!issueDescription) return toast('Enter an issue description');
  const equipmentId = $('#woEquipment').value;
  const equipment = maintenance.equipment.find(item => item['Equipment ID'] === equipmentId) || {};
  const { locationId, locationName } = selectedMaintenanceLocationForForm(equipment);
  const payload = {
    locationId,
    locationName,
    requestedBy: currentUser().name,
    category: $('#woCategory').value,
    equipmentId,
    equipmentName: equipment['Equipment Name'],
    priority: $('#woPriority').value,
    vendorId: $('#woVendor').value,
    issueDescription,
    targetDate: $('#woTargetDate').value,
    photoLink: await uploadMaintenanceFile('#woPhoto', 'work-order-photo'),
    manualLink: await uploadMaintenanceFile('#woManual', 'work-order-manual')
  };
  try {
    const saved = await api('/api/maintenance/work-order', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    $('#woIssue').value = '';
    $('#woTargetDate').value = '';
    $('#woPhoto').value = '';
    $('#woManual').value = '';
    renderMaintenance();
    toast(`Created ${saved.workOrder['Work Order ID']}`);
  } catch {
    toast('Work order did not save — restart the backend server');
  }
};

$('#addEquipmentBtn').onclick = async () => {
  const equipmentName = $('#eqName').value.trim();
  if (!equipmentName) return toast('Enter an equipment name');
  const { locationId, locationName } = selectedMaintenanceLocationForForm();
  const payload = {
    locationId,
    locationName,
    equipmentName,
    equipmentType: $('#eqType').value,
    manufacturer: $('#eqManufacturer').value.trim(),
    model: $('#eqModel').value.trim(),
    serialNumber: $('#eqSerial').value.trim(),
    manualLink: await uploadMaintenanceFile('#eqManual', 'equipment-manual')
  };
  try {
    const saved = await api('/api/maintenance/equipment', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    ['#eqName', '#eqManufacturer', '#eqModel', '#eqSerial', '#eqManual'].forEach(selector => $(selector).value = '');
    renderMaintenance();
    toast(`Added ${saved.equipment['Equipment ID']}`);
  } catch {
    toast('Equipment did not save — restart the backend server');
  }
};

$('#addPmBtn').onclick = async () => {
  const task = $('#pmTask').value.trim();
  if (!task) return toast('Enter a PM task');
  const equipment = maintenance.equipment.find(item => item['Equipment ID'] === $('#pmEquipment').value) || {};
  const { locationId, locationName } = selectedMaintenanceLocationForForm(equipment);
  const payload = {
    locationId,
    locationName,
    equipmentId: equipment['Equipment ID'],
    equipmentName: equipment['Equipment Name'],
    task,
    frequency: $('#pmFrequency').value,
    nextDue: $('#pmNextDue').value,
    assignedTo: $('#pmAssignedTo').value.trim(),
    instructions: $('#pmInstructions').value.trim(),
    photoLink: await uploadMaintenanceFile('#pmPhoto', 'pm-photo'),
    manualLink: await uploadMaintenanceFile('#pmManual', 'pm-manual')
  };
  try {
    const saved = await api('/api/maintenance/pm', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    ['#pmTask', '#pmNextDue', '#pmAssignedTo', '#pmInstructions', '#pmPhoto', '#pmManual'].forEach(selector => $(selector).value = '');
    renderMaintenance();
    toast(`Added ${saved.pmTask['PM ID']}`);
  } catch {
    toast('PM task did not save — restart the backend server');
  }
};

$('#saveWorkOrderBtn').onclick = async () => {
  const payload = {
    workOrderId: $('#editWoId').value,
    locationId: $('#editWoLocationId').value,
    status: $('#editWoStatus').value,
    priority: $('#editWoPriority').value,
    assignedTo: $('#editWoAssignedTo').value.trim(),
    vendorId: $('#editWoVendor').value,
    issueDescription: $('#editWoIssue').value.trim(),
    resolutionNotes: $('#editWoResolution').value.trim(),
    targetDate: $('#editWoTargetDate').value,
    dateCompleted: $('#editWoCompletedDate').value,
    laborHours: $('#editWoLabor').value,
    partsCost: $('#editWoParts').value,
    vendorCost: $('#editWoVendorCost').value
  };
  const photoLink = await uploadMaintenanceFile('#editWoPhoto', 'work-order-photo');
  const manualLink = await uploadMaintenanceFile('#editWoManual', 'work-order-manual');
  if (photoLink) payload.photoLink = photoLink;
  if (manualLink) payload.manualLink = manualLink;
  try {
    const saved = await api('/api/maintenance/work-order/update', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    toast(`Updated ${saved.workOrder['Work Order ID']}`);
  } catch {
    toast('Work order did not update — restart the backend server');
  }
};

$('#saveTempBtn').onclick = async event => {
  if (!$('#tempValue').value) {
    event.preventDefault();
    return;
  }
  selectedTempSession = $('#tempSession').value;
  localStorage.setItem('dailyops-temp-session', selectedTempSession);
  day.temps.push({
    area: $('#tempArea').value,
    item: $('#tempItem').value,
    session: $('#tempSession').value,
    value: $('#tempValue').value,
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    userId: currentUser().id,
    userName: currentUser().name
  });
  await persistAndRender('Temperature saved');
};

$('#photoInput').onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('#photoPreview').src = reader.result;
    $('#photoPreview').style.display = 'block';
    $('#savePhotoBtn').disabled = false;
    photoTask._pending = reader.result;
  };
  reader.readAsDataURL(file);
};

$('#savePhotoBtn').onclick = async () => {
  if (apiOnline) {
    const photo = await api('/api/photo', {
      method: 'POST',
      body: JSON.stringify({ locationId: currentLocationId, date: dateKey, taskId: photoTask.id, userId: currentUser().id, dataUrl: photoTask._pending })
    });
    photoTask.photoUrl = photo.url;
  } else {
    photoTask.photoData = photoTask._pending;
  }
  photoTask.photoBy = currentUser().name;
  delete photoTask._pending;
  await persistAndRender('Photo attached');
};

$('#addUserBtn').onclick = async () => {
  const name = $('#newUserName').value.trim();
  const email = $('#newUserEmail').value.trim();
  if (!name) return toast('Enter a user name');
  const locationId = $('#newUserLocation').value;
  const role = $('#newUserRole').value;
  const selectedLocations = [...document.querySelectorAll('#newUserLocations input:checked')].map(input => input.value);
  const locationIds = roleUsesMultipleLocations(role) ? (selectedLocations.length ? selectedLocations : [locationId]) : [locationId];
  if (!allowedAssignableRoles().includes(role)) return toast('You do not have access to create that role');
  if (!isFullAccess() && locationIds.some(savedLocation => !userLocationIds().includes(savedLocation))) return toast('You can only add users to your locations');
  try {
    await saveUser({ name, email, role, locationId, locationIds, invitedBy: currentUser().name });
    $('#newUserName').value = '';
    $('#newUserEmail').value = '';
    $('#newUserRole').value = 'Employee';
    renderNewUserLocationChecks();
    toast(email ? 'Invite sent' : 'User added');
  } catch {
    toast('User did not save — restart the backend server');
  }
};

function openUserDialog(id) {
  const user = users.find(entry => entry.id === id);
  if (!user) return;
  if (!canEditUser(user)) return toast('You do not have access to edit this user');
  const roles = allowedAssignableRoles();
  const visibleLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  $('#editUserId').value = user.id;
  $('#editUserName').value = user.name;
  $('#editUserEmail').value = user.email || '';
  $('#editUserRole').innerHTML = roles.map(role => `<option ${user.role === role ? 'selected' : ''}>${role}</option>`).join('');
  if (!roles.includes(user.role)) $('#editUserRole').innerHTML += `<option selected>${escapeHtml(user.role)}</option>`;
  $('#editUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}" ${user.locationId === location.id ? 'selected' : ''}>${location.name}</option>`).join('');
  renderLocationChecks('#editUserLocations', userLocationIds(user));
  $('#editUserLocationsWrap').style.display = isAboveStore(user) ? 'block' : 'none';
  $('#userDialog').showModal();
}

$('#editUserRole').onchange = () => {
  $('#editUserLocationsWrap').style.display = ['Area Manager', 'Director of Operations', 'Owner'].includes($('#editUserRole').value) ? 'block' : 'none';
};

$('#saveUserEditBtn').onclick = async () => {
  const id = $('#editUserId').value;
  const existing = users.find(user => user.id === id);
  if (!existing || !canEditUser(existing)) return toast('You do not have access to edit this user');
  const name = $('#editUserName').value.trim();
  const email = $('#editUserEmail').value.trim();
  const role = $('#editUserRole').value;
  const selected = [...document.querySelectorAll('#editUserLocations input:checked')].map(input => input.value);
  const locationId = $('#editUserLocation').value;
  if (!name) return toast('Enter a user name');
  if (!allowedAssignableRoles().includes(role)) return toast('You do not have access to assign that role');
  const locationsToSave = ['Area Manager', 'Director of Operations', 'Owner'].includes(role) ? (selected.length ? selected : [locationId]) : [locationId];
  if (!isFullAccess() && locationsToSave.some(savedLocation => !userLocationIds().includes(savedLocation))) return toast('You can only assign your locations');
  await saveUser({
    id,
    name,
    email,
    role,
    locationId,
    locationIds: locationsToSave
  });
  toast('User saved');
};

async function saveExistingUser(id) {
  const name = document.querySelector(`[data-user-name="${id}"]`).value.trim();
  if (!name) return toast('Enter a user name');
  try {
    await saveUser({
      id,
      name,
      role: document.querySelector(`[data-user-role="${id}"]`).value,
      locationId: document.querySelector(`[data-user-location="${id}"]`).value,
      locationIds: [document.querySelector(`[data-user-location="${id}"]`).value]
    });
    toast('User saved');
  } catch {
    toast('User did not save — restart the backend server');
  }
}

async function saveUser(user) {
  if (apiOnline) {
    const path = user.email && !user.id ? '/api/invite' : '/api/user';
    users = (await api(path, { method: 'POST', body: JSON.stringify(user) })).users;
  } else {
    const id = user.id || user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = users.find(entry => entry.id === id);
    if (existing) Object.assign(existing, user, { id });
    else users.push({ id, ...user });
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.users = users;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
  }
  render();
}

async function saveLocation(id) {
  const name = document.querySelector(`[data-location-name="${id}"]`).value.trim();
  if (!name) return toast('Enter a location name');
  if (apiOnline) {
    locations = (await api('/api/location', { method: 'POST', body: JSON.stringify({ id, name }) })).locations;
  } else {
    const location = locations.find(entry => entry.id === id);
    if (location) location.name = name;
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.locations = locations;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
  }
  render();
  toast('Location saved');
}

$('#pushTaskBtn').onclick = async () => {
  const name = $('#newTask').value.trim();
  if (!name) return toast('Enter a task description');
  const section = $('#newTaskSection').value;
  day.tasks.push({ id: `extra-${Date.now()}`, name, section, photo: $('#photoRequired').checked, done: false, pushed: true });
  selectedTaskSection = section;
  localStorage.setItem('dailyops-task-section', selectedTaskSection);
  $('#newTask').value = '';
  $('#photoRequired').checked = false;
  await persistAndRender('Task pushed to today');
};

$('#finishBtn').onclick = async () => {
  day.complete = true;
  day.completedAt = new Date().toISOString();
  day.completedBy = currentUser().name;
  await persistAndRender('Daily checklist complete');
};

document.querySelectorAll('nav button').forEach(button => {
  button.onclick = () => switchView(button.dataset.view);
});

$('#roleBtn').onclick = () => $('#manageNav').click();
$('#backToHistoryBtn').onclick = () => switchView('historyView');
$('#exportAllBtn').onclick = () => downloadReports(history.map(reportKey));
$('#exportSelectedBtn').onclick = () => downloadReports(selectedHistoryKeys());
$('#exportReportBtn').onclick = () => selectedReportDate && downloadReports([`${selectedReportLocationId}|${selectedReportDate}`]);

function renderHistory() {
  $('#historyList').innerHTML = history.length
    ? history.sort((a, b) => b.date.localeCompare(a.date) || locationName(a.locationId).localeCompare(locationName(b.locationId))).map(report => {
      const key = reportKey(report);
      const location = report.locationId || report.day.locationId || currentLocationId;
      return `
        <article class="card history-day selectable-history">
          <label class="history-select" title="Select for export"><input type="checkbox" data-history-select value="${escapeHtml(key)}"></label>
          <button data-history-key="${escapeHtml(key)}" class="history-open">
            <div>
              <b>${new Date(`${report.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${escapeHtml(locationName(location))}</b>
              <p>${report.day.tasks.length} tasks · ${report.day.temps.length} temperature logs${report.day.completedBy ? ` · ${escapeHtml(report.day.completedBy)}` : ''}</p>
            </div>
            <span class="complete-mark">View report</span>
          </button>
        </article>
      `;
    }).join('')
    : '<div class="empty">Completed checklists will appear here.</div>';
}

loadState();
