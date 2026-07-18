const baseTasks = [
  { id: 'sanitize', name: 'Sanitize all prep surfaces' },
  { id: 'coolers', name: 'Check cooler and freezer doors', photo: true },
  { id: 'labels', name: 'Verify food labels and dates' },
  { id: 'floors', name: 'Sweep and mop kitchen floors', photo: true },
  { id: 'cash', name: 'Count and record opening cash' }
];

const defaultTemperatureItems = {
  Grill: {
    requiredDaily: true,
    areas: {
      'Cook temperatures': [
        'Hamburger Patties',
        'Grilled Chicken',
        'Crispy Chicken',
        'Chicken Strips',
        'Other Proteins',
        'Fish Fillets / Shrimp',
        'Hot Dogs',
        'Chili',
        'Gravy'
      ],
      'Hot holding / heated products': [
        'Hamburger Patties - Hold',
        'Grilled Chicken - Hold',
        'Crispy Chicken - Hold',
        'Chicken Strips - Hold',
        'Other Proteins - Hold',
        'Fish Fillets / Shrimp - Hold',
        'Hot Dogs - Hold',
        'Chili - Hold',
        'Barbecue - Hold',
        'Mushroom Sauce - Hold',
        'Gravy - Hold',
        'Reheated Queso',
        'Queso Heated First Time'
      ],
      'Cold holding - grill': [
        'Cheese Sliced',
        'Cheese Shredded',
        'Iron Grill Set-ups',
        'Cooler #1',
        'Cooler #2',
        'Refrigerated Prep Table',
        'Walk-in Cooler',
        'Walk-in Freezer'
      ]
    }
  },
  Chill: {
    requiredDaily: true,
    areas: {
      'Hot products': [
        'Hot Fudge',
        'Hot Caramel',
        'Waffle Coating',
        'Novelty Cone Coat',
        'Cocoa Fudge',
        'Cone Coating'
      ],
      'Cold products': [
        'DQ Mix in Bag',
        'Milk',
        'Open Topping',
        'Frozen Soft Serve',
        'Overrun',
        'DQ Bakes Desserts'
      ],
      'Chill equipment': [
        'Topping Cabinet Cooler Ambient',
        'Walk-in Cooler Ambient',
        'Topping Cabinet Freezer #1 Ambient',
        'Topping Cabinet Freezer #2 Ambient',
        'Refrigerated Prep Table',
        'Soft Serve Freezer Cabinet Ambient',
        'Blast Freezer',
        'Cake Display',
        'Walk-in Freezer Ambient'
      ]
    }
  },
  Receiving: {
    requiredDaily: false,
    areas: {
      'Truck receiving': [
        'Hamburgers',
        'Liquid Yogurt - frozen',
        'Fruit Mix - frozen',
        'Cheese',
        'Soft Serve Mix',
        'Other Products',
        'Buns',
        'Problem Cases'
      ]
    }
  }
};

const taskSections = ['All Day', 'Opening', 'Mid-shift', 'Closing'];
const taskCategories = ['Manager', 'Chill', 'Grill', 'Service'];
const prepAreas = ['Grill', 'Chill'];
const tempSessions = ['Day', 'Afternoon'];
const weekdayOptions = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const maintenanceRole = 'Maintenance Tech';
const dateKey = new Date().toISOString().slice(0, 10);
const $ = selector => document.querySelector(selector);
const hostedAuthEnabled = () => Boolean(window.dailyOpsAuth?.enabled);
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
let selectedTaskCategory = localStorage.getItem('dailyops-task-category') || 'Manager';
let editingTemplateId = null;
let templateScope = localStorage.getItem('dailyops-template-scope') || 'all';
let selectedTempList = localStorage.getItem('dailyops-temp-list') || 'Grill';
let selectedTempSession = localStorage.getItem('dailyops-temp-session') || 'Day';
let dashboardRange = localStorage.getItem('dailyops-dashboard-range') || 'day';
let dashboardLocationId = localStorage.getItem('dailyops-dashboard-location') || 'all';
let dashboardMetrics = {
  ops: { completed: 0, remaining: 0, total: 0, percent: 0 },
  maintenance: { completed: 0, open: 0, total: 0, percent: 0 }
};
let taskTemplates = baseTasks.map(task => ({ ...task, section: 'Opening', active: true }));
let notices = [];
let alertSettings = { rules: [], logs: [] };
let notificationLogs = [];
let calendarEvents = { events: [] };
let calendarLocationFilter = localStorage.getItem('calendar-location-filter') || 'all';
let maintenancePriorityOrder = [];
let fpc = { records: [] };
let fpcLocationId = localStorage.getItem('fpc-location') || 'all';
let storeDocuments = { documents: [] };
let storeDocsLocationId = localStorage.getItem('store-docs-location') || 'all';
let resources = { resources: [] };
let resourcesLocationId = localStorage.getItem('resources-location') || 'all';
let smallwares = { requests: [] };
let smallwaresLocationId = localStorage.getItem('smallwares-location') || currentLocationId;
let showApprovedSmallwares = false;

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
    <article class="card location-switcher" id="taskLocationSwitcher">
      <label>Working location
        <select id="taskLocationSelect"></select>
      </label>
      <p class="hint">Tasks completed here will save to the selected location.</p>
    </article>
    <div id="taskCategoryTabs" class="pill-row category-row"></div>
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
    <article class="card location-switcher" id="tempLocationSwitcher">
      <label>Working location
        <select id="tempLocationSelect"></select>
      </label>
      <p class="hint">Temperature readings entered here will save to the selected location.</p>
    </article>
    <div id="tempListTabs" class="pill-row"></div>
    <div id="tempSessionTabs" class="pill-row"></div>
  `;

  todayView.after(tempLogsView);
  todayView.after(taskListsView);

  taskListsView.append(progress);
  sectionTitle.querySelector('h3').id = 'taskSectionTitle';
  taskListsView.append(sectionTitle, taskList, finishBtn);
  tempLogsView.append(tempCard);
  if (hostedAuthEnabled()) todayView.classList.add('utility-view');

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

function setupCollapsibleCards() {
  document.querySelectorAll('.collapsible-card').forEach((card, index) => {
    if (card.dataset.collapsibleReady) return;
    const title = card.querySelector(':scope > h3');
    if (!title) return;
    const body = document.createElement('div');
    body.className = 'collapsible-body';
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'collapsible-header';
    const indicator = document.createElement('span');
    indicator.className = 'collapse-indicator';
    indicator.textContent = card.dataset.startOpen === 'true' ? '−' : '+';
    header.append(title, indicator);
    card.insertBefore(header, card.firstChild);
    while (header.nextSibling) body.appendChild(header.nextSibling);
    card.appendChild(body);
    card.classList.toggle('collapsed', card.dataset.startOpen !== 'true');
    card.dataset.collapsibleReady = String(index + 1);
  });
}

setupCollapsibleCards();

function applyTenantBranding() {
  const tenant = window.dailyOpsAuth?.tenant || {};
  const appName = tenant.appName || 'HIS OPS';
  const businessName = tenant.name || 'HIS Management Group Inc';
  const subtitle = tenant.subtitle || 'Daily operations';
  document.title = businessName;
  document.querySelectorAll('.app-logo').forEach(logo => {
    if (tenant.logoUrl) logo.src = tenant.logoUrl;
    logo.alt = `${businessName} logo`;
  });
  document.querySelectorAll('.side-brand b').forEach(entry => { entry.textContent = appName; });
  document.querySelectorAll('.side-brand span').forEach(entry => { entry.textContent = subtitle; });
  document.querySelectorAll('header h1').forEach(entry => { entry.textContent = appName; });
  document.querySelectorAll('header .eyebrow').forEach(entry => { entry.textContent = businessName.toUpperCase(); });
}

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
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const payload = JSON.parse(text);
      message = payload.error || payload.message || text;
    } catch {
      message = text;
    }
    throw new Error(message || 'Request failed');
  }
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

function isMaintenanceTech(user = currentUser()) {
  return user.role === maintenanceRole;
}

function usesAssignedLocations(user = currentUser()) {
  return isAboveStore(user) || isMaintenanceTech(user);
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

function canUseDailyOps(user = currentUser()) {
  return !isMaintenanceTech(user);
}

function canAddStoreDocuments(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
}

function canManageResources(user = currentUser()) {
  return ['Director of Operations', 'Owner'].includes(user.role);
}

function canManageAlerts(user = currentUser()) {
  return ['Director of Operations', 'Owner'].includes(user.role);
}

function canManageCalendar(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
}

function canApproveSmallwares(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
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
  if (isFullAccess(actor)) return ['Employee', 'Manager', 'Area Manager', maintenanceRole, 'Director of Operations', 'Owner'];
  if (actor.role === 'Area Manager') return ['Employee', 'Manager', 'Area Manager', maintenanceRole];
  if (actor.role === 'Manager') return ['Employee', 'Manager'];
  return [];
}

async function loadState() {
  try {
    const state = await api(`/api/state?date=${dateKey}&locationId=${currentLocationId}&historyScope=${historyScope}`);
    applyTenantBranding();
    day = state.day;
    history = state.history;
    overdue = state.overdue || [];
    temperatureItems = state.temperatureItems || defaultTemperatureItems;
    taskTemplates = state.taskTemplates?.length ? state.taskTemplates : taskTemplates;
    notices = state.notices || [];
    alertSettings = state.alertSettings || alertSettings;
    notificationLogs = state.notificationLogs || notificationLogs;
    calendarEvents = state.calendarEvents || calendarEvents;
    users = state.users?.length ? state.users : users;
    locations = state.locations?.length ? state.locations : locations;
    if (window.dailyOpsAuth?.profile?.id) {
      if (!users.some(user => user.id === window.dailyOpsAuth.profile.id)) users = [window.dailyOpsAuth.profile, ...users];
      currentUserId = window.dailyOpsAuth.profile.id;
      localStorage.setItem('dailyops-current-user', currentUserId);
    }
    if (!users.some(user => user.id === currentUserId)) currentUserId = users[0].id;
    if (!locations.some(location => location.id === currentLocationId)) currentLocationId = locations[0].id;
    apiOnline = true;
  } catch (error) {
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
  await loadFpcState();
  await loadCalendarState();
  await loadStoreDocumentsState();
  await loadResourcesState();
  await loadSmallwaresState();
  await loadDashboardState();
  render();
}

async function loadMaintenanceState() {
  if (!apiOnline) return;
  try {
    if (maintenanceLocationId === 'all' && currentUser().role === 'Manager') maintenanceLocationId = 'assigned';
    const queryLocation = maintenanceLocationId === 'assigned' ? 'all' : maintenanceLocationId;
    maintenance = await api(`/api/maintenance/state?locationId=${queryLocation}`);
    maintenancePriorityOrder = maintenance.priorityOrder || [];
    filterMaintenanceScope();
  } catch {
    maintenance = { locations: [], equipment: [], workOrders: [], pmSchedule: [], vendors: [], lists: {} };
    maintenancePriorityOrder = [];
  }
}

async function loadFpcState() {
  if (!apiOnline) return;
  try {
    fpc = await api('/api/fpc/state');
  } catch {
    fpc = { records: [] };
  }
}

async function loadCalendarState() {
  if (!apiOnline) return;
  try {
    calendarEvents = await api('/api/calendar/state');
  } catch {
    calendarEvents = { events: [] };
  }
}

async function loadStoreDocumentsState() {
  if (!apiOnline) return;
  try {
    storeDocuments = await api('/api/store-documents/state');
  } catch {
    storeDocuments = { documents: [] };
  }
}

async function loadResourcesState() {
  if (!apiOnline) return;
  try {
    resources = await api('/api/resources/state');
  } catch {
    resources = { resources: [] };
  }
}

async function loadSmallwaresState() {
  if (!apiOnline) return;
  try {
    smallwares = await api('/api/smallwares/state');
  } catch {
    smallwares = { requests: [] };
  }
}

function tempRequirementTotal() {
  return Object.values(dailyTemperatureAreas()).reduce((sum, items) => sum + items.length, 0) * tempSessions.length;
}

function localDashboardMetrics() {
  const taskTotal = day.tasks.length || baseTasks.length;
  const taskDone = day.tasks.filter(task => task.done).length;
  const requiredTemps = new Set();
  Object.entries(dailyTemperatureAreas()).forEach(([area, items]) => {
    items.forEach(item => tempSessions.forEach(session => requiredTemps.add(`${area}|${item}|${session}`)));
  });
  const loggedTemps = new Set(day.temps.filter(temp => readingList(temp) !== 'Receiving').map(temp => `${temp.area}|${temp.item}|${readingSession(temp)}`));
  const tempDone = [...requiredTemps].filter(key => loggedTemps.has(key)).length;
  const opsTotal = taskTotal + tempRequirementTotal();
  const opsCompleted = taskDone + tempDone;
  const completedOrders = maintenance.workOrders.filter(order => order.Status === 'Completed').length;
  const openOrders = maintenance.workOrders.filter(order => !['Completed', 'Cancelled', 'Canceled'].includes(order.Status)).length;
  const completedPm = maintenance.pmSchedule.filter(pm => pm.Status === 'Completed').length;
  const openPm = maintenance.pmSchedule.filter(pm => pm.Status !== 'Completed').length;
  const fpcItems = (fpc.records || [])
    .filter(record => record.active !== false && accessibleLocationIds().includes(record.locationId))
    .flatMap(record => record.items || []);
  const completedFpc = fpcItems.filter(item => item.status === 'Completed').length;
  const openFpc = fpcItems.filter(item => item.status !== 'Completed').length;
  const sectionRows = allTaskSections().map(section => {
    const tasks = day.tasks.filter(task => task.section === section);
    const completed = tasks.filter(task => task.done).length;
    return {
      label: section,
      completed,
      remaining: Math.max(tasks.length - completed, 0),
      total: tasks.length,
      percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    };
  }).filter(row => row.total > 0);
  const tempRows = temperatureListNames()
    .filter(list => temperatureItems[list]?.requiredDaily !== false)
    .map(list => {
      const areas = temperatureAreasForList(list);
      const required = new Set();
      Object.entries(areas).forEach(([area, items]) => {
        items.forEach(item => tempSessions.forEach(session => required.add(`${area}|${item}|${session}`)));
      });
      const logged = new Set(day.temps
        .filter(temp => readingList(temp) === list)
        .map(temp => `${temp.area}|${temp.item}|${readingSession(temp)}`));
      const completed = [...required].filter(key => logged.has(key)).length;
      return {
        label: `${list} Temp Logs`,
        completed,
        remaining: Math.max(required.size - completed, 0),
        total: required.size,
        percent: required.size ? Math.round((completed / required.size) * 100) : 0
      };
    });
  return {
    ops: {
      completed: opsCompleted,
      remaining: Math.max(opsTotal - opsCompleted, 0),
      total: opsTotal,
      percent: opsTotal ? Math.round((opsCompleted / opsTotal) * 100) : 0
    },
    maintenance: {
      completed: completedOrders + completedPm,
      open: openOrders + openPm,
      total: completedOrders + completedPm + openOrders + openPm,
      percent: completedOrders + completedPm + openOrders + openPm ? Math.round(((completedOrders + completedPm) / (completedOrders + completedPm + openOrders + openPm)) * 100) : 0
    },
    fpc: {
      completed: completedFpc,
      open: openFpc,
      total: completedFpc + openFpc,
      percent: completedFpc + openFpc ? Math.round((completedFpc / (completedFpc + openFpc)) * 100) : 0
    },
    progress: {
      mode: 'single-location',
      rows: [...sectionRows, ...tempRows]
    }
  };
}

async function loadDashboardState() {
  if (!apiOnline) {
    dashboardMetrics = localDashboardMetrics();
    return;
  }
  try {
    dashboardMetrics = await api(`/api/dashboard?range=${encodeURIComponent(dashboardRange)}&locationId=${encodeURIComponent(dashboardLocationId)}`);
  } catch {
    dashboardMetrics = localDashboardMetrics();
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

function chooseSnoozeDays() {
  return new Promise(resolve => {
    let dialog = $('#snoozeDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'snoozeDialog';
      dialog.innerHTML = `
        <form method="dialog">
          <div class="modal-head">
            <h3>Snooze task</h3>
            <button value="cancel" class="x">×</button>
          </div>
          <p class="hint">How long should this task be moved out?</p>
          <div class="snooze-options">
            <button value="1">1 day</button>
            <button value="2">2 days</button>
            <button value="3">3 days</button>
            <button value="7">1 week</button>
            <button value="14">2 weeks</button>
          </div>
        </form>
      `;
      document.body.append(dialog);
    }
    dialog.onclose = () => resolve(Number(dialog.returnValue) || 0);
    dialog.showModal();
  });
}

async function snoozeTask(taskId) {
  const days = await chooseSnoozeDays();
  if (!days) return;
  const target = new Date();
  target.setDate(target.getDate() + days);
  const targetDate = target.toISOString().slice(0, 10);
  try {
    const saved = await api('/api/task/snooze', {
      method: 'POST',
      body: JSON.stringify({ locationId: currentLocationId, date: dateKey, taskId, targetDate })
    });
    day = saved.day;
    history = saved.history || history;
    overdue = saved.overdue || overdue;
    render();
    toast('Task snoozed');
  } catch (error) {
    toast(`Task did not snooze: ${error.message}`);
  }
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

function userOptionList(selectedId = '') {
  return '<option value="">No internal person selected</option>' + users
    .filter(user => user.active !== false && user.email)
    .map(user => `<option value="${escapeHtml(user.id)}" ${user.id === selectedId ? 'selected' : ''}>${escapeHtml(user.name)} · ${escapeHtml(user.role || '')}</option>`)
    .join('');
}

function vendorOptionList(selectedId = '') {
  return '<option value="">No vendor selected</option>' + (maintenance.vendors || [])
    .map(vendor => `<option value="${escapeHtml(vendor['Vendor ID'])}" ${vendor['Vendor ID'] === selectedId ? 'selected' : ''}>${escapeHtml(vendor['Vendor Name'])}</option>`)
    .join('');
}

function assignmentName(entry = {}) {
  if (entry.assignmentType === 'internal') return entry.assigneeName || entry['Assignee Name'] || entry.assignedTo || entry['Assigned To'] || 'Internal person';
  if (entry.assignmentType === 'vendor') return entry.vendorName || entry['Vendor Name'] || maintenance.vendors.find(vendor => vendor['Vendor ID'] === (entry.vendorId || entry['Vendor ID']))?.['Vendor Name'] || 'Outside vendor';
  return entry.assignedTo || entry['Assigned To'] || '';
}

function assignmentPayload(prefix) {
  const type = $(`#${prefix}AssignmentType`)?.value || '';
  const assigneeId = $(`#${prefix}AssigneeUser`)?.value || '';
  const vendorId = $(`#${prefix}Vendor`)?.value || '';
  const notify = $(`#${prefix}AssignmentNotify`)?.value || 'none';
  const user = users.find(entry => entry.id === assigneeId);
  const vendor = maintenance.vendors.find(entry => entry['Vendor ID'] === vendorId);
  return {
    assignmentType: type,
    assigneeId: type === 'internal' ? assigneeId : '',
    assigneeName: type === 'internal' ? (user?.name || '') : '',
    assigneeEmail: type === 'internal' ? (user?.email || '') : '',
    assigneePhone: type === 'internal' ? (user?.phone || user?.mobile_phone || user?.mobile || '') : '',
    vendorId: type === 'vendor' ? vendorId : '',
    vendorName: type === 'vendor' ? (vendor?.['Vendor Name'] || '') : '',
    assignmentNotify: type === 'internal' ? notify : 'none',
    assignedTo: type === 'internal' ? (user?.name || '') : type === 'vendor' ? (vendor?.['Vendor Name'] || '') : ''
  };
}

function setAssignmentFields(prefix, entry = {}) {
  if ($(`#${prefix}AssignmentType`)) $(`#${prefix}AssignmentType`).value = entry.assignmentType || (entry.assigneeId ? 'internal' : entry.vendorId || entry['Vendor ID'] ? 'vendor' : '');
  if ($(`#${prefix}AssigneeUser`)) $(`#${prefix}AssigneeUser`).innerHTML = userOptionList(entry.assigneeId || '');
  if ($(`#${prefix}Vendor`)) $(`#${prefix}Vendor`).innerHTML = vendorOptionList(entry.vendorId || entry['Vendor ID'] || '');
  if ($(`#${prefix}AssignmentNotify`)) $(`#${prefix}AssignmentNotify`).value = entry.assignmentNotify || 'none';
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

function isImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
}

function normalizeDailyOps() {
  day.prepQuantities ??= {};
  day.tasks = (day.tasks || []).map(task => ({
    ...task,
    section: task.section || task.list || (task.pushed ? 'All Day' : 'Opening')
  })).filter(task => !(/^prep-(manager|crew)-/.test(String(task.id || '')) && !task.linkedPrepId));
  const existingById = new Map(day.tasks.map(task => [task.id, task]));
  day.tasks
    .filter(task => task.managerPrep && task.prepArea)
    .forEach(task => {
      const crewId = `prep-crew-${task.id}`;
      if (!existingById.has(crewId)) {
        day.tasks.push({
          ...task,
          id: crewId,
          category: task.prepArea,
          linkedPrepId: task.id,
          managerPrep: false,
          crewPrep: true,
          done: false
        });
      }
      day.prepQuantities[task.id] ??= '';
    });
  day.temps = day.temps || [];
}

function allTaskSections() {
  return [...new Set([
    ...taskSections,
    ...taskTemplates.map(task => task.section).filter(Boolean),
    ...(day.tasks || []).map(task => task.section).filter(Boolean)
  ])];
}

function templateLocationId(task = {}) {
  return task.locationId || 'all';
}

function scopedTaskTemplates(scope = templateScope) {
  return taskTemplates.filter(task => (task.active !== false) && templateLocationId(task) === scope);
}

function todaysTaskSections() {
  return [...new Set((day.tasks || []).map(task => task.section).filter(Boolean))];
}

function currentTaskDaypart() {
  const hour = new Date().getHours();
  if (hour >= 13 && hour < 19) return 'Mid-shift';
  if (hour >= 19) return 'Closing';
  return 'Opening';
}

function taskDaypart(section = '') {
  const value = String(section).toLowerCase();
  if (value.includes('mid')) return 'Mid-shift';
  if (value.includes('clos') || value.includes('night shift')) return 'Closing';
  if (value.includes('opening') || value.includes('day shift')) return 'Opening';
  if (value.includes('all day') || value.includes('weekly cleaning')) return 'All Day';
  return 'All Day';
}

function taskCategory(task = {}) {
  if (task.category && taskCategories.includes(task.category)) return task.category;
  const value = `${task.section || ''} ${task.name || ''}`.toLowerCase();
  if (value.includes('chill') || value.includes('cake') || value.includes('soft serve') || value.includes('blizzard') || value.includes('topping')) return 'Chill';
  if (value.includes('grill') || value.includes('kitchen') || value.includes('prep') || value.includes('fryer') || value.includes('broiler') || value.includes('hood') || value.includes('walk-in cooler') || value.includes('walk-in freezer')) return 'Grill';
  if (value.includes('service') || value.includes('dining') || value.includes('restroom') || value.includes('drive') || value.includes('front counter') || value.includes('parking') || value.includes('exterior') || value.includes('patio') || value.includes('customer')) return 'Service';
  return 'Manager';
}

function taskMatchesCurrentTime(task = {}) {
  const part = taskDaypart(task.section);
  return part === 'All Day' || part === currentTaskDaypart();
}

function taskVisibleInCurrentCategory(task = {}) {
  return taskCategory(task) === selectedTaskCategory && taskMatchesCurrentTime(task);
}

function visibleTaskSectionsForCategory() {
  return [...new Set((day.tasks || []).filter(taskVisibleInCurrentCategory).map(task => task.section).filter(Boolean))];
}

function prepQuantityForTask(task = {}) {
  const sourceId = task.linkedPrepId || task.id;
  return day.prepQuantities?.[sourceId] ?? '';
}

function taskTemplateId(task) {
  return task.id || task.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function taskScheduleDays(task = {}, locationId = 'default') {
  const overrides = task.locationSchedules || {};
  const days = locationId !== 'default' && Array.isArray(overrides[locationId]) ? overrides[locationId] : task.scheduleDays;
  return Array.isArray(days) && days.length ? days : ['daily'];
}

function sectionScheduleDays(section, locationId = 'default') {
  const task = taskTemplates.find(entry => (entry.active !== false) && entry.section === section);
  return taskScheduleDays(task || {}, locationId);
}

function scheduleLabel(days = []) {
  if (!days.length || days.includes('daily')) return 'Every day';
  return days.join(', ');
}

function isTemperatureListFormat(items = temperatureItems) {
  return Object.values(items || {}).some(value => value?.areas);
}

function temperatureListNames() {
  return isTemperatureListFormat() ? Object.keys(temperatureItems) : ['Grill', 'Chill'];
}

function temperatureAreasForList(listName = selectedTempList) {
  if (!isTemperatureListFormat()) return temperatureItems;
  return temperatureItems[listName]?.areas || {};
}

function dailyTemperatureAreas() {
  if (!isTemperatureListFormat()) return temperatureItems;
  return Object.values(temperatureItems).reduce((areas, list) => {
    if (list.requiredDaily === false) return areas;
    Object.entries(list.areas || {}).forEach(([area, items]) => {
      areas[area] = items;
    });
    return areas;
  }, {});
}

function readingSession(reading) {
  return reading.session || 'Day';
}

function readingList(reading) {
  if (reading.list) return reading.list;
  if (String(reading.area || '').toLowerCase().includes('chill')) return 'Chill';
  return 'Grill';
}

function taskSectionProgress(section) {
  const tasks = (day.tasks || []).filter(task => task.section === section && taskCategory(task) === selectedTaskCategory && taskMatchesCurrentTime(task));
  const done = tasks.filter(task => task.done).length;
  return { done, total: tasks.length };
}

function tempRequirementComplete() {
  return Object.entries(dailyTemperatureAreas()).every(([area, items]) =>
    items.every(item =>
      tempSessions.every(session =>
        day.temps.some(temp => temp.area === area && temp.item === item && readingSession(temp) === session)
      )
    )
  );
}

function render() {
  const activeUser = currentUser();
  const aboveStore = usesAssignedLocations(activeUser);
  const allowedLocationIds = userLocationIds(activeUser);
  const visibleLocations = aboveStore
    ? locations.filter(location => isFullAccess(activeUser) || allowedLocationIds.includes(location.id))
    : locations.filter(location => location.id === allowedLocationIds[0]);
  if (!visibleLocations.some(location => location.id === currentLocationId)) currentLocationId = visibleLocations[0]?.id || currentLocationId;

  $('#greeting').textContent = `Good morning, ${activeUser.name.split(' ')[0]}`;
  $('#homeGreeting').textContent = 'Dashboard';
  if (window.dailyOpsAuth?.enabled && window.dailyOpsAuth.profile) {
    const profile = window.dailyOpsAuth.profile;
    $('#currentUser').innerHTML = `<option value="${profile.id}" selected>${escapeHtml(profile.name)} — ${escapeHtml(profile.role)}</option>`;
    $('#currentUser').disabled = true;
    $('#currentUserChooser').style.display = 'none';
    $('#deviceUserCard').style.display = aboveStore ? '' : 'none';
  } else {
    $('#currentUser').innerHTML = users.map(user => `<option value="${user.id}" ${user.id === currentUserId ? 'selected' : ''}>${user.name} — ${user.role}</option>`).join('');
    $('#currentUser').disabled = false;
    $('#currentUserChooser').style.display = '';
    $('#deviceUserCard').style.display = '';
  }
  $('#currentLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}" ${location.id === currentLocationId ? 'selected' : ''}>${location.name}</option>`).join('');
  $('#locationChooser').style.display = aboveStore && canUseDailyOps(activeUser) ? 'block' : 'none';
  renderWorkLocationSwitchers(visibleLocations, aboveStore && canUseDailyOps(activeUser));
  if (!canUseHistory(activeUser)) historyScope = 'location';
  $('#historyScope').value = historyScope;
  $('#historyScope').disabled = !aboveStore;
  $('#teamAvatar').textContent = initials(activeUser.name);
  $('#teamName').textContent = `${activeUser.name} · ${locationName(currentLocationId)}`;
  applyRoleAccess(activeUser);
  normalizeDailyOps();
  renderDashboard(visibleLocations, activeUser);
  renderCalendar(visibleLocations, activeUser);
  const sections = allTaskSections();
  if (!taskCategories.includes(selectedTaskCategory)) selectedTaskCategory = 'Manager';
  const visibleSections = visibleTaskSectionsForCategory();
  if (!visibleSections.includes(selectedTaskSection)) selectedTaskSection = visibleSections[0] || '';
  if ($('#newTaskSection')) {
    $('#newTaskSection').innerHTML = sections.map(section => `<option ${section === selectedTaskSection ? 'selected' : ''}>${escapeHtml(section)}</option>`).join('');
  }

  $('#taskCategoryTabs').innerHTML = taskCategories.map(category => {
    const count = (day.tasks || []).filter(task => taskCategory(task) === category && taskMatchesCurrentTime(task)).length;
    return `
      <button class="${category === selectedTaskCategory ? 'active' : ''}" data-task-category="${escapeHtml(category)}">
        <span>${escapeHtml(category)}</span>
        <b>${count}</b>
      </button>
    `;
  }).join('');

  $('#taskSectionTabs').innerHTML = visibleSections.map(section => {
    const progress = taskSectionProgress(section);
    return `
      <button class="${section === selectedTaskSection ? 'active' : ''}" data-task-section="${escapeHtml(section)}">
        <span>${escapeHtml(section)}</span>
        <b>${progress.done}/${progress.total}</b>
      </button>
    `;
  }).join('') || `<p class="hint">No ${escapeHtml(selectedTaskCategory)} lists are scheduled for the current time window.</p>`;
  const visibleTasks = selectedTaskSection
    ? day.tasks.filter(task => task.section === selectedTaskSection && taskCategory(task) === selectedTaskCategory && taskMatchesCurrentTime(task))
    : [];
  $('#taskSectionTitle').textContent = `${selectedTaskCategory} • ${currentTaskDaypart()}${selectedTaskSection ? ` • ${selectedTaskSection}` : ''}`;
  $('#taskList').innerHTML = visibleTasks.length ? visibleTasks.map(task => {
    const prepQty = prepQuantityForTask(task);
    const prepDetails = task.managerPrep ? `
      <label class="prep-qty">Quantity to prep
        <input type="number" min="0" step="1" value="${escapeHtml(prepQty)}" data-prep-qty="${escapeHtml(task.id)}" ${canUseManage(activeUser) ? '' : 'disabled'}>
      </label>
      <p class="hint">This quantity will show as read-only for the ${escapeHtml(task.prepArea)} crew list.</p>
    ` : task.crewPrep ? `
      <p class="prep-readonly"><b>Quantity to prep:</b> ${prepQty !== '' ? escapeHtml(prepQty) : 'Not set by manager yet'}</p>
    ` : '';
    return `
      <article class="card task ${task.done ? 'done' : ''} ${task.pushed ? 'urgent' : ''} ${task.managerPrep || task.crewPrep ? 'prep-task' : ''}">
        <input type="checkbox" data-check="${task.id}" ${task.done ? 'checked' : ''} ${task.photo && !task.photoUrl && !task.photoData ? 'disabled' : ''}>
        <div>
          <div class="task-name">${escapeHtml(task.name)}</div>
          ${prepDetails}
          ${task.pushed ? '<span class="urgent-label">MANAGER ADDED</span>' : ''}
          ${task.snoozedFrom ? `<p class="hint">Snoozed from ${escapeHtml(prettyDate(task.snoozedFrom))}${task.snoozedBy ? ` by ${escapeHtml(task.snoozedBy)}` : ''}</p>` : ''}
        </div>
        <div class="task-actions">
          ${task.photo ? `<button class="photo-btn ${task.photoUrl || task.photoData ? 'photo-ok' : ''}" data-photo="${task.id}">${task.photoUrl || task.photoData ? '✓ Photo' : '📷 Required'}</button>` : ''}
          ${canUseManage(activeUser) && !task.done && !task.managerPrep && !task.crewPrep ? `<button class="ghost snooze-btn" data-snooze-task="${task.id}" type="button">Snooze</button>` : ''}
        </div>
      </article>
    `;
  }).join('') : `<article class="card"><p class="hint">No ${escapeHtml(selectedTaskCategory.toLowerCase())} tasks are due in this time window.</p></article>`;

  const tempLists = temperatureListNames();
  if (!tempLists.includes(selectedTempList)) selectedTempList = tempLists[0] || 'Grill';
  $('#tempListTabs').innerHTML = tempLists.map(list => `
    <button class="${list === selectedTempList ? 'active' : ''}" data-temp-list="${escapeHtml(list)}">${escapeHtml(list)}</button>
  `).join('');
  $('#tempSessionTabs').innerHTML = tempSessions.map(session => `
    <button class="${session === selectedTempSession ? 'active' : ''}" data-temp-session="${escapeHtml(session)}">${escapeHtml(session)}</button>
  `).join('');
  $('#tempList').innerHTML = Object.entries(temperatureAreasForList()).map(([area, items]) => `
    <div class="temp-group">
      <h4>${escapeHtml(area)}</h4>
      ${items.map(item => {
        const readings = day.temps.filter(temp => readingList(temp) === selectedTempList && temp.area === area && temp.item === item && readingSession(temp) === selectedTempSession);
        return `
          <button class="temp-entry temp-pick" data-temp-list="${escapeHtml(selectedTempList)}" data-temp-area="${escapeHtml(area)}" data-temp-item="${escapeHtml(item)}">
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
  renderTaskTemplates();
  renderAlertRules();
  renderNotificationLogs();
  renderNotices();
  renderDashboardAlerts(visibleLocations);
  renderMaintenance();
  renderFpc();
  renderStoreDocuments();
  renderResources();
  renderSmallwares();
}

function setPie(selector, percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  $(selector).style.setProperty('--pct', value);
}

function renderDashboard(visibleLocations, activeUser) {
  if (!$('#dashboardRange')) return;
  const canUseAll = usesAssignedLocations(activeUser);
  if (!canUseAll || (dashboardLocationId !== 'all' && !visibleLocations.some(location => location.id === dashboardLocationId))) {
    dashboardLocationId = canUseAll ? 'all' : currentLocationId;
    localStorage.setItem('dailyops-dashboard-location', dashboardLocationId);
  }
  document.querySelectorAll('.ops-dashboard-card').forEach(card => {
    card.style.display = canUseDailyOps(activeUser) ? '' : 'none';
  });
  document.querySelectorAll('.dashboard-progress-card').forEach(card => {
    card.style.display = canUseDailyOps(activeUser) ? '' : 'none';
  });
  $('#dashboardRange').value = dashboardRange;
  $('#dashboardLocation').innerHTML = [
    ...(canUseAll ? [`<option value="all">${isFullAccess(activeUser) ? 'All locations' : 'All assigned locations'}</option>`] : []),
    ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#dashboardLocation').value = dashboardLocationId;

  const ops = dashboardMetrics.ops || { completed: 0, remaining: 0, total: 0, percent: 0 };
  const maintenanceSummary = dashboardMetrics.maintenance || { completed: 0, open: 0, total: 0, percent: 0 };
  const fpcSummary = dashboardMetrics.fpc || { completed: 0, open: 0, total: 0, percent: 0 };
  setPie('#opsPie', ops.percent);
  setPie('#maintenancePie', maintenanceSummary.percent);
  setPie('#fpcPie', fpcSummary.percent);
  $('#opsPieLabel').textContent = `${ops.percent || 0}%`;
  $('#maintenancePieLabel').textContent = `${maintenanceSummary.percent || 0}%`;
  $('#fpcPieLabel').textContent = `${fpcSummary.percent || 0}%`;
  $('#opsCompleted').textContent = ops.completed || 0;
  $('#opsRemaining').textContent = ops.remaining || 0;
  $('#maintenanceCompleted').textContent = maintenanceSummary.completed || 0;
  $('#maintenanceOpen').textContent = maintenanceSummary.open || 0;
  $('#fpcCompleted').textContent = fpcSummary.completed || 0;
  $('#fpcOpen').textContent = fpcSummary.open || 0;
  $('#opsChartHint').textContent = `${dashboardRange === 'day' ? 'Current day' : dashboardRange === 'week' ? 'Current week' : 'Current month'} cleaning tasks and temp logs.`;
  $('#maintenanceChartHint').textContent = `${dashboardRange === 'day' ? 'Current day' : dashboardRange === 'week' ? 'Current week' : 'Current month'} completed vs open work orders.`;
  $('#fpcChartHint').textContent = 'Current FPC repair item completion for the selected location view.';
  renderDashboardProgress();
  renderUpcomingMaintenanceTasks(visibleLocations, activeUser);
}

function renderDashboardProgress() {
  if (!$('#dashboardProgressBars')) return;
  const progress = dashboardMetrics.progress || { mode: 'locations', rows: [] };
  const rows = progress.rows || [];
  $('#dashboardProgressTitle').textContent = progress.mode === 'single-location' ? 'Checklist + temp log progress' : 'Location progress';
  $('#dashboardProgressCount').textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  $('#dashboardProgressBars').innerHTML = rows.length ? rows.map(row => `
    <div class="progress-row">
      <div class="progress-row-head">
        <b>${escapeHtml(row.label)}</b>
        <span>${row.percent || 0}%</span>
      </div>
      <div class="progress-track"><i style="width:${Math.max(0, Math.min(100, Number(row.percent) || 0))}%"></i></div>
      <p class="hint">${row.completed || 0} completed${row.remaining !== undefined ? ` Â· ${row.remaining || 0} remaining` : ''}${row.total !== undefined ? ` Â· ${row.total || 0} total` : ''}</p>
    </div>
  `).join('') : '<p class="hint">No progress data available for this selection yet.</p>';
}

function eventLocationLabel(locationId) {
  return locationId === 'all' ? 'All assigned locations' : locationName(locationId);
}

function daysUntil(date) {
  const today = new Date(`${dateKey}T12:00`);
  const target = new Date(`${date}T12:00`);
  return Math.round((target - today) / 86400000);
}

function maintenanceLocationLabel(maintenanceLocationId) {
  return maintenance.locations.find(location => String(location['Location ID']) === String(maintenanceLocationId))?.['Location Name'] || maintenanceLocationId || 'Unknown location';
}

function isUpcomingDate(value, withinDays = 15) {
  if (!value) return false;
  const difference = daysUntil(String(value).slice(0, 10));
  return difference >= 0 && difference <= withinDays;
}

function taskPriorityScore(priority = '') {
  return { Emergency: 0, High: 1, Medium: 2, Low: 3 }[priority] ?? 4;
}

function upcomingMaintenanceTasks(visibleLocations = []) {
  const allowedMaintenanceIds = maintenanceAllowedLocationIds();
  const allowedStoreIds = visibleLocations.map(location => location.id);
  const manualRank = new Map((maintenancePriorityOrder || []).map((id, index) => [id, index]));
  const workOrders = (maintenance.workOrders || [])
    .filter(order => !['Completed', 'Cancelled', 'Canceled'].includes(order.Status) && allowedMaintenanceIds.includes(String(order['Location ID'])) && isUpcomingDate(order['Target Date']))
    .map(order => ({
      id: `wo:${order['Work Order ID']}`,
      type: 'Work order',
      title: `${order['Work Order ID']} · ${order['Equipment Name'] || order.Category || 'Maintenance'}`,
      detail: order['Issue Description'] || '',
      location: order['Location Name'] || maintenanceLocationLabel(order['Location ID']),
      date: String(order['Target Date']).slice(0, 10),
      priority: order.Priority || 'Medium',
      status: order.Status || 'New'
    }));
  const pmTasks = (maintenance.pmSchedule || [])
    .filter(pm => pm.Status !== 'Completed' && allowedMaintenanceIds.includes(String(pm['Location ID'])) && isUpcomingDate(pm['Next Due']))
    .map(pm => ({
      id: `pm:${pm['PM ID']}`,
      type: 'PM task',
      title: pm.Task || 'Preventive maintenance',
      detail: pm['Instructions / Checklist'] || '',
      location: pm['Location Name'] || maintenanceLocationLabel(pm['Location ID']),
      date: String(pm['Next Due']).slice(0, 10),
      priority: pm.Status === 'Overdue' ? 'Emergency' : 'Medium',
      status: pm.Status || 'Due'
    }));
  const fpcTasks = (fpc.records || [])
    .filter(record => allowedStoreIds.includes(record.locationId))
    .flatMap(record => (record.items || [])
      .filter(item => item.status !== 'Completed' && isUpcomingDate(item.targetDate))
      .map(item => ({
        id: `fpc:${record.id}:${item.id}`,
        type: 'FPC item',
        title: item.description || 'FPC repair item',
        detail: item.assignedTo ? `Assigned to ${item.assignedTo}` : '',
        location: record.locationName || locationName(record.locationId),
        date: item.targetDate,
        priority: item.priority || 'Medium',
        status: item.status || 'Open'
      })));
  return [...workOrders, ...pmTasks, ...fpcTasks]
    .sort((a, b) => {
      const aRank = manualRank.has(a.id) ? manualRank.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bRank = manualRank.has(b.id) ? manualRank.get(b.id) : Number.MAX_SAFE_INTEGER;
      return aRank - bRank
        || String(a.date).localeCompare(String(b.date))
        || taskPriorityScore(a.priority) - taskPriorityScore(b.priority)
        || a.title.localeCompare(b.title);
    });
}

function renderUpcomingMaintenanceTasks(visibleLocations, activeUser) {
  if (!$('#dashboardUpcomingTasks')) return;
  const tasks = upcomingMaintenanceTasks(visibleLocations);
  const canReorder = canManageCalendar(activeUser);
  $('#dashboardUpcomingCount').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  if (tasks.length) {
    $('#dashboardUpcomingTasks').innerHTML = renderUpcomingTaskDetails(tasks, canReorder);
    return;
  }
  $('#dashboardUpcomingTasks').innerHTML = '<p class="hint">No maintenance, PM, or FPC tasks due in the next 15 days.</p>';
}

function renderUpcomingTaskRows(tasks, canReorder) {
  return tasks.map((task, index) => `
    <article class="upcoming-task-row ${task.priority === 'Emergency' ? 'urgent' : ''}">
      <div>
        <p class="eyebrow">${escapeHtml(task.type)} · ${escapeHtml(task.location)}</p>
        <h3>${escapeHtml(task.title)}</h3>
        <p>Due ${escapeHtml(prettyDate(task.date))} · ${escapeHtml(task.priority)} · ${escapeHtml(task.status)}</p>
        ${task.detail ? `<p class="hint">${escapeHtml(task.detail)}</p>` : ''}
      </div>
      <div class="row-actions">
        ${canReorder ? `<button class="ghost" data-priority-move="${escapeHtml(task.id)}|up" ${index === 0 ? 'disabled' : ''} type="button">Up</button><button class="ghost" data-priority-move="${escapeHtml(task.id)}|down" ${index === tasks.length - 1 ? 'disabled' : ''} type="button">Down</button>` : ''}
      </div>
    </article>
  `).join('');
}

function renderUpcomingTaskDetails(tasks, canReorder) {
  const preview = tasks.slice(0, 2).map(task => `
    <div class="upcoming-preview-row">
      <b>${escapeHtml(task.title)}</b>
      <span>${escapeHtml(task.location)} · Due ${escapeHtml(prettyDate(task.date))}</span>
    </div>
  `).join('');
  return `
    <details class="upcoming-task-details">
      <summary>
        <div>
          <b>${tasks.length} upcoming task${tasks.length === 1 ? '' : 's'}</b>
          <p class="hint">Showing the first ${Math.min(2, tasks.length)}. Open to view and reorder the full list.</p>
          <div class="upcoming-summary-preview">${preview}</div>
        </div>
      </summary>
      <div class="upcoming-expanded-list">${renderUpcomingTaskRows(tasks, canReorder)}</div>
    </details>
  `;
}

function renderUpcomingMaintenanceTasksLegacy() {
  $('#dashboardUpcomingTasks').innerHTML = tasks.length ? tasks.map((task, index) => `
    <article class="upcoming-task-row ${task.priority === 'Emergency' ? 'urgent' : ''}">
      <div>
        <p class="eyebrow">${escapeHtml(task.type)} · ${escapeHtml(task.location)}</p>
        <h3>${escapeHtml(task.title)}</h3>
        <p>Due ${escapeHtml(prettyDate(task.date))} · ${escapeHtml(task.priority)} · ${escapeHtml(task.status)}</p>
        ${task.detail ? `<p class="hint">${escapeHtml(task.detail)}</p>` : ''}
      </div>
      <div class="row-actions">
        ${canReorder ? `<button class="ghost" data-priority-move="${escapeHtml(task.id)}|up" ${index === 0 ? 'disabled' : ''} type="button">Up</button><button class="ghost" data-priority-move="${escapeHtml(task.id)}|down" ${index === tasks.length - 1 ? 'disabled' : ''} type="button">Down</button>` : ''}
      </div>
    </article>
  `).join('') : '<p class="hint">No maintenance, PM, or FPC tasks due in the next 15 days.</p>';
}

function upcomingCalendarItems(visibleLocations = fpcVisibleLocations()) {
  const allowedIds = visibleLocations.map(location => location.id);
  const locationAllowed = locationId => locationId === 'all' || allowedIds.includes(locationId);
  return (calendarEvents.events || [])
    .filter(event => event.active !== false && event.date >= dateKey && locationAllowed(event.locationId || 'all'))
    .map(event => ({
      id: event.id,
      source: 'calendar',
      title: event.title,
      type: event.type || 'Calendar event',
      date: event.date,
      time: event.time || '',
      locationId: event.locationId || 'all',
      notes: event.notes || '',
      createdBy: event.createdBy || ''
    }))
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
}

function renderEventCard(event, { dashboard = false } = {}) {
  const dayCount = daysUntil(event.date);
  const when = dayCount === 0 ? 'Today' : dayCount === 1 ? 'Tomorrow' : `${prettyDate(event.date)}${event.time ? ` at ${event.time}` : ''}`;
  return `
    <article class="calendar-event ${event.source === 'fpc' ? 'fpc-event' : ''}">
      <div>
        <p class="eyebrow">${escapeHtml(event.type || 'Event')}</p>
        <h3>${escapeHtml(event.title || 'Scheduled event')}</h3>
        <p>${escapeHtml(when)} · ${escapeHtml(eventLocationLabel(event.locationId || 'all'))}</p>
        ${event.notes ? `<p class="hint">${escapeHtml(event.notes)}</p>` : ''}
      </div>
      ${!dashboard && event.source === 'calendar' && canManageCalendar() ? `
        <div class="row-actions">
          <button data-calendar-edit="${escapeHtml(event.id)}" type="button">Edit</button>
          <button class="danger" data-calendar-delete="${escapeHtml(event.id)}" type="button">Remove</button>
        </div>
      ` : `<span class="status">${dayCount <= 7 ? 'Soon' : 'Scheduled'}</span>`}
    </article>
  `;
}

function renderDashboardAlerts(visibleLocations) {
  if (!$('#dashboardAlertList')) return;
  const items = upcomingCalendarItems(visibleLocations).slice(0, 5);
  $('#dashboardAlertList').innerHTML = items.length
    ? items.map(item => renderEventCard(item, { dashboard: true })).join('')
    : '<p class="hint">No manually scheduled visits or inspection alerts yet.</p>';
}

function resetCalendarEventForm() {
  if (!$('#calendarEventId')) return;
  $('#calendarEventId').value = '';
  $('#calendarEventTitle').value = '';
  $('#calendarEventType').value = 'FPC revisit';
  $('#calendarEventDate').value = '';
  $('#calendarEventTime').value = '';
  $('#calendarEventNotes').value = '';
  $('#saveCalendarEventBtn').textContent = 'Save event';
  $('#cancelCalendarEventBtn').style.display = 'none';
}

function editCalendarEvent(id) {
  const event = (calendarEvents.events || []).find(entry => entry.id === id);
  if (!event) return toast('Calendar event was not found');
  $('#calendarEventId').value = event.id;
  $('#calendarEventTitle').value = event.title || '';
  $('#calendarEventType').value = event.type || 'Other';
  $('#calendarEventDate').value = event.date || '';
  $('#calendarEventTime').value = event.time || '';
  $('#calendarEventLocation').value = event.locationId || 'all';
  $('#calendarEventNotes').value = event.notes || '';
  $('#saveCalendarEventBtn').textContent = 'Save changes';
  $('#cancelCalendarEventBtn').style.display = '';
  $('#calendarEventFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCalendar(visibleLocations, activeUser) {
  if (!$('#calendarEventList')) return;
  const canEdit = canManageCalendar(activeUser);
  $('#calendarEventFormCard').style.display = canEdit ? '' : 'none';
  const locationOptions = [
    '<option value="all">All assigned locations</option>',
    ...visibleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#calendarEventLocation').innerHTML = locationOptions;
  if (![...$('#calendarEventLocation').options].some(option => option.value === $('#calendarEventLocation').value)) {
    $('#calendarEventLocation').value = 'all';
  }
  $('#calendarLocationFilter').innerHTML = locationOptions;
  if (calendarLocationFilter !== 'all' && !visibleLocations.some(location => location.id === calendarLocationFilter)) calendarLocationFilter = 'all';
  $('#calendarLocationFilter').value = calendarLocationFilter;

  const items = upcomingCalendarItems(visibleLocations)
    .filter(event => calendarLocationFilter === 'all' || event.locationId === 'all' || event.locationId === calendarLocationFilter);
  $('#calendarEventCount').textContent = `${items.length} upcoming`;
  $('#calendarEventList').innerHTML = items.length
    ? items.map(item => renderEventCard(item)).join('')
    : '<p class="hint">No upcoming calendar events or FPC repair due dates for this view.</p>';
  $('#cancelCalendarEventBtn').style.display = $('#calendarEventId').value ? '' : 'none';
}

function renderWorkLocationSwitchers(visibleLocations, show) {
  const options = visibleLocations.map(location => `<option value="${location.id}" ${location.id === currentLocationId ? 'selected' : ''}>${escapeHtml(location.name)}</option>`).join('');
  ['task', 'temp'].forEach(prefix => {
    const card = $(`#${prefix}LocationSwitcher`);
    const select = $(`#${prefix}LocationSelect`);
    if (!card || !select) return;
    card.style.display = show && visibleLocations.length > 1 ? '' : 'none';
    select.innerHTML = options;
    select.value = currentLocationId;
  });
}

function maintenanceLocationOptions() {
  const allOption = isFullAccess() ? '<option value="all">All maintenance locations</option>' : (usesAssignedLocations() ? '<option value="assigned">My assigned locations</option>' : '');
  return allOption + maintenance.locations.map(location => `<option value="${location['Location ID']}" ${String(location['Location ID']) === String(maintenanceLocationId) ? 'selected' : ''}>${escapeHtml(location['Location Name'])}</option>`).join('');
}

function fpcVisibleLocations() {
  return locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
}

function fpcScopedRecords() {
  const allowed = fpcVisibleLocations().map(location => location.id);
  const records = (fpc.records || []).filter(record => allowed.includes(record.locationId));
  if (fpcLocationId === 'all') return records;
  return records.filter(record => record.locationId === fpcLocationId);
}

function storeDocsVisibleLocations() {
  return locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
}

function scopedStoreDocuments() {
  const allowed = storeDocsVisibleLocations().map(location => location.id);
  const docs = (storeDocuments.documents || []).filter(doc => doc.active !== false && allowed.includes(doc.locationId));
  if (storeDocsLocationId === 'all') return docs;
  return docs.filter(doc => doc.locationId === storeDocsLocationId);
}

function resourcesVisibleLocations() {
  return locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
}

function scopedResources() {
  const actor = currentUser();
  const allowed = resourcesVisibleLocations().map(location => location.id);
  const list = (resources.resources || []).filter(resource => {
    if (resource.active === false) return false;
    const resourceLocation = resource.locationId || 'all';
    const locationAllowed = resourceLocation === 'all' || allowed.includes(resourceLocation);
    const roleAllowed = roleRank(actor.role) >= roleRank(resource.minRole || 'Employee');
    return locationAllowed && roleAllowed;
  });
  if (resourcesLocationId === 'all') return list;
  return list.filter(resource => (resource.locationId || 'all') === 'all' || resource.locationId === resourcesLocationId);
}

function smallwaresVisibleLocations() {
  return locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
}

function scopedSmallwaresRequests() {
  const allowed = smallwaresVisibleLocations().map(location => location.id);
  const requests = (smallwares.requests || []).filter(request => request.active !== false && allowed.includes(request.locationId));
  const scoped = smallwaresLocationId === 'all' ? requests : requests.filter(request => request.locationId === smallwaresLocationId);
  return scoped.filter(request => showApprovedSmallwares ? request.status === 'Approved' : request.status !== 'Approved');
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
  setAssignmentFields('wo', {});
  $('#woEquipment').innerHTML = '<option value="">No specific equipment</option>' + maintenance.equipment.map(item => `<option value="${item['Equipment ID']}">${escapeHtml(item['Equipment Name'])} · ${escapeHtml(item['Location Name'])}</option>`).join('');
  $('#eqType').innerHTML = (list.equipmentTypes || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#pmFrequency').innerHTML = (list.pmFrequencies || []).map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#pmEquipment').innerHTML = '<option value="">No specific equipment</option>' + maintenance.equipment.map(item => `<option value="${item['Equipment ID']}">${escapeHtml(item['Equipment Name'])} · ${escapeHtml(item['Location Name'])}</option>`).join('');

  setAssignmentFields('pm', {});

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

  $('#pmCount').textContent = `${overduePm.length} due · ${maintenance.pmSchedule.length} total`;
  const pmRows = [...maintenance.pmSchedule].sort((a, b) => String(a.Status || '').localeCompare(String(b.Status || '')) || String(a['Next Due'] || '').localeCompare(String(b['Next Due'] || '')));
  $('#pmList').innerHTML = pmRows.length ? pmRows.map(pm => `
    <article class="card maintenance-row">
      <div>
        <b>${escapeHtml(pm.Task)}</b>
        <p>${escapeHtml(pm['Location Name'])} · ${escapeHtml(pm['Equipment Name'])} · ${escapeHtml(pm.Frequency || '')}${pm['Next Due'] ? ` · Due ${escapeHtml(pm['Next Due'])}` : ''}</p>
        <p>${escapeHtml(pm['Instructions / Checklist'] || '')}</p>
        <p>${pm['Photo Link'] ? `<a href="${escapeHtml(fullPhotoUrl(pm['Photo Link']))}" target="_blank">Photo</a>` : ''} ${pm['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(pm['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(pm.Status || 'Due')}</span>
        <button data-edit-pm="${escapeHtml(pm['PM ID'])}">Edit</button>
        ${pm.Status === 'Completed' ? '' : `<button class="ghost" data-complete-pm="${escapeHtml(pm['PM ID'])}">Complete</button>`}
      </div>
    </article>
  `).join('') : '<div class="empty">No PM tasks loaded.</div>';

  $('#equipmentCount').textContent = `${maintenance.equipment.length} items`;
  $('#equipmentList').innerHTML = maintenance.equipment.slice(0, 18).map(item => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(item['Equipment Name'])}</b>
        <p>${escapeHtml(item['Location Name'])} · ${escapeHtml(item['Equipment Type'] || '')} · ${escapeHtml(item.Manufacturer || '')}</p>
        <p>${item['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(item['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(item['Equipment ID'])}</span>
        <button data-edit-equipment="${escapeHtml(item['Equipment ID'])}">Edit</button>
      </div>
    </article>
  `).join('') || '<div class="empty">No equipment loaded.</div>';

  $('#vendorCount').textContent = `${maintenance.vendors.length} vendors`;
  $('#vendorList').innerHTML = maintenance.vendors.map(vendor => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(vendor['Vendor Name'])}</b>
        <p>${escapeHtml(vendor.Category || '')} · ${escapeHtml(vendor['Service Area'] || '')}</p>
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(vendor.Preferred || '')}</span>
        <button data-edit-vendor="${escapeHtml(vendor['Vendor ID'])}">Edit</button>
      </div>
    </article>
  `).join('');
}

function renderFpc() {
  if (!$('#fpcLocation')) return;
  const visibleLocations = fpcVisibleLocations();
  if (fpcLocationId !== 'all' && !visibleLocations.some(location => location.id === fpcLocationId)) fpcLocationId = 'all';
  if (visibleLocations.length === 1) fpcLocationId = visibleLocations[0].id;
  $('#fpcLocation').innerHTML = [
    ...(visibleLocations.length > 1 ? ['<option value="all">All assigned locations</option>'] : []),
    ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#fpcLocation').value = fpcLocationId;
  fpcLocationId = $('#fpcLocation').value;

  const records = fpcScopedRecords();
  const openItems = records.flatMap(record => record.items || []).filter(item => item.status !== 'Completed');
  $('#fpcOpenCount').textContent = `${openItems.length} open`;
  $('#fpcRecordSelect').innerHTML = records.length
    ? records.map(record => `<option value="${record.id}">${escapeHtml(record.locationName || locationName(record.locationId))} · ${escapeHtml(record.inspectionDate || '')}</option>`).join('')
    : '<option value="">Create from selected location</option>';

  setAssignmentFields('fpc', {});
  $('#fpcList').innerHTML = records.length ? records.map(record => `
    <details class="card fpc-record">
      <summary class="fpc-record-head">
        <div>
          <h3>${escapeHtml(record.locationName || locationName(record.locationId))} · ${escapeHtml(record.inspectionDate || 'FPC')}</h3>
          <p class="hint">Added by ${escapeHtml(record.createdBy || 'Manager')}${record.createdAt ? ` · ${new Date(record.createdAt).toLocaleDateString()}` : ''}</p>
          ${record.inspectionUrl ? `<p><a href="${escapeHtml(record.inspectionUrl)}" target="_blank" rel="noopener">${escapeHtml(record.inspectionName || 'Open inspection')}</a></p>` : '<p class="hint">No inspection file attached yet.</p>'}
        </div>
        <span class="status">${(record.items || []).filter(item => item.status !== 'Completed').length} open</span>
      </summary>
      <div class="fpc-items">
        ${(record.items || []).length ? record.items.map(item => `
          <div class="fpc-item ${item.status === 'Completed' ? 'complete' : ''}">
            <div class="fpc-item-head">
              <div>
                <b>${escapeHtml(item.description)}</b>
                <p class="hint">${escapeHtml(item.priority || 'Medium')} priority${item.assignedTo ? ` · Assigned to ${escapeHtml(item.assignedTo)}` : ''}${item.targetDate ? ` · Target ${escapeHtml(item.targetDate)}` : ''}</p>
                ${item.photoUrl ? `
                  <a class="fpc-photo-link" href="${escapeHtml(item.photoUrl)}" target="_blank" rel="noopener">
                    ${isImageUrl(item.photoUrl) ? `<img src="${escapeHtml(item.photoUrl)}" alt="FPC item photo">` : '<span class="link-icon">🔗</span>'}
                    <span>${escapeHtml(item.photoName || 'View item photo')}</span>
                  </a>
                ` : ''}
              </div>
              <div class="row-actions">
                <select data-fpc-status="${escapeHtml(record.id)}|${escapeHtml(item.id)}">
                  ${['Open', 'In Progress', 'Completed'].map(status => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                </select>
                <button data-edit-fpc="${escapeHtml(record.id)}|${escapeHtml(item.id)}" type="button">Edit</button>
              </div>
            </div>
            <div class="fpc-comments">
              ${(item.comments || []).map(comment => `<p><b>${escapeHtml(comment.createdBy || 'Manager')}:</b> ${escapeHtml(comment.text)} <span class="hint">${comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}</span></p>`).join('')}
            </div>
            <div class="fpc-comment-form">
              <input data-fpc-comment-input="${escapeHtml(record.id)}|${escapeHtml(item.id)}" placeholder="Add a manager comment">
              <button data-fpc-comment="${escapeHtml(record.id)}|${escapeHtml(item.id)}" type="button">Comment</button>
            </div>
          </div>
        `).join('') : '<p class="hint">No FPC repair items yet.</p>'}
      </div>
    </details>
  `).join('') : '<div class="empty">No FPC inspections for this view yet.</div>';
}

function renderStoreDocuments() {
  if (!$('#storeDocsLocation')) return;
  const visibleLocations = storeDocsVisibleLocations();
  if (storeDocsLocationId !== 'all' && !visibleLocations.some(location => location.id === storeDocsLocationId)) storeDocsLocationId = 'all';
  if (visibleLocations.length === 1) storeDocsLocationId = visibleLocations[0].id;
  $('#storeDocsLocation').innerHTML = [
    ...(visibleLocations.length > 1 ? ['<option value="all">All assigned locations</option>'] : []),
    ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#storeDocsLocation').value = storeDocsLocationId;
  storeDocsLocationId = $('#storeDocsLocation').value;

  $('#storeDocsUploadCard').style.display = canAddStoreDocuments() ? '' : 'none';
  const docs = scopedStoreDocuments();
  $('#storeDocsCount').textContent = `${docs.length} document${docs.length === 1 ? '' : 's'}`;
  $('#storeDocsList').innerHTML = docs.length ? docs.map(doc => `
    <article class="card maintenance-row compact store-doc-row">
      <div>
        <b>${escapeHtml(doc.title)}</b>
        <p>${escapeHtml(doc.locationName || locationName(doc.locationId))} · ${escapeHtml(doc.category || 'General')} · Added by ${escapeHtml(doc.createdBy || 'Area Manager')}${doc.createdAt ? ` · ${new Date(doc.createdAt).toLocaleDateString()}` : ''}</p>
        ${doc.notes ? `<p>${escapeHtml(doc.notes)}</p>` : ''}
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(doc.category || 'General')}</span>
        <a class="button-link ghost" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">Open</a>
      </div>
    </article>
  `).join('') : '<div class="empty">No store documents for this view yet.</div>';
}

function renderResources() {
  if (!$('#resourcesLocation')) return;
  const visibleLocations = resourcesVisibleLocations();
  if (resourcesLocationId !== 'all' && !visibleLocations.some(location => location.id === resourcesLocationId)) resourcesLocationId = 'all';
  if (visibleLocations.length === 1) resourcesLocationId = visibleLocations[0].id;
  $('#resourcesLocation').innerHTML = [
    ...(visibleLocations.length > 1 ? ['<option value="all">All assigned locations</option>'] : []),
    ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#resourcesLocation').value = resourcesLocationId;
  resourcesLocationId = $('#resourcesLocation').value;

  if ($('#resourceLocation')) {
    const selectedAdminLocation = $('#resourceLocation').value || 'all';
    $('#resourceLocation').innerHTML = [
      '<option value="all">All assigned locations</option>',
      ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
    ].join('');
    $('#resourceLocation').value = [...$('#resourceLocation').options].some(option => option.value === selectedAdminLocation) ? selectedAdminLocation : 'all';
  }
  $('#resourcesAdminCard').style.display = canManageResources() ? '' : 'none';
  $('#cancelResourceEditBtn').style.display = $('#resourceId').value ? '' : 'none';

  const list = scopedResources();
  $('#resourcesCount').textContent = `${list.length} link${list.length === 1 ? '' : 's'}`;
  $('#resourcesList').innerHTML = list.length ? list.map(resource => `
    <article class="card maintenance-row compact resource-row">
      <div>
        <b>${escapeHtml(resource.title)}</b>
        <p>${escapeHtml(resource.category || 'General')} · ${resource.locationId === 'all' || !resource.locationId ? 'All assigned locations' : escapeHtml(resource.locationName || locationName(resource.locationId))} · ${escapeHtml(resource.minRole || 'Employee')}+</p>
        ${resource.notes ? `<p>${escapeHtml(resource.notes)}</p>` : ''}
      </div>
      <div class="row-actions">
        <a class="button-link ghost" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener">Open</a>
        ${canManageResources() ? `<button data-resource-edit="${escapeHtml(resource.id)}" type="button">Edit</button><button class="danger" data-resource-delete="${escapeHtml(resource.id)}" type="button">Remove</button>` : ''}
      </div>
    </article>
  `).join('') : '<div class="empty">No resources for this view yet.</div>';
}

function renderSmallwares() {
  if (!$('#smallwaresLocation')) return;
  const visibleLocations = smallwaresVisibleLocations();
  if (smallwaresLocationId !== 'all' && !visibleLocations.some(location => location.id === smallwaresLocationId)) smallwaresLocationId = visibleLocations[0]?.id || currentLocationId;
  if (visibleLocations.length === 1) smallwaresLocationId = visibleLocations[0].id;
  $('#smallwaresLocation').innerHTML = [
    ...(visibleLocations.length > 1 ? ['<option value="all">All assigned locations</option>'] : []),
    ...visibleLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#smallwaresLocation').value = smallwaresLocationId;
  smallwaresLocationId = $('#smallwaresLocation').value;

  const openCount = (smallwares.requests || []).filter(request => request.active !== false && request.status !== 'Approved' && smallwaresVisibleLocations().some(location => location.id === request.locationId)).length;
  $('#smallwaresCount').textContent = showApprovedSmallwares ? 'Approved view' : `${openCount} open`;
  $('#showApprovedSmallwaresBtn').textContent = showApprovedSmallwares ? 'Back to open requests' : 'Approved requests';
  const requests = scopedSmallwaresRequests();
  $('#smallwaresList').innerHTML = requests.length ? requests.map(request => `
    <article class="card smallwares-row ${request.status === 'Approved' ? 'approved' : ''}">
      <div>
        <p class="eyebrow">${escapeHtml(locationName(request.locationId))}</p>
        <h3>${escapeHtml(request.item)}</h3>
        <p class="hint">Qty ${escapeHtml(request.quantity || 1)} · ${escapeHtml(request.status || 'Requested')} · Requested by ${escapeHtml(request.requestedBy || 'Manager')}${request.createdAt ? ` · ${new Date(request.createdAt).toLocaleDateString()}` : ''}</p>
        ${request.notes ? `<p>${escapeHtml(request.notes)}</p>` : ''}
        ${request.approvedBy ? `<p class="hint">Approved by ${escapeHtml(request.approvedBy)}${request.approvedAt ? ` · ${new Date(request.approvedAt).toLocaleDateString()}` : ''}</p>` : ''}
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(request.status || 'Requested')}</span>
        ${canApproveSmallwares() && request.status !== 'Approved' ? `<button data-smallwares-approve="${escapeHtml(request.id)}" type="button">Approve</button>` : ''}
        ${canApproveSmallwares() && request.status !== 'Declined' && request.status !== 'Approved' ? `<button class="danger" data-smallwares-decline="${escapeHtml(request.id)}" type="button">Decline</button>` : ''}
      </div>
    </article>
  `).join('') : `<div class="empty">${showApprovedSmallwares ? 'No approved smallwares requests yet.' : 'No open smallwares requests for this view.'}</div>`;
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
  setAssignmentFields('editWo', {
    assignmentType: order.assignmentType,
    assigneeId: order.assigneeId,
    vendorId: order.vendorId || order['Vendor ID'],
    assignmentNotify: order.assignmentNotify
  });
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

function openPmDialog(pmId) {
  const pm = maintenance.pmSchedule.find(row => row['PM ID'] === pmId);
  if (!pm) return;
  const list = maintenance.lists || {};
  $('#editPmTitle').textContent = `${pm['PM ID']} · ${pm.Task || 'PM task'}`;
  $('#editPmId').value = pm['PM ID'];
  $('#editPmStatus').innerHTML = ['Due', 'Overdue', 'In Progress', 'Completed'].map(value => `<option ${pm.Status === value ? 'selected' : ''}>${value}</option>`).join('');
  $('#editPmTask').value = pm.Task || '';
  $('#editPmFrequency').innerHTML = (list.pmFrequencies || ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual']).map(value => `<option ${pm.Frequency === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  $('#editPmNextDue').value = toDateInput(pm['Next Due']);
  setAssignmentFields('editPm', pm);
  $('#editPmInstructions').value = pm['Instructions / Checklist'] || '';
  $('#editPmNotes').value = pm.Notes || '';
  $('#pmDialog').showModal();
}

function openEquipmentDialog(equipmentId) {
  const item = maintenance.equipment.find(row => row['Equipment ID'] === equipmentId);
  if (!item) return;
  const list = maintenance.lists || {};
  $('#editEquipmentTitle').textContent = `${item['Equipment ID']} · ${item['Equipment Name'] || 'Equipment'}`;
  $('#editEquipmentId').value = item['Equipment ID'];
  $('#editEquipmentName').value = item['Equipment Name'] || '';
  $('#editEquipmentType').innerHTML = (list.equipmentTypes || []).map(value => `<option ${item['Equipment Type'] === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  $('#editEquipmentManufacturer').value = item.Manufacturer || '';
  $('#editEquipmentModel').value = item.Model || '';
  $('#editEquipmentSerial').value = item['Serial Number'] || '';
  $('#editEquipmentNotes').value = item.Notes || '';
  $('#equipmentDialog').showModal();
}

function openVendorDialog(vendorId = '') {
  const vendor = maintenance.vendors.find(row => row['Vendor ID'] === vendorId) || {};
  $('#editVendorTitle').textContent = vendorId ? `Edit ${vendor['Vendor Name'] || 'vendor'}` : 'Add vendor';
  $('#editVendorId').value = vendor['Vendor ID'] || '';
  $('#editVendorName').value = vendor['Vendor Name'] || '';
  $('#editVendorCategory').value = vendor.Category || '';
  $('#editVendorServiceArea').value = vendor['Service Area'] || '';
  $('#editVendorContact').value = vendor['Contact Name'] || '';
  $('#editVendorPhone').value = vendor.Phone || '';
  $('#editVendorEmail').value = vendor.Email || '';
  $('#editVendorPreferred').value = vendor.Preferred || 'Yes';
  $('#editVendorNotes').value = vendor.Notes || '';
  $('#vendorDialog').showModal();
}

function applyRoleAccess(user) {
  const showHub = canUseHub(user);
  const showHistory = canUseHistory(user);
  const showManage = canUseManage(user);
  const showLocations = canEditLocations(user);
  const tech = isMaintenanceTech(user);
  document.querySelectorAll('[data-view="homeView"]').forEach(button => button.style.display = showHub ? '' : 'none');
  document.querySelectorAll('[data-view="maintenanceView"]').forEach(button => button.style.display = showHub ? '' : 'none');
  document.querySelectorAll('[data-view="fpcView"]').forEach(button => button.style.display = showHub ? '' : 'none');
  document.querySelectorAll('[data-view="calendarView"]').forEach(button => button.style.display = showHub && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="storeDocsView"]').forEach(button => button.style.display = showHub && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="resourcesView"]').forEach(button => button.style.display = tech ? 'none' : '' );
  document.querySelectorAll('[data-view="smallwaresView"]').forEach(button => button.style.display = showHub && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="taskListsView"], [data-view="tempLogsView"], [data-view="todayView"]').forEach(button => button.style.display = canUseDailyOps(user) ? '' : 'none');
  document.querySelectorAll('[data-view="historyView"]').forEach(button => button.style.display = showHistory && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="manageView"]').forEach(button => button.style.display = showManage && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="locationsView"]').forEach(button => button.style.display = showLocations ? '' : 'none');
  $('#changePasswordBtn').style.display = window.dailyOpsAuth?.enabled ? '' : 'none';
  $('#signOutBtn').style.display = window.dailyOpsAuth?.enabled ? '' : 'none';
  $('#sideUserName').textContent = user.name;
  $('#sideUserRole').textContent = user.role;
  if (tech && ($('#taskListsView').classList.contains('active') || $('#tempLogsView').classList.contains('active') || $('#todayView').classList.contains('active') || $('#calendarView').classList.contains('active') || $('#storeDocsView').classList.contains('active') || $('#smallwaresView').classList.contains('active') || $('#historyView').classList.contains('active') || $('#manageView').classList.contains('active'))) switchView('homeView');
  if (!showHub && ($('#homeView').classList.contains('active') || $('#maintenanceView').classList.contains('active') || $('#fpcView').classList.contains('active') || $('#calendarView').classList.contains('active') || $('#storeDocsView').classList.contains('active') || $('#smallwaresView').classList.contains('active'))) switchView('todayView');
  if (!showHistory && $('#historyView').classList.contains('active')) switchView('todayView');
  if (!showManage && $('#manageView').classList.contains('active')) switchView('todayView');
  if (!showLocations && $('#locationsView').classList.contains('active')) switchView('todayView');
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

function renderTaskTemplates() {
  if (!$('#templateSection')) return;
  const actor = currentUser();
  const editableLocations = locations.filter(location => isFullAccess(actor) || userLocationIds(actor).includes(location.id));
  if (templateScope !== 'all' && !editableLocations.some(location => location.id === templateScope)) templateScope = 'all';
  $('#templateScope').innerHTML = [
    '<option value="all">Company master checklist</option>',
    ...editableLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)} store-only copy</option>`)
  ].join('');
  $('#templateScope').value = templateScope;
  const scopedTemplates = scopedTaskTemplates();
  const allSections = allTaskSections();
  const sections = [...new Set([...taskSections, ...scopedTemplates.map(task => task.section).filter(Boolean)])];
  const selectedScheduleSection = $('#scheduleSection')?.value || allSections[0] || 'Opening';
  const selectedScheduleLocation = $('#scheduleLocation')?.value || 'default';
  $('#templateSection').innerHTML = allSections.map(section => `<option>${escapeHtml(section)}</option>`).join('');
  $('#scheduleSection').innerHTML = allSections.map(section => `<option value="${escapeHtml(section)}" ${section === selectedScheduleSection ? 'selected' : ''}>${escapeHtml(section)}</option>`).join('');
  const scheduleLocations = locations.filter(location => isFullAccess(actor) || userLocationIds(actor).includes(location.id));
  $('#copyChecklistLocation').innerHTML = scheduleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  $('#scheduleLocation').innerHTML = [
    `<option value="default" ${selectedScheduleLocation === 'default' ? 'selected' : ''}>All stores default</option>`,
    ...scheduleLocations.map(location => `<option value="${escapeHtml(location.id)}" ${location.id === selectedScheduleLocation ? 'selected' : ''}>${escapeHtml(location.name)} override</option>`)
  ].join('');
  const scheduleDays = sectionScheduleDays($('#scheduleSection').value || selectedScheduleSection, $('#scheduleLocation').value || selectedScheduleLocation);
  $('#scheduleDays').innerHTML = [
    `<label class="location-check"><input type="checkbox" value="daily" ${scheduleDays.includes('daily') ? 'checked' : ''}> Every day</label>`,
    ...weekdayOptions.map(day => `<label class="location-check"><input type="checkbox" value="${escapeHtml(day)}" ${scheduleDays.includes(day) ? 'checked' : ''}> ${escapeHtml(day)}</label>`)
  ].join('');
  $('#templateTaskList').innerHTML = sections.map(section => {
    const tasks = scopedTemplates.filter(task => task.section === section);
    const defaultSchedule = scheduleLabel(sectionScheduleDays(section, 'default'));
    const storeOverride = templateScope !== 'all';
    return `
      <details class="template-section">
        <summary class="template-section-head">
          <span>
            <b>${escapeHtml(section)}</b>
            <small>${tasks.length} item${tasks.length === 1 ? '' : 's'} • ${escapeHtml(defaultSchedule)}</small>
          </span>
          <button class="danger" data-section-delete="${escapeHtml(section)}" data-section-location="${escapeHtml(templateScope)}" type="button">Delete checklist</button>
        </summary>
        <div class="template-section-body">
          <p class="hint">${storeOverride ? `This is a store-only checklist for ${escapeHtml(locationName(templateScope))}.` : 'This is the company master checklist.'} Default schedule: ${escapeHtml(defaultSchedule)}</p>
          ${tasks.length ? tasks.map(task => {
            const id = taskTemplateId(task);
            const editing = editingTemplateId === id;
            return editing ? `
              <div class="template-row template-edit-row">
                <label>Task description
                  <input data-template-edit-name="${escapeHtml(id)}" value="${escapeHtml(task.name)}">
                </label>
                <label>Main set
                  <select data-template-edit-category="${escapeHtml(id)}">
                    ${taskCategories.map(category => `<option ${category === (task.category || taskCategory(task)) ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
                  </select>
                </label>
                <label>Prep list
                  <select data-template-edit-prep="${escapeHtml(id)}">
                    <option value="" ${task.prepArea ? '' : 'selected'}>Not prep</option>
                    ${prepAreas.map(area => `<option value="${escapeHtml(area)}" ${area === task.prepArea ? 'selected' : ''}>${escapeHtml(area)} prep</option>`).join('')}
                  </select>
                </label>
                <label class="check"><input type="checkbox" data-template-edit-photo="${escapeHtml(id)}" ${task.photo ? 'checked' : ''}> Require a photo</label>
                <div class="row-actions">
                  <button data-template-save="${escapeHtml(id)}" type="button">Save</button>
                  <button class="ghost" data-template-cancel="${escapeHtml(id)}" type="button">Cancel</button>
                </div>
              </div>
            ` : `
          <div class="template-row">
            <div>
              <b>${escapeHtml(task.name)}</b>
              <p class="hint">${escapeHtml(task.category || taskCategory(task))}${task.prepArea ? ` • ${escapeHtml(task.prepArea)} prep quantity item` : ''} • ${task.photo ? 'Photo required' : 'No photo required'}</p>
            </div>
            <div class="row-actions">
              <button class="ghost" data-template-edit="${escapeHtml(id)}" type="button">Edit</button>
              <button class="danger" data-template-delete="${escapeHtml(id)}" type="button">Remove</button>
            </div>
          </div>
            `;
          }).join('') : '<p class="hint">No permanent tasks in this checklist yet.</p>'}
        </div>
      </details>
    `;
  }).join('');
}

function renderNotices() {
  if (!$('#noticeBadge')) return;
  const unreadCount = notices.filter(notice => notice.unread).length;
  $('#noticeBadge').textContent = unreadCount;
  $('#noticeBadge').style.display = unreadCount ? 'inline-flex' : 'none';
  $('#noticesBtn').classList.toggle('has-unread', unreadCount > 0);
  if (!$('#noticeList')) return;
  $('#noticeList').innerHTML = notices.length ? notices.map(notice => `
    <article class="card notice-card ${notice.unread ? 'unread' : ''}">
      <div class="notice-head">
        <div>
          <h3>${escapeHtml(notice.title)}</h3>
          ${notice.targetRoles?.length ? `<p class="hint">Visible to: ${notice.targetRoles.map(escapeHtml).join(', ')}</p>` : ''}
          <p class="hint">${escapeHtml(notice.createdBy || 'Manager')} · ${notice.createdAt ? new Date(notice.createdAt).toLocaleString() : ''}</p>
        </div>
        ${notice.unread ? '<span class="status">New</span>' : ''}
      </div>
      <p>${escapeHtml(notice.message)}</p>
      ${notice.attachmentUrl ? `<p><a href="${escapeHtml(notice.attachmentUrl)}" target="_blank" rel="noopener">${escapeHtml(notice.attachmentName || 'Open attachment')}</a></p>` : ''}
      ${notice.unread ? `<button data-notice-read="${escapeHtml(notice.id)}">Mark as read</button>` : ''}
    </article>
  `).join('') : '<div class="empty">No notices yet.</div>';
}

function alertTargetOptions(type = $('#alertRuleType')?.value || 'task') {
  if (type === 'temperature') {
    return temperatureListNames().flatMap(list =>
      tempSessions.map(session => ({ value: `${list}|${session}`, label: `${list} temps · ${session}` }))
    );
  }
  return allTaskSections().map(section => ({ value: section, label: section }));
}

function resetAlertRuleForm() {
  $('#alertRuleId').value = '';
  $('#alertRuleName').value = '';
  $('#alertRuleType').value = 'task';
  $('#alertRuleTime').value = '13:00';
  $('#alertRuleLocation').value = 'all';
  $('#alertChannelEmail').checked = true;
  $('#alertChannelSms').checked = false;
  $('#alertRuleActive').checked = true;
  $('#saveAlertRuleBtn').textContent = 'Save alert rule';
  renderAlertRules();
}

function editAlertRule(id) {
  const rule = (alertSettings.rules || []).find(entry => entry.id === id);
  if (!rule) return toast('Alert rule was not found');
  $('#alertRuleId').value = rule.id;
  $('#alertRuleName').value = rule.name || '';
  $('#alertRuleType').value = rule.type || 'task';
  renderAlertRules();
  $('#alertRuleTarget').value = rule.target || '';
  $('#alertRuleTime').value = rule.dueTime || '13:00';
  $('#alertRuleLocation').value = rule.locationId || 'all';
  document.querySelectorAll('#alertRuleRoles input').forEach(input => { input.checked = (rule.roles || []).includes(input.value); });
  $('#alertChannelEmail').checked = (rule.channels || []).includes('email');
  $('#alertChannelSms').checked = (rule.channels || []).includes('sms');
  $('#alertRuleActive').checked = rule.active !== false;
  $('#saveAlertRuleBtn').textContent = 'Save changes';
  $('#alertRulesCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAlertRules() {
  if (!$('#alertRuleTarget')) return;
  const canEdit = canManageAlerts();
  $('#alertRulesCard').style.display = canEdit ? '' : 'none';
  if (!canEdit) return;
  const selectedTarget = $('#alertRuleTarget').value;
  const targets = alertTargetOptions();
  $('#alertRuleTarget').innerHTML = targets.map(target => `<option value="${escapeHtml(target.value)}">${escapeHtml(target.label)}</option>`).join('');
  $('#alertRuleTarget').value = targets.some(target => target.value === selectedTarget) ? selectedTarget : (targets[0]?.value || '');
  const visibleLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  const selectedLocation = $('#alertRuleLocation').value || 'all';
  $('#alertRuleLocation').innerHTML = [
    '<option value="all">All assigned locations</option>',
    ...visibleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`)
  ].join('');
  $('#alertRuleLocation').value = [...$('#alertRuleLocation').options].some(option => option.value === selectedLocation) ? selectedLocation : 'all';
  const selectedRoles = [...document.querySelectorAll('#alertRuleRoles input:checked')].map(input => input.value);
  const roles = ['Manager', 'Area Manager', 'Director of Operations', 'Owner'];
  $('#alertRuleRoles').innerHTML = roles.map(role => `<label class="location-check"><input type="checkbox" value="${escapeHtml(role)}" ${selectedRoles.includes(role) || (!selectedRoles.length && role !== 'Owner') ? 'checked' : ''}> ${escapeHtml(role)}</label>`).join('');
  $('#cancelAlertRuleBtn').style.display = $('#alertRuleId').value ? '' : 'none';
  const rules = (alertSettings.rules || []).filter(rule => rule.active !== false);
  $('#alertRuleList').innerHTML = rules.length ? rules.map(rule => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(rule.name)}</b>
        <p>${escapeHtml(rule.type === 'temperature' ? 'Temperature log' : 'Task list')} · ${escapeHtml(rule.targetLabel || rule.target)} · Due ${escapeHtml(rule.dueTime || '')} · ${rule.locationId === 'all' ? 'All assigned locations' : escapeHtml(locationName(rule.locationId))}</p>
        <p class="hint">Notify: ${(rule.roles || []).map(escapeHtml).join(', ')} · ${(rule.channels || []).join(' + ')}</p>
      </div>
      <div class="row-actions">
        <button data-alert-edit="${escapeHtml(rule.id)}" type="button">Edit</button>
        <button class="danger" data-alert-delete="${escapeHtml(rule.id)}" type="button">Remove</button>
      </div>
    </article>
  `).join('') : '<p class="hint">No alert rules yet.</p>';
}

function notificationStatus(log = {}) {
  if (log.delivered) return 'Sent';
  if (log.skipped) return 'Skipped';
  return 'Failed';
}

function renderNotificationLogs() {
  if (!$('#notificationLogsCard')) return;
  const canView = canUseManage();
  $('#notificationLogsCard').style.display = canView ? '' : 'none';
  if (!canView) return;
  const logs = (notificationLogs || []).slice(0, 100);
  $('#notificationLogList').innerHTML = logs.length ? logs.map(log => `
    <article class="card maintenance-row compact">
      <div>
        <b>${escapeHtml(notificationStatus(log))} · ${escapeHtml(log.channel || 'notification')} · ${escapeHtml(log.type || 'Alert')}</b>
        <p>${escapeHtml(log.title || log.subject || log.detail || 'Notification')} ${log.locationName ? `· ${escapeHtml(log.locationName)}` : ''}</p>
        <p class="hint">${log.createdAt ? new Date(log.createdAt).toLocaleString() : ''} · To: ${escapeHtml(log.recipientName || '')}${log.to ? ` (${escapeHtml(log.to)})` : ''}</p>
        ${log.reason ? `<p class="hint">Reason: ${escapeHtml(log.reason)}</p>` : ''}
      </div>
      <span class="pill">${escapeHtml(notificationStatus(log))}</span>
    </article>
  `).join('') : '<p class="hint">No notification attempts logged yet.</p>';
}

function renderUsers() {
  const actor = currentUser();
  const visibleLocations = locations.filter(location => isFullAccess(actor) || userLocationIds(actor).includes(location.id));
  const roles = allowedAssignableRoles(actor);
  $('#newUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}">${location.name}</option>`).join('');
  $('#newUserRole').innerHTML = roles.map(role => `<option>${role}</option>`).join('');
  renderNewUserLocationChecks();
  $('#addUserCard').style.display = roles.length ? '' : 'none';
  $('#importUsersCard').style.display = roles.length ? '' : 'none';
  $('#usersCard').style.display = canUseManage(actor) ? '' : 'none';
  $('#userList').innerHTML = manageableUsers(actor).map(user => `
    <article class="card user-row compact-user-row">
      <span class="avatar">${initials(user.name)}</span>
      <div>
        <b>${escapeHtml(user.name)}</b>
        <p>${escapeHtml(user.role)} · ${userLocationIds(user).map(locationName).join(', ')}</p>
      </div>
      <div class="row-actions">
        <button data-user-edit="${user.id}">Edit</button>
        ${user.id === actor.id ? '' : `<button class="danger" data-user-deactivate="${user.id}">Deactivate</button>`}
      </div>
    </article>
  `).join('');
}

function roleUsesMultipleLocations(role) {
  return ['Area Manager', maintenanceRole, 'Director of Operations', 'Owner'].includes(role);
}

function roleRank(role = 'Employee') {
  return {
    Employee: 0,
    Manager: 1,
    [maintenanceRole]: 2,
    'Area Manager': 3,
    'Director of Operations': 4,
    Owner: 5
  }[role] ?? 0;
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

function fileToDataUrl(file) {
  const maxInlineUploadBytes = 4 * 1024 * 1024;
  if (file.size > maxInlineUploadBytes) {
    throw new Error(`"${file.name}" is too large for this uploader. Please use a file under 4 MB for now, or compress/split the PDF.`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFileDirectToSupabase(file, folder = 'store-document') {
  if (window.dailyOpsAuthReady) await window.dailyOpsAuthReady;
  const client = window.dailyOpsAuth?.client;
  const bucket = window.dailyOpsAuth?.storageBucket || 'dailyops-uploads';
  if (!client) throw new Error('Direct upload is only available after signing in.');
  const safeFileName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '') || 'document';
  const path = `${folder}/${Date.now()}-${safeFileName}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false
  });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function savePermanentTask() {
  const customSection = $('#templateCustomSection').value.trim();
  const section = customSection || $('#templateSection').value || 'Opening';
  const prepArea = $('#templatePrepArea')?.value || '';
  const category = prepArea ? 'Manager' : ($('#templateCategory')?.value || 'Manager');
  const name = $('#templateTaskName').value.trim();
  if (!name) return toast('Enter a task description');
  try {
    taskTemplates = (await api('/api/task-template', {
      method: 'POST',
      body: JSON.stringify({
        name,
        section,
        locationId: templateScope,
        category,
        prepArea,
        managerPrep: Boolean(prepArea),
        photo: $('#templatePhotoRequired').checked
      })
    })).taskTemplates;
    $('#templateCustomSection').value = '';
    $('#templateTaskName').value = '';
    if ($('#templatePrepArea')) $('#templatePrepArea').value = '';
    $('#templatePhotoRequired').checked = false;
    render();
    toast('Permanent task added');
  } catch (error) {
    toast(`Task did not save: ${error.message}`);
  }
}

async function importAreaChecklists() {
  if (!confirm('Load the DQ area and weekly cleaning checklists into permanent checklist items? Existing matching items will be updated, not duplicated.')) return;
  try {
    taskTemplates = (await api('/api/task-templates/import-area-checklists', {
      method: 'POST',
      body: '{}'
    })).taskTemplates;
    render();
    toast('Area checklists loaded');
  } catch (error) {
    toast(`Area checklists did not load: ${error.message}`);
  }
}

async function deletePermanentTask(id) {
  if (!confirm('Remove this task from future checklists? Existing daily records will not change.')) return;
  try {
    taskTemplates = (await api('/api/task-template/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    })).taskTemplates;
    render();
    toast('Permanent task removed');
  } catch (error) {
    toast(`Task did not remove: ${error.message}`);
  }
}

async function saveTemplateEdit(id) {
  const task = taskTemplates.find(entry => taskTemplateId(entry) === id);
  if (!task) return toast('Checklist item was not found');
  const name = document.querySelector(`[data-template-edit-name="${CSS.escape(id)}"]`)?.value.trim();
  const prepArea = document.querySelector(`[data-template-edit-prep="${CSS.escape(id)}"]`)?.value || '';
  const category = prepArea ? 'Manager' : (document.querySelector(`[data-template-edit-category="${CSS.escape(id)}"]`)?.value || task.category || taskCategory(task));
  const photo = document.querySelector(`[data-template-edit-photo="${CSS.escape(id)}"]`)?.checked || false;
  if (!name) return toast('Enter a task description');
  try {
    taskTemplates = (await api('/api/task-template', {
      method: 'POST',
      body: JSON.stringify({
        ...task,
        id: taskTemplateId(task),
        name,
        photo,
        category,
        prepArea,
        managerPrep: Boolean(prepArea),
        section: task.section || 'Opening',
        locationId: templateLocationId(task),
        scheduleDays: task.scheduleDays || ['daily'],
        locationSchedules: task.locationSchedules || {}
      })
    })).taskTemplates;
    editingTemplateId = null;
    render();
    toast('Checklist item updated');
  } catch (error) {
    toast(`Checklist item did not save: ${error.message}`);
  }
}

async function deleteChecklistSection(section, locationId = templateScope) {
  const scopeLabel = locationId === 'all' ? 'company master' : `${locationName(locationId)} store-only`;
  if (!confirm(`Delete the "${section}" checklist from the ${scopeLabel} checklists? Existing completed daily records will not change.`)) return;
  try {
    taskTemplates = (await api('/api/task-template/delete-section', {
      method: 'POST',
      body: JSON.stringify({ section, locationId })
    })).taskTemplates;
    if (selectedTaskSection === section) selectedTaskSection = todaysTaskSections()[0] || 'Opening';
    render();
    toast('Checklist deleted');
  } catch (error) {
    toast(`Checklist did not delete: ${error.message}`);
  }
}

async function copyChecklistToLocation() {
  const section = $('#templateSection').value;
  const locationId = $('#copyChecklistLocation').value;
  if (!section || !locationId) return toast('Choose a checklist and location');
  try {
    taskTemplates = (await api('/api/task-template/copy-section', {
      method: 'POST',
      body: JSON.stringify({ section, locationId })
    })).taskTemplates;
    templateScope = locationId;
    localStorage.setItem('dailyops-template-scope', templateScope);
    render();
    toast(`Checklist copied to ${locationName(locationId)}`);
  } catch (error) {
    toast(`Checklist did not copy: ${error.message}`);
  }
}

async function saveChecklistSchedule() {
  const section = $('#scheduleSection').value;
  const locationId = $('#scheduleLocation').value || 'default';
  let days = [...document.querySelectorAll('#scheduleDays input:checked')].map(input => input.value);
  if (!days.length) days = ['daily'];
  if (days.includes('daily')) days = ['daily'];
  try {
    taskTemplates = (await api('/api/task-template/schedule', {
      method: 'POST',
      body: JSON.stringify({ section, locationId, days })
    })).taskTemplates;
    render();
    toast('Checklist schedule saved');
  } catch (error) {
    toast(`Schedule did not save: ${error.message}`);
  }
}

async function postNotice() {
  const title = $('#noticeTitle').value.trim();
  const message = $('#noticeMessage').value.trim();
  if (!title || !message) return toast('Enter a notice title and message');
  const targetRoles = [...document.querySelectorAll('#noticeTargetRoles input:checked')].map(input => input.value);
  if (!targetRoles.length) return toast('Choose at least one role for this notice');
  const file = $('#noticeFile').files[0];
  const attachmentUrl = $('#noticeLink')?.value.trim() || '';
  const attachment = file ? { name: file.name, dataUrl: await fileToDataUrl(file) } : null;
  try {
    notices = (await api('/api/notice', {
      method: 'POST',
      body: JSON.stringify({ title, message, targetRoles, attachment, attachmentUrl, attachmentName: attachmentUrl ? 'Shared link' : '' })
    })).notices;
    $('#noticeTitle').value = '';
    $('#noticeMessage').value = '';
    document.querySelectorAll('#noticeTargetRoles input').forEach(input => { input.checked = true; });
    $('#noticeFile').value = '';
    if ($('#noticeLink')) $('#noticeLink').value = '';
    render();
    toast('Notice posted');
  } catch (error) {
    toast(`Notice did not post: ${error.message}`);
  }
}

async function markNoticeRead(id) {
  try {
    notices = (await api('/api/notice/read', {
      method: 'POST',
      body: JSON.stringify({ id })
    })).notices;
    render();
  } catch (error) {
    toast(`Notice did not update: ${error.message}`);
  }
}

async function saveCalendarEvent() {
  if (!canManageCalendar()) return toast('Only Area Managers and above can manage calendar events');
  const title = $('#calendarEventTitle').value.trim();
  const date = $('#calendarEventDate').value;
  if (!title || !date) return toast('Enter an event title and date');
  const locationId = $('#calendarEventLocation').value || 'all';
  try {
    calendarEvents = await api('/api/calendar/event', {
      method: 'POST',
      body: JSON.stringify({
        id: $('#calendarEventId').value || undefined,
        title,
        type: $('#calendarEventType').value,
        date,
        time: $('#calendarEventTime').value,
        locationId,
        locationName: locationId === 'all' ? 'All assigned locations' : locationName(locationId),
        notes: $('#calendarEventNotes').value.trim()
      })
    });
    resetCalendarEventForm();
    render();
    toast('Calendar event saved');
  } catch (error) {
    toast(`Calendar event did not save: ${error.message}`);
  }
}

async function deleteCalendarEvent(id) {
  if (!canManageCalendar()) return toast('Only Area Managers and above can remove calendar events');
  if (!confirm('Remove this calendar event?')) return;
  try {
    calendarEvents = await api('/api/calendar/event/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    render();
    toast('Calendar event removed');
  } catch (error) {
    toast(`Calendar event did not remove: ${error.message}`);
  }
}

async function movePriorityTask(taskId, direction) {
  if (!canManageCalendar()) return toast('Only Area Managers and above can reorder upcoming work');
  const tasks = upcomingMaintenanceTasks(locations.filter(location => isFullAccess() || userLocationIds().includes(location.id)));
  const ids = tasks.map(task => task.id);
  const from = ids.indexOf(taskId);
  if (from < 0) return;
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  try {
    const result = await api('/api/maintenance/priority-order', {
      method: 'POST',
      body: JSON.stringify({ order: ids })
    });
    maintenancePriorityOrder = result.priorityOrder || ids;
    render();
    toast('Priority order updated');
  } catch (error) {
    toast(`Priority order did not save: ${error.message}`);
  }
}

async function saveAlertRule() {
  if (!canManageAlerts()) return toast('Only Director of Operations and Owner can manage alerts');
  const name = $('#alertRuleName').value.trim();
  const type = $('#alertRuleType').value;
  const target = $('#alertRuleTarget').value;
  const targetLabel = $('#alertRuleTarget').selectedOptions[0]?.textContent || target;
  const roles = [...document.querySelectorAll('#alertRuleRoles input:checked')].map(input => input.value);
  const channels = [
    $('#alertChannelEmail').checked ? 'email' : '',
    $('#alertChannelSms').checked ? 'sms' : ''
  ].filter(Boolean);
  if (!name) return toast('Enter an alert rule name');
  if (!target) return toast('Choose the list to watch');
  if (!roles.length) return toast('Choose at least one role to notify');
  if (!channels.length) return toast('Choose email, text, or both');
  try {
    alertSettings = await api('/api/alerts/rule', {
      method: 'POST',
      body: JSON.stringify({
        id: $('#alertRuleId').value || undefined,
        name,
        type,
        target,
        targetLabel,
        dueTime: $('#alertRuleTime').value || '17:00',
        locationId: $('#alertRuleLocation').value || 'all',
        roles,
        channels,
        active: $('#alertRuleActive').checked
      })
    });
    resetAlertRuleForm();
    toast('Alert rule saved');
  } catch (error) {
    toast(`Alert rule did not save: ${error.message}`);
  }
}

async function deleteAlertRule(id) {
  if (!canManageAlerts()) return toast('Only Director of Operations and Owner can remove alerts');
  if (!confirm('Remove this alert rule?')) return;
  try {
    alertSettings = await api('/api/alerts/rule/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    resetAlertRuleForm();
    toast('Alert rule removed');
  } catch (error) {
    toast(`Alert rule did not remove: ${error.message}`);
  }
}

async function previewAlerts() {
  try {
    const result = await api(`/api/alerts/check?date=${dateKey}&dryRun=true`);
    const alerts = result.alerts || [];
    $('#alertPreviewList').innerHTML = alerts.length
      ? `Preview found ${alerts.length} overdue alert${alerts.length === 1 ? '' : 's'}:<br>${alerts.slice(0, 8).map(alert => `${escapeHtml(alert.locationName)} · ${escapeHtml(alert.ruleName)} · ${escapeHtml(alert.detail)}`).join('<br>')}`
      : 'Preview found no overdue alerts right now.';
    toast('Alert preview complete');
  } catch (error) {
    toast(`Alert preview failed: ${error.message}`);
  }
}

async function refreshNotificationLogs() {
  try {
    const result = await api('/api/notification-logs');
    notificationLogs = result.logs || [];
    renderNotificationLogs();
    toast('Notification logs refreshed');
  } catch (error) {
    toast(`Notification logs did not load: ${error.message}`);
  }
}

async function saveFpcInspection() {
  const locationId = $('#fpcLocation').value === 'all' ? (fpcVisibleLocations()[0]?.id || currentLocationId) : $('#fpcLocation').value;
  const file = $('#fpcInspectionFile').files[0];
  const inspectionUrl = $('#fpcInspectionLink')?.value.trim() || '';
  if (!file && !inspectionUrl) return toast('Choose an FPC inspection file or paste a shared link');
  try {
    fpc = await api('/api/fpc/inspection', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        locationName: locationName(locationId),
        inspectionDate: $('#fpcInspectionDate').value || dateKey,
        attachment: file ? { name: file.name, dataUrl: await fileToDataUrl(file) } : null,
        inspectionUrl,
        inspectionName: file?.name || (inspectionUrl ? 'Shared inspection link' : '')
      })
    });
    $('#fpcInspectionFile').value = '';
    if ($('#fpcInspectionLink')) $('#fpcInspectionLink').value = '';
    $('#fpcInspectionDate').value = '';
    render();
    toast('FPC inspection saved');
  } catch (error) {
    toast(`FPC inspection did not save: ${error.message}`);
  }
}

async function saveFpcItem() {
  const selectedRecordId = $('#fpcRecordSelect').value;
  const locationId = $('#fpcLocation').value === 'all' ? (fpcVisibleLocations()[0]?.id || currentLocationId) : $('#fpcLocation').value;
  const description = $('#fpcItemDescription').value.trim();
  if (!description) return toast('Enter the FPC repair item');
  try {
    const photoFile = $('#fpcItemPhoto')?.files?.[0];
    const photoLink = $('#fpcItemPhotoLink')?.value.trim() || '';
    const photoUrl = photoFile ? await uploadFileDirectToSupabase(photoFile, 'fpc-item-photo') : photoLink;
    fpc = await api('/api/fpc/item', {
      method: 'POST',
      body: JSON.stringify({
        recordId: selectedRecordId,
        locationId,
        locationName: locationName(locationId),
        description,
        priority: $('#fpcItemPriority').value,
        ...assignmentPayload('fpc'),
        targetDate: $('#fpcItemTargetDate').value,
        photoUrl,
        photoName: photoFile?.name || (photoLink ? 'Shared photo link' : '')
      })
    });
    $('#fpcItemDescription').value = '';
    $('#fpcItemTargetDate').value = '';
    if ($('#fpcItemPhoto')) $('#fpcItemPhoto').value = '';
    if ($('#fpcItemPhotoLink')) $('#fpcItemPhotoLink').value = '';
    render();
    toast('FPC item added');
  } catch (error) {
    toast(`FPC item did not save: ${error.message}`);
  }
}

async function updateFpcStatus(recordId, itemId, status) {
  try {
    fpc = await api('/api/fpc/item/update', {
      method: 'POST',
      body: JSON.stringify({ recordId, itemId, status })
    });
    render();
    toast('FPC item updated');
  } catch (error) {
    toast(`FPC item did not update: ${error.message}`);
  }
}

function findFpcItem(recordId, itemId) {
  const record = (fpc.records || []).find(entry => entry.id === recordId);
  const item = record?.items?.find(entry => entry.id === itemId);
  return { record, item };
}

function openFpcItemDialog(recordId, itemId) {
  const { item } = findFpcItem(recordId, itemId);
  if (!item) return toast('FPC item not found');
  $('#editFpcRecordId').value = recordId;
  $('#editFpcItemId').value = itemId;
  $('#editFpcStatus').value = item.status || 'Open';
  $('#editFpcPriority').value = item.priority || 'Medium';
  $('#editFpcDescription').value = item.description || '';
  setAssignmentFields('editFpc', item);
  $('#editFpcTargetDate').value = toDateInput(item.targetDate);
  $('#editFpcPhoto').value = '';
  if ($('#editFpcPhotoLink')) $('#editFpcPhotoLink').value = '';
  $('#editFpcPhotoCurrent').innerHTML = item.photoUrl
    ? `<a class="fpc-photo-link" href="${escapeHtml(item.photoUrl)}" target="_blank" rel="noopener">${isImageUrl(item.photoUrl) ? `<img src="${escapeHtml(item.photoUrl)}" alt="Current FPC item photo">` : '<span class="link-icon">🔗</span>'}<span>${escapeHtml(item.photoName || 'Current photo')}</span></a>`
    : '<p class="hint">No photo attached yet.</p>';
  $('#fpcItemDialog').showModal();
}

async function saveFpcEdit() {
  const recordId = $('#editFpcRecordId').value;
  const itemId = $('#editFpcItemId').value;
  const description = $('#editFpcDescription').value.trim();
  if (!description) return toast('Enter the FPC item description');
  try {
    const photoFile = $('#editFpcPhoto')?.files?.[0];
    const photoLink = $('#editFpcPhotoLink')?.value.trim() || '';
    const photoUrl = photoFile ? await uploadFileDirectToSupabase(photoFile, 'fpc-item-photo') : (photoLink || undefined);
    fpc = await api('/api/fpc/item/update', {
      method: 'POST',
      body: JSON.stringify({
        recordId,
        itemId,
        description,
        priority: $('#editFpcPriority').value,
        status: $('#editFpcStatus').value,
        ...assignmentPayload('editFpc'),
        targetDate: $('#editFpcTargetDate').value,
        ...(photoUrl ? { photoUrl, photoName: photoFile?.name || (photoLink ? 'Shared photo link' : '') } : {})
      })
    });
    if ($('#editFpcPhotoLink')) $('#editFpcPhotoLink').value = '';
    render();
    toast('FPC item saved');
  } catch (error) {
    toast(`FPC item did not save: ${error.message}`);
  }
}

async function addFpcComment(recordId, itemId) {
  const input = [...document.querySelectorAll('[data-fpc-comment-input]')]
    .find(entry => entry.dataset.fpcCommentInput === `${recordId}|${itemId}`);
  const comment = input?.value.trim();
  if (!comment) return toast('Enter a comment first');
  try {
    fpc = await api('/api/fpc/comment', {
      method: 'POST',
      body: JSON.stringify({ recordId, itemId, comment })
    });
    render();
    toast('Comment added');
  } catch (error) {
    toast(`Comment did not save: ${error.message}`);
  }
}

async function saveStoreDocument() {
  if (!canAddStoreDocuments()) return toast('Only Area Managers and above can add store documents');
  const title = $('#storeDocTitle').value.trim();
  const file = $('#storeDocFile').files[0];
  const documentLink = $('#storeDocLink')?.value.trim() || '';
  if (!title) return toast('Enter a document title');
  if (!file && !documentLink) return toast('Choose a document file or paste a shared link');
  if (file && file.size > 50 * 1024 * 1024) return toast('Please keep store documents under 50 MB.');
  const locationId = $('#storeDocsLocation').value === 'all' ? (storeDocsVisibleLocations()[0]?.id || currentLocationId) : $('#storeDocsLocation').value;
  const button = $('#saveStoreDocBtn');
  button.disabled = true;
  button.textContent = file ? 'Uploading...' : 'Saving link...';
  try {
    const documentUrl = file ? await uploadFileDirectToSupabase(file, 'store-document') : documentLink;
    storeDocuments = await api('/api/store-documents/document', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        locationName: locationName(locationId),
        title,
        category: $('#storeDocCategory').value,
        notes: $('#storeDocNotes').value.trim(),
        url: documentUrl,
        fileName: file?.name || 'Shared document link'
      })
    });
    $('#storeDocTitle').value = '';
    $('#storeDocNotes').value = '';
    $('#storeDocFile').value = '';
    if ($('#storeDocLink')) $('#storeDocLink').value = '';
    render();
    toast('Store document uploaded');
  } catch (error) {
    toast(`Document did not upload: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Upload document';
  }
}

function resetResourceForm() {
  $('#resourceId').value = '';
  $('#resourceTitle').value = '';
  $('#resourceUrl').value = '';
  $('#resourceCategory').value = 'General';
  $('#resourceMinRole').value = 'Employee';
  if ($('#resourceLocation')) $('#resourceLocation').value = 'all';
  $('#resourceNotes').value = '';
  $('#saveResourceBtn').textContent = 'Save resource';
  renderResources();
}

function editResource(id) {
  const resource = (resources.resources || []).find(entry => entry.id === id);
  if (!resource) return toast('Resource link was not found');
  $('#resourceId').value = resource.id;
  $('#resourceTitle').value = resource.title || '';
  $('#resourceUrl').value = resource.url || '';
  $('#resourceCategory').value = resource.category || 'General';
  $('#resourceMinRole').value = resource.minRole || 'Employee';
  if ($('#resourceLocation')) $('#resourceLocation').value = resource.locationId || 'all';
  $('#resourceNotes').value = resource.notes || '';
  $('#saveResourceBtn').textContent = 'Save changes';
  renderResources();
  $('#resourcesAdminCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveResource() {
  if (!canManageResources()) return toast('Only Director of Operations and Owner can manage resources');
  const title = $('#resourceTitle').value.trim();
  const url = $('#resourceUrl').value.trim();
  if (!title) return toast('Enter a resource title');
  if (!/^https?:\/\//i.test(url)) return toast('Enter a full web address starting with https://');
  const locationId = $('#resourceLocation').value || 'all';
  try {
    resources = await api('/api/resources/resource', {
      method: 'POST',
      body: JSON.stringify({
        id: $('#resourceId').value || undefined,
        title,
        url,
        category: $('#resourceCategory').value,
        minRole: $('#resourceMinRole').value,
        locationId,
        locationName: locationId === 'all' ? 'All assigned locations' : locationName(locationId),
        notes: $('#resourceNotes').value.trim()
      })
    });
    resetResourceForm();
    toast('Resource saved');
  } catch (error) {
    toast(`Resource did not save: ${error.message}`);
  }
}

async function deleteResource(id) {
  if (!canManageResources()) return toast('Only Director of Operations and Owner can remove resources');
  if (!confirm('Remove this resource link?')) return;
  try {
    resources = await api('/api/resources/resource/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    if ($('#resourceId').value === id) resetResourceForm();
    else renderResources();
    toast('Resource removed');
  } catch (error) {
    toast(`Resource did not remove: ${error.message}`);
  }
}

async function submitSmallwaresRequest() {
  const locationId = $('#smallwaresLocation').value === 'all' ? (smallwaresVisibleLocations()[0]?.id || currentLocationId) : $('#smallwaresLocation').value;
  const item = $('#smallwaresItem').value.trim();
  if (!item) return toast('Enter the item needed');
  try {
    smallwares = await api('/api/smallwares/request', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        locationName: locationName(locationId),
        item,
        quantity: Number($('#smallwaresQty').value) || 1,
        notes: $('#smallwaresNotes').value.trim()
      })
    });
    $('#smallwaresItem').value = '';
    $('#smallwaresQty').value = '1';
    $('#smallwaresNotes').value = '';
    showApprovedSmallwares = false;
    render();
    toast('Smallwares request submitted');
  } catch (error) {
    toast(`Request did not save: ${error.message}`);
  }
}

async function updateSmallwaresRequest(id, status) {
  try {
    smallwares = await api('/api/smallwares/request/update', {
      method: 'POST',
      body: JSON.stringify({ id, status })
    });
    render();
    toast(`Request ${status.toLowerCase()}`);
  } catch (error) {
    toast(`Request did not update: ${error.message}`);
  }
}

function switchView(viewId) {
  if (hostedAuthEnabled() && viewId === 'todayView') viewId = 'taskListsView';
  document.querySelectorAll('.view, nav button, .ops-sidebar button').forEach(entry => entry.classList.remove('active'));
  $(`#${viewId}`).classList.add('active');
  document.querySelectorAll(`[data-view="${viewId}"]`).forEach(button => button.classList.add('active'));
}

document.addEventListener('click', async event => {
  const collapseHeader = event.target.closest('.collapsible-header');
  if (collapseHeader) {
    const card = collapseHeader.closest('.collapsible-card');
    card.classList.toggle('collapsed');
    collapseHeader.querySelector('.collapse-indicator').textContent = card.classList.contains('collapsed') ? '+' : '−';
    return;
  }

  const sectionButton = event.target.closest('[data-section-view]');
  if (sectionButton) {
    const targetView = sectionButton.dataset.sectionView;
    if ((targetView === 'homeView' || targetView === 'maintenanceView' || targetView === 'fpcView' || targetView === 'calendarView' || targetView === 'storeDocsView' || targetView === 'smallwaresView') && !canUseHub()) return toast('Only managers and above can access this section');
    if (isMaintenanceTech() && !['homeView', 'maintenanceView', 'fpcView'].includes(targetView)) return toast('This role can only access Dashboard, Maintenance, and FPC');
    switchView(targetView);
  }

  const taskSectionButton = event.target.closest('[data-task-section]');
  if (taskSectionButton) {
    selectedTaskSection = taskSectionButton.dataset.taskSection;
    localStorage.setItem('dailyops-task-section', selectedTaskSection);
    render();
  }

  const taskCategoryButton = event.target.closest('[data-task-category]');
  if (taskCategoryButton) {
    selectedTaskCategory = taskCategoryButton.dataset.taskCategory;
    localStorage.setItem('dailyops-task-category', selectedTaskCategory);
    selectedTaskSection = visibleTaskSectionsForCategory()[0] || '';
    localStorage.setItem('dailyops-task-section', selectedTaskSection);
    render();
  }

  const tempListButton = event.target.closest('[data-temp-list]:not([data-temp-area])');
  if (tempListButton) {
    selectedTempList = tempListButton.dataset.tempList;
    localStorage.setItem('dailyops-temp-list', selectedTempList);
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

  const editPmButton = event.target.closest('[data-edit-pm]');
  if (editPmButton) openPmDialog(editPmButton.dataset.editPm);

  const completePmButton = event.target.closest('[data-complete-pm]');
  if (completePmButton) await completePmTask(completePmButton.dataset.completePm);

  const editEquipmentButton = event.target.closest('[data-edit-equipment]');
  if (editEquipmentButton) openEquipmentDialog(editEquipmentButton.dataset.editEquipment);

  const editVendorButton = event.target.closest('[data-edit-vendor]');
  if (editVendorButton) openVendorDialog(editVendorButton.dataset.editVendor);

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

  const snoozeButton = event.target.closest('[data-snooze-task]');
  if (snoozeButton) await snoozeTask(snoozeButton.dataset.snoozeTask);

  const tempPick = event.target.closest('[data-temp-area][data-temp-item]');
  if (tempPick) openTempDialog(tempPick.dataset.tempArea, tempPick.dataset.tempItem, tempPick.dataset.tempList);

  const historyButton = event.target.closest('[data-history-key]');
  if (historyButton) openReport(historyButton.dataset.historyKey);

  const templateDeleteButton = event.target.closest('[data-template-delete]');
  if (templateDeleteButton) await deletePermanentTask(templateDeleteButton.dataset.templateDelete);

  const templateEditButton = event.target.closest('[data-template-edit]');
  if (templateEditButton) {
    editingTemplateId = templateEditButton.dataset.templateEdit;
    renderTaskTemplates();
  }

  const templateCancelButton = event.target.closest('[data-template-cancel]');
  if (templateCancelButton) {
    editingTemplateId = null;
    renderTaskTemplates();
  }

  const templateSaveButton = event.target.closest('[data-template-save]');
  if (templateSaveButton) await saveTemplateEdit(templateSaveButton.dataset.templateSave);

  const sectionDeleteButton = event.target.closest('[data-section-delete]');
  if (sectionDeleteButton) await deleteChecklistSection(sectionDeleteButton.dataset.sectionDelete, sectionDeleteButton.dataset.sectionLocation || templateScope);

  const noticeReadButton = event.target.closest('[data-notice-read]');
  if (noticeReadButton) await markNoticeRead(noticeReadButton.dataset.noticeRead);

  const calendarEditButton = event.target.closest('[data-calendar-edit]');
  if (calendarEditButton) editCalendarEvent(calendarEditButton.dataset.calendarEdit);

  const calendarDeleteButton = event.target.closest('[data-calendar-delete]');
  if (calendarDeleteButton) await deleteCalendarEvent(calendarDeleteButton.dataset.calendarDelete);

  const priorityMoveButton = event.target.closest('[data-priority-move]');
  if (priorityMoveButton) {
    const [taskId, direction] = priorityMoveButton.dataset.priorityMove.split('|');
    await movePriorityTask(taskId, direction);
  }

  const alertEditButton = event.target.closest('[data-alert-edit]');
  if (alertEditButton) editAlertRule(alertEditButton.dataset.alertEdit);

  const alertDeleteButton = event.target.closest('[data-alert-delete]');
  if (alertDeleteButton) await deleteAlertRule(alertDeleteButton.dataset.alertDelete);

  const resourceEditButton = event.target.closest('[data-resource-edit]');
  if (resourceEditButton) editResource(resourceEditButton.dataset.resourceEdit);

  const resourceDeleteButton = event.target.closest('[data-resource-delete]');
  if (resourceDeleteButton) await deleteResource(resourceDeleteButton.dataset.resourceDelete);

  const fpcCommentButton = event.target.closest('[data-fpc-comment]');
  if (fpcCommentButton) {
    const [recordId, itemId] = fpcCommentButton.dataset.fpcComment.split('|');
    await addFpcComment(recordId, itemId);
  }

  const fpcEditButton = event.target.closest('[data-edit-fpc]');
  if (fpcEditButton) {
    const [recordId, itemId] = fpcEditButton.dataset.editFpc.split('|');
    openFpcItemDialog(recordId, itemId);
  }

  const approveSmallwaresButton = event.target.closest('[data-smallwares-approve]');
  if (approveSmallwaresButton) await updateSmallwaresRequest(approveSmallwaresButton.dataset.smallwaresApprove, 'Approved');

  const declineSmallwaresButton = event.target.closest('[data-smallwares-decline]');
  if (declineSmallwaresButton) await updateSmallwaresRequest(declineSmallwaresButton.dataset.smallwaresDecline, 'Declined');

  const saveButton = event.target.closest('[data-user-save]');
  if (saveButton) await saveExistingUser(saveButton.dataset.userSave);

  const editButton = event.target.closest('[data-user-edit]');
  if (editButton) openUserDialog(editButton.dataset.userEdit);

  const deactivateButton = event.target.closest('[data-user-deactivate]');
  if (deactivateButton) await deactivateUser(deactivateButton.dataset.userDeactivate);

  const locationButton = event.target.closest('[data-location-save]');
  if (locationButton) {
    if (!canEditLocations()) return toast('Only Director or Owner can edit store names');
    await saveLocation(locationButton.dataset.locationSave);
  }
});

function fillTempItems() {
  const area = $('#tempArea').value;
  const areas = temperatureAreasForList();
  $('#tempItem').innerHTML = (areas[area] || []).map(item => `<option>${escapeHtml(item)}</option>`).join('');
}

function openTempDialog(area = $('#tempArea').value, item = null, list = selectedTempList) {
  $('#tempValue').value = '';
  if (list) {
    selectedTempList = list;
    localStorage.setItem('dailyops-temp-list', selectedTempList);
  }
  const areas = temperatureAreasForList();
  const firstArea = Object.keys(areas)[0] || area;
  $('#tempArea').innerHTML = Object.keys(areas).map(entry => `<option>${escapeHtml(entry)}</option>`).join('');
  area = areas[area] ? area : firstArea;
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
  if (window.dailyOpsAuth?.enabled) return;
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

async function changeWorkingLocation(locationId) {
  currentLocationId = locationId;
  localStorage.setItem('dailyops-current-location', currentLocationId);
  await loadState();
}

document.addEventListener('change', async event => {
  if (event.target.matches('#taskLocationSelect, #tempLocationSelect')) {
    await changeWorkingLocation(event.target.value);
  }
  if (event.target.matches('#templateScope')) {
    templateScope = event.target.value || 'all';
    localStorage.setItem('dailyops-template-scope', templateScope);
    editingTemplateId = null;
    renderTaskTemplates();
  }
  if (event.target.matches('#templatePrepArea')) {
    if (event.target.value && $('#templateCategory')) $('#templateCategory').value = 'Manager';
  }
  if (event.target.matches('#alertRuleType')) {
    renderAlertRules();
  }
  if (event.target.matches('[data-prep-qty]')) {
    const sourceId = event.target.dataset.prepQty;
    day.prepQuantities ??= {};
    day.prepQuantities[sourceId] = event.target.value;
    await persistAndRender('Prep quantity saved');
  }
  if (event.target.matches('#fpcLocation')) {
    fpcLocationId = event.target.value;
    localStorage.setItem('fpc-location', fpcLocationId);
    renderFpc();
  }
  if (event.target.matches('#storeDocsLocation')) {
    storeDocsLocationId = event.target.value;
    localStorage.setItem('store-docs-location', storeDocsLocationId);
    renderStoreDocuments();
  }

  if (event.target.matches('#resourcesLocation')) {
    resourcesLocationId = event.target.value;
    localStorage.setItem('resources-location', resourcesLocationId);
    renderResources();
  }

  if (event.target.matches('#smallwaresLocation')) {
    smallwaresLocationId = event.target.value;
    localStorage.setItem('smallwares-location', smallwaresLocationId);
    renderSmallwares();
  }
  if (event.target.matches('#calendarLocationFilter')) {
    calendarLocationFilter = event.target.value;
    localStorage.setItem('calendar-location-filter', calendarLocationFilter);
    render();
  }
  if (event.target.matches('[data-fpc-status]')) {
    const [recordId, itemId] = event.target.dataset.fpcStatus.split('|');
    await updateFpcStatus(recordId, itemId, event.target.value);
  }
});

$('#historyScope').onchange = async event => {
  historyScope = event.target.value;
  localStorage.setItem('dailyops-history-scope', historyScope);
  await loadState();
};

$('#dashboardRange').onchange = async event => {
  dashboardRange = event.target.value;
  localStorage.setItem('dailyops-dashboard-range', dashboardRange);
  await loadDashboardState();
  render();
};

$('#dashboardLocation').onchange = async event => {
  dashboardLocationId = event.target.value;
  localStorage.setItem('dailyops-dashboard-location', dashboardLocationId);
  await loadDashboardState();
  render();
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
    ...assignmentPayload('wo'),
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
    ...assignmentPayload('pm'),
    instructions: $('#pmInstructions').value.trim(),
    photoLink: await uploadMaintenanceFile('#pmPhoto', 'pm-photo'),
    manualLink: await uploadMaintenanceFile('#pmManual', 'pm-manual')
  };
  try {
    const saved = await api('/api/maintenance/pm', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    ['#pmTask', '#pmNextDue', '#pmInstructions', '#pmPhoto', '#pmManual'].forEach(selector => $(selector).value = '');
    renderMaintenance();
    toast(`Added ${saved.pmTask['PM ID']}`);
  } catch (error) {
    toast(`PM task did not save: ${error.message}`);
  }
};

$('#saveWorkOrderBtn').onclick = async () => {
  const payload = {
    workOrderId: $('#editWoId').value,
    locationId: $('#editWoLocationId').value,
    status: $('#editWoStatus').value,
    priority: $('#editWoPriority').value,
    ...assignmentPayload('editWo'),
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

async function completePmTask(pmId) {
  try {
    const saved = await api('/api/maintenance/pm/update', {
      method: 'POST',
      body: JSON.stringify({ pmId, status: 'Completed', completedDate: new Date().toISOString().slice(0, 10) })
    });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    toast('PM task completed');
  } catch {
    toast('PM task did not update — restart the backend server');
  }
}

$('#completePmBtn').onclick = async () => {
  await completePmTask($('#editPmId').value);
};

$('#savePmEditBtn').onclick = async () => {
  const task = $('#editPmTask').value.trim();
  if (!task) return toast('Enter a PM task');
  try {
    const saved = await api('/api/maintenance/pm/update', {
      method: 'POST',
      body: JSON.stringify({
        pmId: $('#editPmId').value,
        status: $('#editPmStatus').value,
        task,
        frequency: $('#editPmFrequency').value,
        nextDue: $('#editPmNextDue').value,
        ...assignmentPayload('editPm'),
        instructions: $('#editPmInstructions').value.trim(),
        notes: $('#editPmNotes').value.trim()
      })
    });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    toast('PM task saved');
  } catch (error) {
    toast(`PM task did not save: ${error.message}`);
  }
};

$('#saveEquipmentEditBtn').onclick = async () => {
  const equipmentName = $('#editEquipmentName').value.trim();
  if (!equipmentName) return toast('Enter an equipment name');
  try {
    const saved = await api('/api/maintenance/equipment/update', {
      method: 'POST',
      body: JSON.stringify({
        equipmentId: $('#editEquipmentId').value,
        equipmentName,
        equipmentType: $('#editEquipmentType').value,
        manufacturer: $('#editEquipmentManufacturer').value.trim(),
        model: $('#editEquipmentModel').value.trim(),
        serialNumber: $('#editEquipmentSerial').value.trim(),
        notes: $('#editEquipmentNotes').value.trim()
      })
    });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    toast('Equipment saved');
  } catch {
    toast('Equipment did not save — restart the backend server');
  }
};

$('#addVendorOpenBtn').onclick = () => openVendorDialog();

$('#saveVendorBtn').onclick = async () => {
  const vendorName = $('#editVendorName').value.trim();
  if (!vendorName) return toast('Enter a vendor name');
  try {
    const saved = await api('/api/maintenance/vendor', {
      method: 'POST',
      body: JSON.stringify({
        vendorId: $('#editVendorId').value,
        vendorName,
        category: $('#editVendorCategory').value.trim(),
        serviceArea: $('#editVendorServiceArea').value.trim(),
        contactName: $('#editVendorContact').value.trim(),
        phone: $('#editVendorPhone').value.trim(),
        email: $('#editVendorEmail').value.trim(),
        preferred: $('#editVendorPreferred').value,
        notes: $('#editVendorNotes').value.trim()
      })
    });
    maintenance = saved.state;
    renderMaintenance();
    toast('Vendor saved');
  } catch {
    toast('Vendor did not save — restart the backend server');
  }
};

$('#saveTempBtn').onclick = async event => {
  event.preventDefault();
  if (!$('#tempValue').value) {
    return;
  }
  selectedTempSession = $('#tempSession').value;
  localStorage.setItem('dailyops-temp-session', selectedTempSession);
  day.temps.push({
    list: selectedTempList,
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
  const phone = $('#newUserPhone').value.trim();
  const temporaryPassword = $('#newUserPassword').value.trim();
  if (!name) return toast('Enter a user name');
  if (window.dailyOpsAuth?.enabled && !email) return toast('Enter an email for hosted login');
  if (window.dailyOpsAuth?.enabled && !temporaryPassword) return toast('Enter a temporary password for hosted login');
  if (temporaryPassword && !email) return toast('Enter an email when setting a temporary password');
  if (temporaryPassword && temporaryPassword.length < 6) return toast('Temporary password must be at least 6 characters');
  const locationId = $('#newUserLocation').value;
  const role = $('#newUserRole').value;
  const selectedLocations = [...document.querySelectorAll('#newUserLocations input:checked')].map(input => input.value);
  const locationIds = roleUsesMultipleLocations(role) ? (selectedLocations.length ? selectedLocations : [locationId]) : [locationId];
  if (!allowedAssignableRoles().includes(role)) return toast('You do not have access to create that role');
  if (!isFullAccess() && locationIds.some(savedLocation => !userLocationIds().includes(savedLocation))) return toast('You can only add users to your locations');
  try {
    await saveUser({ name, email, phone, temporaryPassword, role, locationId, locationIds, invitedBy: currentUser().name });
    $('#newUserName').value = '';
    $('#newUserEmail').value = '';
    $('#newUserPhone').value = '';
    $('#newUserPassword').value = '';
    $('#newUserRole').value = 'Employee';
    renderNewUserLocationChecks();
    toast(temporaryPassword ? 'User added with temporary password' : 'User added');
  } catch (error) {
    toast(`User did not save: ${error.message}`);
  }
};

$('#importUsersBtn').onclick = importUsersFromFile;
$('#importLocationsBtn').onclick = importLocationsFromFile;
$('#importMaintenanceWorkbookBtn').onclick = importMaintenanceWorkbook;

function openUserDialog(id) {
  const user = users.find(entry => entry.id === id);
  if (!user) return;
  if (!canEditUser(user)) return toast('You do not have access to edit this user');
  const roles = allowedAssignableRoles();
  const visibleLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  $('#editUserId').value = user.id;
  $('#editUserName').value = user.name;
  $('#editUserEmail').value = user.email || '';
  $('#editUserPhone').value = user.phone || '';
  $('#editUserPassword').value = '';
  $('#editUserRole').innerHTML = roles.map(role => `<option ${user.role === role ? 'selected' : ''}>${role}</option>`).join('');
  if (!roles.includes(user.role)) $('#editUserRole').innerHTML += `<option selected>${escapeHtml(user.role)}</option>`;
  $('#editUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}" ${user.locationId === location.id ? 'selected' : ''}>${location.name}</option>`).join('');
  renderLocationChecks('#editUserLocations', userLocationIds(user));
  $('#editUserLocationsWrap').style.display = isAboveStore(user) ? 'block' : 'none';
  $('#userDialog').showModal();
}

$('#editUserRole').onchange = () => {
  $('#editUserLocationsWrap').style.display = roleUsesMultipleLocations($('#editUserRole').value) ? 'block' : 'none';
};

$('#saveUserEditBtn').onclick = async () => {
  const id = $('#editUserId').value;
  const existing = users.find(user => user.id === id);
  if (!existing || !canEditUser(existing)) return toast('You do not have access to edit this user');
  const name = $('#editUserName').value.trim();
  const email = $('#editUserEmail').value.trim();
  const phone = $('#editUserPhone').value.trim();
  const role = $('#editUserRole').value;
  const selected = [...document.querySelectorAll('#editUserLocations input:checked')].map(input => input.value);
  const locationId = $('#editUserLocation').value;
  if (!name) return toast('Enter a user name');
  if (!allowedAssignableRoles().includes(role)) return toast('You do not have access to assign that role');
  const locationsToSave = roleUsesMultipleLocations(role) ? (selected.length ? selected : [locationId]) : [locationId];
  if (!isFullAccess() && locationsToSave.some(savedLocation => !userLocationIds().includes(savedLocation))) return toast('You can only assign your locations');
  try {
    await saveUser({
      id,
      name,
      email,
      phone,
      role,
      locationId,
      locationIds: locationsToSave
    });
    const temporaryPassword = $('#editUserPassword').value.trim();
    if (temporaryPassword) await setUserPassword(id, temporaryPassword);
    toast(temporaryPassword ? 'User and password saved' : 'User saved');
  } catch (error) {
    toast(`User did not save: ${error.message}`);
  }
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
  } catch (error) {
    toast(`User did not save: ${error.message}`);
  }
}

function normalizeHeader(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rowValue(row, aliases) {
  for (const alias of aliases) {
    const match = Object.keys(row).find(key => normalizeHeader(key) === normalizeHeader(alias));
    if (match && row[match] !== undefined && row[match] !== null) return String(row[match]).trim();
  }
  return '';
}

function findLocationId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  const exact = locations.find(location => location.id.toLowerCase() === normalized || location.name.toLowerCase() === normalized);
  if (exact) return exact.id;
  const storeNumber = normalized.match(/(?:store\s*|store-)?(\d{1,2})$/);
  if (storeNumber) {
    const id = `store-${String(Number(storeNumber[1])).padStart(2, '0')}`;
    if (locations.some(location => location.id === id)) return id;
  }
  return '';
}

function importedLocationIds(value, homeLocationId) {
  const parts = String(value || '').split(/[,;|]/).map(part => part.trim()).filter(Boolean);
  const ids = parts.map(findLocationId).filter(Boolean);
  return [...new Set(ids.length ? ids : [homeLocationId].filter(Boolean))];
}

function normalizeRole(value = 'Employee') {
  const normalized = String(value || 'Employee').toLowerCase().replace(/[^a-z]/g, '');
  const roles = {
    employee: 'Employee',
    manager: 'Manager',
    areamanager: 'Area Manager',
    maintenancetech: maintenanceRole,
    maintenancetechnician: maintenanceRole,
    maintenance: maintenanceRole,
    directorofoperations: 'Director of Operations',
    owner: 'Owner'
  };
  return roles[normalized] || String(value || 'Employee').trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift()?.map(header => header.trim()) || [];
  return rows
    .filter(entry => entry.some(cell => String(cell).trim()))
    .map(entry => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ''])));
}

async function readUserImportRows(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'csv') {
    const text = await file.text();
    return parseCsv(text);
  }
  if (!window.XLSX) throw new Error('Excel parser did not load. Save the file as CSV or check your internet connection.');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function readWorkbookSheets(file) {
  if (!window.XLSX) throw new Error('Excel parser did not load. Check your internet connection and try again.');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return Object.fromEntries(workbook.SheetNames.map(name => [
    name,
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
  ]));
}

function maintenanceImportKey(sheetName) {
  const normalized = normalizeHeader(sheetName);
  if (['locations', 'stores', 'storelocations'].includes(normalized)) return 'locations';
  if (['equipment', 'equipmentlist', 'assets'].includes(normalized)) return 'equipment';
  if (['pm', 'pmtasks', 'pmschedule', 'preventivemaintenance', 'preventivemaintenancetasks'].includes(normalized)) return 'pmSchedule';
  if (['vendors', 'preferredvendors', 'vendorlist'].includes(normalized)) return 'vendors';
  if (['lists', 'dropdowns', 'lookups', 'options'].includes(normalized)) return 'lists';
  return '';
}

async function importMaintenanceWorkbook() {
  const file = $('#maintenanceWorkbookFile').files[0];
  if (!file) return toast('Choose an Excel workbook first');
  $('#maintenanceImportResult').textContent = 'Reading workbook...';
  try {
    const sheets = await readWorkbookSheets(file);
    const payload = {};
    for (const [sheetName, rows] of Object.entries(sheets)) {
      const key = maintenanceImportKey(sheetName);
      if (key && rows.length) payload[key] = rows;
    }
    const keys = Object.keys(payload);
    if (!keys.length) throw new Error('No recognized tabs found. Use tabs named Locations, Equipment, PM Tasks, Vendors, or Lists.');
    const saved = await api('/api/maintenance/import', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    $('#maintenanceWorkbookFile').value = '';
    $('#maintenanceImportResult').textContent = `Imported: ${saved.updated.join(', ')}`;
    toast('Maintenance workbook imported');
  } catch (error) {
    $('#maintenanceImportResult').textContent = error.message;
    toast(`Import failed: ${error.message}`);
  }
}

function importedUserFromRow(row) {
  const name = rowValue(row, ['Name', 'Employee Name', 'User Name', 'Full Name']);
  const email = rowValue(row, ['Email', 'Email Address', 'User Email']);
  const phone = rowValue(row, ['Phone', 'Phone Number', 'Mobile', 'Mobile Phone', 'Cell']);
  const temporaryPassword = rowValue(row, ['Temporary Password', 'Password', 'Temp Password']);
  const role = normalizeRole(rowValue(row, ['Role', 'Access Level']) || 'Employee');
  const homeLocationValue = rowValue(row, ['Home Location', 'Location', 'Store', 'Store Location', 'Location ID']);
  const attachedValue = rowValue(row, ['Attached Locations', 'Location IDs', 'Locations', 'Assigned Locations', 'Stores']);
  const locationId = findLocationId(homeLocationValue) || currentLocationId;
  const locationIds = roleUsesMultipleLocations(role) ? importedLocationIds(attachedValue, locationId) : [locationId];
  return { name, email, phone, temporaryPassword, role, locationId, locationIds, invitedBy: currentUser().name };
}

async function importUsersFromFile() {
  const file = $('#userImportFile').files[0];
  if (!file) return toast('Choose an Excel or CSV file first');
  $('#userImportResult').textContent = 'Reading file...';
  try {
    const rows = await readUserImportRows(file);
    if (!rows.length) throw new Error('No user rows found');
    let created = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const user = importedUserFromRow(row);
      const rowNumber = index + 2;
      if (!user.name) {
        errors.push(`Row ${rowNumber}: missing name`);
        continue;
      }
      if (window.dailyOpsAuth?.enabled && !user.email) {
        errors.push(`Row ${rowNumber}: missing email`);
        continue;
      }
      if (window.dailyOpsAuth?.enabled && !user.temporaryPassword) {
        errors.push(`Row ${rowNumber}: missing temporary password`);
        continue;
      }
      if (user.temporaryPassword && user.temporaryPassword.length < 6) {
        errors.push(`Row ${rowNumber}: temporary password must be at least 6 characters`);
        continue;
      }
      if (!allowedAssignableRoles().includes(user.role)) {
        errors.push(`Row ${rowNumber}: role not allowed (${user.role})`);
        continue;
      }
      if (!isFullAccess() && user.locationIds.some(locationId => !userLocationIds().includes(locationId))) {
        errors.push(`Row ${rowNumber}: location not allowed`);
        continue;
      }
      try {
        await saveUser(user);
        created += 1;
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }
    $('#userImportFile').value = '';
    $('#userImportResult').innerHTML = `${created} user${created === 1 ? '' : 's'} imported.${errors.length ? `<br>${errors.slice(0, 6).map(escapeHtml).join('<br>')}${errors.length > 6 ? '<br>More errors not shown.' : ''}` : ''}`;
    toast(`${created} user${created === 1 ? '' : 's'} imported`);
  } catch (error) {
    $('#userImportResult').textContent = error.message;
    toast(`Import failed: ${error.message}`);
  }
}

function importedLocationFromRow(row) {
  const idValue = rowValue(row, ['Location ID', 'Store ID', 'ID', 'Store Number', 'Store']);
  const name = rowValue(row, ['Location Name', 'Name', 'Store Name']);
  let id = findLocationId(idValue);
  if (!id && /^store-\d+$/i.test(idValue)) id = idValue.toLowerCase().replace(/store-(\d+)/, (_, number) => `store-${String(Number(number)).padStart(2, '0')}`);
  if (!id && /^\d+$/.test(idValue)) id = `store-${String(Number(idValue)).padStart(2, '0')}`;
  return { id, name };
}

async function importLocationsFromFile() {
  const file = $('#locationImportFile').files[0];
  if (!file) return toast('Choose an Excel or CSV file first');
  if (!canEditLocations()) return toast('Only Director or Owner can edit locations');
  $('#locationImportResult').textContent = 'Reading file...';
  try {
    const rows = await readUserImportRows(file);
    if (!rows.length) throw new Error('No location rows found');
    let updated = 0;
    const errors = [];
    for (const [index, row] of rows.entries()) {
      const location = importedLocationFromRow(row);
      const rowNumber = index + 2;
      if (!location.id) {
        errors.push(`Row ${rowNumber}: missing or unknown location ID`);
        continue;
      }
      if (!location.name) {
        errors.push(`Row ${rowNumber}: missing location name`);
        continue;
      }
      try {
        await saveLocationRecord(location);
        updated += 1;
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }
    $('#locationImportFile').value = '';
    $('#locationImportResult').innerHTML = `${updated} location${updated === 1 ? '' : 's'} updated.${errors.length ? `<br>${errors.slice(0, 6).map(escapeHtml).join('<br>')}${errors.length > 6 ? '<br>More errors not shown.' : ''}` : ''}`;
    render();
    toast(`${updated} location${updated === 1 ? '' : 's'} updated`);
  } catch (error) {
    $('#locationImportResult').textContent = error.message;
    toast(`Import failed: ${error.message}`);
  }
}

async function saveUser(user) {
  if (apiOnline) {
    const path = user.email && user.temporaryPassword && !user.id ? '/api/invite' : '/api/user';
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

async function deactivateUser(id) {
  const user = users.find(entry => entry.id === id);
  if (!user) return;
  if (user.id === currentUser().id) return toast('You cannot deactivate yourself');
  if (!canEditUser(user)) return toast('You do not have access to deactivate this user');
  if (!confirm(`Deactivate ${user.name}? They will no longer be able to access the app.`)) return;
  if (apiOnline) {
    users = (await api('/api/user/deactivate', { method: 'POST', body: JSON.stringify({ id }) })).users;
  } else {
    users = users.filter(entry => entry.id !== id);
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.users = users;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
  }
  render();
  toast('User deactivated');
}

async function setUserPassword(id, password) {
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
  return api('/api/user/password', { method: 'POST', body: JSON.stringify({ id, password }) });
}

async function saveLocationRecord(location) {
  if (apiOnline) {
    locations = (await api('/api/location', { method: 'POST', body: JSON.stringify(location) })).locations;
  } else {
    const existing = locations.find(entry => entry.id === location.id);
    if (existing) existing.name = location.name;
    else locations.push(location);
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.locations = locations;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
  }
}

async function saveLocation(id) {
  const name = document.querySelector(`[data-location-name="${id}"]`).value.trim();
  if (!name) return toast('Enter a location name');
  await saveLocationRecord({ id, name });
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

document.querySelectorAll('nav button, .ops-sidebar button[data-view]').forEach(button => {
  button.onclick = () => {
    if (isMaintenanceTech() && !['homeView', 'maintenanceView', 'fpcView'].includes(button.dataset.view)) return toast('This role can only access Dashboard, Maintenance, and FPC');
    switchView(button.dataset.view);
  };
});

$('#signOutBtn').onclick = () => window.dailyOpsSignOut ? window.dailyOpsSignOut() : toast('Sign out is available on the hosted app');
$('#noticesBtn').onclick = () => switchView('noticesView');
$('#addTemplateTaskBtn').onclick = savePermanentTask;
$('#loadAreaChecklistsBtn').onclick = importAreaChecklists;
$('#copyChecklistBtn').onclick = copyChecklistToLocation;
$('#saveScheduleBtn').onclick = saveChecklistSchedule;
$('#scheduleSection').onchange = renderTaskTemplates;
$('#scheduleLocation').onchange = renderTaskTemplates;
$('#scheduleDays').onchange = event => {
  if (event.target.value === 'daily' && event.target.checked) {
    document.querySelectorAll('#scheduleDays input').forEach(input => {
      if (input.value !== 'daily') input.checked = false;
    });
  }
  if (event.target.value !== 'daily' && event.target.checked) {
    const daily = document.querySelector('#scheduleDays input[value="daily"]');
    if (daily) daily.checked = false;
  }
};
$('#postNoticeBtn').onclick = postNotice;
$('#saveCalendarEventBtn').onclick = saveCalendarEvent;
$('#cancelCalendarEventBtn').onclick = resetCalendarEventForm;
$('#saveAlertRuleBtn').onclick = saveAlertRule;
$('#cancelAlertRuleBtn').onclick = resetAlertRuleForm;
$('#previewAlertsBtn').onclick = previewAlerts;
$('#refreshNotificationLogsBtn').onclick = refreshNotificationLogs;
$('#saveFpcInspectionBtn').onclick = saveFpcInspection;
$('#saveFpcItemBtn').onclick = saveFpcItem;
$('#saveFpcEditBtn').onclick = saveFpcEdit;
$('#saveStoreDocBtn').onclick = saveStoreDocument;
$('#saveResourceBtn').onclick = saveResource;
$('#cancelResourceEditBtn').onclick = resetResourceForm;
$('#submitSmallwaresBtn').onclick = submitSmallwaresRequest;
$('#showApprovedSmallwaresBtn').onclick = () => {
  showApprovedSmallwares = !showApprovedSmallwares;
  renderSmallwares();
};
$('#changePasswordBtn').onclick = () => {
  $('#selfPassword').value = '';
  $('#selfPasswordConfirm').value = '';
  $('#passwordDialog').showModal();
};
$('#saveSelfPasswordBtn').onclick = async () => {
  const password = $('#selfPassword').value;
  const confirm = $('#selfPasswordConfirm').value;
  if (!password || password.length < 6) return toast('Password must be at least 6 characters');
  if (password !== confirm) return toast('Passwords do not match');
  try {
    await setUserPassword(currentUser().id, password);
    toast('Password changed');
  } catch (error) {
    toast(`Password did not change: ${error.message}`);
  }
};
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
