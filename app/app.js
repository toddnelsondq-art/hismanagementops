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
      'Products and equipment': [
        'Hamburger Patties',
        'Grilled Chicken',
        'Crispy Chicken',
        'Chicken Strips',
        'Other Proteins',
        'Fish Fillets / Shrimp',
        'Hot Dogs',
        'Chili',
        'Gravy',
        'Barbecue',
        'Mushroom Sauce',
        'Reheated Queso',
        'Queso Heated First Time',
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
      'Products and equipment': [
        'Hot Fudge',
        'Hot Caramel',
        'Waffle Coating',
        'Novelty Cone Coat',
        'Cocoa Fudge',
        'Cone Coating',
        'DQ Mix in Bag',
        'Milk',
        'Open Topping',
        'Frozen Soft Serve',
        'Overrun',
        'DQ Bakes Desserts',
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
    deliveryDaysByLocation: {},
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
const managerTaskAreas = ['Service', 'Chill', 'Grill', 'Exterior', 'Back of house'];
const tempSessions = ['Day', 'Afternoon'];
const weekdayOptions = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const maintenanceRole = 'Maintenance Tech';
const dateKey = new Date().toISOString().slice(0, 10);
const $ = selector => document.querySelector(selector);
const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
const apiUrl = path => isNativeApp() && String(path).startsWith('/api/') ? `https://dqops.net${path}` : path;
let waitingAppServiceWorker = null;
let updateRefreshRequested = false;
let currentDeploymentId = '';

function showAppVersion(version = window.DQ_OPS_VERSION || '1.0.0', build = window.DQ_OPS_BUILD || 'unknown') {
  if ($('#appVersionLabel')) $('#appVersionLabel').textContent = `DQ OPS v${version}`;
  if ($('#appBuildLabel')) $('#appBuildLabel').textContent = `Build ${String(build).slice(0, 12)}`;
}

async function deployedAppVersion() {
  const response = await fetch(apiUrl(`/api/version?t=${Date.now()}`), { cache: 'no-store' });
  if (!response.ok) throw new Error('Version service unavailable');
  return response.json();
}

function showAppUpdateReady(worker) {
  if (worker) waitingAppServiceWorker = worker;
  if ($('#appUpdateBanner')) $('#appUpdateBanner').hidden = false;
  if ($('#helpRefreshNowBtn')) $('#helpRefreshNowBtn').hidden = false;
  if ($('#checkForUpdatesBtn')) $('#checkForUpdatesBtn').textContent = 'Update ready';
}

function refreshToAppUpdate() {
  if (!waitingAppServiceWorker) return location.reload();
  updateRefreshRequested = true;
  waitingAppServiceWorker.postMessage({ type: 'SKIP_WAITING' });
}

async function checkForAppUpdate() {
  if (isNativeApp() || !('serviceWorker' in navigator) || location.protocol !== 'https:') return toast('Android app updates are installed through Google Play');
  const button = $('#checkForUpdatesBtn');
  if (button) { button.disabled = true; button.textContent = 'Checking…'; }
  try {
    const deployed = await deployedAppVersion();
    if (currentDeploymentId && deployed.build && deployed.build !== currentDeploymentId) {
      showAppUpdateReady(null);
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return toast('Update service is not ready yet');
    await registration.update();
    if (registration.waiting) showAppUpdateReady(registration.waiting);
    else if (!registration.installing) {
      if (button) button.textContent = 'Check for updates';
      toast('DQ OPS is up to date');
    }
  } catch (error) {
    if (button) button.textContent = 'Check for updates';
    toast(`Update check failed: ${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
}

async function setupAppUpdateFlow() {
  showAppVersion();
  if (isNativeApp() || !('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  try {
    const deployed = await deployedAppVersion();
    currentDeploymentId = deployed.build || '';
    showAppVersion(deployed.version, deployed.build);
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    if (registration.waiting && navigator.serviceWorker.controller) showAppUpdateReady(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showAppUpdateReady(worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateRefreshRequested) location.reload();
    });
    window.setInterval(async () => {
      try {
        const latest = await deployedAppVersion();
        if (currentDeploymentId && latest.build && latest.build !== currentDeploymentId) showAppUpdateReady(null);
      } catch {}
    }, 300000);
  } catch (error) {
    console.warn('DQ OPS update service did not start', error);
  }
}
const hostedAuthEnabled = () => Boolean(window.dailyOpsAuth?.enabled);
let locations = [{ id: 'store-01', name: 'Store 1' }];
let currentLocationId = localStorage.getItem('dailyops-current-location') || 'store-01';
let day = { locationId: currentLocationId, tasks: baseTasks.map(task => ({ ...task, done: false })), temps: [], complete: false };
let history = [];
let temperatureCompliance = { entries: [], totals: {}, loaded: false, loading: false, canMarkClosed: false };
let overdue = [];
let temperatureItems = defaultTemperatureItems;
let temperatureStandards = {};
let pendingTemperatureReading = null;
let users = [{ id: 'alex-rivera', name: 'Alex Rivera', role: 'Manager', locationId: 'store-01' }];
let currentUserId = localStorage.getItem('dailyops-current-user') || 'alex-rivera';
let historyScope = localStorage.getItem('dailyops-history-scope') || 'location';
let photoTask = null;
let apiOnline = false;
let selectedReportDate = null;
let selectedReportLocationId = null;
let maintenance = { locations: [], equipment: [], workOrders: [], workOrderUpdates: [], workOrderUpdatesReady: true, pmSchedule: [], vendors: [], lists: {} };
let maintenanceWorkLog = { mode: 'none', canEdit: false, canManagePermissions: false, entries: [], technicians: [], areaManagers: [], permissions: { areaManagerIds: [] } };
let locationHealth = { configured: false, cameras: [], mappings: {}, canManage: false, message: '', thermostats: [], thermostatConfigured: false, thermostatMessage: '' };
let rollout = { allowed: false, canManagePermissions: false, sections: [], records: {}, installerUserIds: [], users: [] };
let rolloutLocationId = localStorage.getItem('dqops-rollout-location') || 'store-01';
const locationHealthSnapshots = new Map();
let maintenanceLogPeriod = 'month';
let maintenanceTechnicianFilter = 'all';
let maintenanceLocationId = localStorage.getItem('maintenance-location') || 'all';
let maintenanceFilter = 'open';
let selectedTaskSection = localStorage.getItem('dailyops-task-section') || 'Opening';
let selectedTaskCategory = localStorage.getItem('dailyops-task-category') || 'Manager';
let editingTemplateId = null;
let templateScope = localStorage.getItem('dailyops-template-scope') || 'all';
let selectedTempList = localStorage.getItem('dailyops-temp-list') || 'Grill';
let selectedTempSession = localStorage.getItem('dailyops-temp-session') || 'Day';
let tempEntryMode = 'listed';
let dashboardRange = localStorage.getItem('dailyops-dashboard-range') || 'day';
let dashboardLocationId = localStorage.getItem('dailyops-dashboard-location') || 'all';
const dashboardWidgetCatalog = [
  { id: 'financials', label: 'Sales & labor at a glance' },
  { id: 'alerts', label: 'Upcoming visits and events' },
  { id: 'upcoming', label: 'Upcoming maintenance and FPC tasks' },
  { id: 'marketing', label: 'POP & readerboard updates', required: true },
  { id: 'incidents', label: 'Incident Reports' },
  { id: 'taskLists', label: 'Task Lists' },
  { id: 'weeklyCleaning', label: 'Weekly Cleaning' },
  { id: 'tempLogs', label: 'Temp Logs' },
  { id: 'maintenance', label: 'Maintenance work orders' },
  { id: 'fpc', label: 'FPC repair items' },
  { id: 'inspections', label: 'Inspection performance' },
  { id: 'progress', label: 'Location progress detail' }
];
const defaultDashboardPreferences = () => ({ visible: dashboardWidgetCatalog.map(widget => widget.id), order: dashboardWidgetCatalog.map(widget => widget.id), defaultRange: 'day', defaultLocationId: 'all' });
let dashboardPreferences = defaultDashboardPreferences();
let dashboardPreferencesCustomizable = false;
let companyDashboardPreferences = defaultDashboardPreferences();
let companyDashboardDefaultEditable = false;
let editingDashboardPreferences = null;
let dashboardCustomizationScope = 'personal';
let dashboardPreferencesApplied = false;
let dashboardMetrics = {
  financials: { allowed: false, migrationReady: true, reportCount: 0, totals: {}, byLocation: [], standouts: [] },
  taskLists: { completed: 0, remaining: 0, total: 0, percent: 0 },
  weeklyCleaning: { completed: 0, remaining: 0, total: 0, percent: 0 },
  tempLogs: { completed: 0, remaining: 0, total: 0, percent: 0 },
  maintenance: { completed: 0, open: 0, total: 0, percent: 0 }
};
let taskTemplates = baseTasks.map(task => ({ ...task, section: 'Opening', active: true }));
let qrCheckpoints = { migrationReady: true, canManage: false, checkpoints: [], scans: [] };
let qrScannerStream = null;
let qrScannerTimer = null;
let qrScannerTaskId = '';
let qrCheckpointLogDate = dateKey;
let pendingChecklistImport = [];
let pendingFpcImport = [];
let notices = [];
let showPreviousNotices = false;
let alertSettings = { rules: [], logs: [] };
let notificationLogs = [];
let managerNotificationPreferences = {
  allowed: false,
  preferences: {
    incompleteTemps: { enabled: false, dueTime: '14:00', channels: ['in-app'] },
    outOfRangeTemps: { enabled: false, channels: ['in-app'] },
    newMaintenanceRequest: { enabled: false, channels: ['in-app'] },
    performanceReport: { cadence: 'none', sendTime: '08:00', channels: ['email'], includeTasks: true, includeTemps: true, includePm: true }
  }
};
let financialReportState = { allowed: false, migrationReady: true, canImport: false, reportCount: 0, totals: {}, byLocation: [], standouts: [], imports: [], mappings: {}, reports: [], emailImports: [], emailAutomation: { configured: false, inboundAddress: '' } };
let pendingFinancialReports = [];
let pendingFinancialSource = { filename: '', hash: '' };
let popCampaigns = { campaigns: [], canManage: false };
let subscriptionAdmin = {
  tenantId: 'his-management',
  canView: false,
  canEdit: false,
  migrationReady: false,
  subscription: { planKey: 'advanced', planName: 'Advanced', status: 'active', features: {}, limits: {} },
  plans: [],
  featureCatalog: [],
  addonCatalog: [],
  locationAddons: [],
  tenants: [],
  locations: []
};
let platformAdminSupport = { platformAdmin: false, tenantId: '', tenants: [], users: [], feedbackMigrationReady: false, feedback: [] };
let storeAlarms = { canSend: false, active: [], history: [] };
let storeAlarmAudioContext = null;
let storeAlarmToneTimer = null;
let lastStoreAlarmNotificationId = sessionStorage.getItem('dqops-last-store-alarm') || '';
let storeAlarmPollBusy = false;
let calendarEvents = { events: [] };
let calendarLocationFilter = localStorage.getItem('calendar-location-filter') || 'all';
let maintenancePriorityOrder = [];
let fpc = { records: [] };
let fpcLocationId = localStorage.getItem('fpc-location') || 'all';
let storeDocuments = { documents: [] };
let storeDocsLocationId = localStorage.getItem('store-docs-location') || 'all';
let resources = { resources: [] };
let resourcesLocationId = localStorage.getItem('resources-location') || 'all';
let receipts = { receipts: [] };
let inspections = { templates: [], inspections: [] };
let inspectionChartMonths = Number(localStorage.getItem('inspection-chart-months')) || 1;
let inspectionTemplateId = localStorage.getItem('inspection-template') || 'store-visit';
let inspectionChartTemplateId = localStorage.getItem('inspection-chart-template') || 'store-visit';
let smallwares = { requests: [] };
let managementReports = { reports: [] };
let managementReportStatusFilter = 'open';
let smallwaresLocationId = localStorage.getItem('smallwares-location') || currentLocationId;
let showApprovedSmallwares = false;
let kioskDevices = [];

$('#todayLabel').textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
}).toUpperCase();
if ($('#receiptDate')) $('#receiptDate').value = dateKey;
if ($('#inspectionDate')) $('#inspectionDate').value = dateKey;
if ($('#managementReportOccurredAt')) $('#managementReportOccurredAt').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
if ($('#popCampaignStartDate')) $('#popCampaignStartDate').value = dateKey;
if ($('#popCampaignDueDate')) $('#popCampaignDueDate').value = dateKey;
if ($('#temperatureHistoryEnd')) { $('#temperatureHistoryEnd').value = dateKey; $('#temperatureHistoryEnd').max = dateKey; }
if ($('#temperatureHistoryStart')) {
  const start = new Date(`${dateKey}T12:00:00`);
  start.setDate(start.getDate() - 59);
  $('#temperatureHistoryStart').value = start.toISOString().slice(0, 10);
  $('#temperatureHistoryStart').max = dateKey;
}

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
    <div id="taskInStoreReminders"></div>
    <div class="task-scan-tools"><button id="openQrScannerBtn" class="ghost" type="button">▣ Scan a checkpoint</button></div>
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
    <div id="tempInStoreReminders"></div>
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

}

function setupCustomizableDashboard() {
  const home = $('#homeView');
  if (!home || $('#dashboardWidgetArea')) return;
  const controls = home.querySelector('.dashboard-controls');
  const alerts = $('#dashboardAlertsCard');
  const upcoming = $('#dashboardUpcomingTasksCard');
  const metricGrid = home.querySelector('.dashboard-grid');
  const metricCards = metricGrid ? [...metricGrid.children] : [];
  const progress = home.querySelector('.dashboard-progress-card');
  const area = document.createElement('div');
  area.id = 'dashboardWidgetArea';
  area.className = 'dashboard-widget-area';
  controls.insertAdjacentElement('afterend', area);

  const financialCard = document.createElement('article');
  financialCard.className = 'card dashboard-widget financial-dashboard-card';
  financialCard.id = 'dashboardFinancialCard';
  financialCard.innerHTML = `
    <div class="maintenance-row compact">
      <div><p class="eyebrow">DAY / WEEK / MONTH AT A GLANCE</p><h3>Sales &amp; labor</h3></div>
      <span class="status" id="dashboardFinancialCoverage">No reports</span>
    </div>
    <div id="dashboardFinancialMetrics" class="financial-metric-grid"></div>
    <div id="dashboardFinancialStandouts" class="financial-standouts"></div>
    <details id="dashboardFinancialLocations" class="financial-location-details"><summary>Location detail</summary><div></div></details>`;
  const incidentCard = document.createElement('article');
  incidentCard.className = 'card dashboard-card dashboard-widget dashboard-clickable';
  incidentCard.id = 'dashboardIncidentCard';
  incidentCard.dataset.sectionView = 'managementReportsView';
  incidentCard.innerHTML = '<div><p class="eyebrow">MANAGEMENT</p><h3>Incident Reports</h3></div><div id="dashboardIncidentSummary"></div><button class="ghost" data-section-view="managementReportsView" type="button">Open Incident Reports</button>';
  const inspectionCard = document.createElement('article');
  inspectionCard.className = 'card dashboard-card dashboard-widget dashboard-clickable';
  inspectionCard.id = 'dashboardInspectionCard';
  inspectionCard.dataset.sectionView = 'inspectionsView';
  inspectionCard.innerHTML = '<div><p class="eyebrow">STORE VISITS</p><h3>Inspection performance</h3></div><div id="dashboardInspectionSummary"></div><button class="ghost" data-section-view="inspectionsView" type="button">Open inspections</button>';
  const marketingCard = document.createElement('article');
  marketingCard.className = 'card dashboard-widget dashboard-clickable';
  marketingCard.id = 'dashboardMarketingCard';
  marketingCard.dataset.sectionView = 'manageView';
  marketingCard.dataset.openManageCard = 'popCampaignAdminCard';
  marketingCard.innerHTML = '<div class="maintenance-row compact"><div><p class="eyebrow">NOW + NEXT 30 DAYS</p><h3>POP &amp; readerboard updates</h3></div><span class="status" id="dashboardMarketingCount">0 updates</span></div><div id="dashboardMarketingList"></div>';

  const widgets = { financials: financialCard, alerts, upcoming, marketing: marketingCard, incidents: incidentCard, taskLists: metricCards[0], weeklyCleaning: metricCards[1], tempLogs: metricCards[2], maintenance: metricCards[3], fpc: metricCards[4], inspections: inspectionCard, progress };
  dashboardWidgetCatalog.forEach(widget => {
    const element = widgets[widget.id];
    if (!element) return;
    element.dataset.dashboardWidget = widget.id;
    element.classList.add('dashboard-widget');
    if (['financials', 'alerts', 'upcoming', 'marketing', 'progress'].includes(widget.id)) element.classList.add('widget-wide');
    area.appendChild(element);
  });
  metricGrid?.remove();
}

setupDailyOpsLayout();
setupCustomizableDashboard();

function arrangeManageSections() {
  const usersGroup = $('#manageUsersGroupItems');
  const setupGroup = $('#manageSetupGroupItems');
  if (!usersGroup || !setupGroup || usersGroup.dataset.arranged) return;

  $('#usersTitle').textContent = 'Current users';
  $('#addUserCard').querySelector(':scope > h3').textContent = 'Add new user';
  $('#importUsersCard').querySelector(':scope > h3').textContent = 'Import users';
  ['usersCard', 'addUserCard', 'kioskAdminCard', 'importUsersCard'].forEach(id => usersGroup.appendChild($(`#${id}`)));

  const locationLink = document.createElement('button');
  locationLink.className = 'section-hub-card manage-setup-link';
  locationLink.type = 'button';
  locationLink.dataset.sectionView = 'locationsView';
  locationLink.innerHTML = '<span>⌖</span><b>Locations</b><small>Addresses, phone numbers, and store setup</small>';
  setupGroup.appendChild(locationLink);
  ['companyDashboardDefaultCard', 'popCampaignAdminCard', 'checklistTemplateCard', 'qrCheckpointAdminCard', 'temperatureStandardsCard', 'alertRulesCard'].forEach(id => setupGroup.appendChild($(`#${id}`)));

  $('#missingChecklistAdminCard').hidden = true;
  $('#teamProgressAdminCard').hidden = true;
  usersGroup.dataset.arranged = 'true';
}

arrangeManageSections();

function arrangePlatformAdmin() {
  const host = $('#platformSubscriptionHost');
  const card = $('#subscriptionAdminCard');
  if (host && card && card.parentElement !== host) host.appendChild(card);
}

arrangePlatformAdmin();

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

function arrangeMaintenanceTools() {
  const view = $('#maintenanceView');
  const actions = $('#maintenanceActions');
  if (!view || !actions) return;
  view.append(actions);
  ['maintenanceImportPanel', 'equipmentForm', 'pmForm', 'equipmentDirectory', 'vendorDirectory']
    .forEach(id => { const panel = $(`#${id}`); if (panel) view.append(panel); });
}

arrangeMaintenanceTools();

const wideSidebarQuery = window.matchMedia('(min-width: 840px)');
let sidebarExpanded = localStorage.getItem('dqops-sidebar-expanded');
sidebarExpanded = sidebarExpanded === null ? wideSidebarQuery.matches : sidebarExpanded === 'true';
if (!wideSidebarQuery.matches) sidebarExpanded = false;

function setSidebarExpanded(expanded, remember = true) {
  sidebarExpanded = Boolean(expanded);
  const sidebar = $('#primarySidebar');
  document.body.classList.toggle('menu-expanded', sidebarExpanded);
  document.body.classList.toggle('menu-collapsed', !sidebarExpanded && wideSidebarQuery.matches);
  sidebar.classList.toggle('drawer-open', sidebarExpanded);
  sidebar.setAttribute('aria-hidden', String(!sidebarExpanded && !wideSidebarQuery.matches));
  $('#sideMenuToggle').setAttribute('aria-expanded', String(sidebarExpanded));
  $('#sideMenuToggle').setAttribute('aria-label', sidebarExpanded ? 'Collapse navigation' : 'Expand navigation');
  const sideMenuIcon = $('#sideMenuToggle .nav-icon');
  const sideMenuText = $('#sideMenuToggle span:not(.nav-icon)');
  if (sideMenuIcon) sideMenuIcon.textContent = sidebarExpanded && !wideSidebarQuery.matches ? '×' : '☰';
  if (sideMenuText) sideMenuText.textContent = sidebarExpanded && !wideSidebarQuery.matches ? 'Close menu' : 'Menu';
  $('#menuOpenButton').setAttribute('aria-expanded', String(sidebarExpanded));
  $('#menuOpenButton').hidden = sidebarExpanded;
  $('#menuScrim').hidden = !sidebarExpanded;
  if (remember) localStorage.setItem('dqops-sidebar-expanded', String(sidebarExpanded));
}

setSidebarExpanded(sidebarExpanded, false);
$('#sideMenuToggle').onclick = () => setSidebarExpanded(!sidebarExpanded);
$('#menuOpenButton').onclick = () => setSidebarExpanded(true);
$('#menuScrim').onclick = () => setSidebarExpanded(false);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && sidebarExpanded) setSidebarExpanded(false);
});
wideSidebarQuery.addEventListener('change', event => {
  if (!event.matches) setSidebarExpanded(false, false);
  else if (localStorage.getItem('dqops-sidebar-expanded') === null) setSidebarExpanded(true, false);
  else setSidebarExpanded(sidebarExpanded, false);
});

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
  $('#toast').textContent = window.DQOpsI18n?.translate(message) || message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 1800);
}

async function api(path, options = {}) {
  if (window.dailyOpsAuthReady) await window.dailyOpsAuthReady;
  let authToken = window.dailyOpsAuth?.token;
  if (window.dailyOpsAuth?.authMode === 'password' && window.dailyOpsAuth?.client) {
    const { data, error } = await window.dailyOpsAuth.client.auth.getSession();
    if (error) throw new Error('Your sign-in could not be refreshed. Please sign in again.');
    authToken = data.session?.access_token || '';
    window.dailyOpsAuth.token = authToken;
  }
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const tenantId = window.dailyOpsAuth?.profile?.tenantId || localStorage.getItem('dqops-tenant-id') || '';
  const response = await fetch(apiUrl(path), {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(tenantId ? { 'X-DQOPS-Tenant': tenantId } : {}),
      ...optionHeaders
    }
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

async function apiBlob(path) {
  if (window.dailyOpsAuthReady) await window.dailyOpsAuthReady;
  let authToken = window.dailyOpsAuth?.token;
  if (window.dailyOpsAuth?.authMode === 'password' && window.dailyOpsAuth?.client) {
    const { data, error } = await window.dailyOpsAuth.client.auth.getSession();
    if (error) throw new Error('Your sign-in could not be refreshed. Please sign in again.');
    authToken = data.session?.access_token || '';
  }
  const tenantId = window.dailyOpsAuth?.profile?.tenantId || localStorage.getItem('dqops-tenant-id') || '';
  const response = await fetch(apiUrl(path), {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(tenantId ? { 'X-DQOPS-Tenant': tenantId } : {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    try { throw new Error(JSON.parse(text).error || text); } catch (error) { if (error instanceof SyntaxError) throw new Error(text || 'Request failed'); throw error; }
  }
  return response.blob();
}

function canUseMaintenanceWorkLog(user = currentUser()) {
  return isMaintenanceTech(user) || isFullAccess(user) || (user.role === 'Area Manager' && maintenanceWorkLog.mode === 'hours-only');
}

function canUseMaintenanceWorkLogReport(user = currentUser()) {
  return !isMaintenanceTech(user) && ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role) && canUseMaintenanceWorkLog(user);
}

function canUseLocationHealth(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
}

function usesAssignedLocations(user = currentUser()) {
  return isFullAccess(user) || isMaintenanceTech(user) || userLocationIds(user).length > 1;
}

function isFullAccess(user = currentUser()) {
  return ['Director of Operations', 'Owner'].includes(user.role);
}

function canUseHistory(user = currentUser()) {
  return user.role !== 'Employee';
}

function canUseManage(user = currentUser()) {
  return roleRank(user.role) >= roleRank('Manager');
}

function canUseManagementReports(user = currentUser()) {
  return user.role !== 'Employee' && !isMaintenanceTech(user);
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
  return roleRank(user.role) >= roleRank('Manager');
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

function canViewLocations(user = currentUser()) {
  return user.role !== 'Employee' && !isMaintenanceTech(user);
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
  // The API already restricts this list to the signed-in user's assigned stores.
  return maintenance.locations.map(location => String(location['Location ID']));
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
  if (actor.role === 'Area Manager' || actor.role === 'Manager') return targetLocations.every(locationId => actorLocations.includes(locationId));
  return false;
}

function manageableUsers(actor = currentUser()) {
  return users.filter(user => canEditUser(user, actor));
}

function allowedAssignableRoles(actor = currentUser()) {
  if (isFullAccess(actor)) return ['Employee', 'Shift Manager', 'Manager', 'Area Manager', maintenanceRole, 'Director of Operations', 'Owner'];
  if (actor.role === 'Area Manager') return ['Employee', 'Shift Manager', 'Manager', 'Area Manager', maintenanceRole];
  if (actor.role === 'Manager') return ['Employee', 'Shift Manager', 'Manager'];
  return [];
}

async function loadState() {
  const authProfile = window.dailyOpsAuth?.profile;
  if (authProfile?.id) {
    currentUserId = authProfile.id;
    localStorage.setItem('dailyops-current-user', currentUserId);
    const authLocations = authProfile.locationIds?.length
      ? authProfile.locationIds
      : [authProfile.locationId].filter(Boolean);
    if (!isFullAccess(authProfile) && authLocations.length && !authLocations.includes(currentLocationId)) {
      currentLocationId = authLocations[0];
      localStorage.setItem('dailyops-current-location', currentLocationId);
    }
  }
  try {
    const state = await api(`/api/state?date=${dateKey}&locationId=${currentLocationId}&historyScope=${historyScope}`);
    applyTenantBranding();
    currentLocationId = state.locationId || state.day?.locationId || currentLocationId;
    localStorage.setItem('dailyops-current-location', currentLocationId);
    day = state.day;
    history = state.history;
    overdue = state.overdue || [];
    temperatureItems = state.temperatureItems || defaultTemperatureItems;
    taskTemplates = state.taskTemplates?.length ? state.taskTemplates : taskTemplates;
    notices = state.notices || [];
    alertSettings = state.alertSettings || alertSettings;
    notificationLogs = state.notificationLogs || notificationLogs;
    managerNotificationPreferences = state.managerNotificationPreferences || managerNotificationPreferences;
    popCampaigns = state.popCampaigns || popCampaigns;
    subscriptionAdmin = { ...subscriptionAdmin, ...(state.subscription || {}) };
    calendarEvents = state.calendarEvents || calendarEvents;
    managementReports = state.managementReports || managementReports;
    if (state.dashboardPreferences?.preferences) {
      dashboardPreferences = state.dashboardPreferences.preferences;
      dashboardPreferencesCustomizable = Boolean(state.dashboardPreferences.customizable);
      companyDashboardPreferences = normalizeClientDashboardPreferences(state.dashboardPreferences.companyDefault || defaultDashboardPreferences());
      companyDashboardDefaultEditable = Boolean(state.dashboardPreferences.companyDefaultEditable);
      if (!dashboardPreferencesApplied) {
        dashboardRange = dashboardPreferences.defaultRange || dashboardRange;
        dashboardLocationId = dashboardPreferences.defaultLocationId || dashboardLocationId;
        dashboardPreferencesApplied = true;
      }
    }
    users = state.users?.length ? state.users : users;
    locations = state.locations?.length ? state.locations : locations;
    if (subscriptionAdmin.canView) {
      subscriptionAdmin = await api(`/api/subscription/admin?tenantId=${encodeURIComponent(subscriptionAdmin.tenantId || '')}`).catch(() => subscriptionAdmin);
    }
    if (subscriptionAdmin.platformAdmin) {
      platformAdminSupport = await api(`/api/platform/admin?tenantId=${encodeURIComponent(subscriptionAdmin.tenantId || '')}`).catch(() => platformAdminSupport);
    }
    if (window.dailyOpsAuth?.profile?.id) {
      if (!users.some(user => user.id === window.dailyOpsAuth.profile.id)) users = [window.dailyOpsAuth.profile, ...users];
      currentUserId = window.dailyOpsAuth.profile.id;
      localStorage.setItem('dailyops-current-user', currentUserId);
    }
    if (!users.some(user => user.id === currentUserId)) currentUserId = users[0].id;
    if (!locations.some(location => location.id === currentLocationId)) currentLocationId = locations[0].id;
    await loadQrCheckpointState();
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
    if (authProfile?.id) {
      if (!users.some(user => user.id === authProfile.id)) users = [authProfile, ...users];
      currentUserId = authProfile.id;
    }
    locations = fallback.locations || locations;
    history = Object.entries(fallback.days[currentLocationId] || {})
      .filter(([, entry]) => entry.complete)
      .map(([date, entry]) => ({ locationId: currentLocationId, date, day: entry }));
    overdue = [];
    apiOnline = false;
    toast(`Live data did not load — ${error.message}`);
  }

  const user = currentUser();
  const allowedLocations = userLocationIds(user);
  if (!usesAssignedLocations(user) && allowedLocations[0] && currentLocationId !== allowedLocations[0]) {
    currentLocationId = allowedLocations[0];
    localStorage.setItem('dailyops-current-location', currentLocationId);
    if (apiOnline) return loadState();
  }

  filterScopedRecords();
  await loadMaintenanceState();
  await loadMaintenanceWorkLogState();
  await loadRolloutState();
  await loadLocationHealthState(true);
  await loadFpcState();
  await loadCalendarState();
  await loadStoreDocumentsState();
  await loadResourcesState();
  await loadReceiptsState();
  await loadInspectionsState();
  await loadSmallwaresState();
  await loadManagementReportsState();
  await loadDashboardState();
  await loadFinancialReportState();
  await loadKioskDevices();
  await loadStoreAlarmState();
  await loadTemperatureStandards();
  render();
  setupDqOpsAgentTools();
  processPendingQrLink();
}

async function loadQrCheckpointState() {
  if (!hostedAuthEnabled()) return;
  try {
    qrCheckpoints = await api(`/api/qr-checkpoints/state?locationId=all&date=${encodeURIComponent(qrCheckpointLogDate)}`);
  } catch (error) {
    qrCheckpoints = { migrationReady: false, canManage: canUseManage(), checkpoints: [], scans: [], error: error.message };
  }
}

async function loadRolloutState() {
  if (!apiOnline) return;
  try { rollout = await api('/api/rollout/state'); }
  catch { rollout = { allowed: false, canManagePermissions: false, sections: [], records: {}, installerUserIds: [], users: [] }; }
}

function renderRollout() {
  if (!$('#rolloutView')) return;
  document.querySelectorAll('[data-view="rolloutView"], [data-section-view="rolloutView"]').forEach(button => { button.style.display = rollout.allowed ? '' : 'none'; });
  if (!rollout.allowed) return;
  const select = $('#rolloutLocation');
  select.innerHTML = locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  if (!locations.some(location => location.id === rolloutLocationId)) rolloutLocationId = locations[0]?.id || 'store-01';
  select.value = rolloutLocationId;
  const record = rollout.records?.[rolloutLocationId] || {};
  const requiredItems = (rollout.sections || []).filter(section => !section.optional).flatMap(section => section.items.map((_, index) => record[`${section.id}:${index}`]?.checked));
  const completed = requiredItems.filter(Boolean).length;
  const percent = requiredItems.length ? Math.round(completed / requiredItems.length * 100) : 0;
  $('#rolloutProgress').textContent = `${percent}% required complete`;
  $('#rolloutSections').innerHTML = (rollout.sections || []).map(section => `<article class="card rollout-section"><div class="section-title"><h3>${escapeHtml(section.name)}</h3><span>${section.optional ? 'Optional' : 'Required'}</span></div><div class="rollout-items">${section.items.map((item, index) => { const saved = record[`${section.id}:${index}`] || {}; return `<label class="rollout-item"><input type="checkbox" data-rollout-section="${escapeHtml(section.id)}" data-rollout-index="${index}" ${saved.checked ? 'checked' : ''}><span><b>${escapeHtml(item)}</b>${saved.updatedAt ? `<small>${escapeHtml(saved.updatedBy || 'Installer')} · ${new Date(saved.updatedAt).toLocaleString()}</small>` : ''}</span></label>`; }).join('')}</div></article>`).join('');
  document.querySelectorAll('[data-rollout-section]').forEach(input => input.addEventListener('change', () => saveRolloutItem(input)));
  $('#rolloutPermissionsCard').hidden = !rollout.canManagePermissions;
  if (rollout.canManagePermissions) $('#rolloutPermissionList').innerHTML = (rollout.users || []).filter(user => !isFullAccess(user)).map(user => `<label class="location-check"><input type="checkbox" value="${escapeHtml(user.id)}" ${(rollout.installerUserIds || []).includes(String(user.id)) ? 'checked' : ''}> ${escapeHtml(user.name)} · ${escapeHtml(user.role)}</label>`).join('') || '<p class="hint">No additional users are available.</p>';
}

async function saveRolloutItem(input) {
  input.disabled = true;
  try { rollout = await api('/api/rollout/item', { method: 'POST', body: JSON.stringify({ locationId: rolloutLocationId, sectionId: input.dataset.rolloutSection, itemIndex: Number(input.dataset.rolloutIndex), checked: input.checked }) }); renderRollout(); }
  catch (error) { input.checked = !input.checked; input.disabled = false; toast(`Rollout item did not save: ${error.message}`); }
}

async function saveRolloutPermissions() {
  try { rollout = await api('/api/rollout/permissions', { method: 'POST', body: JSON.stringify({ userIds: [...document.querySelectorAll('#rolloutPermissionList input:checked')].map(input => input.value) }) }); renderRollout(); toast('Installer access saved'); }
  catch (error) { toast(`Installer access did not save: ${error.message}`); }
}

async function loadTemperatureStandards() {
  if (!apiOnline) return;
  try { temperatureStandards = (await api('/api/temperature-standards')).standards || {}; } catch { temperatureStandards = {}; }
}

async function loadStoreAlarmState() {
  if (!apiOnline || storeAlarmPollBusy) return;
  storeAlarmPollBusy = true;
  try {
    storeAlarms = await api('/api/store-alarms/state');
    renderStoreAlarms();
  } catch (error) {
    console.warn('Store alarm state did not load', error);
  } finally {
    storeAlarmPollBusy = false;
  }
}

function storeAlarmLocationOptions() {
  const allowed = isFullAccess() ? locations : locations.filter(location => userLocationIds().includes(location.id));
  return allowed.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
}

function stopStoreAlarmTone() {
  clearInterval(storeAlarmToneTimer); storeAlarmToneTimer = null;
}

function unlockStoreAlarmAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    storeAlarmAudioContext ||= new AudioCtx();
    storeAlarmAudioContext.resume();
  } catch { /* The visible Enable alarm sound button remains available. */ }
}

function soundStoreAlarmTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    storeAlarmAudioContext ||= new AudioCtx();
    storeAlarmAudioContext.resume();
    const oscillator = storeAlarmAudioContext.createOscillator();
    const gain = storeAlarmAudioContext.createGain();
    oscillator.frequency.value = 880; gain.gain.setValueAtTime(0.18, storeAlarmAudioContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, storeAlarmAudioContext.currentTime + 0.7);
    oscillator.connect(gain); gain.connect(storeAlarmAudioContext.destination); oscillator.start(); oscillator.stop(storeAlarmAudioContext.currentTime + 0.7);
    $('#enableAlarmSoundBtn').hidden = true;
  } catch { $('#enableAlarmSoundBtn').hidden = false; }
}

function startStoreAlarmTone() {
  if (!storeAlarmToneTimer) { soundStoreAlarmTone(); storeAlarmToneTimer = setInterval(soundStoreAlarmTone, 5000); }
}

async function showStoreAlarmNotification(alarm) {
  if (!alarm || alarm.id === lastStoreAlarmNotificationId || !('Notification' in window) || Notification.permission !== 'granted') return;
  lastStoreAlarmNotificationId = alarm.id; sessionStorage.setItem('dqops-last-store-alarm', alarm.id);
  const registration = await navigator.serviceWorker?.ready;
  if (registration) registration.showNotification(`URGENT: ${alarm.locationName}`, { body: `${alarm.reason}. ${alarm.incomplete?.summary || ''}`, icon: '/assets/his-management.png', tag: alarm.id, requireInteraction: true, data: { url: '/' } });
}

function renderStoreAlarms() {
  const admin = $('#storeAlarmAdminCard');
  if (admin) {
    admin.style.display = storeAlarms.canSend ? '' : 'none';
    if (storeAlarms.canSend) {
      const select = $('#storeAlarmLocation'); const selected = select.value; select.innerHTML = storeAlarmLocationOptions();
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
      $('#storeAlarmHistory').innerHTML = (storeAlarms.history || []).length ? storeAlarms.history.map(alarm => `<article class="store-alarm-history-item"><div><b>${escapeHtml(alarm.locationName)} · ${escapeHtml(alarm.status)}</b><p>${escapeHtml(alarm.reason)} · ${new Date(alarm.sentAt).toLocaleString()}</p><small>Sent by ${escapeHtml(alarm.sentBy || '')}${alarm.acknowledgedBy ? ` · Acknowledged by ${escapeHtml(alarm.acknowledgedBy)} at ${new Date(alarm.acknowledgedAt).toLocaleString()}` : ''}${alarm.escalatedAt ? ' · Escalated' : ''}</small></div>${alarm.status === 'Active' ? `<button class="ghost" data-store-alarm-cancel="${escapeHtml(alarm.id)}" type="button">Cancel</button>` : ''}</article>`).join('') : '<p class="hint">No store alarms have been sent.</p>';
    }
  }
  const alarm = storeAlarms.canSend ? null : (storeAlarms.active || []).find(item => item.locationId === currentLocationId) || (storeAlarms.active || [])[0];
  const overlay = $('#storeAlarmOverlay');
  if (!overlay) return;
  overlay.hidden = !alarm;
  document.body.classList.toggle('store-alarm-active', Boolean(alarm));
  if (!alarm) return stopStoreAlarmTone();
  overlay.dataset.alarmId = alarm.id; $('#storeAlarmOverlayTitle').textContent = alarm.reason; $('#storeAlarmOverlayLocation').textContent = alarm.locationName; $('#storeAlarmOverlayMessage').textContent = alarm.message || 'Please acknowledge this alarm and complete the required work.'; $('#storeAlarmOverlaySummary').textContent = alarm.incomplete?.summary || '';
  $('#storeAlarmOverlayMissing').innerHTML = (alarm.incomplete?.missing || []).slice(0, 12).map(item => `<p>• ${escapeHtml(item.label)}</p>`).join('') + ((alarm.incomplete?.missing || []).length > 12 ? `<p><b>+ ${(alarm.incomplete.missing.length - 12)} more items</b></p>` : '');
  startStoreAlarmTone(); showStoreAlarmNotification(alarm);
}

async function enableTabletNotifications() {
  if (!('Notification' in window)) return toast('Notifications are not supported on this device');
  const permission = await Notification.requestPermission();
  toast(permission === 'granted' ? 'Tablet notifications enabled' : 'Notification permission was not enabled');
}

async function sendStoreAlarm() {
  if (!confirm(`Push a blocking alarm to ${$('#storeAlarmLocation').selectedOptions[0]?.textContent || 'this store'} now?`)) return;
  try {
    storeAlarms = await api('/api/store-alarms/send', { method: 'POST', body: JSON.stringify({ locationId: $('#storeAlarmLocation').value, reason: $('#storeAlarmReason').value, message: $('#storeAlarmMessage').value, escalateAfterMinutes: Number($('#storeAlarmEscalation').value) }) });
    $('#storeAlarmMessage').value = ''; renderStoreAlarms(); toast('Store tablet alarm pushed');
  } catch (error) { toast(`Alarm was not sent: ${error.message}`); }
}

async function acknowledgeStoreAlarm() {
  const id = $('#storeAlarmOverlay').dataset.alarmId;
  try {
    const alarm = (storeAlarms.active || []).find(item => item.id === id);
    storeAlarms = await api('/api/store-alarms/acknowledge', { method: 'POST', body: JSON.stringify({ id }) });
    renderStoreAlarms(); switchView('todayView'); toast(`Alarm acknowledged — please complete the remaining ${alarm?.incomplete?.missingTemps?.length ? 'temperature and checklist' : 'checklist'} work`);
  } catch (error) { toast(`Alarm was not acknowledged: ${error.message}`); }
}

async function loadKioskDevices() {
  if (!apiOnline || !canUseManage()) return;
  try {
    kioskDevices = (await api('/api/kiosk/devices')).devices || [];
  } catch {
    kioskDevices = [];
  }
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
    maintenance = { locations: [], equipment: [], workOrders: [], workOrderUpdates: [], workOrderUpdatesReady: false, pmSchedule: [], vendors: [], lists: {} };
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
  return temperatureListNames().filter(list => temperatureItems[list]?.requiredDaily !== false)
    .reduce((sum, list) => sum + Object.values(temperatureAreasForList(list)).reduce((itemSum, items) => itemSum + items.length, 0), 0) * tempSessions.length;
}

function isWeeklyCleaningTask(task = {}) {
  return String(task.section || '').trim().toLowerCase().includes('weekly cleaning');
}

function progressMetric(completed = 0, total = 0) {
  return {
    completed,
    remaining: Math.max(total - completed, 0),
    total,
    percent: total ? Math.round((completed / total) * 100) : 0
  };
}

function localDashboardMetrics() {
  const currentTasks = day.tasks.length ? day.tasks : baseTasks;
  const weeklyTasks = currentTasks.filter(isWeeklyCleaningTask);
  const standardTasks = currentTasks.filter(task => !isWeeklyCleaningTask(task));
  const requiredTemps = new Set();
  temperatureListNames().filter(list => temperatureItems[list]?.requiredDaily !== false).forEach(list => Object.entries(temperatureAreasForList(list)).forEach(([area, items]) => {
    items.forEach(item => tempSessions.forEach(session => requiredTemps.add(`${list}|${area}|${item}|${session}`)));
  }));
  const loggedTemps = new Set(day.temps.map(temp => `${readingList(temp)}|${temp.area}|${temp.item}|${readingSession(temp)}`));
  const tempDone = [...requiredTemps].filter(key => loggedTemps.has(key)).length;
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
    taskLists: progressMetric(standardTasks.filter(task => task.done).length, standardTasks.length),
    weeklyCleaning: progressMetric(weeklyTasks.filter(task => task.done).length, weeklyTasks.length),
    tempLogs: progressMetric(tempDone, tempRequirementTotal()),
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
  const visibleOrderIds = new Set(maintenance.workOrders.map(row => String(row['Work Order ID'])));
  maintenance.workOrderUpdates = (maintenance.workOrderUpdates || []).filter(update => visibleOrderIds.has(String(update.workOrderId)));
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
    .filter(user => user.active !== false && (user.maintenance || isMaintenanceTech(user) || user.id === selectedId))
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

async function loadFinancialReportState() {
  if (!apiOnline || !isFullAccess() || !subscriptionFeatureEnabled('advanced_reports')) {
    financialReportState = { allowed: false, migrationReady: true, canImport: false, reportCount: 0, totals: {}, byLocation: [], standouts: [], imports: [], mappings: {}, reports: [], emailImports: [], emailAutomation: { configured: false, inboundAddress: '' } };
    return;
  }
  try {
    financialReportState = await api(`/api/financial-reports/state?range=${encodeURIComponent(dashboardRange)}&locationId=all`);
  } catch (error) {
    financialReportState = { allowed: true, migrationReady: false, canImport: true, reportCount: 0, totals: {}, byLocation: [], standouts: [], imports: [], mappings: {}, reports: [], emailImports: [], emailAutomation: { configured: false, inboundAddress: '' }, message: error.message };
  }
}

function formatClockTime(value = '') {
  const text = String(value || '').trim();
  if (!text || /\b(?:AM|PM)\b/i.test(text)) return text;
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!clock) return text;
  return new Date(2000, 0, 1, Number(clock[1]), Number(clock[2]))
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function temperatureListScheduledToday(listName, locationId = currentLocationId, when = new Date()) {
  const schedules = temperatureItems[listName]?.deliveryDaysByLocation;
  if (!schedules || !Object.prototype.hasOwnProperty.call(schedules, locationId)) return true;
  const scheduledDays = Array.isArray(schedules[locationId]) ? schedules[locationId] : [];
  return scheduledDays.includes(weekdayOptions[when.getDay()]);
}

function visibleTemperatureListNames() {
  return temperatureListNames().filter(list => temperatureListScheduledToday(list));
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

function isOverrunReading(list, item) {
  return String(list || '').trim().toLowerCase() === 'chill' && String(item || '').trim().toLowerCase() === 'overrun';
}

function temperatureReadingUnit(reading = {}) {
  if (reading.unit === '%') return '%';
  return isOverrunReading(readingList(reading), reading.item) ? '%' : '°F';
}

function formattedTemperatureReading(reading = {}) {
  return `${escapeHtml(reading.value)}${temperatureReadingUnit(reading)}`;
}

let dqOpsAgentTools = [];
let dqOpsWebMcpRegistration = { attempted: false, available: false, names: [], controller: null };

function assignedAgentLocation(locationReference = '', { requireExplicitForMultiple = false } = {}) {
  return window.DqOpsAgentTools.resolveAssignedLocation(
    locations,
    accessibleLocationIds(),
    locationReference,
    { requireExplicitForMultiple, fallbackLocationId: currentLocationId }
  );
}

async function agentDailyOpsContext(locationReference = '') {
  const location = assignedAgentLocation(locationReference, { requireExplicitForMultiple: true });
  if (String(location.id) === String(currentLocationId)) {
    return { location, daily: day, definitions: temperatureItems };
  }
  if (!apiOnline) throw new Error('Live data is required to review a different location.');
  const state = await api(`/api/state?date=${dateKey}&locationId=${encodeURIComponent(location.id)}&historyScope=location`);
  return {
    location,
    daily: state.day || { locationId: location.id, tasks: [], temps: [] },
    definitions: state.temperatureItems || temperatureItems
  };
}

async function agentDueTasks({ location: locationReference = '', scope = 'now', category = 'all', area = '', section = '' } = {}) {
  if (!canUseDailyOps() || !subscriptionFeatureEnabled('daily_operations')) throw new Error('Task Lists are not available to this account.');
  const context = await agentDailyOpsContext(locationReference);
  const requestedArea = String(area || '').trim().toLowerCase();
  const due = (context.daily.tasks || [])
    .filter(task => !task.done)
    .filter(task => scope === 'today' || taskMatchesCurrentTime(task))
    .filter(task => category === 'all' || taskCategory(task) === category)
    .filter(task => !requestedArea || [task.area, taskCategory(task)].some(value => String(value || '').trim().toLowerCase() === requestedArea))
    .filter(task => !section || String(task.section || '') === section)
    .map(task => ({
      name: task.name,
      section: task.section || 'All Day',
      category: taskCategory(task),
      area: task.area || taskCategory(task),
      photoRequired: Boolean(task.photo),
      qrRequired: Boolean(task.qrCheckpointId || task.requiresQr)
    }));
  return { date: dateKey, location: context.location.name, scope, category, area: area || 'all', dueCount: due.length, items: due.slice(0, 25), moreItems: Math.max(due.length - 25, 0) };
}

function agentTemperatureListDueToday(listName, definitions, locationId) {
  const definition = definitions[listName] || {};
  const schedules = definition.deliveryDaysByLocation;
  if (!schedules || !Object.prototype.hasOwnProperty.call(schedules, locationId)) return definition.requiredDaily !== false;
  const scheduledDays = Array.isArray(schedules[locationId]) ? schedules[locationId] : [];
  return scheduledDays.includes(weekdayOptions[new Date().getDay()]);
}

async function agentDueTemperatures({ location: locationReference = '', session = selectedTempSession, list = '' } = {}) {
  if (!canUseDailyOps() || !subscriptionFeatureEnabled('daily_operations')) throw new Error('Temperature Logs are not available to this account.');
  if (!tempSessions.includes(session)) throw new Error('Choose the Day or Afternoon temperature session.');
  const context = await agentDailyOpsContext(locationReference);
  const definitions = context.definitions || {};
  const listFormat = Object.values(definitions).some(value => value?.areas);
  const listNames = listFormat ? Object.keys(definitions) : ['Grill', 'Chill'];
  const areasForList = listName => listFormat ? (definitions[listName]?.areas || {}) : definitions;
  const dueLists = listNames.filter(listName => agentTemperatureListDueToday(listName, definitions, context.location.id));
  if (list && !dueLists.includes(list)) throw new Error('That temperature list is not scheduled for the selected location today.');
  const missing = dueLists
    .filter(listName => !list || listName === list)
    .flatMap(listName => Object.entries(areasForList(listName)).flatMap(([area, items]) => items
      .filter(item => !(context.daily.temps || []).some(reading => readingList(reading) === listName && readingSession(reading) === session && reading.area === area && reading.item === item))
      .map(item => ({ list: listName, area, item, unit: isOverrunReading(listName, item) ? '%' : '°F' }))));
  return {
    date: dateKey,
    location: context.location.name,
    session,
    entryLocked: session === 'Day' && !dayTempsAvailable(),
    dueCount: missing.length,
    items: missing.slice(0, 25),
    moreItems: Math.max(missing.length - 25, 0)
  };
}

function agentOpenHelpSection({ section } = {}) {
  if (!canUseManage()) throw new Error('Help is available to Managers and above in this version of HIS OPS.');
  const helpSections = {
    contents: 'helpContents', navigation: 'help-navigation', dashboard: 'help-dashboard', tasks: 'help-task-lists',
    temperatures: 'help-temp-logs', maintenance: 'help-maintenance', incidents: 'help-management-reports',
    users: 'help-users', notifications: 'help-notices', 'agent-tools': 'help-agent-tools'
  };
  const targetId = helpSections[section];
  if (!targetId) throw new Error('That Help topic is not available.');
  switchView('helpView');
  window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  return { opened: section, savedDataChanged: false };
}

function setSelectIfAvailable(selector, value) {
  if (!value) return false;
  const select = $(selector);
  const option = [...(select?.options || [])].find(entry => entry.value.toLowerCase() === String(value).toLowerCase());
  if (!option) return false;
  select.value = option.value;
  return true;
}

async function agentDraftMaintenanceRequest({ description, location: locationReference = '', location_id: locationId = '', category = '', priority = 'Medium', target_date: targetDate = '' } = {}) {
  if (!canUseHub() || !subscriptionFeatureEnabled('maintenance')) throw new Error('Maintenance requests are not available to this account.');
  if (!String(description || '').trim()) throw new Error('Enter a maintenance issue description.');
  const location = assignedAgentLocation(locationReference || locationId, { requireExplicitForMultiple: true });
  maintenanceLocationId = location.id;
  localStorage.setItem('maintenance-location', maintenanceLocationId);
  await loadMaintenanceState();
  renderMaintenance();
  switchView('maintenanceView');
  $('#createWorkOrderCard')?.classList.remove('collapsed');
  $('#woIssue').value = String(description).trim().slice(0, 2000);
  $('#woTargetDate').value = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : '';
  setSelectIfAvailable('#woCategory', category);
  setSelectIfAvailable('#woPriority', priority);
  $('#createWorkOrderCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Maintenance draft ready — review it before creating the work order');
  return { draftReady: true, location: location.name, submitted: false, reviewRequired: true };
}

function agentDraftIncidentReport({ title, details, location: locationReference = '', location_id: locationId = '', issue_type: issueType = '', severity = 'Medium', immediate_action: immediateAction = '', amount } = {}) {
  if (!canUseManagementReports() || !subscriptionFeatureEnabled('advanced_reports')) throw new Error('Incident Reports are not available to this account.');
  if (!String(title || '').trim() || !String(details || '').trim()) throw new Error('Enter both an incident subject and the facts.');
  const location = assignedAgentLocation(locationReference || locationId, { requireExplicitForMultiple: true });
  switchView('managementReportsView');
  renderManagementReports();
  $('#managementReportLocation').value = location.id;
  $('#managementReportTitle').value = String(title).trim().slice(0, 120);
  $('#managementReportDetails').value = String(details).trim().slice(0, 4000);
  $('#managementReportAction').value = String(immediateAction || '').trim().slice(0, 2000);
  $('#managementReportAmount').value = Number.isFinite(Number(amount)) && Number(amount) >= 0 ? String(Number(amount)) : '';
  setSelectIfAvailable('#managementReportType', issueType);
  setSelectIfAvailable('#managementReportSeverity', severity);
  document.querySelector('.management-report-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Incident draft ready — review it before submitting the report');
  return { draftReady: true, location: location.name, submitted: false, reviewRequired: true };
}

function updateAgentToolsHelpStatus(message, state = '') {
  const status = $('#webMcpStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function setupDqOpsAgentTools() {
  if (dqOpsWebMcpRegistration.attempted || !window.DqOpsAgentTools || !currentUser()?.id) return;
  dqOpsWebMcpRegistration.attempted = true;
  dqOpsAgentTools = window.DqOpsAgentTools.createToolDefinitions({
    getDueTasks: agentDueTasks,
    getDueTemperatures: agentDueTemperatures,
    openHelpSection: agentOpenHelpSection,
    draftMaintenanceRequest: agentDraftMaintenanceRequest,
    draftIncidentReport: agentDraftIncidentReport
  });
  window.HISOpsAgent = {
    listTools: () => dqOpsAgentTools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
    executeTool: (name, args) => window.DqOpsAgentTools.executeTool(dqOpsAgentTools, name, args)
  };
  try {
    dqOpsWebMcpRegistration = { attempted: true, ...(await window.DqOpsAgentTools.registerWebMcpTools(document, dqOpsAgentTools)) };
    updateAgentToolsHelpStatus(
      dqOpsWebMcpRegistration.available
        ? `Ready in this browser · ${dqOpsWebMcpRegistration.names.length} safe tools available`
        : 'The shared agent tools are ready; this browser does not currently expose WebMCP.',
      dqOpsWebMcpRegistration.available ? 'ready' : 'unsupported'
    );
  } catch (error) {
    console.warn('HIS OPS WebMCP tools did not register', error);
    updateAgentToolsHelpStatus('WebMCP is not active in this browser. Normal HIS OPS features are unaffected.', 'error');
  }
}

function taskSectionProgress(section) {
  const tasks = (day.tasks || []).filter(task => task.section === section && taskCategory(task) === selectedTaskCategory && taskMatchesCurrentTime(task));
  const done = tasks.filter(task => task.done).length;
  return { done, total: tasks.length };
}

function tempRequirementComplete() {
  return temperatureListNames().filter(list => temperatureItems[list]?.requiredDaily !== false).every(list =>
    Object.entries(temperatureAreasForList(list)).every(([area, items]) => items.every(item => tempSessions.every(session =>
      day.temps.some(temp => readingList(temp) === list && temp.area === area && temp.item === item && readingSession(temp) === session)
    )))
  );
}

function render() {
  const activeUser = currentUser();
  const availableTenants = window.dailyOpsAuth?.availableTenants || [];
  if ($('#tenantSwitchWrap')) {
    $('#tenantSwitchWrap').hidden = availableTenants.length < 2;
    $('#tenantSwitch').innerHTML = availableTenants.map(tenant => `<option value="${escapeHtml(tenant.id)}" ${tenant.id === window.dailyOpsAuth?.profile?.tenantId ? 'selected' : ''}>${escapeHtml(tenant.name || tenant.appName || tenant.id)}</option>`).join('');
  }
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
      <article class="card task task-clickable ${task.done ? 'done' : ''} ${task.pushed ? 'urgent' : ''} ${task.qrCheckpointId ? 'qr-required-task' : ''} ${task.managerPrep || task.crewPrep ? 'prep-task' : ''}" data-task-card="${escapeHtml(task.id)}" role="button" tabindex="0" aria-label="${task.qrCheckpointId && !task.done ? 'Scan checkpoint to complete' : task.done ? 'Mark incomplete' : 'Mark complete'}: ${escapeHtml(task.name)}">
        <input type="checkbox" data-check="${task.id}" ${task.done ? 'checked' : ''} ${(task.qrCheckpointId && !task.done) || task.photo && !task.photoUrl && !task.photoData ? 'disabled' : ''}>
        <div>
          <div class="task-name">${escapeHtml(task.name)}</div>
          ${task.area ? `<span class="task-area-badge">${escapeHtml(task.area)}</span>` : ''}
          ${task.done && task.completedBy ? `<p class="task-completed-by">Completed by ${escapeHtml(task.completedBy)}${task.completedAt ? ` · ${escapeHtml(new Date(task.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : ''}</p>` : ''}
          ${prepDetails}
          ${task.pushed ? '<span class="urgent-label">MANAGER ADDED</span>' : ''}
          ${task.qrCheckpointId ? `<p class="qr-required-label">▣ ${task.done ? 'Completed at' : 'Scan required at'} ${escapeHtml(task.qrCheckpointName || 'assigned checkpoint')}</p>` : ''}
          ${task.snoozedFrom ? `<p class="hint">Snoozed from ${escapeHtml(prettyDate(task.snoozedFrom))}${task.snoozedBy ? ` by ${escapeHtml(task.snoozedBy)}` : ''}</p>` : ''}
        </div>
        <div class="task-actions">
          ${task.qrCheckpointId && !task.done ? `<button class="qr-task-scan-btn" data-qr-task="${escapeHtml(task.id)}" type="button">Scan QR</button>` : ''}
          ${task.photo ? `<button class="photo-btn ${task.photoUrl || task.photoData ? 'photo-ok' : ''}" data-photo="${task.id}">${task.photoUrl || task.photoData ? '✓ Photo' : '📷 Required'}</button>` : ''}
          ${canUseManage(activeUser) && !task.done && !task.managerPrep && !task.crewPrep ? `<button class="ghost snooze-btn" data-snooze-task="${task.id}" type="button">Snooze</button>` : ''}
        </div>
      </article>
    `;
  }).join('') : `<article class="card"><p class="hint">No ${escapeHtml(selectedTaskCategory.toLowerCase())} tasks are due in this time window.</p></article>`;

  if (!dayTempsAvailable(activeUser) && selectedTempSession === 'Day') selectedTempSession = 'Afternoon';
  const tempLists = visibleTemperatureListNames();
  if (!tempLists.includes(selectedTempList)) selectedTempList = tempLists[0] || 'Grill';
  $('#tempListTabs').innerHTML = tempLists.map(list => `
    <button class="${list === selectedTempList ? 'active' : ''}" data-temp-list="${escapeHtml(list)}">${escapeHtml(list)}</button>
  `).join('');
  $('#tempSessionTabs').innerHTML = tempSessions.filter(session => session !== 'Day' || dayTempsAvailable(activeUser)).map(session => `
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
              ${readings.map(reading => `<span class="reading-chip ${reading.correctiveAction ? 'reading-out-of-range' : ''}">${formattedTemperatureReading(reading)} · ${escapeHtml(formatClockTime(reading.time))}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}${reading.correctiveAction ? ` · ${escapeHtml(reading.correctiveAction)}` : ''}</span>`).join('')}
              ${readings.length < 1 ? `<span class="reading-due">due for ${escapeHtml(selectedTempSession)}</span>` : ''}
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `).join('');
  const additionalReadings = (day.temps || []).filter(temp => readingList(temp) === 'Additional' && readingSession(temp) === selectedTempSession);
  $('#additionalTempList').innerHTML = additionalReadings.length ? `
    <div class="temp-group additional-temp-group"><h4>Additional / non-listed temperatures</h4>
      ${additionalReadings.map(reading => `<div class="temp-entry additional-temp-entry"><span>${escapeHtml(reading.item)}</span><div class="reading-chips"><span class="reading-chip">${escapeHtml(reading.value)}°F · ${escapeHtml(formatClockTime(reading.time))}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</span></div></div>`).join('')}
    </div>` : '';
  const receivingIssues = (day.receivingIssues || []).filter(issue => issue.list === selectedTempList);
  if ($('#receivingIssueTools')) $('#receivingIssueTools').hidden = selectedTempList !== 'Receiving';
  if ($('#receivingIssueList')) $('#receivingIssueList').innerHTML = selectedTempList === 'Receiving' && receivingIssues.length ? `
    <div class="temp-group receiving-issue-group"><h4>Reported receiving issues</h4>
      ${receivingIssues.map(issue => `<article class="receiving-issue"><b>${escapeHtml(issue.note || 'Photo-only issue')}</b><p>${escapeHtml(formatClockTime(issue.time))} · ${escapeHtml(issue.userName || '')}</p>${issue.photoUrl ? `<a href="${escapeHtml(fullPhotoUrl(issue.photoUrl))}" target="_blank" rel="noopener">View photo</a>` : issue.photoData ? `<a href="${escapeHtml(issue.photoData)}" target="_blank" rel="noopener">View photo</a>` : ''}</article>`).join('')}
    </div>` : '';

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
  renderTemperatureHistoryControls(visibleLocations, aboveStore);
  renderHistory();
  renderTaskTemplates();
  renderQrCheckpoints();
  renderAlertRules();
  renderManagerNotificationPreferences();
  renderSubscriptionAdmin();
  renderPlatformAdmin();
  renderPopCampaigns();
  renderNotificationLogs();
  renderTemperatureStandards();
  renderInStoreReminders();
  renderStoreAlarms();
  renderNotices();
  renderDashboardAlerts(visibleLocations);
  renderMaintenance();
  renderMaintenanceWorkLog();
  renderLocationHealth();
  renderRollout();
  renderFpc();
  renderStoreDocuments();
  renderResources();
  renderReceipts();
  renderInspections();
  renderSmallwares();
  renderManagementReports();
  renderFinancialReportImport();
}

function temperatureStandardKey(list, area, item) { return `${list}|${area}|${item}`; }
function temperatureStandard(list, area, item) { return temperatureStandards[temperatureStandardKey(list, area, item)] || {}; }
function dayTempsAvailable() { return new Date().getHours() < 14; }

function inStoreRuleIncomplete(rule) {
  if (rule.type === 'task') return (day.tasks || []).some(task => task.section === rule.target && !task.done);
  const [list, session, area = '', item = ''] = String(rule.target || '').split('|');
  const required = Object.entries(temperatureAreasForList(list)).flatMap(([entryArea, items]) => items.map(entryItem => ({ area: entryArea, item: entryItem })))
    .filter(entry => (!area || entry.area === area) && (!item || entry.item === item));
  return required.some(entry => !(day.temps || []).some(temp => readingList(temp) === list && readingSession(temp) === session && temp.area === entry.area && temp.item === entry.item));
}

function renderInStoreReminders() {
  const now = new Date(); const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const reminders = (alertSettings.rules || []).filter(rule => rule.active !== false && (rule.channels || []).includes('in-app'))
    .filter(rule => rule.locationId === 'all' || rule.locationId === currentLocationId)
    .filter(rule => !(rule.roles || []).length || rule.roles.includes(currentUser().role))
    .filter(rule => { const [h, m] = String(rule.dueTime || '23:59').split(':').map(Number); return currentMinutes >= h * 60 + m; })
    .filter(inStoreRuleIncomplete);
  const html = reminders.map(rule => `<article class="card in-store-reminder"><h3>Reminder: ${escapeHtml(rule.name)}</h3><p>${escapeHtml(rule.targetLabel || rule.target)} was due by ${escapeHtml(formatClockTime(rule.dueTime))} and is not complete.</p></article>`).join('');
  if ($('#tempInStoreReminders')) $('#tempInStoreReminders').innerHTML = html;
  if ($('#taskInStoreReminders')) $('#taskInStoreReminders').innerHTML = html;
}

function renderTemperatureStandards() {
  if (!$('#temperatureStandardsList')) return;
  $('#temperatureStandardsCard').style.display = canUseManage() ? '' : 'none';
  if (!canUseManage()) return;
  $('#temperatureStandardsList').innerHTML = temperatureListNames().map(list => {
    const items = Object.entries(temperatureAreasForList(list)).flatMap(([area, names]) => names.map(item => ({ area, item })));
    return temperatureLogEditorHtml(list, temperatureItems[list]?.requiredDaily !== false, items);
  }).join('');
}

function temperatureItemEditorHtml(list, area, item) {
  const standard = temperatureStandard(list, area, item);
  const unit = isOverrunReading(list, item) ? '%' : '°F';
  return `<div class="temperature-item-editor" data-temperature-item><label>Item name<input data-temp-item-name value="${escapeHtml(item)}" placeholder="Product or equipment"></label><label>Minimum ${unit}<input data-standard-min type="number" step="0.1" value="${standard.min ?? ''}"></label><label>Maximum ${unit}<input data-standard-max type="number" step="0.1" value="${standard.max ?? ''}"></label><label>Too-low actions<textarea data-standard-below placeholder="One per line">${escapeHtml((standard.belowActions || []).join('\n'))}</textarea></label><label>Too-high actions<textarea data-standard-above placeholder="One per line">${escapeHtml((standard.aboveActions || []).join('\n'))}</textarea></label><div class="temperature-item-actions"><button class="ghost" data-temp-item-move="up" type="button" aria-label="Move up">↑</button><button class="ghost" data-temp-item-move="down" type="button" aria-label="Move down">↓</button><button class="danger" data-temp-item-remove type="button">Remove</button></div></div>`;
}

function temperatureLogEditorHtml(list = '', required = true, items = []) {
  const schedules = temperatureItems[list]?.deliveryDaysByLocation || {};
  const scheduleEditor = list === 'Receiving' ? `<details class="delivery-schedule-editor"><summary><b>Truck delivery days by location</b></summary><p class="hint">Receiving appears only on checked delivery days.</p>${locations.map(location => `<div class="delivery-location-row" data-delivery-location="${escapeHtml(location.id)}"><b>${escapeHtml(location.name)}</b><div class="delivery-day-checks">${weekdayOptions.map(dayName => `<label class="location-check"><input type="checkbox" value="${dayName}" ${(schedules[location.id] || []).includes(dayName) ? 'checked' : ''}> ${dayName.slice(0, 3)}</label>`).join('')}</div></div>`).join('')}</details>` : '';
  return `<details class="temperature-log-editor" open><summary><b>${escapeHtml(list || 'New temperature log')}</b><span>${items.length} item${items.length === 1 ? '' : 's'}</span></summary><div class="temperature-log-editor-body"><div class="temperature-log-head"><label>Log name<input data-temp-log-name value="${escapeHtml(list)}" placeholder="e.g. Grill"></label><label class="check"><input data-temp-log-required type="checkbox" ${required ? 'checked' : ''}> Required Day and Afternoon</label><button class="danger" data-temp-log-remove type="button">Delete log</button></div>${scheduleEditor}<div data-temp-items>${items.map(({ area, item }) => temperatureItemEditorHtml(list, area, item)).join('')}</div><button class="ghost" data-temp-item-add type="button">+ Add item</button></div></details>`;
}

async function loadLocationHealthState(loadSnapshots = false) {
  if (!apiOnline || !canUseLocationHealth()) {
    locationHealth = { configured: false, cameras: [], mappings: {}, canManage: false, message: '', thermostats: [], thermostatConfigured: false, thermostatMessage: '' };
    return;
  }
  let cameraState = { configured: false, cameras: [], mappings: {}, canManage: false, message: '' };
  let thermostatState = { configured: false, devices: [], message: '' };
  try {
    [cameraState, thermostatState] = await Promise.all([
      api('/api/location-health/cameras').catch(error => ({ configured: true, cameras: [], mappings: {}, canManage: false, message: error.message || 'UniFi cameras did not load.' })),
      api('/api/location-health/thermostats').catch(error => ({ configured: true, devices: [], message: error.message || 'Thermostats did not load.' }))
    ]);
    locationHealth = { ...cameraState, thermostats: thermostatState.devices || [], thermostatCommands: thermostatState.commands || [], thermostatCanControl: thermostatState.canControl === true, thermostatConfigured: thermostatState.configured, thermostatMessage: thermostatState.message || '', thermostatRefreshedAt: thermostatState.refreshedAt };
    if (loadSnapshots && cameraState.configured) {
      await Promise.all((cameraState.cameras || []).map(async camera => {
        try {
          const blob = await apiBlob(`/api/location-health/camera-snapshot?cameraId=${encodeURIComponent(camera.id)}&v=${Date.now()}`);
          const previous = locationHealthSnapshots.get(camera.id);
          if (previous) URL.revokeObjectURL(previous);
          locationHealthSnapshots.set(camera.id, URL.createObjectURL(blob));
        } catch {
          locationHealthSnapshots.delete(camera.id);
        }
      }));
    }
  } catch (error) {
    locationHealth = { configured: true, cameras: [], mappings: {}, canManage: false, message: error.message || 'Location Health did not load.', thermostats: [], thermostatConfigured: false, thermostatMessage: error.message || '' };
  }
}

async function loadMaintenanceWorkLogState() {
  const user = currentUser();
  if (!apiOnline || ![maintenanceRole, 'Area Manager', 'Director of Operations', 'Owner'].includes(user.role)) return;
  try {
    maintenanceWorkLog = await api('/api/maintenance-log/state');
  } catch {
    maintenanceWorkLog = { mode: 'none', canEdit: false, canManagePermissions: false, entries: [], technicians: [], areaManagers: [], permissions: { areaManagerIds: [] } };
  }
}

function setPie(selector, percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  $(selector).style.setProperty('--pct', value);
}

function canCustomizeDashboard(user = currentUser()) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role);
}

function normalizeClientDashboardPreferences(value = {}) {
  const allIds = dashboardWidgetCatalog.map(widget => widget.id);
  const requiredIds = dashboardWidgetCatalog.filter(widget => widget.required).map(widget => widget.id);
  const legacyOperationsVisible = Array.isArray(value.visible) && value.visible.includes('operations');
  const migratedVisible = legacyOperationsVisible ? [...value.visible, 'taskLists', 'weeklyCleaning', 'tempLogs'] : value.visible;
  const visible = Array.isArray(migratedVisible) ? [...new Set([...migratedVisible.filter(id => allIds.includes(id)), ...requiredIds])] : allIds;
  const migratedOrder = Array.isArray(value.order) ? value.order.flatMap(id => id === 'operations' ? ['taskLists', 'weeklyCleaning', 'tempLogs'] : id) : [];
  const suppliedOrder = migratedOrder.filter(id => allIds.includes(id));
  return { visible: [...new Set(visible)], order: [...new Set([...suppliedOrder, ...allIds])], defaultRange: ['day', 'week', 'month'].includes(value.defaultRange) ? value.defaultRange : 'day', defaultLocationId: String(value.defaultLocationId || 'all') };
}

function renderDashboardWidgetSummaries() {
  if ($('#dashboardIncidentSummary')) {
    const openReports = (managementReports.reports || []).filter(report => report.status !== 'Resolved');
    const latest = openReports[0];
    $('#dashboardIncidentSummary').innerHTML = `<p class="dashboard-summary-number">${openReports.length}</p><p class="hint">open authorized report${openReports.length === 1 ? '' : 's'}</p>${latest ? `<p><b>${escapeHtml(latest.title)}</b><br><span class="hint">${escapeHtml(latest.locationName || locationName(latest.locationId))} · ${escapeHtml(latest.severity || 'Medium')}</span></p>` : ''}`;
  }
  if ($('#dashboardInspectionSummary')) {
    const allowed = dashboardLocationId === 'all' ? accessibleLocationIds() : [dashboardLocationId];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const recent = (inspections.inspections || []).filter(record => allowed.includes(record.locationId) && new Date(`${record.date}T12:00:00`) >= cutoff);
    const average = recent.length ? Math.round(recent.reduce((sum, record) => sum + (Number(record.score) || 0), 0) / recent.length) : null;
    $('#dashboardInspectionSummary').innerHTML = `<p class="dashboard-summary-number">${average === null ? '—' : `${average}%`}</p><p class="hint">${recent.length ? `${recent.length} inspection${recent.length === 1 ? '' : 's'} in the last 3 months` : 'No inspections in the last 3 months'}</p>`;
  }
}

function financialCurrency(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return number.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: Math.abs(number) < 100 ? 2 : 0, maximumFractionDigits: Math.abs(number) < 100 ? 2 : 0 });
}

function financialPercent(value, { fraction = false, signed = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value) * (fraction ? 100 : 1);
  return `${signed && number > 0 ? '+' : ''}${number.toFixed(1)}%`;
}

function renderDashboardFinancials() {
  const container = $('#dashboardFinancialMetrics');
  if (!container) return;
  const financials = dashboardMetrics.financials || { allowed: false, migrationReady: true, reportCount: 0, totals: {}, byLocation: [], standouts: [] };
  const coverage = $('#dashboardFinancialCoverage');
  const standouts = $('#dashboardFinancialStandouts');
  const details = $('#dashboardFinancialLocations');
  if (!financials.allowed) {
    coverage.textContent = 'Manager access';
    container.innerHTML = '<p class="hint">Financial performance is available to Managers and above.</p>';
    standouts.innerHTML = '';
    details.hidden = true;
    return;
  }
  if (!financials.migrationReady) {
    coverage.textContent = 'Setup required';
    container.innerHTML = `<p class="hint">${escapeHtml(financials.message || 'Financial reporting needs to be set up in Supabase.')}</p>`;
    standouts.innerHTML = '';
    details.hidden = true;
    return;
  }
  if (!financials.reportCount) {
    coverage.textContent = 'No reports';
    container.innerHTML = '<p class="hint">No financial recap has been imported for this time period and location selection.</p>';
    standouts.innerHTML = '';
    details.hidden = true;
    return;
  }
  const totals = financials.totals || {};
  coverage.textContent = `${financials.reportCount} store-day${financials.reportCount === 1 ? '' : 's'}`;
  const salesTone = totals.salesVsLyPercent === null ? '' : totals.salesVsLyPercent < 0 ? 'metric-attention' : 'metric-positive';
  const laborTone = totals.laborPercent !== null && totals.laborPercent >= 0.25 ? 'metric-attention' : '';
  container.innerHTML = `
    <div class="financial-metric"><span>Net sales</span><b>${financialCurrency(totals.netSales)}</b><small>${financials.start === financials.end ? escapeHtml(financials.start) : `${escapeHtml(financials.start)} through ${escapeHtml(financials.end)}`}</small></div>
    <div class="financial-metric ${salesTone}"><span>Sales vs last year</span><b>${financialPercent(totals.salesVsLyPercent, { signed: true })}</b><small>${financialCurrency(totals.comparisonNetSales)} vs ${financialCurrency(totals.netSalesLy)}</small></div>
    <div class="financial-metric ${laborTone}"><span>Labor</span><b>${financialPercent(totals.laborPercent, { fraction: true })}</b><small>${financialCurrency(totals.laborCost)} · ${Number(totals.laborHours || 0).toFixed(1)} hours</small></div>
    <div class="financial-metric"><span>Transactions</span><b>${Number(totals.transactions || 0).toLocaleString()}</b><small>${financialPercent(totals.transactionChangePercent, { signed: true })} vs last year</small></div>
    <div class="financial-metric"><span>Average ticket</span><b>${financialCurrency(totals.averageTicket)}</b><small>${financialCurrency(totals.digitalSales)} digital sales</small></div>`;
  const comparison = financials.comparisonCoverage || {};
  const comparisonNote = comparison.matchedReports < comparison.totalReports
    ? `<p class="hint">Last-year comparison excludes ${comparison.totalReports - comparison.matchedReports} store-day${comparison.totalReports - comparison.matchedReports === 1 ? '' : 's'} without last-year sales.</p>`
    : '';
  standouts.innerHTML = `${comparisonNote}${(financials.standouts || []).length ? `<h4>Items to review</h4><div class="financial-standout-list">${financials.standouts.slice(0, 8).map(item => `<div class="financial-standout ${item.severity === 'attention' ? 'attention' : ''}"><b>${escapeHtml(item.locationName)}</b><span>${escapeHtml(item.message)}</span></div>`).join('')}</div>` : '<p class="hint">No sales, labor, or transaction items crossed the current review thresholds.</p>'}`;
  const byLocation = financials.byLocation || [];
  details.hidden = byLocation.length < 2;
  details.querySelector('div').innerHTML = byLocation.length ? `<div class="financial-location-table"><div class="financial-location-row heading"><b>Location</b><span>Sales</span><span>vs LY</span><span>Labor</span><span>Transactions</span></div>${byLocation.map(location => `<div class="financial-location-row"><b>${escapeHtml(location.locationName)}</b><span>${financialCurrency(location.netSales)}</span><span>${financialPercent(location.salesVsLyPercent, { signed: true })}</span><span>${financialPercent(location.laborPercent, { fraction: true })}</span><span>${Number(location.transactions || 0).toLocaleString()}</span></div>`).join('')}</div>` : '';
}

function applyDashboardPreferences(activeUser = currentUser()) {
  dashboardPreferences = normalizeClientDashboardPreferences(dashboardPreferences);
  const area = $('#dashboardWidgetArea');
  if (!area) return;
  dashboardPreferences.order.forEach(id => {
    const widget = area.querySelector(`[data-dashboard-widget="${CSS.escape(id)}"]`);
    if (widget) area.appendChild(widget);
  });
  area.querySelectorAll('[data-dashboard-widget]').forEach(widget => {
    const id = widget.dataset.dashboardWidget;
    const permitted = (id !== 'financials' || (roleRank(activeUser.role) >= roleRank('Manager') && subscriptionFeatureEnabled('advanced_reports'))) && (id !== 'incidents' || canUseManagementReports(activeUser)) && (id !== 'inspections' || canAddStoreDocuments(activeUser)) && (!['taskLists', 'weeklyCleaning', 'tempLogs', 'progress'].includes(id) || canUseDailyOps(activeUser));
    const required = dashboardWidgetCatalog.find(item => item.id === id)?.required;
    widget.style.display = (required || dashboardPreferences.visible.includes(id)) && permitted ? '' : 'none';
  });
  $('#customizeDashboardBtn').style.display = dashboardPreferencesCustomizable && canCustomizeDashboard(activeUser) ? '' : 'none';
  renderDashboardWidgetSummaries();
}

function renderDashboardCustomization() {
  editingDashboardPreferences = normalizeClientDashboardPreferences(editingDashboardPreferences || dashboardPreferences);
  const companyMode = dashboardCustomizationScope === 'company';
  $('#dashboardCustomizeEyebrow').textContent = companyMode ? 'COMPANY SETTINGS' : 'PERSONAL SETTINGS';
  $('#dashboardCustomizeTitle').textContent = companyMode ? 'Company dashboard default' : 'Customize dashboard';
  $('#dashboardCustomizeHint').textContent = companyMode
    ? 'Choose the starting layout for everyone in this organization. Existing personal layouts are not changed.'
    : 'Choose what appears, move widgets into your preferred order, and select the view that should open by default. These settings apply only to your account.';
  $('#dashboardDefaultLocationLabel').hidden = companyMode;
  $('#resetDashboardBtn').textContent = companyMode ? 'Restore built-in default' : 'Reset to company default';
  $('#saveDashboardBtn').textContent = companyMode ? 'Save company default' : 'Save dashboard';
  const visibleLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  $('#dashboardDefaultRange').value = editingDashboardPreferences.defaultRange;
  $('#dashboardDefaultLocation').innerHTML = [`<option value="all">${isFullAccess() ? 'All locations' : 'All assigned locations'}</option>`, ...visibleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`)].join('');
  if (![...$('#dashboardDefaultLocation').options].some(option => option.value === editingDashboardPreferences.defaultLocationId)) editingDashboardPreferences.defaultLocationId = 'all';
  $('#dashboardDefaultLocation').value = editingDashboardPreferences.defaultLocationId;
  $('#dashboardWidgetSettings').innerHTML = editingDashboardPreferences.order.map((id, index) => {
    const widget = dashboardWidgetCatalog.find(item => item.id === id);
    return `<div class="dashboard-widget-setting"><label class="check"><input type="checkbox" data-dashboard-widget-visible="${escapeHtml(id)}" ${editingDashboardPreferences.visible.includes(id) ? 'checked' : ''} ${widget?.required ? 'disabled' : ''}> ${escapeHtml(widget?.label || id)}${widget?.required ? ' (always shown)' : ''}</label><div class="row-actions"><button class="ghost" data-dashboard-widget-move="${escapeHtml(id)}|up" ${index === 0 ? 'disabled' : ''} type="button">Up</button><button class="ghost" data-dashboard-widget-move="${escapeHtml(id)}|down" ${index === editingDashboardPreferences.order.length - 1 ? 'disabled' : ''} type="button">Down</button></div></div>`;
  }).join('');
}

function openDashboardCustomization(scope = 'personal') {
  dashboardCustomizationScope = scope === 'company' ? 'company' : 'personal';
  if (dashboardCustomizationScope === 'company' && !companyDashboardDefaultEditable) return toast('Only the company Owner can change the company dashboard default');
  if (dashboardCustomizationScope === 'personal' && (!canCustomizeDashboard() || !dashboardPreferencesCustomizable)) return toast('Dashboard customization is available to Area Managers and above');
  const source = dashboardCustomizationScope === 'company' ? companyDashboardPreferences : dashboardPreferences;
  editingDashboardPreferences = JSON.parse(JSON.stringify(normalizeClientDashboardPreferences(source)));
  if (dashboardCustomizationScope === 'company') editingDashboardPreferences.defaultLocationId = 'all';
  renderDashboardCustomization();
  $('#dashboardCustomizeDialog').showModal();
}

async function saveDashboardCustomization() {
  editingDashboardPreferences.defaultRange = $('#dashboardDefaultRange').value;
  editingDashboardPreferences.defaultLocationId = dashboardCustomizationScope === 'company' ? 'all' : $('#dashboardDefaultLocation').value;
  editingDashboardPreferences.visible = [...document.querySelectorAll('[data-dashboard-widget-visible]:checked')].map(input => input.dataset.dashboardWidgetVisible);
  try {
    const companyMode = dashboardCustomizationScope === 'company';
    const route = companyMode ? '/api/dashboard/company-default' : '/api/dashboard/preferences';
    const result = await api(route, { method: 'POST', body: JSON.stringify({ preferences: editingDashboardPreferences }) });
    dashboardPreferences = normalizeClientDashboardPreferences(result.preferences);
    companyDashboardPreferences = normalizeClientDashboardPreferences(result.companyDefault || companyDashboardPreferences);
    companyDashboardDefaultEditable = Boolean(result.companyDefaultEditable);
    dashboardRange = dashboardPreferences.defaultRange;
    dashboardLocationId = dashboardPreferences.defaultLocationId;
    localStorage.setItem('dailyops-dashboard-range', dashboardRange);
    localStorage.setItem('dailyops-dashboard-location', dashboardLocationId);
    await loadDashboardState();
    $('#dashboardCustomizeDialog').close();
    render();
    toast(companyMode ? 'Company dashboard default saved' : 'Dashboard settings saved');
  } catch (error) { toast(`Dashboard settings did not save: ${error.message}`); }
}

async function resetDashboardCustomization() {
  const companyMode = dashboardCustomizationScope === 'company';
  const message = companyMode
    ? 'Restore the built-in dashboard as the company default? Personal layouts will not be changed.'
    : 'Reset your dashboard cards, order, time period, and location to the company default?';
  if (!confirm(message)) return;
  try {
    const route = companyMode ? '/api/dashboard/company-default/reset' : '/api/dashboard/preferences/reset';
    const result = await api(route, { method: 'POST', body: '{}' });
    dashboardPreferences = normalizeClientDashboardPreferences(result.preferences || defaultDashboardPreferences());
    companyDashboardPreferences = normalizeClientDashboardPreferences(result.companyDefault || defaultDashboardPreferences());
    companyDashboardDefaultEditable = Boolean(result.companyDefaultEditable);
    editingDashboardPreferences = JSON.parse(JSON.stringify(companyMode ? companyDashboardPreferences : dashboardPreferences));
    dashboardRange = dashboardPreferences.defaultRange;
    dashboardLocationId = dashboardPreferences.defaultLocationId;
    localStorage.setItem('dailyops-dashboard-range', dashboardRange);
    localStorage.setItem('dailyops-dashboard-location', dashboardLocationId);
    await loadDashboardState();
    renderDashboardCustomization();
    render();
    toast(companyMode ? 'Company dashboard default restored' : 'Dashboard reset to company default');
  } catch (error) { toast(`Dashboard did not reset: ${error.message}`); }
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

  const taskLists = dashboardMetrics.taskLists || { completed: 0, remaining: 0, total: 0, percent: 0 };
  const weeklyCleaning = dashboardMetrics.weeklyCleaning || { completed: 0, remaining: 0, total: 0, percent: 0 };
  const tempLogs = dashboardMetrics.tempLogs || { completed: 0, remaining: 0, total: 0, percent: 0 };
  const maintenanceSummary = dashboardMetrics.maintenance || { completed: 0, open: 0, total: 0, percent: 0 };
  const fpcSummary = dashboardMetrics.fpc || { completed: 0, open: 0, total: 0, percent: 0 };
  setPie('#taskListsPie', taskLists.percent);
  setPie('#weeklyCleaningPie', weeklyCleaning.percent);
  setPie('#tempLogsPie', tempLogs.percent);
  setPie('#maintenancePie', maintenanceSummary.percent);
  setPie('#fpcPie', fpcSummary.percent);
  $('#taskListsPieLabel').textContent = `${taskLists.percent || 0}%`;
  $('#weeklyCleaningPieLabel').textContent = `${weeklyCleaning.percent || 0}%`;
  $('#tempLogsPieLabel').textContent = `${tempLogs.percent || 0}%`;
  $('#maintenancePieLabel').textContent = `${maintenanceSummary.percent || 0}%`;
  $('#fpcPieLabel').textContent = `${fpcSummary.percent || 0}%`;
  $('#taskListsCompleted').textContent = taskLists.completed || 0;
  $('#taskListsRemaining').textContent = taskLists.remaining || 0;
  $('#weeklyCleaningCompleted').textContent = weeklyCleaning.completed || 0;
  $('#weeklyCleaningRemaining').textContent = weeklyCleaning.remaining || 0;
  $('#tempLogsCompleted').textContent = tempLogs.completed || 0;
  $('#tempLogsRemaining').textContent = tempLogs.remaining || 0;
  $('#maintenanceCompleted').textContent = maintenanceSummary.completed || 0;
  $('#maintenanceOpen').textContent = maintenanceSummary.open || 0;
  $('#fpcCompleted').textContent = fpcSummary.completed || 0;
  $('#fpcOpen').textContent = fpcSummary.open || 0;
  const periodLabel = dashboardRange === 'day' ? 'Current day' : dashboardRange === 'week' ? 'Current week' : 'Current month';
  $('#taskListsChartHint').textContent = `${periodLabel} task-list progress.`;
  $('#weeklyCleaningChartHint').textContent = `${periodLabel} weekly-cleaning progress.`;
  $('#tempLogsChartHint').textContent = `${periodLabel} required temperature logs.`;
  $('#maintenanceChartHint').textContent = `${dashboardRange === 'day' ? 'Current day' : dashboardRange === 'week' ? 'Current week' : 'Current month'} completed vs open work orders.`;
  $('#fpcChartHint').textContent = 'Current FPC repair item completion for the selected location view.';
  renderDashboardFinancials();
  renderDashboardProgress();
  renderUpcomingMaintenanceTasks(visibleLocations, activeUser);
  renderPopCampaigns();
  applyDashboardPreferences(activeUser);
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
  const firstItems = items.slice(0, 2);
  const remainingItems = items.slice(2);
  $('#dashboardAlertList').innerHTML = items.length
    ? `${firstItems.map(item => renderEventCard(item, { dashboard: true })).join('')}${remainingItems.length ? `<details class="dashboard-alert-more"><summary>Show ${remainingItems.length} more upcoming ${remainingItems.length === 1 ? 'item' : 'items'}</summary>${remainingItems.map(item => renderEventCard(item, { dashboard: true })).join('')}</details>` : ''}`
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

function fpcItemPhotos(item = {}) {
  const source = Array.isArray(item.photos) ? item.photos : (item.photoUrl ? [{ url: item.photoUrl, name: item.photoName || 'FPC photo' }] : []);
  const seen = new Set();
  return source.map(photo => typeof photo === 'string' ? { url: photo, name: 'FPC photo' } : photo)
    .map(photo => ({ url: String(photo?.url || '').trim(), name: String(photo?.name || 'FPC photo').trim() }))
    .filter(photo => photo.url && !seen.has(photo.url) && seen.add(photo.url))
    .slice(0, 9);
}

function fpcInspectionFiles(record = {}) {
  const source = Array.isArray(record.inspectionFiles)
    ? record.inspectionFiles
    : (record.inspectionUrl ? [{ url: record.inspectionUrl, name: record.inspectionName || 'Open inspection' }] : []);
  const seen = new Set();
  return source
    .map(file => typeof file === 'string' ? { url: file, name: 'Open inspection' } : file)
    .map(file => ({ url: String(file?.url || '').trim(), name: String(file?.name || 'Open inspection').trim() }))
    .filter(file => file.url && !seen.has(file.url) && seen.add(file.url));
}

function fpcInspectionLinksHtml(record = {}) {
  const files = fpcInspectionFiles(record);
  if (!files.length) return '<p class="hint">No inspection file attached yet.</p>';
  return files.map(file => `<p><a href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.name || 'Open inspection')}</a></p>`).join('');
}

function fpcPhotoGalleryHtml(item = {}) {
  const photos = fpcItemPhotos(item);
  if (!photos.length) return '';
  return `<div class="fpc-photo-gallery">${photos.map((photo, index) => `
    <a class="fpc-photo-link" href="${escapeHtml(photo.url)}" target="_blank" rel="noopener" title="${escapeHtml(photo.name || `Photo ${index + 1}`)}">
      ${isImageUrl(photo.url) ? `<img src="${escapeHtml(photo.url)}" alt="FPC attachment ${index + 1}">` : '<span class="link-icon">🔗</span>'}
      <span>${escapeHtml(photo.name || `Photo ${index + 1}`)}</span>
    </a>`).join('')}</div>`;
}

function parseFpcPhotoLinks(value = '') {
  const links = String(value).split(/[\r\n]+/).map(link => link.trim()).filter(Boolean);
  const invalid = links.find(link => !/^https?:\/\//i.test(link));
  if (invalid) throw new Error('Every photo link must begin with http:// or https://');
  return links.map((url, index) => ({ url, name: `Shared photo or folder link ${index + 1}` }));
}

async function newFpcPhotos(fileInput, linkInput, maximum = 9, locationId = currentLocationId) {
  const files = [...(fileInput?.files || [])];
  const links = parseFpcPhotoLinks(linkInput?.value || '');
  if (files.length + links.length > maximum) throw new Error(`You can add ${maximum} more photo${maximum === 1 ? '' : 's'} or link${maximum === 1 ? '' : 's'} to this item`);
  const uploaded = await Promise.all(files.map(async file => ({ url: await uploadFileDirectToSupabase(file, 'fpc-item-photo', locationId), name: file.name })));
  return [...uploaded, ...links];
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

function resourceLocationIds(resource = {}) {
  if (Array.isArray(resource.locationIds) && resource.locationIds.length) return resource.locationIds.map(String);
  return resource.locationId && resource.locationId !== 'all' ? [String(resource.locationId)] : [];
}

function resourceLocationLabel(resource = {}) {
  const assigned = resourceLocationIds(resource);
  if (!assigned.length) return 'All assigned locations';
  const names = assigned.map(locationName);
  return names.length <= 2 ? names.join(', ') : `${names.length} selected locations`;
}

function scopedResources() {
  const actor = currentUser();
  const allowed = resourcesVisibleLocations().map(location => location.id);
  const list = (resources.resources || []).filter(resource => {
    if (resource.active === false) return false;
    const assignedLocations = resourceLocationIds(resource);
    const locationAllowed = !assignedLocations.length || assignedLocations.some(locationId => allowed.includes(locationId));
    const roleAllowed = roleRank(actor.role) >= roleRank(resource.minRole || 'Employee');
    return locationAllowed && roleAllowed;
  });
  if (resourcesLocationId === 'all') return list;
  return list.filter(resource => {
    const assignedLocations = resourceLocationIds(resource);
    return !assignedLocations.length || assignedLocations.includes(resourcesLocationId);
  });
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

function maintenanceLogRangeStart() {
  if (maintenanceLogPeriod === 'all') return null;
  const date = new Date();
  date.setDate(date.getDate() - (maintenanceLogPeriod === 'week' ? 6 : 29));
  return date.toISOString().slice(0, 10);
}

function filteredMaintenanceLogEntries() {
  const start = maintenanceLogRangeStart();
  return (maintenanceWorkLog.entries || []).filter(entry => (!start || entry.date >= start) && (maintenanceTechnicianFilter === 'all' || entry.technicianId === maintenanceTechnicianFilter));
}

function maintenanceTimeLabel(start, end) {
  if (!start || !end) return 'Not recorded';
  const format = value => new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${format(start)}–${format(end)}`;
}

function resetMaintenanceLogForm() {
  if (!$('#maintenanceLogId')) return;
  $('#maintenanceLogId').value = '';
  $('#maintenanceLogDate').value = dateKey;
  $('#maintenanceScheduledStart').value = '';
  $('#maintenanceScheduledEnd').value = '';
  $('#maintenanceActualStart').value = '';
  $('#maintenanceActualEnd').value = '';
  $('#maintenanceBreakMinutes').value = '0';
  $('#maintenancePlannedWork').value = '';
  $('#maintenanceAccomplishments').value = '';
  $('#maintenanceLogNotes').value = '';
  document.querySelectorAll('#maintenanceLogLocations input').forEach(input => { input.checked = false; });
  $('#maintenanceLogFormTitle').textContent = 'Plan or record a workday';
  $('#cancelMaintenanceLogBtn').hidden = true;
}

function editMaintenanceLogEntry(id) {
  const entry = (maintenanceWorkLog.entries || []).find(item => item.id === id);
  if (!entry || !maintenanceWorkLog.canEdit) return;
  $('#maintenanceLogId').value = entry.id;
  $('#maintenanceLogDate').value = entry.date || dateKey;
  $('#maintenanceScheduledStart').value = entry.scheduledStart || '';
  $('#maintenanceScheduledEnd').value = entry.scheduledEnd || '';
  $('#maintenanceActualStart').value = entry.actualStart || '';
  $('#maintenanceActualEnd').value = entry.actualEnd || '';
  $('#maintenanceBreakMinutes').value = entry.breakMinutes || 0;
  $('#maintenancePlannedWork').value = entry.plannedWork || '';
  $('#maintenanceAccomplishments').value = entry.accomplishments || '';
  $('#maintenanceLogNotes').value = entry.notes || '';
  document.querySelectorAll('#maintenanceLogLocations input').forEach(input => { input.checked = (entry.locationIds || []).includes(input.value); });
  $('#maintenanceLogFormTitle').textContent = `Edit ${prettyDate(entry.date)}`;
  $('#cancelMaintenanceLogBtn').hidden = false;
  $('#maintenanceLogFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderMaintenanceWorkLog() {
  if (!$('#maintenanceLogView')) return;
  const allowed = canUseMaintenanceWorkLog();
  const maintenanceUser = isMaintenanceTech();
  document.querySelectorAll('.maintenance-worklog-menu-link').forEach(button => { button.style.display = allowed && maintenanceUser ? '' : 'none'; });
  const reportAllowed = canUseMaintenanceWorkLogReport();
  $('#maintenanceWorkLogReportCard').hidden = !reportAllowed;
  document.querySelectorAll('.maintenance-worklog-report-link').forEach(button => { button.style.display = reportAllowed ? '' : 'none'; });
  $('#exportMaintenanceWorkLogBtn').style.display = reportAllowed ? '' : 'none';
  if (!allowed) return;
  const fullView = maintenanceWorkLog.mode === 'full';
  $('#maintenanceLogFormCard').style.display = maintenanceWorkLog.canEdit ? '' : 'none';
  $('#maintenanceHoursPermissionCard').style.display = maintenanceWorkLog.canManagePermissions ? '' : 'none';
  $('#maintenanceTechnicianFilterWrap').style.display = fullView && (maintenanceWorkLog.technicians || []).length > 1 ? '' : 'none';
  if (maintenanceWorkLog.canEdit) {
    const allowedLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
    const selected = [...document.querySelectorAll('#maintenanceLogLocations input:checked')].map(input => input.value);
    $('#maintenanceLogLocations').innerHTML = allowedLocations.map(location => `<label class="location-check"><input type="checkbox" value="${escapeHtml(location.id)}" ${selected.includes(location.id) ? 'checked' : ''}> ${escapeHtml(location.name)}</label>`).join('');
    if (!$('#maintenanceLogDate').value) $('#maintenanceLogDate').value = dateKey;
  }
  $('#maintenanceTechnicianFilter').innerHTML = ['<option value="all">All maintenance team members</option>', ...(maintenanceWorkLog.technicians || []).map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`)].join('');
  if (![...$('#maintenanceTechnicianFilter').options].some(option => option.value === maintenanceTechnicianFilter)) maintenanceTechnicianFilter = 'all';
  $('#maintenanceTechnicianFilter').value = maintenanceTechnicianFilter;
  $('#maintenanceLogPeriod').value = maintenanceLogPeriod;
  if (maintenanceWorkLog.canManagePermissions) {
    const granted = maintenanceWorkLog.permissions?.areaManagerIds || [];
    $('#maintenanceHoursPermissionList').innerHTML = (maintenanceWorkLog.areaManagers || []).length ? maintenanceWorkLog.areaManagers.map(user => `<label class="location-check"><input type="checkbox" value="${escapeHtml(user.id)}" ${granted.includes(user.id) ? 'checked' : ''}> ${escapeHtml(user.name)}</label>`).join('') : '<p class="hint">No Area Manager accounts are available.</p>';
  }
  const entries = filteredMaintenanceLogEntries();
  const hours = entries.reduce((sum, entry) => sum + (Number(entry.actualHours) || 0), 0);
  $('#maintenanceLogTotal').textContent = `${hours.toFixed(2).replace(/\.00$/, '')} hours`;
  $('#maintenanceLogList').innerHTML = entries.length ? entries.map(entry => fullView ? `
    <article class="card maintenance-log-entry">
      <div class="maintenance-log-heading"><div><p class="eyebrow">${escapeHtml(entry.technicianName || 'Maintenance Tech')}</p><h3>${escapeHtml(prettyDate(entry.date))}</h3></div><div class="maintenance-report-badges"><span class="status">${escapeHtml(entry.status || 'Scheduled')}</span><strong>${entry.actualHours === null || entry.actualHours === undefined ? '—' : `${Number(entry.actualHours).toFixed(2).replace(/\.00$/, '')} hrs`}</strong></div></div>
      <div class="maintenance-time-grid"><p><b>Scheduled</b><span>${escapeHtml(maintenanceTimeLabel(entry.scheduledStart, entry.scheduledEnd))}${entry.scheduledHours !== null && entry.scheduledHours !== undefined ? ` · ${escapeHtml(entry.scheduledHours)} hrs` : ''}</span></p><p><b>Actual</b><span>${escapeHtml(maintenanceTimeLabel(entry.actualStart, entry.actualEnd))}${entry.breakMinutes ? ` · ${escapeHtml(entry.breakMinutes)} min break` : ''}</span></p><p><b>Locations</b><span>${(entry.locationIds || []).map(locationName).map(escapeHtml).join(', ') || 'Not specified'}</span></p></div>
      ${entry.plannedWork ? `<div class="maintenance-log-copy"><b>Planned work</b><p>${escapeHtml(entry.plannedWork)}</p></div>` : ''}
      ${entry.accomplishments ? `<div class="maintenance-log-copy accomplishments"><b>Accomplishments</b><p>${escapeHtml(entry.accomplishments)}</p></div>` : ''}
      ${entry.notes ? `<div class="maintenance-log-copy"><b>Additional notes</b><p>${escapeHtml(entry.notes)}</p></div>` : ''}
      ${maintenanceWorkLog.canEdit ? `<button class="ghost" data-maintenance-log-edit="${escapeHtml(entry.id)}" type="button">Edit workday</button>` : ''}
    </article>` : `
    <article class="card maintenance-hours-row"><div><b>${escapeHtml(entry.technicianName || 'Maintenance Tech')}</b><p>${escapeHtml(prettyDate(entry.date))}</p></div><strong>${entry.actualHours === null || entry.actualHours === undefined ? 'Not submitted' : `${Number(entry.actualHours).toFixed(2).replace(/\.00$/, '')} hours`}</strong></article>`).join('') : '<div class="empty">No maintenance schedule or work-log entries match this period.</div>';
}

function exportMaintenanceWorkLog() {
  if (!canUseMaintenanceWorkLogReport()) return toast('Maintenance Work Log report access has not been granted');
  const entries = filteredMaintenanceLogEntries();
  if (!entries.length) return toast('There are no Work Log entries in the selected period');
  const fullView = maintenanceWorkLog.mode === 'full';
  const headers = fullView
    ? ['Team Member', 'Date', 'Status', 'Scheduled Start', 'Scheduled End', 'Scheduled Hours', 'Actual Start', 'Actual End', 'Break Minutes', 'Actual Hours', 'Locations', 'Planned Work', 'Accomplishments', 'Notes']
    : ['Team Member', 'Date', 'Status', 'Actual Hours'];
  const rows = entries.map(entry => fullView
    ? [entry.technicianName, entry.date, entry.status, entry.scheduledStart, entry.scheduledEnd, entry.scheduledHours, entry.actualStart, entry.actualEnd, entry.breakMinutes, entry.actualHours, (entry.locationIds || []).map(locationName).join('; '), entry.plannedWork, entry.accomplishments, entry.notes]
    : [entry.technicianName, entry.date, entry.status, entry.actualHours]);
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `his-ops-maintenance-work-log-${dateKey}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Maintenance Work Log exported');
}

function renderLocationHealth() {
  if (!$('#locationHealthView')) return;
  const allowed = canUseLocationHealth();
  document.querySelectorAll('[data-view="locationHealthView"]').forEach(button => { button.style.display = allowed ? '' : 'none'; });
  if (!allowed) return;
  const thermostats = locationHealth.thermostats || [];
  const thermostatOnline = thermostats.filter(device => device.online).length;
  $('#locationHealthThermostatStatus').textContent = locationHealth.thermostatMessage || (locationHealth.thermostatConfigured
    ? `${thermostatOnline} of ${thermostats.length} thermostat${thermostats.length === 1 ? '' : 's'} reporting${locationHealth.thermostatRefreshedAt ? ` · Refreshed ${new Date(locationHealth.thermostatRefreshedAt).toLocaleString()}` : ''}`
    : 'Thermostat reporting is not configured yet.');
  const modeNames = ['Off', 'Heat', 'Cool', 'Auto'];
  const stateNames = ['Idle', 'Heating', 'Cooling', 'Lockout', 'Error'];
  $('#locationHealthThermostatList').innerHTML = thermostats.length ? thermostats.map(device => {
    const info = device.info || {};
    const deviceKey = `${device.gatewayId}|${device.id}`;
    const recentCommand = (locationHealth.thermostatCommands || []).find(command => command.deviceKey === deviceKey);
    const unit = Number(info.temperatureUnits) === 1 ? '°C' : '°F';
    const reading = value => value === null || value === undefined ? '—' : `${Number(value).toFixed(1).replace(/\.0$/, '')}${unit}`;
    return `<article class="card thermostat-card">
      <div class="maintenance-log-heading"><div><p class="eyebrow">${escapeHtml(device.model || 'VENSTAR')}</p><h3>${escapeHtml(device.name || 'Thermostat')}</h3><p>${escapeHtml(locationName(device.locationId))}</p></div><span class="status ${device.online ? 'camera-online' : 'camera-offline'}">${device.online ? 'ONLINE' : 'OFFLINE'}</span></div>
      <div class="thermostat-reading"><strong>${reading(info.spaceTemp)}</strong><span>Current temperature</span></div>
      <div class="thermostat-details"><p><b>System</b><span>${escapeHtml(modeNames[info.mode] || `Mode ${info.mode ?? '—'}`)}</span></p><p><b>Status</b><span>${escapeHtml(stateNames[info.state] || `State ${info.state ?? '—'}`)}</span></p><p><b>Heat setpoint</b><span>${reading(info.heatTemp)}</span></p><p><b>Cool setpoint</b><span>${reading(info.coolTemp)}</span></p><p><b>Fan</b><span>${info.fanState ? 'Running' : (info.fan ? 'On' : 'Auto')}</span></p><p><b>Last report</b><span>${device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}</span></p></div>
      ${locationHealth.thermostatCanControl ? `<details class="thermostat-control" data-thermostat-control="${escapeHtml(deviceKey)}"><summary><b>Adjust thermostat</b></summary><div class="form-grid three-col"><label>System mode<select data-thermostat-mode><option value="0" ${info.mode === 0 ? 'selected' : ''}>Off</option><option value="1" ${info.mode === 1 ? 'selected' : ''}>Heat</option><option value="2" ${info.mode === 2 ? 'selected' : ''}>Cool</option><option value="3" ${info.mode === 3 ? 'selected' : ''}>Auto</option></select></label><label>Heat setpoint<input data-thermostat-heat type="number" min="55" max="78" step="1" value="${Number(info.heatTemp) || 68}"></label><label>Cool setpoint<input data-thermostat-cool type="number" min="65" max="85" step="1" value="${Number(info.coolTemp) || 75}"></label><label>Fan<select data-thermostat-fan><option value="0" ${!info.fan ? 'selected' : ''}>Auto</option><option value="1" ${info.fan ? 'selected' : ''}>On</option></select></label></div><p class="hint">Safety limits: heat 55–78°F, cool 65–85°F, with at least 2°F between them.</p><button data-thermostat-apply type="button" ${device.online ? '' : 'disabled'}>Apply changes</button></details>` : ''}
      ${recentCommand ? `<p class="thermostat-command-status"><b>Latest change:</b> ${escapeHtml(recentCommand.status)} · ${escapeHtml(recentCommand.requestedBy || '')} · ${new Date(recentCommand.requestedAt).toLocaleString()}${recentCommand.message ? ` · ${escapeHtml(recentCommand.message)}` : ''}</p>` : ''}
    </article>`;
  }).join('') : '<div class="empty">No thermostat has reported to DQ OPS yet.</div>';
  document.querySelectorAll('[data-thermostat-apply]').forEach(button => button.addEventListener('click', () => queueThermostatControl(button.closest('[data-thermostat-control]'))));
  const cameras = locationHealth.cameras || [];
  const online = cameras.filter(camera => camera.state === 'CONNECTED').length;
  $('#locationHealthStatus').textContent = locationHealth.message || (locationHealth.configured
    ? `${online} of ${cameras.length} camera${cameras.length === 1 ? '' : 's'} connected${locationHealth.refreshedAt ? ` · Refreshed ${new Date(locationHealth.refreshedAt).toLocaleString()}` : ''}`
    : 'UniFi is not configured yet. Add the API key and console ID in Netlify.');
  $('#locationHealthCameraList').innerHTML = cameras.length ? cameras.map(camera => {
    const snapshot = locationHealthSnapshots.get(camera.id);
    const locationOptions = ['<option value="">Unassigned</option>', ...locations.map(location => `<option value="${escapeHtml(location.id)}" ${camera.locationId === String(location.id) ? 'selected' : ''}>${escapeHtml(location.name)}</option>`)].join('');
    return `<article class="card unifi-camera-card">
      <div class="unifi-camera-image">${snapshot ? `<img src="${escapeHtml(snapshot)}" alt="Current snapshot from ${escapeHtml(camera.name)}">` : '<div class="unifi-snapshot-empty">Snapshot unavailable</div>'}</div>
      <div class="unifi-camera-details">
        <div class="maintenance-log-heading"><div><p class="eyebrow">${escapeHtml(camera.model || 'UNIFI PROTECT')}</p><h3>${escapeHtml(camera.name)}</h3></div><span class="status ${camera.state === 'CONNECTED' ? 'camera-online' : 'camera-offline'}">${escapeHtml(camera.state)}</span></div>
        <p>${camera.locationId ? escapeHtml(locationName(camera.locationId)) : 'Not assigned to a DQ OPS location'}</p>
        ${locationHealth.canManage ? `<label>DQ OPS location<select data-unifi-camera-location="${escapeHtml(camera.id)}">${locationOptions}</select></label>` : ''}
        <div class="row-actions"><a class="button-link ghost" href="https://unifi.ui.com" target="_blank" rel="noopener">Open UniFi Protect</a></div>
      </div>
    </article>`;
  }).join('') + (locationHealth.canManage ? '<button id="saveUnifiCameraMappingsBtn" type="button">Save camera locations</button>' : '') : '<div class="empty">No cameras are available for your assigned locations.</div>';
  $('#saveUnifiCameraMappingsBtn')?.addEventListener('click', saveUnifiCameraMappings);
}

async function queueThermostatControl(panel) {
  if (!panel) return;
  const [gatewayId, deviceId] = panel.dataset.thermostatControl.split('|');
  const heatTemp = Number(panel.querySelector('[data-thermostat-heat]').value);
  const coolTemp = Number(panel.querySelector('[data-thermostat-cool]').value);
  if (!confirm(`Apply heat ${heatTemp}°F and cool ${coolTemp}°F to this thermostat?`)) return;
  const button = panel.querySelector('[data-thermostat-apply]');
  button.disabled = true;
  try {
    const state = await api('/api/location-health/thermostat-command', { method: 'POST', body: JSON.stringify({ gatewayId, deviceId, mode: Number(panel.querySelector('[data-thermostat-mode]').value), fan: Number(panel.querySelector('[data-thermostat-fan]').value), heatTemp, coolTemp }) });
    locationHealth = { ...locationHealth, thermostats: state.devices || [], thermostatCommands: state.commands || [], thermostatCanControl: state.canControl === true };
    renderLocationHealth();
    toast('Thermostat change queued. It will apply when the gateway checks in.');
  } catch (error) {
    button.disabled = false;
    toast(`Thermostat did not update: ${error.message}`);
  }
}

async function saveUnifiCameraMappings() {
  const mappings = {};
  document.querySelectorAll('[data-unifi-camera-location]').forEach(select => { mappings[select.dataset.unifiCameraLocation] = select.value; });
  try {
    const cameraState = await api('/api/location-health/camera-mappings', { method: 'POST', body: JSON.stringify({ mappings }) });
    locationHealth = { ...locationHealth, ...cameraState };
    renderLocationHealth();
    toast('Camera locations saved');
  } catch (error) { toast(`Camera locations did not save: ${error.message}`); }
}

async function refreshLocationHealth() {
  $('#refreshLocationHealthBtn').disabled = true;
  $('#locationHealthStatus').textContent = 'Refreshing cameras and snapshots…';
  $('#locationHealthThermostatStatus').textContent = 'Refreshing thermostat readings…';
  await loadLocationHealthState(true);
  renderLocationHealth();
  $('#refreshLocationHealthBtn').disabled = false;
}

async function saveMaintenanceLogEntry() {
  const date = $('#maintenanceLogDate').value;
  if (!date) return toast('Choose a work date');
  try {
    maintenanceWorkLog = await api('/api/maintenance-log/entry', { method: 'POST', body: JSON.stringify({
      id: $('#maintenanceLogId').value || undefined,
      date,
      scheduledStart: $('#maintenanceScheduledStart').value,
      scheduledEnd: $('#maintenanceScheduledEnd').value,
      actualStart: $('#maintenanceActualStart').value,
      actualEnd: $('#maintenanceActualEnd').value,
      breakMinutes: $('#maintenanceBreakMinutes').value,
      locationIds: [...document.querySelectorAll('#maintenanceLogLocations input:checked')].map(input => input.value),
      plannedWork: $('#maintenancePlannedWork').value.trim(),
      accomplishments: $('#maintenanceAccomplishments').value.trim(),
      notes: $('#maintenanceLogNotes').value.trim()
    }) });
    resetMaintenanceLogForm();
    renderMaintenanceWorkLog();
    toast('Maintenance workday saved');
  } catch (error) { toast(`Workday did not save: ${error.message}`); }
}

async function saveMaintenanceHoursPermissions() {
  try {
    maintenanceWorkLog = await api('/api/maintenance-log/permissions', { method: 'POST', body: JSON.stringify({ areaManagerIds: [...document.querySelectorAll('#maintenanceHoursPermissionList input:checked')].map(input => input.value) }) });
    renderMaintenanceWorkLog();
    toast('Maintenance hours access updated');
  } catch (error) { toast(`Access permissions did not save: ${error.message}`); }
}

function workOrderUpdatesFor(workOrderId) {
  return (maintenance.workOrderUpdates || [])
    .filter(update => String(update.workOrderId) === String(workOrderId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
  $('#workOrderList').innerHTML = shownOrders.length ? shownOrders.map(order => {
    const updates = workOrderUpdatesFor(order['Work Order ID']);
    const latest = updates[0];
    return `
    <article class="card maintenance-row ${order.Priority === 'Emergency' ? 'urgent' : ''}">
      <div>
        <b>${escapeHtml(order['Work Order ID'])} · ${escapeHtml(order['Equipment Name'] || order.Category || 'General')}</b>
        <p>${escapeHtml(order['Location Name'] || '')} · ${escapeHtml(order.Category || '')} · ${escapeHtml(order.Priority || '')} · ${escapeHtml(order.Status || '')}</p>
        <p>${escapeHtml(order['Issue Description'] || '')}</p>
        ${updates.length ? `<p class="hint">${updates.length} repair update${updates.length === 1 ? '' : 's'} · Latest ${escapeHtml(latest.createdByName || 'App User')}${latest.createdAt ? ` on ${escapeHtml(new Date(latest.createdAt).toLocaleDateString())}` : ''}</p>` : ''}
        <p>${order['Photo Link'] ? `<a href="${escapeHtml(fullPhotoUrl(order['Photo Link']))}" target="_blank">Photo</a>` : ''} ${order['Manual Link'] ? `<a href="${escapeHtml(fullPhotoUrl(order['Manual Link']))}" target="_blank">Manual</a>` : ''}</p>
      </div>
      <div class="row-actions"><span class="status">${escapeHtml(order.Status || 'New')}</span><button data-edit-wo="${escapeHtml(order['Work Order ID'])}">Edit</button></div>
    </article>
  `; }).join('') : '<div class="empty">No open work orders for this view.</div>';

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

function fpcRepairItemHtml(record, item) {
  return `
    <div class="fpc-item ${item.status === 'Completed' ? 'complete' : ''}">
      <div class="fpc-item-head">
        <div>
          <b>${escapeHtml(item.description)}</b>
          <p class="hint">${escapeHtml(item.priority || 'Medium')} priority${item.assignedTo ? ` · Assigned to ${escapeHtml(item.assignedTo)}` : ''}${item.targetDate ? ` · Target ${escapeHtml(item.targetDate)}` : ''}</p>
          ${fpcPhotoGalleryHtml(item)}
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
  `;
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
    ? records.map(record => `<option value="${record.id}">${escapeHtml(locationName(record.locationId) || record.locationName)} · ${escapeHtml(record.inspectionDate || '')}</option>`).join('')
    : '<option value="">Create from selected location</option>';

  setAssignmentFields('fpc', {});
  $('#fpcList').innerHTML = records.length ? records.map(record => {
    const activeItems = (record.items || []).filter(item => item.status !== 'Completed');
    const completedItems = (record.items || []).filter(item => item.status === 'Completed');
    return `
    <details class="card fpc-record">
      <summary class="fpc-record-head">
        <div>
          <h3>${escapeHtml(locationName(record.locationId) || record.locationName)} · ${escapeHtml(record.inspectionDate || 'FPC')}</h3>
          <p class="hint">Added by ${escapeHtml(record.createdBy || 'Manager')}${record.createdAt ? ` · ${new Date(record.createdAt).toLocaleDateString()}` : ''}</p>
          ${fpcInspectionLinksHtml(record)}
        </div>
        <span class="status">${activeItems.length} open</span>
      </summary>
      <div class="fpc-items">
        ${activeItems.length ? activeItems.map(item => fpcRepairItemHtml(record, item)).join('') : '<p class="hint">No open FPC repair items.</p>'}
        ${completedItems.length ? `
          <details class="fpc-completed-items">
            <summary>Completed Items <span>${completedItems.length}</span></summary>
            <div class="fpc-completed-list">${completedItems.map(item => fpcRepairItemHtml(record, item)).join('')}</div>
          </details>
        ` : ''}
      </div>
    </details>
  `;
  }).join('') : '<div class="empty">No FPC inspections for this view yet.</div>';
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

  if ($('#resourceLocations')) {
    const initialized = $('#resourceLocations').children.length > 0;
    const selectedIds = initialized
      ? [...document.querySelectorAll('#resourceLocations input:checked')].map(input => input.value)
      : [];
    const allSelected = initialized ? $('#resourceAllLocations').checked : true;
    $('#resourceLocations').innerHTML = visibleLocations.map(location => `
      <label class="location-check"><input type="checkbox" value="${escapeHtml(location.id)}" ${selectedIds.includes(location.id) ? 'checked' : ''} ${allSelected ? 'disabled' : ''}> ${escapeHtml(location.name)}</label>
    `).join('');
    $('#resourceAllLocations').checked = allSelected;
  }
  $('#resourcesAdminCard').style.display = canManageResources() ? '' : 'none';
  document.querySelectorAll('#resourcesSectionHub [data-section-view]').forEach(button => {
    const view = button.dataset.sectionView;
    const allowed = (view === 'trainingView' && !isMaintenanceTech()) || (view === 'fpcView' && canUseHub()) || (view === 'storeDocsView' && canUseHub() && !isMaintenanceTech()) || (view === 'historyView' && canUseHistory() && !isMaintenanceTech());
    button.style.display = allowed ? '' : 'none';
  });
  $('#cancelResourceEditBtn').style.display = $('#resourceId').value ? '' : 'none';

  const list = scopedResources();
  $('#resourcesCount').textContent = `${list.length} link${list.length === 1 ? '' : 's'}`;
  $('#resourcesList').innerHTML = list.length ? list.map(resource => `
    <article class="resource-row-wrap">
      <a class="card resource-row resource-row-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener">
        <div><b>${escapeHtml(resource.title)}</b><p>${escapeHtml(resource.category || 'General')} · ${escapeHtml(resourceLocationLabel(resource))} · ${escapeHtml(resource.minRole || 'Employee')}+</p>${resource.notes ? `<p>${escapeHtml(resource.notes)}</p>` : ''}</div>
        <span class="resource-open-label">Open <span aria-hidden="true">↗</span></span>
      </a>
      ${canManageResources() ? `<button class="resource-pencil" data-resource-edit="${escapeHtml(resource.id)}" type="button" title="Edit or delete ${escapeHtml(resource.title)}" aria-label="Edit or delete ${escapeHtml(resource.title)}">✎</button>` : ''}
    </article>
  `).join('') : '<div class="empty">No resources for this view yet.</div>';
}

function areaManagerLocations() {
  return locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
}

async function loadManagementReportsState() {
  if (!apiOnline || !canUseManagementReports()) return;
  try {
    managementReports = await api('/api/management-reports/state');
  } catch {
    managementReports = { reports: [] };
  }
}

function renderReceipts() {
  if (!$('#receiptsView') || !canAddStoreDocuments()) return;
  const allowed = areaManagerLocations();
  const locationOptions = allowed.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  const currentUpload = $('#receiptLocation').value;
  $('#receiptLocation').innerHTML = locationOptions;
  if (allowed.some(location => location.id === currentUpload)) $('#receiptLocation').value = currentUpload;
  const currentFilter = $('#receiptFilterLocation').value || 'all';
  $('#receiptFilterLocation').innerHTML = `<option value="all">All assigned locations</option>${locationOptions}`;
  if ([...$('#receiptFilterLocation').options].some(option => option.value === currentFilter)) $('#receiptFilterLocation').value = currentFilter;
  const fromDate = $('#receiptFilterDate').value;
  const list = (receipts.receipts || []).filter(receipt => ($('#receiptFilterLocation').value === 'all' || receipt.locationId === $('#receiptFilterLocation').value) && (!fromDate || receipt.date >= fromDate));
  $('#receiptsCount').textContent = `${list.length} receipt${list.length === 1 ? '' : 's'}`;
  $('#receiptList').innerHTML = list.length ? list.map(receipt => `
    <article class="card receipt-row">
      <div><p class="eyebrow">${escapeHtml(receipt.date || '')} · ${escapeHtml(locationName(receipt.locationId))}</p><h3>${escapeHtml(receipt.vendor)}</h3><p>${escapeHtml(receipt.category || 'Other')} · Uploaded by ${escapeHtml(receipt.createdBy || '')}</p>${receipt.notes ? `<p class="hint">${escapeHtml(receipt.notes)}</p>` : ''}</div>
      <div class="receipt-total"><b>${Number(receipt.amount || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</b>${receipt.downloadUrl ? `<a class="button-link ghost" href="${escapeHtml(receipt.downloadUrl)}" target="_blank" rel="noopener">Download</a>` : '<span class="hint">File unavailable</span>'}</div>
    </article>
  `).join('') : '<div class="empty">No receipts match this view.</div>';
}

function inspectionRangeStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - inspectionChartMonths);
  return start;
}

function inspectionChartMarkup(records) {
  if (!records.length) return '<div class="empty">No inspections in this period.</div>';
  const width = 760, height = 260, left = 42, right = 16, top = 18, bottom = 42;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const points = records.map((record, index) => ({ x: left + (records.length === 1 ? chartWidth / 2 : index * chartWidth / (records.length - 1)), y: top + (100 - record.score) / 100 * chartHeight, record }));
  const average = Math.round(records.reduce((sum, record) => sum + record.score, 0) / records.length);
  const averageY = top + (100 - average) / 100 * chartHeight;
  return `<div class="inspection-summary"><strong>${average}%</strong><span>average · ${records.length} visit${records.length === 1 ? '' : 's'}</span></div>
    <svg class="inspection-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Inspection scores over time">
      ${[0,25,50,75,100].map(value => { const y = top + (100 - value) / 100 * chartHeight; return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid"/><text x="${left-8}" y="${y+4}" text-anchor="end">${value}%</text>`; }).join('')}
      <line x1="${left}" y1="${averageY}" x2="${width-right}" y2="${averageY}" class="chart-average"/>
      ${records.length > 1 ? `<polyline points="${points.map(point => `${point.x},${point.y}`).join(' ')}" class="chart-line"/>` : ''}
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="6" class="chart-point"><title>${escapeHtml(point.record.date)}: ${point.record.score}%</title></circle><text x="${point.x}" y="${height-17}" text-anchor="middle">${escapeHtml(point.record.date.slice(5))}</text>`).join('')}
    </svg>`;
}

function renderInspectionsLegacy() {
  if (!$('#inspectionsView') || !canAddStoreDocuments()) return;
  const allowed = areaManagerLocations();
  const options = allowed.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  const formLocation = $('#inspectionLocation').value;
  $('#inspectionLocation').innerHTML = options;
  if (allowed.some(location => location.id === formLocation)) $('#inspectionLocation').value = formLocation;
  const chartLocation = $('#inspectionChartLocation').value || allowed[0]?.id;
  $('#inspectionChartLocation').innerHTML = options;
  if (allowed.some(location => location.id === chartLocation)) $('#inspectionChartLocation').value = chartLocation;
  if (!$('#inspectionChecklist').dataset.ready) {
    $('#inspectionChecklist').innerHTML = (inspections.template || []).map(item => `<div class="inspection-item"><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.category)}</span></div><select data-inspection-answer="${escapeHtml(item.id)}"><option value="2">Meets standard</option><option value="1">Needs attention</option><option value="0">Unsatisfactory</option><option value="na">N/A</option></select><input data-inspection-comment="${escapeHtml(item.id)}" placeholder="Optional comment"></div>`).join('');
    $('#inspectionChecklist').dataset.ready = 'true';
  }
  document.querySelectorAll('[data-inspection-months]').forEach(button => button.classList.toggle('active', Number(button.dataset.inspectionMonths) === inspectionChartMonths));
  const selected = $('#inspectionChartLocation').value;
  const start = inspectionRangeStart();
  const records = (inspections.inspections || []).filter(record => record.locationId === selected && new Date(`${record.date}T12:00:00`) >= start).sort((a, b) => a.date.localeCompare(b.date));
  $('#inspectionChart').innerHTML = inspectionChartMarkup(records);
  const average = records.length ? Math.round(records.reduce((sum, record) => sum + record.score, 0) / records.length) : null;
  $('#inspectionAverage').textContent = average === null ? 'No scores yet' : `${average}% average`;
  const history = (inspections.inspections || []).filter(record => record.locationId === selected);
  $('#inspectionHistory').innerHTML = history.length ? history.map(record => `<details class="card"><summary class="inspection-history-head"><div><b>${escapeHtml(record.date)} · ${escapeHtml(locationName(record.locationId))}</b><p class="hint">${escapeHtml(record.completedBy || '')}${record.notes ? ` · ${escapeHtml(record.notes)}` : ''}</p></div><strong>${record.score}%</strong></summary><div class="inspection-results">${(record.answers || []).map(answer => `<p><span>${escapeHtml(answer.category)} · ${escapeHtml(answer.label)}</span><b>${answer.value === null ? 'N/A' : answer.value === 2 ? 'Meets standard' : answer.value === 1 ? 'Needs attention' : 'Unsatisfactory'}</b>${answer.comment ? `<small>${escapeHtml(answer.comment)}</small>` : ''}</p>`).join('')}</div></details>`).join('') : '<div class="empty">No store visits have been saved for this location.</div>';
}

function renderInspections() {
  if (!$('#inspectionsView') || !canAddStoreDocuments()) return;
  const templates = inspections.templates || [];
  if (!templates.some(template => template.id === inspectionTemplateId)) inspectionTemplateId = templates[0]?.id || 'store-visit';
  if (!templates.some(template => template.id === inspectionChartTemplateId)) inspectionChartTemplateId = templates[0]?.id || 'store-visit';
  const templateOptions = templates.map(template => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join('');
  $('#inspectionTemplate').innerHTML = templateOptions;
  $('#inspectionTemplate').value = inspectionTemplateId;
  $('#inspectionChartTemplate').innerHTML = templateOptions;
  $('#inspectionChartTemplate').value = inspectionChartTemplateId;

  const allowed = areaManagerLocations();
  const options = allowed.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  const formLocation = $('#inspectionLocation').value;
  $('#inspectionLocation').innerHTML = options;
  if (allowed.some(location => location.id === formLocation)) $('#inspectionLocation').value = formLocation;
  const chartLocation = $('#inspectionChartLocation').value || allowed[0]?.id;
  $('#inspectionChartLocation').innerHTML = options;
  if (allowed.some(location => location.id === chartLocation)) $('#inspectionChartLocation').value = chartLocation;

  const activeTemplate = templates.find(template => template.id === inspectionTemplateId);
  if ($('#inspectionChecklist').dataset.templateId !== inspectionTemplateId) {
    $('#inspectionChecklist').innerHTML = (activeTemplate?.items || []).map(item => `<div class="inspection-item"><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.category)}</span></div><select data-inspection-answer="${escapeHtml(item.id)}"><option value="2">Meets standard</option><option value="1">Needs attention</option><option value="0">Unsatisfactory</option><option value="na">N/A</option></select><input data-inspection-comment="${escapeHtml(item.id)}" placeholder="Optional comment"><label class="inspection-photo-button" title="Attach optional photo"><span>📎</span><input data-inspection-photo="${escapeHtml(item.id)}" type="file" accept="image/*" capture="environment"></label></div>`).join('');
    $('#inspectionChecklist').dataset.templateId = inspectionTemplateId;
  }
  document.querySelectorAll('[data-inspection-months]').forEach(button => button.classList.toggle('active', Number(button.dataset.inspectionMonths) === inspectionChartMonths));
  const selected = $('#inspectionChartLocation').value;
  const start = inspectionRangeStart();
  const matchesTemplate = record => (record.templateId || 'store-visit') === inspectionChartTemplateId;
  const records = (inspections.inspections || []).filter(record => record.locationId === selected && matchesTemplate(record) && new Date(`${record.date}T12:00:00`) >= start).sort((a, b) => a.date.localeCompare(b.date));
  $('#inspectionChart').innerHTML = inspectionChartMarkup(records);
  const average = records.length ? Math.round(records.reduce((sum, record) => sum + record.score, 0) / records.length) : null;
  $('#inspectionAverage').textContent = average === null ? 'No scores yet' : `${average}% average`;
  const history = (inspections.inspections || []).filter(record => record.locationId === selected && matchesTemplate(record));
  $('#inspectionHistory').innerHTML = history.length ? history.map(record => `<details class="card"><summary class="inspection-history-head"><div><b>${escapeHtml(record.date)} · ${escapeHtml(locationName(record.locationId))}</b><p class="hint">${escapeHtml(record.templateName || 'Store Visit Inspection')} · ${escapeHtml(record.completedBy || '')}${record.notes ? ` · ${escapeHtml(record.notes)}` : ''}</p></div><strong>${record.score}%</strong></summary><div class="inspection-results">${(record.answers || []).map(answer => `<p><span>${escapeHtml(answer.category)} · ${escapeHtml(answer.label)}</span><b>${answer.value === null ? 'N/A' : answer.value === 2 ? 'Meets standard' : answer.value === 1 ? 'Needs attention' : 'Unsatisfactory'}</b>${answer.comment ? `<small>${escapeHtml(answer.comment)}</small>` : ''}${answer.photoUrl ? `<a class="inspection-result-photo" href="${escapeHtml(answer.photoUrl)}" target="_blank" rel="noopener">${isImageUrl(answer.photoUrl) ? `<img src="${escapeHtml(answer.photoUrl)}" alt="Inspection attachment">` : ''}<span>📎 ${escapeHtml(answer.photoName || 'View photo')}</span></a>` : ''}</p>`).join('')}</div></details>`).join('') : '<div class="empty">No inspections from this list have been saved for this location.</div>';
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

function repairUpdateDateTime(value = '') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function renderWorkOrderTimeline(workOrderId) {
  const updates = workOrderUpdatesFor(workOrderId);
  $('#workOrderUpdateCount').textContent = `${updates.length} update${updates.length === 1 ? '' : 's'}`;
  $('#workOrderTimeline').open = maintenance.workOrderUpdatesReady === false;
  $('#toggleWorkOrderUpdateBtn').disabled = maintenance.workOrderUpdatesReady === false;
  $('#toggleWorkOrderUpdateBtn').title = maintenance.workOrderUpdatesReady === false ? (maintenance.workOrderUpdatesMessage || 'Repair History is not set up yet') : '';
  if (maintenance.workOrderUpdatesReady === false) {
    $('#workOrderTimelineList').innerHTML = `<div class="empty">${escapeHtml(maintenance.workOrderUpdatesMessage || 'Repair History is not set up yet.')}</div>`;
    return;
  }
  $('#workOrderTimelineList').innerHTML = updates.length ? updates.map(update => {
    const meta = [
      update.status ? `Status: ${update.status}` : '',
      update.timeSpentHours !== null && update.timeSpentHours !== undefined ? `${update.timeSpentHours} hour${Number(update.timeSpentHours) === 1 ? '' : 's'}` : '',
      update.followUpDate ? `Follow up ${prettyDate(update.followUpDate)}` : ''
    ].filter(Boolean);
    return `
      <article class="work-order-update-entry">
        <div class="work-order-update-entry-head"><b>${escapeHtml(update.updateType || 'Progress update')}</b><span class="hint">${escapeHtml(repairUpdateDateTime(update.createdAt))}</span></div>
        <p>${escapeHtml(update.note || '')}</p>
        <div class="work-order-update-meta"><span>${escapeHtml(update.createdByName || 'App User')}</span>${meta.map(value => `<span>· ${escapeHtml(value)}</span>`).join('')}</div>
        ${update.attachmentUrl ? `<a href="${escapeHtml(fullPhotoUrl(update.attachmentUrl))}" target="_blank" rel="noopener">📎 ${escapeHtml(update.attachmentName || 'View attachment')}</a>` : ''}
      </article>`;
  }).join('') : '<div class="empty">No repair updates have been added yet.</div>';
}

function openWorkOrderDialog(workOrderId) {
  const order = maintenance.workOrders.find(row => row['Work Order ID'] === workOrderId);
  if (!order) return;
  const list = maintenance.lists || {};
  $('#editWoTitle').textContent = `${order['Work Order ID']} · ${order['Equipment Name'] || order.Category || 'Work Order'}`;
  $('#editWoId').value = order['Work Order ID'];
  $('#editWoLocationId').value = order['Location ID'];
  const workOrderStatuses = [...new Set([
    ...(list.statuses || []),
    'New', 'Assigned', 'In Progress', 'Waiting on Parts', 'Waiting on Vendor', 'Scheduled', 'On Hold', 'Completed', 'Cancelled'
  ])];
  $('#editWoStatus').innerHTML = workOrderStatuses.map(value => `<option ${order.Status === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
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
  const updateStatuses = workOrderStatuses.filter(value => !['Completed', 'Cancelled'].includes(value));
  $('#workOrderUpdateStatus').innerHTML = '<option value="">No status change</option>' + updateStatuses.map(value => `<option>${escapeHtml(value)}</option>`).join('');
  $('#workOrderUpdateType').value = 'Progress update';
  $('#workOrderUpdateNote').value = '';
  $('#workOrderUpdateHours').value = '';
  $('#workOrderUpdateFollowUp').value = '';
  $('#workOrderUpdateAttachment').value = '';
  $('#workOrderUpdateForm').hidden = true;
  $('#toggleWorkOrderUpdateBtn').textContent = '+ Add update';
  renderWorkOrderTimeline(order['Work Order ID']);
  const technician = isMaintenanceTech();
  ['#editWoPriority', '#editWoAssignmentType', '#editWoAssigneeUser', '#editWoVendor', '#editWoAssignmentNotify', '#editWoIssue', '#editWoTargetDate', '#editWoParts', '#editWoVendorCost'].forEach(selector => {
    $(selector).closest('label').style.display = technician ? 'none' : '';
  });
  $('#saveWorkOrderBtn').textContent = technician ? 'Save notes and status' : 'Save work order';
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
  const showLocations = canViewLocations(user);
  const tech = isMaintenanceTech(user);
  const showMaintenance = showHub && subscriptionFeatureEnabled('maintenance');
  const showMaintenanceLog = canUseMaintenanceWorkLog(user) && subscriptionFeatureEnabled('maintenance_work_logs');
  const showLocationHealth = canUseLocationHealth(user) && (subscriptionAddonEnabled('thermostats') || subscriptionAddonEnabled('sensors') || subscriptionAddonEnabled('cameras'));
  const showDailyOperations = canUseDailyOps(user) && subscriptionFeatureEnabled('daily_operations');
  const showPlatformAdmin = Boolean(subscriptionAdmin.platformAdmin);
  document.querySelectorAll('[data-view="homeView"]').forEach(button => button.style.display = showHub ? '' : 'none');
  document.querySelectorAll('[data-view="noticesView"]').forEach(button => button.style.display = '');
  document.querySelectorAll('[data-view="maintenanceView"]').forEach(button => button.style.display = showMaintenance ? '' : 'none');
  document.querySelectorAll('[data-view="fpcView"]').forEach(button => button.style.display = showHub && subscriptionFeatureEnabled('fpc_repairs') ? '' : 'none');
  document.querySelectorAll('.maintenance-worklog-menu-link').forEach(button => button.style.display = showMaintenanceLog && tech ? '' : 'none');
  document.querySelectorAll('.maintenance-worklog-report-link').forEach(button => button.style.display = showMaintenanceLog && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="locationHealthView"]').forEach(button => button.style.display = showLocationHealth ? '' : 'none');
  document.querySelectorAll('[data-view="calendarView"]').forEach(button => button.style.display = showHub && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="storeDocsView"]').forEach(button => button.style.display = showHub && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="resourcesView"]').forEach(button => button.style.display = '');
  document.querySelectorAll('[data-view="smallwaresView"]').forEach(button => button.style.display = showHub && !tech && subscriptionFeatureEnabled('smallwares') ? '' : 'none');
  document.querySelectorAll('[data-view="managementReportsView"]').forEach(button => button.style.display = canUseManagementReports(user) && subscriptionFeatureEnabled('advanced_reports') ? '' : 'none');
  document.querySelectorAll('[data-view="taskListsView"], [data-view="tempLogsView"], [data-view="todayView"]').forEach(button => button.style.display = showDailyOperations ? '' : 'none');
  document.querySelectorAll('[data-view="historyView"]').forEach(button => button.style.display = showHistory && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="manageView"]').forEach(button => button.style.display = showManage && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="platformAdminView"]').forEach(button => { button.hidden = !showPlatformAdmin; button.style.display = showPlatformAdmin ? '' : 'none'; });
  document.querySelectorAll('[data-view="rolloutView"], [data-section-view="rolloutView"]').forEach(button => button.style.display = rollout.allowed && subscriptionFeatureEnabled('rollouts') ? '' : 'none');
  document.querySelectorAll('[data-view="helpView"]').forEach(button => button.style.display = showManage && !tech ? '' : 'none');
  document.querySelectorAll('[data-view="locationsView"]').forEach(button => button.style.display = showLocations ? '' : 'none');
  document.querySelectorAll('[data-view="receiptsView"]').forEach(button => button.style.display = canAddStoreDocuments(user) && subscriptionFeatureEnabled('receipts') ? '' : 'none');
  document.querySelectorAll('[data-view="inspectionsView"]').forEach(button => button.style.display = canAddStoreDocuments(user) && subscriptionFeatureEnabled('inspections') ? '' : 'none');
  document.querySelectorAll('[data-section-view="locationsView"]').forEach(button => button.style.display = showLocations ? '' : 'none');
  document.querySelectorAll('#manageSectionHub [data-section-view="receiptsView"], #manageSectionHub [data-section-view="inspectionsView"]').forEach(button => button.style.display = canAddStoreDocuments(user) ? '' : 'none');
  if ($('#alertRulesCard')) $('#alertRulesCard').style.display = subscriptionFeatureEnabled('advanced_alerts') ? '' : 'none';
  if ($('#storeAlarmAdminCard')) $('#storeAlarmAdminCard').style.display = subscriptionFeatureEnabled('advanced_alerts') ? '' : 'none';
  if ($('#financialImportCard')) $('#financialImportCard').hidden = !(isFullAccess(user) && subscriptionFeatureEnabled('advanced_reports'));
  if ($('#companyDashboardDefaultCard')) $('#companyDashboardDefaultCard').hidden = !companyDashboardDefaultEditable;
  $('#changePasswordBtn').style.display = window.dailyOpsAuth?.enabled && window.dailyOpsAuth?.authMode !== 'kiosk' ? '' : 'none';
  $('#signOutBtn').style.display = window.dailyOpsAuth?.enabled ? '' : 'none';
  $('#sideUserName').textContent = user.name;
  $('#sideUserRole').textContent = user.role;
  if (tech && ($('#taskListsView').classList.contains('active') || $('#tempLogsView').classList.contains('active') || $('#todayView').classList.contains('active') || $('#calendarView').classList.contains('active') || $('#storeDocsView').classList.contains('active') || $('#smallwaresView').classList.contains('active') || $('#managementReportsView').classList.contains('active') || $('#historyView').classList.contains('active') || $('#manageView').classList.contains('active') || $('#receiptsView').classList.contains('active') || $('#inspectionsView').classList.contains('active'))) switchView('homeView');
  if (!showHub && ($('#homeView').classList.contains('active') || $('#maintenanceView').classList.contains('active') || $('#fpcView').classList.contains('active') || $('#calendarView').classList.contains('active') || $('#storeDocsView').classList.contains('active') || $('#smallwaresView').classList.contains('active'))) switchView('todayView');
  if (!showMaintenanceLog && $('#maintenanceLogView').classList.contains('active')) switchView(canUseDailyOps(user) ? 'todayView' : 'homeView');
  if (!showLocationHealth && $('#locationHealthView').classList.contains('active')) switchView(canUseDailyOps(user) ? 'todayView' : 'homeView');
  if (!showHistory && $('#historyView').classList.contains('active')) switchView('todayView');
  if (!showManage && $('#manageView').classList.contains('active')) switchView('todayView');
  if (!showPlatformAdmin && $('#platformAdminView').classList.contains('active')) switchView('homeView');
  if (!rollout.allowed && $('#rolloutView').classList.contains('active')) switchView('todayView');
  if (!showManage && $('#helpView').classList.contains('active')) switchView('todayView');
  if (!showLocations && $('#locationsView').classList.contains('active')) switchView('todayView');
  if (!canAddStoreDocuments(user) && ($('#receiptsView').classList.contains('active') || $('#inspectionsView').classList.contains('active'))) switchView('todayView');
}

function managementReportMinimumRole(report = {}) {
  return {
    'Shift Manager': 'Manager',
    Manager: 'Area Manager',
    'Area Manager': 'Director of Operations',
    'Director of Operations': 'Owner'
  }[report.reportedByRole] || 'Owner';
}

function canUpdateManagementReport(report, user = currentUser()) {
  return roleRank(user.role) >= roleRank(managementReportMinimumRole(report));
}

function renderManagementReports() {
  if (!$('#managementReportList') || !canUseManagementReports()) return;
  const visibleLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  const locationSelect = $('#managementReportLocation');
  const selectedLocation = locationSelect.value || currentLocationId;
  locationSelect.innerHTML = visibleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  locationSelect.value = visibleLocations.some(location => location.id === selectedLocation) ? selectedLocation : (visibleLocations[0]?.id || currentLocationId);
  locationSelect.disabled = visibleLocations.length < 2;
  const reports = (managementReports.reports || []).filter(report => managementReportStatusFilter === 'all' || (managementReportStatusFilter === 'open' ? report.status !== 'Resolved' : report.status === 'Resolved'));
  const openCount = (managementReports.reports || []).filter(report => report.status !== 'Resolved').length;
  $('#managementReportCount').textContent = `${openCount} open`;
  document.querySelectorAll('[data-management-report-filter]').forEach(button => button.classList.toggle('active', button.dataset.managementReportFilter === managementReportStatusFilter));
  $('#managementReportList').innerHTML = reports.length ? reports.map(report => {
    const canUpdate = canUpdateManagementReport(report);
    const amount = report.amount === null || report.amount === undefined ? '' : `<span class="management-report-amount">$${Number(report.amount).toFixed(2)}</span>`;
    return `
      <article class="card management-report-card severity-${escapeHtml(String(report.severity || 'Medium').toLowerCase())}">
        <div class="management-report-heading">
          <div>
            <p class="eyebrow">${escapeHtml(report.locationName || locationName(report.locationId))} · ${escapeHtml(report.type || 'Store issue')}</p>
            <h3>${escapeHtml(report.title)}</h3>
          </div>
          <div class="management-report-badges"><span class="status">${escapeHtml(report.severity || 'Medium')}</span><span class="status">${escapeHtml(report.status || 'Open')}</span>${amount}</div>
        </div>
        <p class="hint">Reported by ${escapeHtml(report.reportedBy || '')} · ${escapeHtml(report.reportedByRole || '')} · ${report.createdAt ? new Date(report.createdAt).toLocaleString() : ''}</p>
        <p>${escapeHtml(report.details || '')}</p>
        ${report.immediateAction ? `<p><b>Immediate action:</b> ${escapeHtml(report.immediateAction)}</p>` : ''}
        ${report.followUp ? `<div class="management-follow-up"><b>Management follow-up</b><p>${escapeHtml(report.followUp)}</p><small>${escapeHtml(report.reviewedBy || '')}${report.updatedAt ? ` · ${new Date(report.updatedAt).toLocaleString()}` : ''}</small></div>` : ''}
        ${canUpdate ? `<div class="management-review-controls">
          <label>Status<select data-management-status="${escapeHtml(report.id)}"><option ${report.status === 'Open' ? 'selected' : ''}>Open</option><option ${report.status === 'Reviewing' ? 'selected' : ''}>Reviewing</option><option ${report.status === 'Resolved' ? 'selected' : ''}>Resolved</option></select></label>
          <label>Management follow-up<textarea data-management-followup="${escapeHtml(report.id)}" rows="2" placeholder="Document review, action taken, or resolution">${escapeHtml(report.followUp || '')}</textarea></label>
          <button data-management-update="${escapeHtml(report.id)}" type="button">Save follow-up</button>
        </div>` : ''}
      </article>`;
  }).join('') : '<div class="empty">No management reports match this view.</div>';
}

function renderLocations() {
  const editable = canEditLocations();
  const visibleLocations = isFullAccess() ? locations : locations.filter(location => accessibleLocationIds().includes(location.id));
  $('#importLocationsCard').style.display = editable ? '' : 'none';
  $('#locationAdminCard').querySelector('.hint').textContent = editable
    ? 'Update each location’s name, street address, and public phone number.'
    : 'Contact details for your assigned locations.';
  $('#locationList').innerHTML = visibleLocations.map(location => editable ? `
    <article class="location-directory-card location-directory-edit">
      <div class="location-directory-heading"><span class="status">${escapeHtml(location.id.replace('store-', 'Store '))}</span></div>
      <label>Location name<input data-location-name="${escapeHtml(location.id)}" value="${escapeHtml(location.name)}"></label>
      <label>Street address<input data-location-address="${escapeHtml(location.id)}" value="${escapeHtml(location.address || '')}" placeholder="123 Main Street, City, State ZIP"></label>
      <label>Phone number<input data-location-phone="${escapeHtml(location.id)}" type="tel" value="${escapeHtml(location.phone || '')}" placeholder="(555) 555-0123"></label>
      <button data-location-save="${escapeHtml(location.id)}" type="button">Save location</button>
    </article>
  ` : `
    <article class="location-directory-card">
      <div class="location-directory-heading"><div><p class="eyebrow">${escapeHtml(location.id.replace('store-', 'Store '))}</p><h3>${escapeHtml(location.name)}</h3></div></div>
      <p class="location-address">${location.address ? escapeHtml(location.address) : 'Address not entered yet'}</p>
      ${location.phone ? `<a class="location-phone" href="tel:${escapeHtml(String(location.phone).replace(/[^+\d]/g, ''))}">${escapeHtml(location.phone)}</a>` : '<p class="hint">Phone number not entered yet</p>'}
    </article>
  `).join('') || '<div class="empty">No assigned locations are available.</div>';
}

async function loadReceiptsState() {
  if (!apiOnline || !canAddStoreDocuments()) return;
  try { receipts = await api('/api/receipts/state'); } catch { receipts = { receipts: [] }; }
}

async function loadInspectionsState() {
  if (!apiOnline || !canAddStoreDocuments()) return;
  try { inspections = await api('/api/inspections/state'); } catch { inspections = { templates: [], inspections: [] }; }
}

function renderOverdue() {
  const scopedOverdue = overdue.filter(item => accessibleLocationIds().includes(item.locationId));
  $('#overdueList').innerHTML = scopedOverdue.length
    ? scopedOverdue.map(item => `<div class="overdue-row"><b>${escapeHtml(item.locationName)}</b><span>${escapeHtml(item.status)}</span></div>`).join('')
    : '<p class="hint">All locations have completed today’s checklist.</p>';
}

function checkpointOptions(locationId = currentLocationId, selected = '') {
  return (qrCheckpoints.checkpoints || [])
    .filter(checkpoint => checkpoint.active !== false && checkpoint.locationId === locationId)
    .map(checkpoint => `<option value="${escapeHtml(checkpoint.id)}" ${checkpoint.id === selected ? 'selected' : ''}>${escapeHtml(checkpoint.name)}</option>`)
    .join('');
}

function renderQrCheckpoints() {
  if (!$('#qrCheckpointAdminCard')) return;
  const canManage = qrCheckpoints.canManage && canUseManage();
  $('#qrCheckpointAdminCard').hidden = !canManage;
  if (!canManage) return;
  const allowedLocations = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  const preferredLocationId = $('#qrCheckpointLocation').value || currentLocationId;
  const locationOptions = allowedLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  $('#qrCheckpointLocation').innerHTML = locationOptions;
  $('#qrCheckpointLocation').value = allowedLocations.some(location => location.id === preferredLocationId) ? preferredLocationId : (allowedLocations.find(location => location.id === currentLocationId)?.id || allowedLocations[0]?.id || '');
  $('#qrCheckpointMigrationHelp').hidden = qrCheckpoints.migrationReady;
  $('#qrCheckpointLogDate').value = qrCheckpointLogDate;
  $('#saveQrCheckpointBtn').disabled = !qrCheckpoints.migrationReady;
  const active = (qrCheckpoints.checkpoints || []).filter(checkpoint => checkpoint.active !== false);
  $('#qrCheckpointList').innerHTML = active.length ? active.map(checkpoint => {
    const scans = (qrCheckpoints.scans || []).filter(scan => scan.checkpointId === checkpoint.id);
    const period = qrCheckpointLogDate === dateKey ? 'today' : prettyDate(qrCheckpointLogDate);
    const target = checkpoint.targetVisits ? `${scans.length}/${checkpoint.targetVisits} visits ${period}` : `${scans.length} visit${scans.length === 1 ? '' : 's'} ${period}`;
    return `<article class="qr-checkpoint-row">
      <div><b>${escapeHtml(checkpoint.name)}</b><p>${escapeHtml(locationName(checkpoint.locationId))}${checkpoint.area ? ` · ${escapeHtml(checkpoint.area)}` : ''}</p><span class="status">${escapeHtml(target)}</span></div>
      <div class="row-actions"><button class="ghost" data-qr-print="${escapeHtml(checkpoint.id)}" type="button">Print QR</button><button class="ghost" data-qr-edit="${escapeHtml(checkpoint.id)}" type="button">Edit</button><button class="danger" data-qr-deactivate="${escapeHtml(checkpoint.id)}" type="button">Deactivate</button></div>
    </article>`;
  }).join('') : '<p class="hint">No QR checkpoints have been created yet.</p>';
  $('#qrCheckpointScanLog').innerHTML = (qrCheckpoints.scans || []).length ? qrCheckpoints.scans.map(scan => {
    const checkpoint = active.find(entry => entry.id === scan.checkpointId);
    return `<div class="qr-scan-row"><span><b>${escapeHtml(checkpoint?.name || 'Checkpoint')}</b> · ${escapeHtml(locationName(scan.locationId))}${scan.taskName ? ` · Task: ${escapeHtml(scan.taskName)}` : ''}</span><span>${escapeHtml(scan.userName)} · ${escapeHtml(new Date(scan.scannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span></div>`;
  }).join('') : '<p class="hint">No checkpoint scans were recorded for the selected date.</p>';

  const todayCheckpointOptions = checkpointOptions(currentLocationId);
  $('#newTaskQrCheckpoint').innerHTML = todayCheckpointOptions || '<option value="">Create a checkpoint first</option>';
  $('#newTaskQrRequired').disabled = !todayCheckpointOptions;
  $('#newTaskQrCheckpointLabel').hidden = !$('#newTaskQrRequired').checked;
  const templateLocation = templateScope === 'all' ? '' : templateScope;
  $('#templateQrCheckpoint').innerHTML = `<option value="">No QR scan required</option>${templateLocation ? checkpointOptions(templateLocation, $('#templateQrCheckpoint').value) : ''}`;
  $('#templateQrCheckpoint').disabled = !templateLocation;
  $('#templateQrCheckpoint').title = templateLocation ? '' : 'Choose a store-only checklist scope before assigning a physical checkpoint.';
}

async function saveQrCheckpoint() {
  const body = {
    id: $('#qrCheckpointId').value,
    locationId: $('#qrCheckpointLocation').value,
    name: $('#qrCheckpointName').value.trim(),
    area: $('#qrCheckpointArea').value.trim(),
    targetVisits: Number($('#qrCheckpointTarget').value || 0)
  };
  if (!body.name) return toast('Enter a checkpoint name');
  try {
    await api('/api/qr-checkpoints/checkpoint', { method: 'POST', body: JSON.stringify(body) });
    cancelQrCheckpointEdit();
    await loadQrCheckpointState();
    render();
    toast(body.id ? 'QR checkpoint updated' : 'QR checkpoint created');
  } catch (error) { toast(`Checkpoint did not save: ${error.message}`); }
}

function editQrCheckpoint(id) {
  const checkpoint = (qrCheckpoints.checkpoints || []).find(entry => entry.id === id);
  if (!checkpoint) return;
  $('#qrCheckpointId').value = checkpoint.id;
  $('#qrCheckpointLocation').value = checkpoint.locationId;
  $('#qrCheckpointName').value = checkpoint.name;
  $('#qrCheckpointArea').value = checkpoint.area || '';
  $('#qrCheckpointTarget').value = checkpoint.targetVisits || 0;
  $('#saveQrCheckpointBtn').textContent = 'Save checkpoint';
  $('#cancelQrCheckpointBtn').hidden = false;
  $('#qrCheckpointName').focus();
}

function cancelQrCheckpointEdit() {
  $('#qrCheckpointId').value = '';
  $('#qrCheckpointName').value = '';
  $('#qrCheckpointArea').value = '';
  $('#qrCheckpointTarget').value = '0';
  $('#saveQrCheckpointBtn').textContent = 'Create checkpoint';
  $('#cancelQrCheckpointBtn').hidden = true;
}

async function deactivateQrCheckpoint(id) {
  const checkpoint = (qrCheckpoints.checkpoints || []).find(entry => entry.id === id);
  if (!checkpoint || !confirm(`Deactivate ${checkpoint.name}? The printed code will stop working.`)) return;
  try {
    await api('/api/qr-checkpoints/deactivate', { method: 'POST', body: JSON.stringify({ id }) });
    await loadQrCheckpointState(); render(); toast('QR checkpoint deactivated');
  } catch (error) { toast(`Checkpoint did not deactivate: ${error.message}`); }
}

async function printQrCheckpoint(id) {
  const printWindow = window.open('', '_blank', 'width=850,height=1000');
  if (!printWindow) return toast('Allow pop-ups to print the QR checkpoint');
  printWindow.document.write('<p style="font-family:sans-serif;padding:30px">Preparing printable checkpoint…</p>');
  try {
    const result = await api(`/api/qr-checkpoints/qr?id=${encodeURIComponent(id)}`);
    const checkpoint = result.checkpoint;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(checkpoint.name)} QR checkpoint</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:40px;color:#0c315c}.sheet{border:5px solid #0c315c;border-radius:28px;max-width:720px;margin:auto;padding:36px}h1{font-size:42px;margin:0 0 8px}.location{font-size:25px;font-weight:bold}.instructions{font-size:22px;color:#52677f}svg{width:min(90vw,560px);height:auto}.footer{margin-top:20px;font-size:18px}@media print{button{display:none}.sheet{break-inside:avoid}}</style></head><body><div class="sheet"><p>DQ OPS PHYSICAL CHECKPOINT</p><h1>${escapeHtml(checkpoint.name)}</h1><p class="location">${escapeHtml(locationName(checkpoint.locationId))}</p>${checkpoint.area ? `<p class="instructions">${escapeHtml(checkpoint.area)}</p>` : ''}${result.svg}<p class="footer">Scan with the store device, then identify yourself with your employee PIN if requested.</p><button onclick="window.print()">Print checkpoint</button></div></body></html>`);
    printWindow.document.close();
  } catch (error) { printWindow.close(); toast(`QR code did not load: ${error.message}`); }
}

function tokenFromCheckpointInput(value = '') {
  const input = String(value || '').trim();
  if (!input) return '';
  try { return new URL(input, location.origin).searchParams.get('checkpoint') || input; } catch { return input; }
}

function stopQrScanner() {
  if (qrScannerTimer) clearInterval(qrScannerTimer);
  qrScannerTimer = null;
  if (qrScannerStream) qrScannerStream.getTracks().forEach(track => track.stop());
  qrScannerStream = null;
  if ($('#qrScannerVideo')) { $('#qrScannerVideo').srcObject = null; $('#qrScannerVideo').hidden = true; }
}

function openQrScanner(taskId = '') {
  qrScannerTaskId = taskId;
  const task = (day.tasks || []).find(entry => entry.id === taskId);
  $('#qrScannerTitle').textContent = task ? `Scan for: ${task.name}` : 'Scan QR checkpoint';
  $('#qrScannerHint').textContent = task?.qrCheckpointName ? `Scan the “${task.qrCheckpointName}” code to complete this task.` : 'Point the camera at the printed DQ OPS checkpoint code.';
  $('#qrScannerStatus').textContent = 'Camera is not started.';
  $('#qrScannerManualToken').value = '';
  $('#qrScannerDialog').showModal();
}

async function startQrScanner() {
  stopQrScanner();
  if (!('BarcodeDetector' in window)) {
    $('#qrScannerStatus').textContent = 'This device does not support in-app QR scanning. Use its Camera app to open the printed code.';
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    qrScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const video = $('#qrScannerVideo');
    video.srcObject = qrScannerStream; video.hidden = false; await video.play();
    $('#qrScannerStatus').textContent = 'Looking for a QR checkpoint…';
    qrScannerTimer = setInterval(async () => {
      if (!qrScannerStream || video.readyState < 2) return;
      const codes = await detector.detect(video).catch(() => []);
      if (codes[0]?.rawValue) { stopQrScanner(); await recordQrCheckpointScan(tokenFromCheckpointInput(codes[0].rawValue), qrScannerTaskId); }
    }, 500);
  } catch (error) { stopQrScanner(); $('#qrScannerStatus').textContent = `Camera could not start: ${error.message}`; }
}

async function recordQrCheckpointScan(token, taskId = '') {
  if (!token) return toast('Scan or paste a checkpoint code');
  try {
    const result = await api('/api/qr-checkpoints/scan', { method: 'POST', body: JSON.stringify({ token, taskId, date: dateKey }) });
    if (result.day) day = result.day;
    await loadQrCheckpointState();
    $('#qrScannerDialog')?.close(); stopQrScanner(); render();
    toast(result.duplicate ? (result.taskComplete ? 'This task was already completed' : 'This visit was already recorded') : (result.taskComplete ? 'Task completed by QR scan' : `${result.checkpoint.name} visit recorded`));
  } catch (error) { $('#qrScannerStatus').textContent = error.message; toast(`Scan did not save: ${error.message}`); }
}

let pendingQrLinkHandled = false;
async function processPendingQrLink() {
  if (pendingQrLinkHandled || !apiOnline) return;
  const url = new URL(location.href);
  const token = url.searchParams.get('checkpoint');
  if (!token) return;
  pendingQrLinkHandled = true;
  url.searchParams.delete('checkpoint');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  await recordQrCheckpointScan(token);
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
  const sections = allSections;
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
                <label>Area
                  <select data-template-edit-area="${escapeHtml(id)}">
                    <option value="">Not designated</option>
                    ${managerTaskAreas.map(area => `<option value="${escapeHtml(area)}" ${area === task.area ? 'selected' : ''}>${escapeHtml(area)}</option>`).join('')}
                  </select>
                </label>
                <label>Prep list
                  <select data-template-edit-prep="${escapeHtml(id)}">
                    <option value="" ${task.prepArea ? '' : 'selected'}>Not prep</option>
                    ${prepAreas.map(area => `<option value="${escapeHtml(area)}" ${area === task.prepArea ? 'selected' : ''}>${escapeHtml(area)} prep</option>`).join('')}
                  </select>
                </label>
                <label class="check"><input type="checkbox" data-template-edit-photo="${escapeHtml(id)}" ${task.photo ? 'checked' : ''}> Require a photo</label>
                <label>QR checkpoint
                  <select data-template-edit-qr="${escapeHtml(id)}"><option value="">No QR scan required</option>${checkpointOptions(templateLocationId(task), task.qrCheckpointId || '')}</select>
                </label>
                <div class="row-actions">
                  <button data-template-save="${escapeHtml(id)}" type="button">Save</button>
                  <button class="ghost" data-template-cancel="${escapeHtml(id)}" type="button">Cancel</button>
                </div>
              </div>
            ` : `
          <div class="template-row">
            <div>
              <b>${escapeHtml(task.name)}</b>
              <p class="hint">${escapeHtml(task.category || taskCategory(task))}${task.area ? ` • ${escapeHtml(task.area)}` : ''}${task.prepArea ? ` • ${escapeHtml(task.prepArea)} prep quantity item` : ''} • ${task.photo ? 'Photo required' : 'No photo required'}${task.qrCheckpointId ? ` • QR: ${escapeHtml(task.qrCheckpointName || 'checkpoint required')}` : ''}</p>
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
  const activeNotices = notices.filter(notice => notice.unread && !notice.expired);
  const previousNotices = notices.filter(notice => !notice.unread || notice.expired);
  const unreadCount = activeNotices.length;
  $('#noticeBadge').textContent = unreadCount;
  $('#noticeBadge').style.display = unreadCount ? 'inline-flex' : 'none';
  $('#noticesBtn').classList.toggle('has-unread', unreadCount > 0);
  $('#noticesBtn').setAttribute('aria-label', unreadCount ? `Notices, ${unreadCount} unread` : 'Notices');
  $('#noticesBtn').title = unreadCount ? `${unreadCount} unread notice${unreadCount === 1 ? '' : 's'}` : 'Notices';
  if (!$('#noticeList')) return;
  const noticeMarkup = list => list.length ? list.map(notice => `
    <article class="card notice-card ${notice.unread ? 'unread' : ''}">
      <div class="notice-head">
        <div>
          <h3>${escapeHtml(notice.title)}</h3>
          ${notice.targetRoles?.length ? `<p class="hint">Visible to: ${notice.targetRoles.map(escapeHtml).join(', ')}</p>` : ''}
          ${notice.visibleToActor === false ? '<p class="hint">Managed notice · not targeted to your role</p>' : ''}
          <p class="hint">${escapeHtml(notice.createdBy || 'Manager')} · ${notice.createdAt ? new Date(notice.createdAt).toLocaleString() : ''}</p>
          ${notice.endDate ? `<p class="hint">Active through ${escapeHtml(prettyDate(notice.endDate))}</p>` : ''}
        </div>
        ${notice.unread ? '<span class="status">New</span>' : ''}
      </div>
      <p>${escapeHtml(notice.message)}</p>
      ${notice.attachmentUrl ? `<p><a href="${escapeHtml(notice.attachmentUrl)}" target="_blank" rel="noopener">${escapeHtml(notice.attachmentName || 'Open attachment')}</a></p>` : ''}
      ${notice.unread ? `<button data-notice-read="${escapeHtml(notice.id)}">Mark as read</button>` : ''}
      ${notice.editable ? `<div class="row-actions"><button class="ghost" data-notice-edit="${escapeHtml(notice.id)}" type="button">Edit</button><button class="danger" data-notice-delete="${escapeHtml(notice.id)}" type="button">Delete</button></div>` : ''}
    </article>
  `).join('') : '<div class="empty">No notices here.</div>';
  $('#noticeList').innerHTML = noticeMarkup(activeNotices);
  $('#previousNoticeList').innerHTML = noticeMarkup(previousNotices);
  $('#previousNoticeList').hidden = !showPreviousNotices;
  $('#togglePreviousNoticesBtn').textContent = showPreviousNotices ? 'Hide previous notifications' : `Previous notifications (${previousNotices.length})`;
}

function alertTargetOptions(type = $('#alertRuleType')?.value || 'task') {
  if (type === 'temperature') {
    return temperatureListNames().filter(list => temperatureItems[list]?.requiredDaily !== false).flatMap(list => tempSessions.flatMap(session => [
      { value: `${list}|${session}`, label: `${list} full temp log · ${session}` },
      ...Object.entries(temperatureAreasForList(list)).flatMap(([area, items]) => items.map(item => ({ value: `${list}|${session}|${area}|${item}`, label: `${item} · ${session}` })))
    ]));
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
  $('#alertChannelInApp').checked = false;
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
  $('#alertChannelInApp').checked = (rule.channels || []).includes('in-app');
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
  const roles = ['Employee', 'Shift Manager', 'Manager', 'Area Manager', 'Director of Operations', 'Owner'];
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
  const selectedHomeLocation = $('#newUserLocation').value;
  $('#newUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}">${location.name}</option>`).join('');
  if (visibleLocations.some(location => location.id === selectedHomeLocation)) $('#newUserLocation').value = selectedHomeLocation;
  $('#newUserRole').innerHTML = roles.map(role => `<option>${role}</option>`).join('');
  renderNewUserLocationChecks();
  $('#addUserCard').style.display = roles.length ? '' : 'none';
  $('#importUsersCard').style.display = roles.length ? '' : 'none';
  $('#usersCard').style.display = canUseManage(actor) ? '' : 'none';
  renderKioskAdmin();
  $('#userList').innerHTML = manageableUsers(actor).map(user => `
    <article class="card user-row compact-user-row">
      <span class="avatar">${initials(user.name)}</span>
      <div>
        <b>${escapeHtml(user.name)}</b>
        <p>${escapeHtml(user.role)}${user.maintenance || isMaintenanceTech(user) ? ' · Maintenance' : ''} · ${userLocationIds(user).map(locationName).join(', ')}</p>
      </div>
      <div class="row-actions">
        <button data-user-edit="${user.id}">Edit</button>
        ${user.id === actor.id ? '' : `<button class="danger" data-user-deactivate="${user.id}">Deactivate</button>`}
      </div>
    </article>
  `).join('');
}

function roleUsesMultipleLocations(role) {
  return ['Employee', 'Shift Manager', 'Manager', 'Area Manager', maintenanceRole, 'Director of Operations', 'Owner'].includes(role);
}

function roleRank(role = 'Employee') {
  return {
    Employee: 0,
    'Shift Manager': 1,
    Manager: 2,
    [maintenanceRole]: 2,
    'Area Manager': 3,
    'Director of Operations': 4,
    Owner: 5
  }[role] ?? 0;
}

function renderNewUserLocationChecks({ reset = false } = {}) {
  if (!$('#newUserLocations')) return;
  const locationId = $('#newUserLocation').value;
  const selected = reset ? [] : [...document.querySelectorAll('#newUserLocations input:checked')].map(input => input.value);
  const selectedIds = [...new Set([...(selected.length ? selected : []), locationId].filter(Boolean))];
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
            <p>${task.pushed ? 'Manager-added task' : 'Standard task'}${task.done && task.completedBy ? ` · Completed by ${escapeHtml(task.completedBy)}${task.completedAt ? ` at ${escapeHtml(new Date(task.completedAt).toLocaleString())}` : ''}` : ''}${task.photo ? ` · Photo ${task.photoUrl || task.photoData ? 'attached' : 'required but missing'}` : ''}${task.photoBy ? ` · Photo by ${escapeHtml(task.photoBy)}` : ''}</p>
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
                ${readings.map(reading => `<span class="reading-chip">${formattedTemperatureReading(reading)} · ${escapeHtml(formatClockTime(reading.time))}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') : '<p class="hint">No temperature readings recorded.</p>'}
    </article>
    ${(entry.receivingIssues || []).length ? `<article class="card report-card"><h3>Receiving issues</h3>${entry.receivingIssues.map(issue => `<div class="report-line"><span>!</span><div><b>${escapeHtml(issue.note || 'Photo-only issue')}</b><p>${escapeHtml(formatClockTime(issue.time || ''))}${issue.userName ? ` · ${escapeHtml(issue.userName)}` : ''}</p>${issue.photoUrl ? `<a href="${escapeHtml(fullPhotoUrl(issue.photoUrl))}" target="_blank" rel="noopener">View photo</a>` : issue.photoData ? `<a href="${escapeHtml(issue.photoData)}" target="_blank" rel="noopener">View photo</a>` : ''}</div></div>`).join('')}</article>` : ''}
  `;
}

function renderTemperatureHistoryControls(visibleLocations = [], allowAll = false) {
  const select = $('#temperatureHistoryLocation');
  if (!select) return;
  const previous = select.value || currentLocationId;
  select.innerHTML = `${allowAll ? '<option value="all">All assigned locations</option>' : ''}${visibleLocations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('')}`;
  const valid = [...select.options].some(option => option.value === previous);
  select.value = valid ? previous : (allowAll ? 'all' : visibleLocations[0]?.id || currentLocationId);
}

function temperatureStatusSummaryLabel(code) {
  return ({ complete: 'Complete', partial: 'Partial', none: 'No temperatures', closed: 'Location closed', 'not-scheduled': 'Not scheduled' })[code] || code;
}

function temperatureHistoryEntryMarkup(entry) {
  const progress = entry.expected ? `${entry.completed} of ${entry.expected} required readings` : 'No temperature log scheduled';
  const closure = entry.statusCode === 'closed' ? `<p><b>Closure reason:</b> ${escapeHtml(entry.closedReason || '')}${entry.closedBy ? ` · Marked by ${escapeHtml(entry.closedBy)}` : ''}</p>` : '';
  const readings = (entry.readings || []).length ? `<div class="temperature-history-readings"><b>Recorded readings</b><div>${entry.readings.map(reading => `<span class="reading-chip">${escapeHtml(readingList(reading))} · ${escapeHtml(reading.item || '')}: ${formattedTemperatureReading(reading)}${reading.time ? ` · ${escapeHtml(formatClockTime(reading.time))}` : ''}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</span>`).join('')}</div></div>` : '<p class="hint">No temperatures were recorded this day.</p>';
  const closureButton = temperatureCompliance.canMarkClosed && ['none', 'closed', 'not-scheduled'].includes(entry.statusCode)
    ? `<button class="ghost" type="button" data-temperature-closure-date="${escapeHtml(entry.date)}" data-temperature-closure-location="${escapeHtml(entry.locationId)}">${entry.statusCode === 'closed' ? 'Edit closed status' : 'Mark location closed'}</button>`
    : '';
  return `<details class="temperature-history-row">
    <summary><div><h4>${escapeHtml(prettyDate(entry.date))} · ${escapeHtml(entry.locationName)}</h4><p>${escapeHtml(progress)}</p></div><span class="temperature-history-status ${escapeHtml(entry.statusCode)}">${escapeHtml(entry.status)}</span></summary>
    <div class="temperature-history-detail">
      ${closure}
      ${(entry.logs || []).map(log => `<div class="temperature-history-log"><span>${escapeHtml(log.list)}</span><b>${log.completed}/${log.expected}</b></div>`).join('')}
      ${readings}
      ${closureButton ? `<div class="report-actions">${closureButton}</div>` : ''}
    </div>
  </details>`;
}

function renderTemperatureCompliance() {
  if (!$('#temperatureHistoryList')) return;
  const totals = temperatureCompliance.totals || {};
  $('#temperatureHistorySummary').innerHTML = temperatureCompliance.loaded
    ? ['complete', 'partial', 'none', 'closed', 'not-scheduled'].map(code => `<span class="status">${escapeHtml(temperatureStatusSummaryLabel(code))}: ${Number(totals[code] || 0)}</span>`).join('')
    : '';
  if (temperatureCompliance.loading) {
    $('#temperatureHistoryList').innerHTML = '<div class="empty">Loading temperature records…</div>';
    return;
  }
  if (!temperatureCompliance.loaded) return;
  $('#temperatureHistoryList').innerHTML = temperatureCompliance.entries?.length
    ? temperatureCompliance.entries.map(temperatureHistoryEntryMarkup).join('')
    : '<div class="empty">No calendar days match this report.</div>';
}

async function loadTemperatureCompliance() {
  if (!apiOnline || temperatureCompliance.loading) return;
  const start = $('#temperatureHistoryStart').value;
  const end = $('#temperatureHistoryEnd').value;
  const locationId = $('#temperatureHistoryLocation').value || currentLocationId;
  temperatureCompliance.loading = true;
  renderTemperatureCompliance();
  try {
    const result = await api(`/api/temperature-compliance?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&locationId=${encodeURIComponent(locationId)}`);
    temperatureCompliance = { ...result, loaded: true, loading: false };
  } catch (error) {
    temperatureCompliance = { ...temperatureCompliance, loaded: true, loading: false, entries: [], totals: {} };
    toast(`Temperature history did not load: ${error.message}`);
  }
  renderTemperatureCompliance();
}

function openTemperatureClosure(entry) {
  $('#temperatureClosureLocationId').value = entry.locationId;
  $('#temperatureClosureDate').value = entry.date;
  $('#temperatureClosureReason').value = entry.closedReason || '';
  $('#temperatureClosureTitle').textContent = entry.statusCode === 'closed' ? 'Edit closed status' : 'Mark location closed';
  $('#temperatureClosureDescription').textContent = `${entry.locationName} · ${prettyDate(entry.date)}`;
  $('#removeTemperatureClosureBtn').hidden = entry.statusCode !== 'closed';
  $('#saveTemperatureClosureBtn').textContent = entry.statusCode === 'closed' ? 'Save closed status' : 'Mark location closed';
  $('#temperatureClosureDialog').showModal();
}

async function saveTemperatureClosure(closed) {
  const locationId = $('#temperatureClosureLocationId').value;
  const date = $('#temperatureClosureDate').value;
  const reason = $('#temperatureClosureReason').value.trim();
  if (closed && !reason) return toast('Enter why the location was closed');
  try {
    const result = await api('/api/temperature-compliance/closure', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        date,
        closed,
        reason,
        start: $('#temperatureHistoryStart').value,
        end: $('#temperatureHistoryEnd').value,
        reportLocationId: $('#temperatureHistoryLocation').value || locationId
      })
    });
    temperatureCompliance = { ...result, loaded: true, loading: false };
    $('#temperatureClosureDialog').close();
    renderTemperatureCompliance();
    toast(closed ? 'Location closure recorded' : 'Closed status removed');
  } catch (error) {
    toast(`Temperature record did not save: ${error.message}`);
  }
}

function temperatureComplianceDocument() {
  const entries = temperatureCompliance.entries || [];
  const title = `Temperature compliance · ${temperatureCompliance.start || ''} through ${temperatureCompliance.end || ''}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px Arial,sans-serif;color:#102f55;margin:28px}h1{margin-bottom:4px}.hint{color:#64748b}.record{border-top:1px solid #cbd5e1;padding:12px 0;page-break-inside:avoid}.head{display:flex;justify-content:space-between;gap:16px}.status{font-weight:bold}.complete{color:#166534}.partial{color:#92400e}.none{color:#991b1b}.closed{color:#1e40af}.log{margin:4px 0}.reading{margin:5px 0 0 16px;font-size:12px}</style></head><body><h1>${escapeHtml(title)}</h1><p class="hint">This report includes every calendar day in the selected range. Missing days are shown explicitly and no readings are inferred.</p>${entries.map(entry => `<section class="record"><div class="head"><div><b>${escapeHtml(prettyDate(entry.date))} · ${escapeHtml(entry.locationName)}</b><div>${entry.expected ? `${entry.completed} of ${entry.expected} required readings` : 'No temperature log scheduled'}</div></div><span class="status ${escapeHtml(entry.statusCode)}">${escapeHtml(entry.status)}</span></div>${entry.closedReason ? `<p><b>Closure reason:</b> ${escapeHtml(entry.closedReason)}${entry.closedBy ? ` · ${escapeHtml(entry.closedBy)}` : ''}</p>` : ''}${(entry.logs || []).map(log => `<div class="log">${escapeHtml(log.list)}: ${log.completed}/${log.expected}</div>`).join('')}${(entry.readings || []).length ? entry.readings.map(reading => `<div class="reading">${escapeHtml(readingList(reading))} · ${escapeHtml(reading.item || '')}: ${formattedTemperatureReading(reading)}${reading.time ? ` · ${escapeHtml(formatClockTime(reading.time))}` : ''}${reading.userName ? ` · ${escapeHtml(reading.userName)}` : ''}</div>`).join('') : '<p><b>No temperatures were recorded this day.</b></p>'}</section>`).join('')}</body></html>`;
}

function exportTemperatureCompliance() {
  if (!temperatureCompliance.loaded || !temperatureCompliance.entries?.length) return toast('Load the temperature report before exporting it');
  const blob = new Blob([temperatureComplianceDocument()], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `temperature-compliance-${temperatureCompliance.start}-${temperatureCompliance.end}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function refreshNoticesQuietly() {
  if (!apiOnline) return;
  try {
    notices = (await api('/api/notices')).notices || [];
    renderNotices();
  } catch {}
}

function preferenceChannelHtml(key, channels = []) {
  const options = [['sms', 'Text'], ['email', 'Email'], ['in-app', 'App notification']];
  return `<b>Send by</b><div class="location-checks">${options.map(([value, label]) => `<label class="location-check"><input type="checkbox" data-pref-channel="${escapeHtml(key)}" value="${value}" ${channels.includes(value) ? 'checked' : ''}> ${label}</label>`).join('')}</div>`;
}

function subscriptionFeatureEnabled(key) {
  const features = subscriptionAdmin.subscription?.features;
  return !features || features[key] !== false;
}

function subscriptionAddonEnabled(addonKey, locationId = '') {
  const addons = subscriptionAdmin.locationAddons || [];
  return addons.some(addon => addon.enabled && addon.addonKey === addonKey && (!locationId || addon.locationId === locationId));
}

function selectedSubscriptionPlan() {
  const key = $('#subscriptionPlan')?.value || subscriptionAdmin.subscription?.planKey;
  return (subscriptionAdmin.plans || []).find(plan => plan.key === key);
}

function renderSubscriptionFeatures(useEffectiveSubscription = true) {
  const container = $('#subscriptionFeatureList');
  if (!container) return;
  const selectedPlan = selectedSubscriptionPlan();
  const planFeatures = selectedPlan?.features || {};
  const effectiveFeatures = subscriptionAdmin.subscription?.features || planFeatures;
  container.innerHTML = (subscriptionAdmin.featureCatalog || []).map(feature => {
    const enabled = useEffectiveSubscription ? effectiveFeatures[feature.key] !== false : Boolean(planFeatures[feature.key]);
    const included = Boolean(planFeatures[feature.key]);
    return `<label class="subscription-feature ${enabled ? 'enabled' : ''}"><input type="checkbox" data-subscription-feature="${escapeHtml(feature.key)}" ${enabled ? 'checked' : ''} ${subscriptionAdmin.canEdit && subscriptionAdmin.migrationReady ? '' : 'disabled'}><span><b>${escapeHtml(feature.name)}</b><small>${escapeHtml(feature.description)}</small><em>${included ? 'Included in plan' : (enabled ? 'Custom add-on' : 'Not included')}</em></span></label>`;
  }).join('');
}

function renderSubscriptionAdmin() {
  const card = $('#subscriptionAdminCard');
  if (!card) return;
  const allowed = Boolean(subscriptionAdmin.canView && (isFullAccess() || subscriptionAdmin.platformAdmin));
  card.hidden = !allowed;
  card.style.display = allowed ? '' : 'none';
  if (!allowed) return;

  const subscription = subscriptionAdmin.subscription || {};
  const plans = subscriptionAdmin.plans || [];
  $('#subscriptionMigrationStatus').textContent = subscriptionAdmin.migrationReady ? `${subscription.planName || subscription.planKey || 'Plan'} · ${subscription.status || 'active'}` : 'Database setup required';
  $('#subscriptionMigrationStatus').classList.toggle('subscription-warning', !subscriptionAdmin.migrationReady);
  $('#subscriptionTenantWrap').hidden = Boolean(card.closest('#platformAdminView')) || !subscriptionAdmin.platformAdmin || (subscriptionAdmin.tenants || []).length < 2;
  $('#subscriptionTenant').innerHTML = (subscriptionAdmin.tenants || []).map(tenant => `<option value="${escapeHtml(tenant.id)}" ${tenant.id === subscriptionAdmin.tenantId ? 'selected' : ''}>${escapeHtml(tenant.name || tenant.app_name || tenant.id)}</option>`).join('');
  $('#subscriptionPlan').innerHTML = plans.map(plan => `<option value="${escapeHtml(plan.key)}" ${plan.key === subscription.planKey ? 'selected' : ''}>${escapeHtml(plan.name)}</option>`).join('');
  $('#subscriptionStatus').value = subscription.status || 'active';
  $('#subscriptionTrialEnds').value = String(subscription.trialEndsAt || '').slice(0, 10);
  $('#subscriptionPeriodEnds').value = String(subscription.currentPeriodEnd || '').slice(0, 10);
  $('#subscriptionLocationLimit').value = subscription.limits?.locations || '';
  $('#subscriptionUserLimit').value = subscription.limits?.users || '';
  $('#subscriptionHistoryDays').value = subscription.limits?.history_days || '';
  renderSubscriptionFeatures(true);

  const enabledKeys = new Set((subscriptionAdmin.locationAddons || []).filter(addon => addon.enabled).map(addon => `${addon.locationId}|${addon.addonKey}`));
  $('#subscriptionAddonMatrix').innerHTML = (subscriptionAdmin.locations || locations).length ? `
    <div class="subscription-addon-row subscription-addon-head"><b>Location</b>${(subscriptionAdmin.addonCatalog || []).map(addon => `<b>${escapeHtml(addon.name)}</b>`).join('')}</div>
    ${(subscriptionAdmin.locations || locations).map(location => `<div class="subscription-addon-row"><span>${escapeHtml(location.name)}</span>${(subscriptionAdmin.addonCatalog || []).map(addon => `<label title="${escapeHtml(addon.description)}"><input type="checkbox" data-subscription-addon="${escapeHtml(addon.key)}" data-location-id="${escapeHtml(location.id)}" ${enabledKeys.has(`${location.id}|${addon.key}`) ? 'checked' : ''} ${subscriptionAdmin.canEdit && subscriptionAdmin.migrationReady ? '' : 'disabled'}><span class="sr-only">${escapeHtml(addon.name)}</span></label>`).join('')}</div>`).join('')}` : '<p class="hint">No active locations were found for this organization.</p>';

  const editable = Boolean(subscriptionAdmin.canEdit && subscriptionAdmin.migrationReady);
  card.querySelectorAll('input, select').forEach(control => {
    if (control.id !== 'subscriptionTenant') control.disabled = !editable;
  });
  $('#subscriptionTenant').disabled = !subscriptionAdmin.platformAdmin;
  $('#saveSubscriptionBtn').disabled = !editable;
  $('#subscriptionAdminHelp').textContent = !subscriptionAdmin.migrationReady
    ? 'Run the included Supabase subscription migration once. HIS OPS remains on Advanced with all current features until then.'
    : subscriptionAdmin.canEdit
      ? 'Changes take effect immediately. A future Stripe webhook can update these same records without changing the app.'
      : 'This summary is read-only. Subscription changes are limited to an Average Guys platform administrator.';
}

async function loadSubscriptionAdmin(tenantId = subscriptionAdmin.tenantId) {
  try {
    subscriptionAdmin = await api(`/api/subscription/admin?tenantId=${encodeURIComponent(tenantId || '')}`);
  renderSubscriptionAdmin();
  renderFinancialReportImport();
  } catch (error) {
    toast(`Subscription settings did not load: ${error.message}`);
  }
}

async function saveSubscriptionAdmin() {
  const plan = selectedSubscriptionPlan();
  const featuresOverride = {};
  document.querySelectorAll('[data-subscription-feature]').forEach(input => {
    const planEnabled = Boolean(plan?.features?.[input.dataset.subscriptionFeature]);
    if (input.checked !== planEnabled) featuresOverride[input.dataset.subscriptionFeature] = input.checked;
  });
  const locationAddons = [...document.querySelectorAll('[data-subscription-addon]')].map(input => ({
    locationId: input.dataset.locationId,
    addonKey: input.dataset.subscriptionAddon,
    enabled: input.checked,
    quantity: 1
  }));
  try {
    subscriptionAdmin = await api('/api/subscription/admin', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: subscriptionAdmin.tenantId,
        planKey: $('#subscriptionPlan').value,
        status: $('#subscriptionStatus').value,
        trialEndsAt: $('#subscriptionTrialEnds').value || null,
        currentPeriodEnd: $('#subscriptionPeriodEnds').value || null,
        limitsOverride: {
          locations: Number($('#subscriptionLocationLimit').value || plan?.limits?.locations || 1),
          users: Number($('#subscriptionUserLimit').value || plan?.limits?.users || 1),
          history_days: Number($('#subscriptionHistoryDays').value || plan?.limits?.history_days || 90)
        },
        featuresOverride,
        locationAddons
      })
    });
    renderSubscriptionAdmin();
    applyRoleAccess(currentUser());
    toast('Subscription and features saved');
  } catch (error) {
    toast(`Subscription did not save: ${error.message}`);
  }
}

function renderPlatformAdmin() {
  const allowed = Boolean(subscriptionAdmin.platformAdmin && platformAdminSupport.platformAdmin);
  document.querySelectorAll('[data-view="platformAdminView"]').forEach(button => { button.hidden = !allowed; button.style.display = allowed ? '' : 'none'; });
  if (!allowed) return;
  const tenantNames = Object.fromEntries((platformAdminSupport.tenants || []).map(tenant => [tenant.id, tenant.name || tenant.app_name || tenant.id]));
  $('#platformAdminTenant').innerHTML = (platformAdminSupport.tenants || []).map(tenant => `<option value="${escapeHtml(tenant.id)}" ${tenant.id === platformAdminSupport.tenantId ? 'selected' : ''}>${escapeHtml(tenant.name || tenant.app_name || tenant.id)}${tenant.active === false ? ' (inactive)' : ''}</option>`).join('');
  const organizationUsers = platformAdminSupport.users || [];
  $('#platformUserCount').textContent = `${organizationUsers.length} user${organizationUsers.length === 1 ? '' : 's'}`;
  $('#platformAdminUsers').innerHTML = organizationUsers.length ? organizationUsers.map(user => `
    <article class="platform-user-row">
      <div><b>${escapeHtml(user.name || user.email || user.id)}</b><p>${escapeHtml(user.role || 'Employee')} · ${escapeHtml(user.email || 'PIN-only account')}</p><small>${user.active === false ? 'Inactive' : (user.auth_user_id ? 'Hosted login connected' : 'Login not connected yet')}</small></div>
      <button class="ghost" data-platform-password-reset="${escapeHtml(user.id)}" data-platform-tenant="${escapeHtml(platformAdminSupport.tenantId)}" type="button" ${!user.email || user.active === false ? 'disabled' : ''}>Send password reset</button>
    </article>`).join('') : '<p class="hint">No users were found for this organization.</p>';

  const feedback = platformAdminSupport.feedback || [];
  const activeFeedback = feedback.filter(item => !['Completed', 'Declined'].includes(item.status));
  const previousFeedback = feedback.filter(item => ['Completed', 'Declined'].includes(item.status));
  const feedbackRow = item => `
    <article class="platform-feedback-row">
      <div class="platform-feedback-heading"><div><span class="status">${escapeHtml(item.category || 'Idea')}</span><b>${escapeHtml(item.title || 'Feedback')}</b></div><small>${escapeHtml(tenantNames[item.tenant_id] || item.tenant_id || '')} · ${escapeHtml(item.user_name || item.user_email || item.app_user_id || '')} · ${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</small></div>
      <p>${escapeHtml(item.message || '')}</p>
      <div class="platform-feedback-actions"><label>Status<select data-platform-feedback-status="${escapeHtml(item.id)}">${['New', 'Reviewing', 'Planned', 'Completed', 'Declined'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><label>Internal note<input data-platform-feedback-note="${escapeHtml(item.id)}" value="${escapeHtml(item.admin_notes || '')}" placeholder="Optional Average Guys note"></label><div class="platform-feedback-buttons"><button class="ghost" data-platform-feedback-save="${escapeHtml(item.id)}" type="button">Save</button><button class="danger" data-platform-feedback-delete="${escapeHtml(item.id)}" type="button">Delete</button></div></div>
    </article>`;
  $('#platformFeedbackCount').textContent = `${activeFeedback.length} active`;
  $('#platformFeedbackInbox').innerHTML = !platformAdminSupport.feedbackMigrationReady
    ? '<p class="hint">Feedback storage needs its one-time Supabase setup. Run <b>supabase/add_app_feedback.sql</b>.</p>'
    : activeFeedback.length ? activeFeedback.map(feedbackRow).join('') : '<p class="hint">No active feedback requests.</p>';
  $('#platformPreviousFeedback').hidden = !platformAdminSupport.feedbackMigrationReady || previousFeedback.length === 0;
  $('#platformPreviousFeedbackCount').textContent = previousFeedback.length;
  $('#platformPreviousFeedbackInbox').innerHTML = previousFeedback.map(feedbackRow).join('');
}

async function loadPlatformAdmin(tenantId = platformAdminSupport.tenantId || subscriptionAdmin.tenantId, includeSubscription = true) {
  try {
    platformAdminSupport = await api(`/api/platform/admin?tenantId=${encodeURIComponent(tenantId || '')}`);
    if (includeSubscription) subscriptionAdmin = await api(`/api/subscription/admin?tenantId=${encodeURIComponent(platformAdminSupport.tenantId)}`);
    renderPlatformAdmin();
    renderSubscriptionAdmin();
  } catch (error) {
    toast(`Platform administration did not load: ${error.message}`);
  }
}

async function sendPlatformPasswordReset(userId, tenantId) {
  const user = (platformAdminSupport.users || []).find(entry => entry.id === userId);
  if (!user || !confirm(`Send a secure password-reset email to ${user.name || user.email}?`)) return;
  try {
    await api('/api/platform/password-reset', { method: 'POST', body: JSON.stringify({ userId, tenantId }) });
    toast(`Password reset sent to ${user.email}`);
  } catch (error) {
    toast(`Password reset was not sent: ${error.message}`);
  }
}

async function updatePlatformFeedback(id) {
  try {
    const result = await api('/api/platform/feedback', {
      method: 'POST',
      body: JSON.stringify({ id, status: document.querySelector(`[data-platform-feedback-status="${CSS.escape(id)}"]`)?.value, adminNotes: document.querySelector(`[data-platform-feedback-note="${CSS.escape(id)}"]`)?.value || '' })
    });
    platformAdminSupport.feedbackMigrationReady = result.migrationReady;
    platformAdminSupport.feedback = result.feedback || [];
    renderPlatformAdmin();
    toast('Feedback updated');
  } catch (error) { toast(`Feedback did not update: ${error.message}`); }
}

async function deletePlatformFeedback(id) {
  const item = (platformAdminSupport.feedback || []).find(entry => entry.id === id);
  if (!item || !confirm(`Permanently delete “${item.title || 'this feedback request'}”? This cannot be undone.`)) return;
  try {
    const result = await api('/api/platform/feedback', { method: 'DELETE', body: JSON.stringify({ id }) });
    platformAdminSupport.feedbackMigrationReady = result.migrationReady;
    platformAdminSupport.feedback = result.feedback || [];
    renderPlatformAdmin();
    toast('Feedback deleted');
  } catch (error) { toast(`Feedback was not deleted: ${error.message}`); }
}

function openFeedbackDialog() {
  $('#feedbackCategory').value = 'Idea';
  $('#feedbackTitle').value = '';
  $('#feedbackMessage').value = '';
  $('#feedbackDialog').showModal();
  $('#feedbackTitle').focus();
}

async function submitAppFeedback() {
  const title = $('#feedbackTitle').value.trim();
  const message = $('#feedbackMessage').value.trim();
  if (!title || !message) return toast('Add a title and details before sending');
  const button = $('#submitFeedbackBtn');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    await api('/api/feedback', { method: 'POST', body: JSON.stringify({ category: $('#feedbackCategory').value, title, message }) });
    $('#feedbackDialog').close();
    toast('Thank you—your feedback was sent');
    if (subscriptionAdmin.platformAdmin) await loadPlatformAdmin(platformAdminSupport.tenantId, false);
  } catch (error) { toast(`Feedback was not sent: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'Send feedback'; }
}

function renderManagerNotificationPreferences() {
  const card = $('#managerNotificationPreferencesCard');
  if (!card) return;
  const allowed = Boolean(managerNotificationPreferences.allowed && canUseManage() && !isMaintenanceTech());
  card.style.display = allowed ? '' : 'none';
  if (!allowed) return;
  const prefs = managerNotificationPreferences.preferences;
  const available = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  const selectedLocationIds = prefs.locationIds?.length ? prefs.locationIds : available.map(location => location.id);
  $('#prefNotificationLocations').innerHTML = available.map(location => `
    <label class="location-check"><input type="checkbox" value="${escapeHtml(location.id)}" ${selectedLocationIds.includes(location.id) ? 'checked' : ''}> ${escapeHtml(location.name)}</label>
  `).join('');
  $('#prefIncompleteTempsEnabled').checked = Boolean(prefs.incompleteTemps.enabled);
  $('#prefIncompleteTempsTime').value = prefs.incompleteTemps.dueTime || '14:00';
  $('#prefOutOfRangeEnabled').checked = Boolean(prefs.outOfRangeTemps.enabled);
  $('#prefMaintenanceEnabled').checked = Boolean(prefs.newMaintenanceRequest.enabled);
  $('#prefMaintenanceRequestRow').style.display = isAboveStore() ? '' : 'none';
  $('#prefReportCadence').value = prefs.performanceReport.cadence || 'none';
  $('#prefReportTime').value = prefs.performanceReport.sendTime || '08:00';
  $('#prefReportTasks').checked = prefs.performanceReport.includeTasks !== false;
  $('#prefReportTemps').checked = prefs.performanceReport.includeTemps !== false;
  $('#prefReportPm').checked = prefs.performanceReport.includePm !== false;
  document.querySelectorAll('[data-preference-channels]').forEach(container => {
    const key = container.dataset.preferenceChannels;
    container.innerHTML = preferenceChannelHtml(key, prefs[key]?.channels || []);
  });
}

function campaignLocations(campaign) {
  const allowed = accessibleLocationIds();
  const selected = dashboardLocationId === 'all' ? allowed : [dashboardLocationId];
  return (campaign.locationIds || []).filter(locationId => selected.includes(locationId));
}

function campaignIsInDashboardWindow(campaign) {
  const startsIn = daysUntil(campaign.startDate || campaign.dueDate);
  const incomplete = campaignLocations(campaign).some(locationId => !campaign.completions?.[locationId]);
  return (startsIn >= 0 && startsIn <= 30) || (startsIn < 0 && incomplete);
}

function renderPopCampaigns() {
  if (!$('#dashboardMarketingList')) return;
  const visible = (popCampaigns.campaigns || []).filter(campaign => campaignLocations(campaign).length && campaignIsInDashboardWindow(campaign));
  $('#dashboardMarketingCount').textContent = `${visible.length} update${visible.length === 1 ? '' : 's'}`;
  $('#dashboardMarketingList').innerHTML = visible.length ? visible.map(campaign => {
    const locationsHtml = campaignLocations(campaign).map(locationId => {
      const completion = campaign.completions?.[locationId];
      return `<div class="pop-location-status"><span><b>${escapeHtml(locationName(locationId))}</b>${completion ? ` · Completed by ${escapeHtml(completion.completedBy || 'Store team')} ${new Date(completion.completedAt).toLocaleDateString()}` : ' · Not completed'}</span>${completion ? '<span class="pill">Complete</span>' : `<button data-pop-complete="${escapeHtml(campaign.id)}|${escapeHtml(locationId)}" type="button">Mark completed</button>`}</div>`;
    }).join('');
    return `<article class="pop-campaign-row ${campaign.dueDate < dateKey && campaignLocations(campaign).some(id => !campaign.completions?.[id]) ? 'overdue' : ''}"><div class="pop-campaign-heading"><div><h4>${escapeHtml(campaign.title)}</h4><p class="hint">Display ${escapeHtml(prettyDate(campaign.startDate))} · Complete by ${escapeHtml(prettyDate(campaign.dueDate || campaign.startDate))}</p></div>${campaign.attachmentUrl ? `<a class="button-link ghost" href="${escapeHtml(campaign.attachmentUrl)}" target="_blank" rel="noopener">Open POP file</a>` : ''}</div>${campaign.popInstructions ? `<p><b>POP:</b> ${escapeHtml(campaign.popInstructions)}</p>` : ''}${campaign.readerboardMessage ? `<div class="readerboard-message"><b>Readerboard message</b><p>${escapeHtml(campaign.readerboardMessage)}</p></div>` : ''}<div class="pop-location-list">${locationsHtml}</div></article>`;
  }).join('') : '<p class="hint">No POP or readerboard changes are due now or in the next 30 days.</p>';
  renderPopCampaignAdmin();
}

function resetPopCampaignForm() {
  $('#popCampaignId').value = '';
  $('#popCampaignTitle').value = '';
  $('#popCampaignStartDate').value = dateKey;
  $('#popCampaignDueDate').value = dateKey;
  $('#popCampaignInstructions').value = '';
  $('#popCampaignReaderboard').value = '';
  $('#popCampaignAttachment').value = '';
  $('#popCampaignAttachmentUrl').value = '';
  $('#cancelPopCampaignBtn').hidden = true;
  $('#savePopCampaignBtn').textContent = 'Publish update';
  renderPopCampaignAdmin();
  document.querySelectorAll('#popCampaignLocations input').forEach(input => { input.checked = true; });
}

function renderPopCampaignAdmin() {
  const card = $('#popCampaignAdminCard');
  if (!card) return;
  card.style.display = popCampaigns.canManage ? '' : 'none';
  if (!popCampaigns.canManage) return;
  const selected = [...document.querySelectorAll('#popCampaignLocations input:checked')].map(input => input.value);
  const allowed = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  $('#popCampaignLocations').innerHTML = allowed.map(location => `<label class="location-check"><input type="checkbox" value="${escapeHtml(location.id)}" ${selected.length ? (selected.includes(location.id) ? 'checked' : '') : 'checked'}> ${escapeHtml(location.name)}</label>`).join('');
  $('#popCampaignAdminList').innerHTML = (popCampaigns.campaigns || []).length ? popCampaigns.campaigns.map(campaign => `<article class="card maintenance-row compact"><div><b>${escapeHtml(campaign.title)}</b><p>${escapeHtml(prettyDate(campaign.startDate))} · ${(campaign.locationIds || []).length} location${campaign.locationIds?.length === 1 ? '' : 's'}</p><p class="hint">${Object.keys(campaign.completions || {}).length} completed</p></div>${campaign.editable !== false ? `<div class="row-actions"><button data-pop-edit="${escapeHtml(campaign.id)}" type="button">Edit</button><button class="danger" data-pop-delete="${escapeHtml(campaign.id)}" type="button">Remove</button></div>` : '<span class="pill">View only</span>'}</article>`).join('') : '<p class="hint">No monthly updates have been published yet.</p>';
}

function editPopCampaign(id) {
  const campaign = (popCampaigns.campaigns || []).find(item => item.id === id);
  if (!campaign) return;
  $('#popCampaignId').value = campaign.id;
  $('#popCampaignTitle').value = campaign.title || '';
  $('#popCampaignStartDate').value = campaign.startDate || '';
  $('#popCampaignDueDate').value = campaign.dueDate || campaign.startDate || '';
  $('#popCampaignInstructions').value = campaign.popInstructions || '';
  $('#popCampaignReaderboard').value = campaign.readerboardMessage || '';
  $('#popCampaignAttachmentUrl').value = campaign.attachmentUrl || '';
  document.querySelectorAll('#popCampaignLocations input').forEach(input => { input.checked = (campaign.locationIds || []).includes(input.value); });
  $('#cancelPopCampaignBtn').hidden = false;
  $('#savePopCampaignBtn').textContent = 'Save changes';
  $('#popCampaignAdminCard').classList.remove('collapsed');
  $('#popCampaignAdminCard .collapsible-body').style.display = '';
  $('#popCampaignAdminCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function savePopCampaign() {
  const locationIds = [...document.querySelectorAll('#popCampaignLocations input:checked')].map(input => input.value);
  if (!$('#popCampaignTitle').value.trim() || !$('#popCampaignStartDate').value) return toast('Enter a campaign name and display date');
  if (!locationIds.length) return toast('Choose at least one location');
  try {
    const file = $('#popCampaignAttachment').files?.[0];
    const attachment = file ? { name: file.name, type: file.type, dataUrl: await receiptFileToDataUrl(file) } : null;
    popCampaigns = await api('/api/pop-campaigns/campaign', { method: 'POST', body: JSON.stringify({ id: $('#popCampaignId').value || undefined, title: $('#popCampaignTitle').value.trim(), startDate: $('#popCampaignStartDate').value, dueDate: $('#popCampaignDueDate').value || $('#popCampaignStartDate').value, popInstructions: $('#popCampaignInstructions').value.trim(), readerboardMessage: $('#popCampaignReaderboard').value.trim(), attachment, attachmentUrl: $('#popCampaignAttachmentUrl').value.trim(), locationIds }) });
    resetPopCampaignForm(); renderPopCampaigns(); toast('POP and readerboard update published');
  } catch (error) { toast(`Update did not save: ${error.message}`); }
}

async function completePopCampaign(id, locationId, completed = true) {
  try {
    popCampaigns = await api('/api/pop-campaigns/complete', { method: 'POST', body: JSON.stringify({ id, locationId, completed }) });
    renderPopCampaigns(); toast(completed ? 'Location marked complete' : 'Completion removed');
  } catch (error) { toast(`Completion did not save: ${error.message}`); }
}

async function deletePopCampaign(id) {
  if (!confirm('Remove this POP and readerboard update?')) return;
  try { popCampaigns = await api('/api/pop-campaigns/delete', { method: 'POST', body: JSON.stringify({ id }) }); resetPopCampaignForm(); renderPopCampaigns(); toast('Update removed'); }
  catch (error) { toast(`Update did not remove: ${error.message}`); }
}

async function refreshPopCampaignsQuietly() {
  if (!apiOnline) return;
  try { popCampaigns = await api('/api/pop-campaigns/state'); renderPopCampaigns(); } catch {}
}

function selectedPreferenceChannels(key) {
  return [...document.querySelectorAll(`[data-pref-channel="${key}"]:checked`)].map(input => input.value);
}

async function saveManagerNotificationPreferences() {
  const channels = key => selectedPreferenceChannels(key);
  const enabledKeys = [
    ['prefIncompleteTempsEnabled', 'incompleteTemps'],
    ['prefOutOfRangeEnabled', 'outOfRangeTemps'],
    ['prefMaintenanceEnabled', 'newMaintenanceRequest']
  ];
  for (const [inputId, key] of enabledKeys) {
    if ($(`#${inputId}`).checked && !channels(key).length) return toast('Choose at least one delivery method for each enabled alert');
  }
  if ($('#prefReportCadence').value !== 'none' && !channels('performanceReport').length) return toast('Choose how to deliver the performance report');
  const availableLocationIds = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id)).map(location => location.id);
  const selectedLocationIds = [...document.querySelectorAll('#prefNotificationLocations input:checked')].map(input => input.value);
  if (!selectedLocationIds.length) return toast('Choose at least one location for your alerts and reports');
  const locationIds = selectedLocationIds.length === availableLocationIds.length ? [] : selectedLocationIds;
  try {
    managerNotificationPreferences = await api('/api/notification-preferences', {
      method: 'POST',
      body: JSON.stringify({ preferences: {
        locationIds,
        incompleteTemps: { enabled: $('#prefIncompleteTempsEnabled').checked, dueTime: $('#prefIncompleteTempsTime').value || '14:00', channels: channels('incompleteTemps') },
        outOfRangeTemps: { enabled: $('#prefOutOfRangeEnabled').checked, channels: channels('outOfRangeTemps') },
        newMaintenanceRequest: { enabled: $('#prefMaintenanceEnabled').checked, channels: channels('newMaintenanceRequest') },
        performanceReport: { cadence: $('#prefReportCadence').value, sendTime: $('#prefReportTime').value || '08:00', channels: channels('performanceReport'), includeTasks: $('#prefReportTasks').checked, includeTemps: $('#prefReportTemps').checked, includePm: $('#prefReportPm').checked }
      } })
    });
    renderManagerNotificationPreferences();
    toast('Your notification settings were saved');
  } catch (error) {
    toast(`Settings did not save: ${error.message}`);
  }
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

async function uploadFileDirectToSupabase(file, folder = 'store-document', locationId = currentLocationId) {
  if (window.dailyOpsAuthReady) await window.dailyOpsAuthReady;
  const client = window.dailyOpsAuth?.client;
  if (!client) throw new Error('Direct upload is only available after signing in.');
  const intent = await api('/api/storage/upload-intent', {
    method: 'POST',
    body: JSON.stringify({ locationId, kind: folder, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
  });
  const { error } = await client.storage.from(intent.bucket).uploadToSignedUrl(intent.pathname, intent.token, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message);
  return intent.reference;
}

async function savePermanentTask() {
  const customSection = $('#templateCustomSection').value.trim();
  const section = customSection || $('#templateSection').value || 'Opening';
  const prepArea = $('#templatePrepArea')?.value || '';
  const category = prepArea ? 'Manager' : ($('#templateCategory')?.value || 'Manager');
  const area = $('#templateTaskArea')?.value || '';
  const qrCheckpointId = $('#templateQrCheckpoint')?.value || '';
  const qrCheckpointName = (qrCheckpoints.checkpoints || []).find(checkpoint => checkpoint.id === qrCheckpointId)?.name || '';
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
        area,
        prepArea,
        managerPrep: Boolean(prepArea),
        photo: $('#templatePhotoRequired').checked,
        qrCheckpointId,
        qrCheckpointName
      })
    })).taskTemplates;
    $('#templateCustomSection').value = '';
    $('#templateTaskName').value = '';
    if ($('#templatePrepArea')) $('#templatePrepArea').value = '';
    if ($('#templateTaskArea')) $('#templateTaskArea').value = '';
    $('#templatePhotoRequired').checked = false;
    if ($('#templateQrCheckpoint')) $('#templateQrCheckpoint').value = '';
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

function checklistImportValue(row, ...names) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
  for (const name of names) {
    const value = normalized[String(name).toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function checklistImportDays(value) {
  const allowed = new Map(weekdayOptions.map(day => [day.toLowerCase(), day]));
  const parts = String(value || 'Daily').split(/[,;|/]+/).map(day => day.trim()).filter(Boolean);
  if (!parts.length || parts.some(day => ['daily', 'every day', 'all'].includes(day.toLowerCase()))) return ['daily'];
  return [...new Set(parts.map(day => allowed.get(day.toLowerCase())).filter(Boolean))];
}

function checklistImportLocation(value) {
  const requested = String(value || 'Company Master').trim();
  if (!requested || ['all', 'company master', 'company', 'master'].includes(requested.toLowerCase())) return 'all';
  const match = locations.find(location => location.id.toLowerCase() === requested.toLowerCase() || location.name.toLowerCase() === requested.toLowerCase());
  return match?.id || '';
}

async function previewChecklistImport(file) {
  const preview = $('#checklistImportPreview');
  const importButton = $('#importChecklistItemsBtn');
  pendingChecklistImport = [];
  importButton.disabled = true;
  if (!file) {
    preview.innerHTML = '<p class="hint">Choose a completed template to preview it here.</p>';
    return;
  }
  try {
    if (!window.XLSX) throw new Error('The spreadsheet reader did not load. Refresh DQ OPS and try again.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const sourceRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    const errors = [];
    const seen = new Set();
    sourceRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const name = checklistImportValue(row, 'Task', 'Task Description', 'Item');
      const section = checklistImportValue(row, 'Checklist', 'Section', 'Daypart') || 'All Day';
      const categoryRaw = checklistImportValue(row, 'Main Set', 'Category', 'Station') || 'Manager';
      const category = taskCategories.find(item => item.toLowerCase() === categoryRaw.toLowerCase());
      const locationRaw = checklistImportValue(row, 'Location', 'Location ID', 'Store') || 'Company Master';
      const locationId = checklistImportLocation(locationRaw);
      const prepRaw = checklistImportValue(row, 'Prep Area', 'Prep Quantity List');
      const prepArea = prepAreas.find(item => item.toLowerCase() === prepRaw.toLowerCase()) || '';
      const areaRaw = checklistImportValue(row, 'Area', 'Task Area');
      const area = managerTaskAreas.find(item => item.toLowerCase() === areaRaw.toLowerCase()) || '';
      const photoRaw = checklistImportValue(row, 'Photo Required', 'Require Photo', 'Photo');
      const photo = ['yes', 'y', 'true', '1', 'required'].includes(photoRaw.toLowerCase());
      const scheduleDays = checklistImportDays(checklistImportValue(row, 'Days', 'Schedule', 'Schedule Days'));
      if (!name) errors.push(`Row ${rowNumber}: Task is required.`);
      if (!category) errors.push(`Row ${rowNumber}: Main Set must be Manager, Service, Chill, or Grill.`);
      if (!locationId) errors.push(`Row ${rowNumber}: Location “${locationRaw}” was not found in DQ OPS.`);
      if (!scheduleDays.length) errors.push(`Row ${rowNumber}: Days must contain Daily or valid weekday names.`);
      if (!name || !category || !locationId || !scheduleDays.length) return;
      const duplicateKey = `${locationId}|${section}|${category}|${name}`.toLowerCase();
      if (seen.has(duplicateKey)) {
        errors.push(`Row ${rowNumber}: Duplicate item in this file.`);
        return;
      }
      seen.add(duplicateKey);
      pendingChecklistImport.push({ name, section, category, area, locationId, prepArea, managerPrep: Boolean(prepArea), photo, scheduleDays, active: true });
    });
    const sample = pendingChecklistImport.slice(0, 12);
    preview.innerHTML = `
      <div class="checklist-import-summary ${errors.length ? 'has-errors' : ''}">
        <b>${pendingChecklistImport.length} valid item${pendingChecklistImport.length === 1 ? '' : 's'}</b>
        <span>${errors.length ? `${errors.length} issue${errors.length === 1 ? '' : 's'} must be corrected` : 'Ready to import'}</span>
      </div>
      ${sample.length ? `<div class="table-scroll"><table><thead><tr><th>Location</th><th>Main Set</th><th>Area</th><th>Checklist</th><th>Task</th><th>Days</th><th>Photo</th></tr></thead><tbody>${sample.map(item => `<tr><td>${escapeHtml(item.locationId === 'all' ? 'Company Master' : locationName(item.locationId))}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.area || '—')}</td><td>${escapeHtml(item.section)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(scheduleLabel(item.scheduleDays))}</td><td>${item.photo ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></div>${pendingChecklistImport.length > sample.length ? `<p class="hint">Previewing the first ${sample.length} items.</p>` : ''}` : ''}
      ${errors.length ? `<ul class="import-errors">${errors.slice(0, 20).map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>${errors.length > 20 ? `<p class="hint">Plus ${errors.length - 20} more issues.</p>` : ''}` : ''}
    `;
    importButton.disabled = Boolean(errors.length || !pendingChecklistImport.length);
  } catch (error) {
    preview.innerHTML = `<p class="import-error">Could not read this file: ${escapeHtml(error.message)}</p>`;
  }
}

async function importChecklistItems() {
  if (!pendingChecklistImport.length) return toast('Choose and preview a checklist file first');
  if (!confirm(`Import ${pendingChecklistImport.length} checklist items? Matching items will be updated instead of duplicated.`)) return;
  const button = $('#importChecklistItemsBtn');
  button.disabled = true;
  try {
    const response = await api('/api/task-templates/import-spreadsheet', {
      method: 'POST',
      body: JSON.stringify({ items: pendingChecklistImport })
    });
    taskTemplates = response.taskTemplates;
    pendingChecklistImport = [];
    $('#checklistImportFile').value = '';
    $('#checklistImportPreview').innerHTML = `<p class="success-text">Imported ${response.importedCount} items. ${response.updatedCount} existing items were updated and ${response.createdCount} were added.</p>`;
    render();
    toast('Checklist items imported');
  } catch (error) {
    button.disabled = false;
    toast(`Checklist items did not import: ${error.message}`);
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
  const area = document.querySelector(`[data-template-edit-area="${CSS.escape(id)}"]`)?.value || '';
  const category = prepArea ? 'Manager' : (document.querySelector(`[data-template-edit-category="${CSS.escape(id)}"]`)?.value || task.category || taskCategory(task));
  const photo = document.querySelector(`[data-template-edit-photo="${CSS.escape(id)}"]`)?.checked || false;
  const qrCheckpointId = document.querySelector(`[data-template-edit-qr="${CSS.escape(id)}"]`)?.value || '';
  const qrCheckpointName = (qrCheckpoints.checkpoints || []).find(checkpoint => checkpoint.id === qrCheckpointId)?.name || '';
  if (!name) return toast('Enter a task description');
  try {
    taskTemplates = (await api('/api/task-template', {
      method: 'POST',
      body: JSON.stringify({
        ...task,
        id: taskTemplateId(task),
        name,
        photo,
        qrCheckpointId,
        qrCheckpointName,
        category,
        area,
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
  const editing = Boolean($('#noticeId').value);
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
      body: JSON.stringify({ id: $('#noticeId').value || undefined, title, message, endDate: $('#noticeEndDate').value, targetRoles, attachment, attachmentUrl, attachmentName: attachmentUrl ? 'Shared link' : '' })
    })).notices;
    resetNoticeForm();
    render();
    toast(editing ? 'Notice updated' : 'Notice posted');
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
  if (!canManageAlerts()) return toast('Only managers and above can manage alerts');
  const name = $('#alertRuleName').value.trim();
  const type = $('#alertRuleType').value;
  const target = $('#alertRuleTarget').value;
  const targetLabel = $('#alertRuleTarget').selectedOptions[0]?.textContent || target;
  const roles = [...document.querySelectorAll('#alertRuleRoles input:checked')].map(input => input.value);
  const channels = [
    $('#alertChannelEmail').checked ? 'email' : '',
    $('#alertChannelSms').checked ? 'sms' : '',
    $('#alertChannelInApp').checked ? 'in-app' : ''
  ].filter(Boolean);
  if (!name) return toast('Enter an alert rule name');
  if (!target) return toast('Choose the list to watch');
  if (!roles.length) return toast('Choose at least one role to notify');
  if (!channels.length) return toast('Choose email, text, or an in-store reminder');
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
  if (!canManageAlerts()) return toast('Only managers and above can remove alerts');
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
    const photos = await newFpcPhotos($('#fpcItemPhoto'), $('#fpcItemPhotoLink'), 9, locationId);
    if (photos.length > 9) return toast('An FPC repair item can have no more than 9 photos or links');
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
        photos
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
  const photos = fpcItemPhotos(item);
  $('#editFpcPhotoCurrent').innerHTML = photos.length
    ? `<p class="hint">Uncheck an attachment to remove it when you save.</p><div class="fpc-photo-gallery">${photos.map((photo, index) => `<div class="fpc-photo-manage"><a class="fpc-photo-link" href="${escapeHtml(photo.url)}" target="_blank" rel="noopener">${isImageUrl(photo.url) ? `<img src="${escapeHtml(photo.url)}" alt="Current FPC attachment ${index + 1}">` : '<span class="link-icon">🔗</span>'}<span>${escapeHtml(photo.name || `Photo ${index + 1}`)}</span></a><label class="check"><input type="checkbox" data-fpc-photo-keep="${index}" checked> Keep</label></div>`).join('')}</div>`
    : '<p class="hint">No photos or links attached yet.</p>';
  $('#fpcItemDialog').showModal();
}

async function saveFpcEdit() {
  const recordId = $('#editFpcRecordId').value;
  const itemId = $('#editFpcItemId').value;
  const description = $('#editFpcDescription').value.trim();
  if (!description) return toast('Enter the FPC item description');
  try {
    const { record, item } = findFpcItem(recordId, itemId);
    const existingPhotos = fpcItemPhotos(item).filter((photo, index) => document.querySelector(`[data-fpc-photo-keep="${index}"]`)?.checked);
    const addedPhotos = await newFpcPhotos($('#editFpcPhoto'), $('#editFpcPhotoLink'), 9 - existingPhotos.length, record?.locationId || currentLocationId);
    const photos = [...existingPhotos, ...addedPhotos].filter((photo, index, list) => list.findIndex(entry => entry.url === photo.url) === index);
    if (photos.length > 9) return toast('An FPC repair item can have no more than 9 photos or links');
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
        photos
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
    const documentUrl = file ? await uploadFileDirectToSupabase(file, 'store-document', locationId) : documentLink;
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
  if ($('#resourceAllLocations')) $('#resourceAllLocations').checked = true;
  document.querySelectorAll('#resourceLocations input').forEach(input => { input.checked = false; input.disabled = true; });
  $('#resourceNotes').value = '';
  $('#saveResourceBtn').textContent = 'Save resource';
  $('#resourceFormTitle').textContent = 'Add resource link';
  $('#deleteEditingResourceBtn').hidden = true;
  renderResources();
}

function fpcImportDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && window.XLSX?.SSF) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return '';
}

function fpcImportLocation(value) {
  const key = String(value || '').toLowerCase().replace(/dairy\s*queen|\bdq\b|\bstore\b/g, '').replace(/[^a-z0-9]+/g, '');
  return fpcVisibleLocations().find(location => String(location.id).toLowerCase() === String(value || '').toLowerCase() || location.name.toLowerCase() === String(value || '').toLowerCase() || location.name.toLowerCase().replace(/dairy\s*queen|\bdq\b|\bstore\b/g, '').replace(/[^a-z0-9]+/g, '') === key);
}

async function previewFpcImport(file) {
  const preview = $('#fpcImportPreview');
  const importButton = $('#importFpcItemsBtn');
  pendingFpcImport = [];
  importButton.disabled = true;
  if (!file) {
    preview.innerHTML = '<p class="hint">Choose a completed template to preview the repair items here.</p>';
    return;
  }
  try {
    if (!window.XLSX) throw new Error('The spreadsheet reader did not load. Refresh HIS OPS and try again.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
    const headerIndex = rows.findIndex(row => row.some(value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '') === 'repairitem'));
    if (headerIndex < 0) throw new Error('The Repair Item heading was not found. Please use the HIS OPS template.');
    const headers = rows[headerIndex].map(value => String(value).toLowerCase().replace(/[^a-z0-9]/g, ''));
    const errors = [];
    const seen = new Set();
    rows.slice(headerIndex + 1).forEach((values, offset) => {
      const rowNumber = headerIndex + offset + 2;
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      const meaningfulValues = [row.location, row.store, row.locationid, row.inspectiondate, row.date, row.repairitem, row.description, row.item, row.targetdate, row.duedate, row.assignedto, row.photofolderlink, row.photofolderlinks, row.photolink, row.photolinks, row.link];
      if (!meaningfulValues.some(value => String(value ?? '').trim())) return;
      const location = fpcImportLocation(row.location || row.store || row.locationid);
      const inspectionDate = fpcImportDate(row.inspectiondate || row.date);
      const targetDateValue = row.targetdate || row.duedate || '';
      const targetDate = fpcImportDate(targetDateValue);
      const description = String(row.repairitem || row.description || row.item || '').trim();
      const priority = ['High', 'Medium', 'Low'].find(value => value.toLowerCase() === String(row.priority || 'Medium').trim().toLowerCase());
      const status = ['Open', 'In Progress', 'Completed'].find(value => value.toLowerCase() === String(row.status || 'Open').trim().toLowerCase());
      const photoLinks = String(row.photofolderlink || row.photofolderlinks || row.photolink || row.photolinks || row.link || '').split(/[;\r\n]+/).map(link => link.trim()).filter(Boolean);
      if (!location) errors.push(`Row ${rowNumber}: Location was not found or is not assigned to you.`);
      if (!inspectionDate) errors.push(`Row ${rowNumber}: Enter a valid Inspection Date.`);
      if (!description) errors.push(`Row ${rowNumber}: Repair Item is required.`);
      if (!priority) errors.push(`Row ${rowNumber}: Priority must be High, Medium, or Low.`);
      if (!status) errors.push(`Row ${rowNumber}: Status must be Open, In Progress, or Completed.`);
      if (targetDateValue && !targetDate) errors.push(`Row ${rowNumber}: Enter a valid Target Date or leave it blank.`);
      if (photoLinks.length > 9) errors.push(`Row ${rowNumber}: Use no more than 9 photo or folder links.`);
      if (photoLinks.some(link => !/^https?:\/\//i.test(link))) errors.push(`Row ${rowNumber}: Every Photo / Folder Link must begin with http:// or https://.`);
      if (!location || !inspectionDate || !description || !priority || !status || (targetDateValue && !targetDate) || photoLinks.length > 9 || photoLinks.some(link => !/^https?:\/\//i.test(link))) return;
      const duplicateKey = `${location.id}|${inspectionDate}|${description}`.toLowerCase();
      if (seen.has(duplicateKey)) {
        errors.push(`Row ${rowNumber}: Duplicate repair item in this file.`);
        return;
      }
      seen.add(duplicateKey);
      pendingFpcImport.push({ locationId: location.id, locationName: location.name, inspectionDate, description, priority, targetDate, status, assignedTo: String(row.assignedto || '').trim(), photos: photoLinks.map((url, index) => ({ url, name: `Imported photo or folder link ${index + 1}` })) });
    });
    const sample = pendingFpcImport.slice(0, 12);
    preview.innerHTML = `
      <div class="checklist-import-summary ${errors.length ? 'has-errors' : ''}"><b>${pendingFpcImport.length} valid repair item${pendingFpcImport.length === 1 ? '' : 's'}</b><span>${errors.length ? `${errors.length} issue${errors.length === 1 ? '' : 's'} must be corrected` : 'Ready to import'}</span></div>
      ${sample.length ? `<div class="table-scroll"><table><thead><tr><th>Location</th><th>Inspection</th><th>Repair item</th><th>Priority</th><th>Target</th><th>Status</th></tr></thead><tbody>${sample.map(item => `<tr><td>${escapeHtml(item.locationName)}</td><td>${escapeHtml(item.inspectionDate)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.priority)}</td><td>${escapeHtml(item.targetDate || '—')}</td><td>${escapeHtml(item.status)}</td></tr>`).join('')}</tbody></table></div>${pendingFpcImport.length > sample.length ? `<p class="hint">Previewing the first ${sample.length} items.</p>` : ''}` : ''}
      ${errors.length ? `<ul class="import-errors">${errors.slice(0, 20).map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>${errors.length > 20 ? `<p class="hint">Plus ${errors.length - 20} more issues.</p>` : ''}` : ''}`;
    importButton.disabled = Boolean(errors.length || !pendingFpcImport.length);
  } catch (error) {
    preview.innerHTML = `<p class="import-error">Could not read this file: ${escapeHtml(error.message)}</p>`;
  }
}

async function importFpcItems() {
  if (!pendingFpcImport.length) return toast('Choose and preview an FPC repair list first');
  if (!confirm(`Import ${pendingFpcImport.length} FPC repair items? Matching items will be updated instead of duplicated.`)) return;
  const button = $('#importFpcItemsBtn');
  button.disabled = true;
  try {
    const response = await api('/api/fpc/items/import', { method: 'POST', body: JSON.stringify({ items: pendingFpcImport }) });
    fpc = response.state;
    pendingFpcImport = [];
    $('#fpcImportFile').value = '';
    $('#fpcImportPreview').innerHTML = `<p class="success-text">Imported ${response.importedCount} repair items: ${response.createdCount} added and ${response.updatedCount} updated.</p>`;
    render();
    toast('FPC repair list imported');
  } catch (error) {
    button.disabled = false;
    toast(`FPC repair list did not import: ${error.message}`);
  }
}

function resetNoticeForm() {
  $('#noticeId').value = '';
  $('#noticeTitle').value = '';
  $('#noticeMessage').value = '';
  $('#noticeEndDate').value = '';
  document.querySelectorAll('#noticeTargetRoles input').forEach(input => { input.checked = true; });
  $('#noticeFile').value = '';
  if ($('#noticeLink')) $('#noticeLink').value = '';
  $('#cancelNoticeEditBtn').hidden = true;
  $('#postNoticeBtn').textContent = 'Post notice';
}

function editNotice(id) {
  const notice = notices.find(item => item.id === id);
  if (!notice?.editable) return toast('Only Area Managers and above can edit notices');
  $('#noticeId').value = notice.id;
  $('#noticeTitle').value = notice.title || '';
  $('#noticeMessage').value = notice.message || '';
  $('#noticeEndDate').value = notice.endDate || '';
  $('#noticeLink').value = notice.attachmentUrl || '';
  document.querySelectorAll('#noticeTargetRoles input').forEach(input => { input.checked = !notice.targetRoles?.length || notice.targetRoles.includes(input.value); });
  $('#cancelNoticeEditBtn').hidden = false;
  $('#postNoticeBtn').textContent = 'Save changes';
  switchView('manageView');
  $('#noticeAdminCard').classList.remove('collapsed');
  $('#noticeAdminCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteNotice(id) {
  if (!confirm('Delete this notice? It will be removed from active and previous notifications.')) return;
  try {
    notices = (await api('/api/notice/delete', { method: 'POST', body: JSON.stringify({ id }) })).notices;
    renderNotices(); toast('Notice deleted');
  } catch (error) { toast(`Notice did not delete: ${error.message}`); }
}

function editResource(id) {
  const resource = (resources.resources || []).find(entry => entry.id === id);
  if (!resource) return toast('Resource link was not found');
  $('#resourceId').value = resource.id;
  $('#resourceTitle').value = resource.title || '';
  $('#resourceUrl').value = resource.url || '';
  $('#resourceCategory').value = resource.category || 'General';
  $('#resourceMinRole').value = resource.minRole || 'Employee';
  $('#resourceNotes').value = resource.notes || '';
  $('#saveResourceBtn').textContent = 'Save changes';
  $('#resourceFormTitle').textContent = 'Edit resource link';
  $('#deleteEditingResourceBtn').hidden = false;
  renderResources();
  const assignedLocations = resourceLocationIds(resource);
  $('#resourceAllLocations').checked = !assignedLocations.length;
  document.querySelectorAll('#resourceLocations input').forEach(input => {
    input.disabled = !assignedLocations.length;
    input.checked = assignedLocations.includes(input.value);
  });
  const card = $('#resourcesAdminCard');
  card.classList.remove('collapsed');
  const indicator = card.querySelector('.collapse-indicator');
  if (indicator) indicator.textContent = '−';
  $('#resourcesAdminCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveResource() {
  if (!canManageResources()) return toast('Only Director of Operations and Owner can manage resources');
  const title = $('#resourceTitle').value.trim();
  const url = $('#resourceUrl').value.trim();
  if (!title) return toast('Enter a resource title');
  if (!/^https?:\/\//i.test(url)) return toast('Enter a full web address starting with https://');
  const allLocations = $('#resourceAllLocations').checked;
  const locationIds = [...document.querySelectorAll('#resourceLocations input:checked')].map(input => input.value);
  if (!allLocations && !locationIds.length) return toast('Select at least one location or choose all assigned locations');
  const locationId = allLocations ? 'all' : locationIds[0];
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
        locationIds: allLocations ? [] : locationIds,
        locationName: allLocations ? 'All assigned locations' : locationIds.map(locationName).join(', '),
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

const viewHistory = [];

function defaultBackView() {
  return canUseHub() || isMaintenanceTech() ? 'homeView' : 'taskListsView';
}

function updatePageBackButtons(viewId) {
  document.querySelectorAll('.page-back-button').forEach(button => {
    button.hidden = button.closest('.view')?.id !== viewId || viewId === 'homeView';
  });
}

function setupPageBackButtons() {
  document.querySelectorAll('main > .view:not(#homeView)').forEach(view => {
    if (view.querySelector(':scope > .page-back-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost page-back-button';
    button.setAttribute('aria-label', 'Go back to the previous page');
    button.innerHTML = '<span aria-hidden="true">←</span> Back';
    button.onclick = () => {
      let target = viewHistory.pop();
      while (target && (!document.getElementById(target) || target === view.id)) target = viewHistory.pop();
      switchView(target || defaultBackView(), { remember: false });
    };
    view.prepend(button);
  });
}

function switchView(viewId, options = {}) {
  if (hostedAuthEnabled() && viewId === 'todayView') viewId = 'taskListsView';
  const currentView = document.querySelector('.view.active');
  if (options.remember !== false && currentView?.id && currentView.id !== viewId) viewHistory.push(currentView.id);
  document.querySelectorAll('.view, nav button, .ops-sidebar button').forEach(entry => entry.classList.remove('active'));
  const targetView = $(`#${viewId}`);
  if (!targetView) return;
  targetView.classList.add('active');
  document.querySelectorAll(`[data-view="${viewId}"]`).forEach(button => button.classList.add('active'));
  updatePageBackButtons(viewId);
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (viewId === 'historyView' && !temperatureCompliance.loaded) loadTemperatureCompliance();
}

setupPageBackButtons();
updatePageBackButtons(document.querySelector('.view.active')?.id || 'homeView');

document.addEventListener('click', async event => {
  if (event.target.closest('.dashboard-alert-more > summary')) return;
  const qrTaskButton = event.target.closest('[data-qr-task]');
  if (qrTaskButton) { openQrScanner(qrTaskButton.dataset.qrTask); return; }
  const qrPrintButton = event.target.closest('[data-qr-print]');
  if (qrPrintButton) { await printQrCheckpoint(qrPrintButton.dataset.qrPrint); return; }
  const qrEditButton = event.target.closest('[data-qr-edit]');
  if (qrEditButton) { editQrCheckpoint(qrEditButton.dataset.qrEdit); return; }
  const qrDeactivateButton = event.target.closest('[data-qr-deactivate]');
  if (qrDeactivateButton) { await deactivateQrCheckpoint(qrDeactivateButton.dataset.qrDeactivate); return; }
  const removeTempLog = event.target.closest('[data-temp-log-remove]');
  if (removeTempLog) { if (confirm('Delete this temperature log and all of its configured items?')) removeTempLog.closest('.temperature-log-editor').remove(); return; }
  const addTempItem = event.target.closest('[data-temp-item-add]');
  if (addTempItem) { const log = addTempItem.closest('.temperature-log-editor'); const list = log.querySelector('[data-temp-log-name]').value.trim(); log.querySelector('[data-temp-items]').insertAdjacentHTML('beforeend', temperatureItemEditorHtml(list, 'Products and equipment', '')); return; }
  const removeTempItem = event.target.closest('[data-temp-item-remove]');
  if (removeTempItem) { removeTempItem.closest('[data-temperature-item]').remove(); return; }
  const moveTempItem = event.target.closest('[data-temp-item-move]');
  if (moveTempItem) { const row = moveTempItem.closest('[data-temperature-item]'); const sibling = moveTempItem.dataset.tempItemMove === 'up' ? row.previousElementSibling : row.nextElementSibling; if (sibling) sibling[moveTempItem.dataset.tempItemMove === 'up' ? 'before' : 'after'](row); return; }
  const correctiveAction = event.target.closest('[data-corrective-action]');
  if (correctiveAction) return saveCorrectiveTemperature(correctiveAction.dataset.correctiveAction);
  const cancelStoreAlarmButton = event.target.closest('[data-store-alarm-cancel]');
  if (cancelStoreAlarmButton) {
    if (!confirm('Cancel this store alarm?')) return;
    try { storeAlarms = await api('/api/store-alarms/cancel', { method: 'POST', body: JSON.stringify({ id: cancelStoreAlarmButton.dataset.storeAlarmCancel }) }); renderStoreAlarms(); toast('Store alarm cancelled'); } catch (error) { toast(`Alarm was not cancelled: ${error.message}`); }
    return;
  }
  const maintenanceLogEdit = event.target.closest('[data-maintenance-log-edit]');
  if (maintenanceLogEdit) return editMaintenanceLogEntry(maintenanceLogEdit.dataset.maintenanceLogEdit);
  const dashboardMove = event.target.closest('[data-dashboard-widget-move]');
  if (dashboardMove) {
    const [id, direction] = dashboardMove.dataset.dashboardWidgetMove.split('|');
    const from = editingDashboardPreferences.order.indexOf(id);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from >= 0 && to >= 0 && to < editingDashboardPreferences.order.length) {
      editingDashboardPreferences.defaultRange = $('#dashboardDefaultRange').value;
      editingDashboardPreferences.defaultLocationId = $('#dashboardDefaultLocation').value;
      [editingDashboardPreferences.order[from], editingDashboardPreferences.order[to]] = [editingDashboardPreferences.order[to], editingDashboardPreferences.order[from]];
      editingDashboardPreferences.visible = [...document.querySelectorAll('[data-dashboard-widget-visible]:checked')].map(input => input.dataset.dashboardWidgetVisible);
      renderDashboardCustomization();
    }
    return;
  }
  const managementUpdate = event.target.closest('[data-management-update]');
  if (managementUpdate) return updateManagementReport(managementUpdate.dataset.managementUpdate);
  const managementFilter = event.target.closest('[data-management-report-filter]');
  if (managementFilter) {
    managementReportStatusFilter = managementFilter.dataset.managementReportFilter;
    renderManagementReports();
    return;
  }
  const temperatureClosure = event.target.closest('[data-temperature-closure-date]');
  if (temperatureClosure) {
    const entry = (temperatureCompliance.entries || []).find(item => item.date === temperatureClosure.dataset.temperatureClosureDate && item.locationId === temperatureClosure.dataset.temperatureClosureLocation);
    if (entry) openTemperatureClosure(entry);
    return;
  }
  const revokeTablet = event.target.closest('[data-kiosk-revoke]');
  if (revokeTablet) {
    if (!confirm('Remove this tablet? Employees will no longer be able to sign in on it.')) return;
    try {
      kioskDevices = (await api('/api/kiosk/revoke', { method: 'POST', body: JSON.stringify({ id: revokeTablet.dataset.kioskRevoke }) })).devices || [];
      renderKioskAdmin();
      toast('Tablet removed');
    } catch (error) {
      toast(`Tablet was not removed: ${error.message}`);
    }
    return;
  }
  const collapseHeader = event.target.closest('.collapsible-header');
  if (collapseHeader) {
    const card = collapseHeader.closest('.collapsible-card');
    card.classList.toggle('collapsed');
    collapseHeader.querySelector('.collapse-indicator').textContent = card.classList.contains('collapsed') ? '+' : '−';
    if (card.id === 'financialImportCard' && !card.classList.contains('collapsed')) {
      const status = $('#financialImportStatus');
      if (status) status.textContent = 'Refreshing report history…';
      await loadFinancialReportState();
      renderFinancialReportImport();
    }
    return;
  }

  const platformPasswordReset = event.target.closest('[data-platform-password-reset]');
  if (platformPasswordReset) return sendPlatformPasswordReset(platformPasswordReset.dataset.platformPasswordReset, platformPasswordReset.dataset.platformTenant);
  const platformFeedbackSave = event.target.closest('[data-platform-feedback-save]');
  if (platformFeedbackSave) return updatePlatformFeedback(platformFeedbackSave.dataset.platformFeedbackSave);
  const platformFeedbackDelete = event.target.closest('[data-platform-feedback-delete]');
  if (platformFeedbackDelete) return deletePlatformFeedback(platformFeedbackDelete.dataset.platformFeedbackDelete);

  const sectionButton = event.target.closest('[data-section-view]');
  if (sectionButton) {
    const targetView = sectionButton.dataset.sectionView;
    if ((targetView === 'homeView' || targetView === 'maintenanceView' || targetView === 'fpcView' || targetView === 'calendarView' || targetView === 'storeDocsView' || targetView === 'smallwaresView') && !canUseHub()) return toast('Only managers and above can access this section');
    if ((targetView === 'receiptsView' || targetView === 'inspectionsView') && !canAddStoreDocuments()) return toast('Only Area Managers and above can access this section');
    if (targetView === 'locationsView' && !canViewLocations()) return toast('Only managers and above can access locations');
    if (targetView === 'helpView' && !canUseManage()) return toast('Only managers and above can access Help');
    if (targetView === 'platformAdminView' && !subscriptionAdmin.platformAdmin) return toast('Only an Average Guys platform administrator can access this section');
    if (isMaintenanceTech() && targetView !== 'rolloutView' && !['homeView', 'maintenanceView', 'fpcView', 'maintenanceLogView', 'noticesView'].includes(targetView)) return toast('This role can only access Dashboard, Notices, Maintenance, FPC, Work Log, and authorized rollouts');
    switchView(targetView);
    const openCardId = sectionButton.dataset.openManageCard;
    if (openCardId) {
      const card = $(`#${openCardId}`);
      const group = card?.closest('.manage-group-card');
      [group, card].filter(Boolean).forEach(item => {
        item.classList.remove('collapsed');
        const indicator = item.querySelector(':scope > .collapsible-header .collapse-indicator');
        if (indicator) indicator.textContent = '−';
      });
      card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
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
    const task = day.tasks.find(entry => entry.id === checkbox.dataset.check);
    if (task.qrCheckpointId && !task.done) { checkbox.checked = false; openQrScanner(task.id); return; }
    task.done = checkbox.checked;
    task.completedBy = checkbox.checked ? currentUser().name : '';
    task.completedById = checkbox.checked ? currentUser().id : '';
    task.completedAt = checkbox.checked ? new Date().toISOString() : '';
    await persistAndRender();
    return;
  }

  const taskCard = event.target.closest('[data-task-card]');
  if (taskCard && !event.target.closest('button, input, select, textarea, a, label')) {
    const task = day.tasks.find(entry => entry.id === taskCard.dataset.taskCard);
    if (!task) return;
    if (task.qrCheckpointId && !task.done) { openQrScanner(task.id); return; }
    if (task.photo && !task.photoUrl && !task.photoData) return toast('Attach the required photo before completing this item');
    task.done = !task.done;
    task.completedBy = task.done ? currentUser().name : '';
    task.completedById = task.done ? currentUser().id : '';
    task.completedAt = task.done ? new Date().toISOString() : '';
    await persistAndRender();
    return;
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
  const noticeEditButton = event.target.closest('[data-notice-edit]');
  if (noticeEditButton) editNotice(noticeEditButton.dataset.noticeEdit);
  const noticeDeleteButton = event.target.closest('[data-notice-delete]');
  if (noticeDeleteButton) await deleteNotice(noticeDeleteButton.dataset.noticeDelete);

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

  const popCompleteButton = event.target.closest('[data-pop-complete]');
  if (popCompleteButton) {
    const [campaignId, locationId] = popCompleteButton.dataset.popComplete.split('|');
    await completePopCampaign(campaignId, locationId);
  }
  const popEditButton = event.target.closest('[data-pop-edit]');
  if (popEditButton) editPopCampaign(popEditButton.dataset.popEdit);
  const popDeleteButton = event.target.closest('[data-pop-delete]');
  if (popDeleteButton) await deletePopCampaign(popDeleteButton.dataset.popDelete);

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
  const areas = temperatureAreasForList();
  $('#tempItem').innerHTML = Object.entries(areas).flatMap(([area, items]) => items.map(item => `<option value="${escapeHtml(item)}" data-area="${escapeHtml(area)}">${escapeHtml(item)}</option>`)).join('');
}

$('#deleteEditingResourceBtn').onclick = async () => {
  const id = $('#resourceId').value;
  if (id) await deleteResource(id);
};

function openTempDialog(area = $('#tempArea').value, item = null, list = selectedTempList) {
  if (selectedTempSession === 'Day' && !dayTempsAvailable()) return toast('Day temperatures close at 2:00 PM');
  tempEntryMode = 'listed';
  $('#tempValue').value = '';
  if (list) {
    selectedTempList = list;
    localStorage.setItem('dailyops-temp-list', selectedTempList);
  }
  fillTempItems();
  const option = [...$('#tempItem').options].find(entry => entry.value === item && entry.dataset.area === area);
  if (option) option.selected = true;
  configureTemperatureEntry(selectedTempList, $('#tempItem').value);
  $('#tempDialogTitle').textContent = item || `${selectedTempSession} temperature`;
  $('#tempItemLabel').hidden = true;
  $('#additionalTempItemLabel').hidden = true;
  $('#additionalTempItem').value = '';
  $('#tempDialog').showModal();
  $('#tempValue').focus();
}

function openAdditionalTempDialog() {
  if (selectedTempSession === 'Day' && !dayTempsAvailable()) return toast('Day temperatures close at 2:00 PM');
  tempEntryMode = 'additional';
  $('#tempValue').value = '';
  $('#additionalTempItem').value = '';
  configureTemperatureEntry('Additional', '');
  $('#tempDialogTitle').textContent = `Additional ${selectedTempSession.toLowerCase()} temperature`;
  $('#tempItemLabel').hidden = true;
  $('#additionalTempItemLabel').hidden = false;
  $('#tempDialog').showModal();
  $('#additionalTempItem').focus();
}

function configureTemperatureEntry(list, item) {
  const overrun = isOverrunReading(list, item);
  const input = $('#tempValue');
  input.dataset.negative = 'false';
  input.min = overrun ? '0' : '';
  input.placeholder = overrun ? '40.0' : '165.0';
  $('#tempValueLabel').textContent = overrun ? 'Overrun (%)' : 'Temperature (°F)';
  $('#toggleNegativeTempBtn').hidden = overrun;
  $('#toggleNegativeTempBtn').classList.remove('is-negative');
  $('#toggleNegativeTempBtn').textContent = '− Negative';
}

$('#toggleNegativeTempBtn').onclick = () => {
  const input = $('#tempValue');
  const numericValue = Number(input.value);
  const currentlyNegative = input.value ? numericValue < 0 : input.dataset.negative === 'true';
  const makeNegative = !currentlyNegative;
  input.dataset.negative = String(makeNegative);
  if (input.value && Number.isFinite(numericValue)) input.value = String(makeNegative ? -Math.abs(numericValue) : Math.abs(numericValue));
  $('#toggleNegativeTempBtn').classList.toggle('is-negative', makeNegative);
  $('#toggleNegativeTempBtn').textContent = makeNegative ? '✓ Negative' : '− Negative';
  input.focus();
};

$('#addTempBtn').onclick = openAdditionalTempDialog;
$('#reportReceivingIssueBtn').onclick = () => {
  $('#receivingIssueNote').value = '';
  $('#receivingIssuePhoto').value = '';
  $('#receivingIssuePreview').removeAttribute('src');
  $('#receivingIssuePreview').style.display = 'none';
  $('#receivingIssueDialog').showModal();
  $('#receivingIssueNote').focus();
};

$('#receivingIssuePhoto').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    $('#receivingIssuePreview').src = await receiptFileToDataUrl(file);
    $('#receivingIssuePreview').style.display = 'block';
  } catch (error) {
    event.target.value = '';
    toast(error.message);
  }
};

$('#saveReceivingIssueBtn').onclick = async event => {
  event.preventDefault();
  const note = $('#receivingIssueNote').value.trim();
  const file = $('#receivingIssuePhoto').files[0];
  if (!note && !file) return toast('Add a note, a photo, or both');
  const issue = { id: `receiving-issue-${Date.now()}`, list: 'Receiving', note,
    time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }), createdAt: new Date().toISOString(),
    userId: currentUser().id, userName: currentUser().name };
  try {
    if (file) {
      const dataUrl = await receiptFileToDataUrl(file);
      if (apiOnline) {
        const photo = await api('/api/photo', { method: 'POST', body: JSON.stringify({ locationId: currentLocationId, date: dateKey, taskId: issue.id, userId: issue.userId, dataUrl }) });
        issue.photoUrl = photo.url;
      } else issue.photoData = dataUrl;
    }
    day.receivingIssues ??= [];
    day.receivingIssues.push(issue);
    $('#receivingIssueDialog').close();
    await persistAndRender('Receiving issue reported');
  } catch (error) { toast(`Issue did not save: ${error.message}`); }
};
$('#newUserRole').onchange = renderNewUserLocationChecks;
$('#newUserLocation').onchange = renderNewUserLocationChecks;

$('#currentUser').onchange = async event => {
  if (window.dailyOpsAuth?.enabled) return;
  currentUserId = event.target.value;
  localStorage.setItem('dailyops-current-user', currentUserId);
  const user = currentUser();
  if (!usesAssignedLocations(user) && userLocationIds(user)[0]) {
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
  if (event.target.matches('#maintenanceLogPeriod')) {
    maintenanceLogPeriod = event.target.value;
    renderMaintenanceWorkLog();
  }
  if (event.target.matches('#maintenanceTechnicianFilter')) {
    maintenanceTechnicianFilter = event.target.value;
    renderMaintenanceWorkLog();
  }
  if (event.target.matches('#taskLocationSelect, #tempLocationSelect')) {
    await changeWorkingLocation(event.target.value);
  }
  if (event.target.matches('#templateScope')) {
    templateScope = event.target.value || 'all';
    localStorage.setItem('dailyops-template-scope', templateScope);
    editingTemplateId = null;
    renderTaskTemplates();
    renderQrCheckpoints();
  }
  if (event.target.matches('#newTaskQrRequired')) $('#newTaskQrCheckpointLabel').hidden = !event.target.checked;
  if (event.target.matches('#qrCheckpointLogDate')) {
    qrCheckpointLogDate = event.target.value || dateKey;
    await loadQrCheckpointState();
    renderQrCheckpoints();
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

  if (event.target.matches('#resourceAllLocations')) {
    const allSelected = event.target.checked;
    document.querySelectorAll('#resourceLocations input').forEach(input => {
      input.disabled = allSelected;
      if (allSelected) input.checked = false;
    });
  }

  if (event.target.matches('#resourceLocations input') && event.target.checked) {
    $('#resourceAllLocations').checked = false;
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
  if (event.target.matches('#receiptFilterLocation, #receiptFilterDate')) renderReceipts();
  if (event.target.matches('#inspectionTemplate')) {
    inspectionTemplateId = event.target.value;
    localStorage.setItem('inspection-template', inspectionTemplateId);
    $('#inspectionChecklist').dataset.templateId = '';
    renderInspections();
  }
  if (event.target.matches('#inspectionChartTemplate')) {
    inspectionChartTemplateId = event.target.value;
    localStorage.setItem('inspection-chart-template', inspectionChartTemplateId);
    renderInspections();
  }
  if (event.target.matches('#inspectionChartLocation')) renderInspections();
  if (event.target.matches('[data-inspection-photo]')) {
    const label = event.target.closest('.inspection-photo-button');
    const file = event.target.files?.[0];
    label?.classList.toggle('has-file', Boolean(file));
    if (label) label.title = file ? `Attached: ${file.name}` : 'Attach optional photo';
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

async function uploadMaintenanceFile(inputSelector, kind, locationId = currentLocationId) {
  const file = $(inputSelector).files[0];
  if (!file) return '';
  return uploadFileDirectToSupabase(file, kind, locationId);
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
    photoLink: await uploadMaintenanceFile('#woPhoto', 'work-order-photo', locationId),
    manualLink: await uploadMaintenanceFile('#woManual', 'work-order-manual', locationId)
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
    manualLink: await uploadMaintenanceFile('#eqManual', 'equipment-manual', locationId)
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
    photoLink: await uploadMaintenanceFile('#pmPhoto', 'pm-photo', locationId),
    manualLink: await uploadMaintenanceFile('#pmManual', 'pm-manual', locationId)
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

async function saveWorkOrderChanges(forceComplete = false) {
  const technician = isMaintenanceTech();
  if (forceComplete && !$('#editWoResolution').value.trim()) {
    return toast('Enter the final resolution before completing this work order');
  }
  const payload = {
    workOrderId: $('#editWoId').value,
    locationId: $('#editWoLocationId').value,
    status: forceComplete ? 'Completed' : $('#editWoStatus').value,
    resolutionNotes: $('#editWoResolution').value.trim(),
    dateCompleted: forceComplete ? new Date().toISOString().slice(0, 10) : $('#editWoCompletedDate').value,
    laborHours: $('#editWoLabor').value,
    ...(technician ? {} : {
      priority: $('#editWoPriority').value,
      ...assignmentPayload('editWo'),
      issueDescription: $('#editWoIssue').value.trim(),
      targetDate: $('#editWoTargetDate').value,
      partsCost: $('#editWoParts').value,
      vendorCost: $('#editWoVendorCost').value
    })
  };
  const photoLink = await uploadMaintenanceFile('#editWoPhoto', 'work-order-photo', payload.locationId);
  const manualLink = await uploadMaintenanceFile('#editWoManual', 'work-order-manual', payload.locationId);
  if (photoLink) payload.photoLink = photoLink;
  if (manualLink) payload.manualLink = manualLink;
  try {
    const saved = await api('/api/maintenance/work-order/update', { method: 'POST', body: JSON.stringify(payload) });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    $('#workOrderDialog').close();
    toast(`Updated ${saved.workOrder['Work Order ID']}`);
  } catch (error) {
    toast(`Work order did not update: ${error.message}`);
  }
}

$('#saveWorkOrderBtn').onclick = () => saveWorkOrderChanges(false);
$('#completeWorkOrderBtn').onclick = () => saveWorkOrderChanges(true);

function closeWorkOrderUpdateForm() {
  $('#workOrderUpdateForm').hidden = true;
  $('#toggleWorkOrderUpdateBtn').textContent = '+ Add update';
}

$('#toggleWorkOrderUpdateBtn').onclick = () => {
  const form = $('#workOrderUpdateForm');
  form.hidden = !form.hidden;
  $('#toggleWorkOrderUpdateBtn').textContent = form.hidden ? '+ Add update' : 'Close update form';
  if (!form.hidden) $('#workOrderUpdateNote').focus();
};

$('#cancelWorkOrderUpdateBtn').onclick = closeWorkOrderUpdateForm;

$('#saveWorkOrderUpdateBtn').onclick = async () => {
  const workOrderId = $('#editWoId').value;
  const note = $('#workOrderUpdateNote').value.trim();
  if (!note) return toast('Enter a repair update before saving');
  const file = $('#workOrderUpdateAttachment').files?.[0];
  const button = $('#saveWorkOrderUpdateBtn');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const attachmentUrl = file
      ? await uploadMaintenanceFile('#workOrderUpdateAttachment', 'work-order-update', $('#editWoLocationId').value)
      : '';
    const saved = await api('/api/maintenance/work-order/update-entry', {
      method: 'POST',
      body: JSON.stringify({
        workOrderId,
        updateType: $('#workOrderUpdateType').value,
        status: $('#workOrderUpdateStatus').value,
        note,
        timeSpentHours: $('#workOrderUpdateHours').value,
        followUpDate: $('#workOrderUpdateFollowUp').value,
        attachmentUrl,
        attachmentName: file?.name || ''
      })
    });
    maintenance = saved.state;
    filterMaintenanceScope();
    renderMaintenance();
    $('#editWoStatus').value = saved.workOrder.Status || $('#editWoStatus').value;
    $('#workOrderUpdateType').value = 'Progress update';
    $('#workOrderUpdateStatus').value = '';
    $('#workOrderUpdateNote').value = '';
    $('#workOrderUpdateHours').value = '';
    $('#workOrderUpdateFollowUp').value = '';
    $('#workOrderUpdateAttachment').value = '';
    closeWorkOrderUpdateForm();
    renderWorkOrderTimeline(workOrderId);
    $('#workOrderTimeline').open = true;
    toast(`Added repair update to ${workOrderId}`);
  } catch (error) {
    toast(`Repair update did not save: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Save update';
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
  if (selectedTempSession === 'Day' && !dayTempsAvailable()) {
    $('#tempDialog').close();
    return toast('Day temperatures close at 2:00 PM');
  }
  const temperatureInput = $('#tempValue');
  if (!temperatureInput.value) {
    return toast('Enter the temperature');
  }
  const additionalItem = $('#additionalTempItem').value.trim();
  if (tempEntryMode === 'additional' && !additionalItem) return toast('Enter the additional product or item');
  const selectedProduct = $('#tempItem').selectedOptions[0];
  let enteredValue = Number(temperatureInput.value);
  if (temperatureInput.dataset.negative === 'true') enteredValue = -Math.abs(enteredValue);
  const reading = {
    list: tempEntryMode === 'additional' ? 'Additional' : selectedTempList,
    area: tempEntryMode === 'additional' ? 'Additional / non-listed' : (selectedProduct?.dataset.area || ''),
    item: tempEntryMode === 'additional' ? additionalItem : $('#tempItem').value,
    session: selectedTempSession,
    value: String(enteredValue),
    unit: isOverrunReading(selectedTempList, tempEntryMode === 'additional' ? additionalItem : $('#tempItem').value) ? '%' : '°F',
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
    userId: currentUser().id,
    userName: currentUser().name
  };
  if (tempEntryMode !== 'additional') {
    const standard = temperatureStandard(reading.list, reading.area, reading.item);
    const value = Number(reading.value);
    const tooCold = Number.isFinite(standard.min) && value < standard.min;
    const tooWarm = Number.isFinite(standard.max) && value > standard.max;
    if (tooCold || tooWarm) {
      pendingTemperatureReading = reading;
      const actions = (tooCold ? standard.belowActions : standard.aboveActions) || [];
      const defaults = tooCold ? ['Continued the heating process', 'Equipment malfunction — removed from service'] : ['Notified manager of equipment issue', 'Discarded product'];
      $('#correctiveActionSummary').textContent = `${reading.item} was entered at ${reading.value}${reading.unit}. The ${tooCold ? `minimum is ${standard.min}${reading.unit}` : `maximum is ${standard.max}${reading.unit}`}.`;
      $('#correctiveActionChoices').innerHTML = (actions.length ? actions : defaults).map(action => `<button type="button" data-corrective-action="${escapeHtml(action)}">${escapeHtml(action)}</button>`).join('');
      $('#tempDialog').close();
      $('#correctiveActionDialog').showModal();
      return;
    }
  }
  day.temps.push(reading);
  $('#tempDialog').close();
  await persistAndRender('Temperature saved');
};

async function saveCorrectiveTemperature(action) {
  if (!pendingTemperatureReading) return;
  day.temps.push({ ...pendingTemperatureReading, correctiveAction: action, outOfRange: true });
  pendingTemperatureReading = null;
  $('#correctiveActionDialog').close();
  await persistAndRender('Temperature and corrective action saved');
}

function goBackToTemperature() {
  $('#correctiveActionDialog').close();
  $('#tempDialog').showModal();
  $('#tempValue').focus();
}

async function saveTemperatureStandards() {
  const definitions = {}; const standards = {}; let invalid = '';
  document.querySelectorAll('.temperature-log-editor').forEach(log => {
    const name = log.querySelector('[data-temp-log-name]').value.trim();
    const rows = [...log.querySelectorAll('[data-temperature-item]')];
    if (!name) invalid ||= 'Every temperature log needs a name';
    if (!rows.length) invalid ||= `${name || 'Each log'} needs at least one item`;
    const items = rows.map(row => row.querySelector('[data-temp-item-name]').value.trim()).filter(Boolean);
    if (items.length !== rows.length) invalid ||= `${name || 'Each log'} has a blank item name`;
    if (definitions[name]) invalid ||= `Temperature log names must be unique: ${name}`;
    const deliveryDaysByLocation = {};
    log.querySelectorAll('[data-delivery-location]').forEach(row => {
      deliveryDaysByLocation[row.dataset.deliveryLocation] = [...row.querySelectorAll('input:checked')].map(input => input.value);
    });
    definitions[name] = { requiredDaily: log.querySelector('[data-temp-log-required]').checked, areas: { 'Products and equipment': items }, ...(name === 'Receiving' ? { deliveryDaysByLocation } : {}) };
    rows.forEach(row => {
      const item = row.querySelector('[data-temp-item-name]').value.trim();
      standards[temperatureStandardKey(name, 'Products and equipment', item)] = { min: row.querySelector('[data-standard-min]').value, max: row.querySelector('[data-standard-max]').value, belowActions: row.querySelector('[data-standard-below]').value.split('\n'), aboveActions: row.querySelector('[data-standard-above]').value.split('\n') };
    });
  });
  if (invalid) return toast(invalid);
  try {
    const savedDefinitions = await api('/api/temperature-definitions', { method: 'POST', body: JSON.stringify({ definitions }) });
    const savedStandards = await api('/api/temperature-standards', { method: 'POST', body: JSON.stringify({ standards }) });
    temperatureItems = savedDefinitions.definitions || definitions; temperatureStandards = savedStandards.standards || standards;
    if (!temperatureItems[selectedTempList]) selectedTempList = Object.keys(temperatureItems)[0];
    render(); toast('Temperature log setup saved');
  } catch (error) { toast(`Temperature log setup did not save: ${error.message}`); }
}

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
  const pin = $('#newUserPin').value.trim();
  const role = $('#newUserRole').value;
  const maintenanceEligible = $('#newUserMaintenance').checked || role === maintenanceRole;
  if (!name) return toast('Enter a user name');
  if (window.dailyOpsAuth?.enabled && role !== 'Employee' && !email) return toast('Enter an email for management login');
  if (window.dailyOpsAuth?.enabled && role !== 'Employee' && !temporaryPassword) return toast('Enter a temporary password for management login');
  if (role === 'Employee' && !/^\d{4}$/.test(pin)) return toast('Enter a four-digit employee PIN');
  if (temporaryPassword && !email) return toast('Enter an email when setting a temporary password');
  if (temporaryPassword && temporaryPassword.length < 6) return toast('Temporary password must be at least 6 characters');
  const locationId = $('#newUserLocation').value;
  const selectedLocations = [...document.querySelectorAll('#newUserLocations input:checked')].map(input => input.value);
  const locationIds = roleUsesMultipleLocations(role) ? (selectedLocations.length ? selectedLocations : [locationId]) : [locationId];
  if (!allowedAssignableRoles().includes(role)) return toast('You do not have access to create that role');
  if (!isFullAccess() && locationIds.some(savedLocation => !userLocationIds().includes(savedLocation))) return toast('You can only add users to your locations');
  try {
    await saveUser({ name, email, phone, temporaryPassword, pin: role === 'Employee' ? pin : '', role, maintenance: maintenanceEligible, locationId, locationIds, invitedBy: currentUser().name });
    $('#newUserName').value = '';
    $('#newUserEmail').value = '';
    $('#newUserPhone').value = '';
    $('#newUserPassword').value = '';
    $('#newUserPin').value = '';
    $('#newUserMaintenance').checked = false;
    $('#newUserRole').value = 'Employee';
    renderNewUserLocationChecks({ reset: true });
    toast(role === 'Employee' ? 'Employee added with PIN' : 'User added with temporary password');
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
  $('#editUserPin').value = '';
  $('#editUserRole').innerHTML = roles.map(role => `<option ${user.role === role ? 'selected' : ''}>${role}</option>`).join('');
  $('#editUserMaintenance').checked = Boolean(user.maintenance || isMaintenanceTech(user));
  if (!roles.includes(user.role)) $('#editUserRole').innerHTML += `<option selected>${escapeHtml(user.role)}</option>`;
  $('#editUserLocation').innerHTML = visibleLocations.map(location => `<option value="${location.id}" ${user.locationId === location.id ? 'selected' : ''}>${location.name}</option>`).join('');
  renderLocationChecks('#editUserLocations', userLocationIds(user));
  $('#editUserLocationsWrap').style.display = 'block';
  $('#editUserPinWrap').style.display = user.role === 'Employee' ? 'block' : 'none';
  $('#userDialog').showModal();
}

$('#editUserRole').onchange = () => {
  $('#editUserLocationsWrap').style.display = roleUsesMultipleLocations($('#editUserRole').value) ? 'block' : 'none';
  $('#editUserPinWrap').style.display = $('#editUserRole').value === 'Employee' ? 'block' : 'none';
};

$('#editUserLocation').onchange = () => {
  const homeLocationId = $('#editUserLocation').value;
  const checkbox = [...document.querySelectorAll('#editUserLocations input')].find(input => input.value === homeLocationId);
  if (checkbox) checkbox.checked = true;
};

$('#newUserRole').onchange = () => {
  renderNewUserLocationChecks();
  $('#newUserPinWrap').style.display = $('#newUserRole').value === 'Employee' ? 'block' : 'none';
};

$('#saveUserEditBtn').onclick = async () => {
  const id = $('#editUserId').value;
  const existing = users.find(user => user.id === id);
  if (!existing || !canEditUser(existing)) return toast('You do not have access to edit this user');
  const name = $('#editUserName').value.trim();
  const email = $('#editUserEmail').value.trim();
  const phone = $('#editUserPhone').value.trim();
  const role = $('#editUserRole').value;
  const maintenanceEligible = $('#editUserMaintenance').checked || role === maintenanceRole;
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
      maintenance: maintenanceEligible,
      locationId,
      locationIds: locationsToSave
    });
    const temporaryPassword = $('#editUserPassword').value.trim();
    if (temporaryPassword) await setUserPassword(id, temporaryPassword);
    const pin = $('#editUserPin').value.trim();
    if (pin) await setUserPin(id, pin);
    toast(pin ? 'User and PIN saved' : temporaryPassword ? 'User and password saved' : 'User saved');
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

function financialImportHasValidMappings() {
  if (!pendingFinancialReports.length) return false;
  const ids = pendingFinancialReports.map(report => report.locationId).filter(Boolean);
  return pendingFinancialReports.every(report => report.locationId && !(report.errors || []).length) && new Set(ids).size === ids.length;
}

function renderFinancialReportImport() {
  const preview = $('#financialImportPreview');
  if (!preview) return;
  const status = $('#financialImportStatus');
  const importButton = $('#importFinancialReportBtn');
  const clearButton = $('#clearFinancialReportBtn');
  const canImport = isFullAccess() && subscriptionFeatureEnabled('advanced_reports');
  if (!canImport) return;

  if (!financialReportState.migrationReady) {
    status.textContent = financialReportState.message || 'Run supabase/add_financial_reports.sql before importing reports.';
    status.classList.add('financial-setup-warning');
  } else {
    status.classList.remove('financial-setup-warning');
  }

  if (!pendingFinancialReports.length) {
    preview.innerHTML = '<p class="hint">Choose an Excel workbook to review its store reports.</p>';
    importButton.disabled = true;
    clearButton.disabled = true;
  } else {
    const mappedIds = pendingFinancialReports.map(report => report.locationId).filter(Boolean);
    const duplicates = new Set(mappedIds.filter((id, index) => mappedIds.indexOf(id) !== index));
    preview.innerHTML = `<div class="financial-preview-summary"><b>${pendingFinancialReports.length} store report${pendingFinancialReports.length === 1 ? '' : 's'} found</b><span>${escapeHtml(pendingFinancialReports[0]?.businessDate || '')}</span></div><div class="financial-preview-table"><div class="financial-preview-row heading"><span>Report store</span><span>DQ OPS location</span><span>Net sales</span><span>vs LY</span><span>Labor</span><span>Transactions</span></div>${pendingFinancialReports.map((report, index) => {
      const salesChange = report.netSalesLy > 0 ? ((report.netSales - report.netSalesLy) / report.netSalesLy) * 100 : null;
      const rowErrors = [...(report.errors || [])];
      if (report.locationId && duplicates.has(report.locationId)) rowErrors.push('This DQ OPS location is selected more than once');
      return `<div class="financial-preview-row ${rowErrors.length ? 'has-error' : ''}"><span><b>${escapeHtml(report.sourceStoreLabel)}</b><small>${escapeHtml(report.businessDate)}${report.comparisonDate ? ` · LY ${escapeHtml(report.comparisonDate)}` : ''}</small></span><span><select data-financial-location-index="${index}"><option value="">Choose location…</option>${locations.map(location => `<option value="${escapeHtml(location.id)}" ${report.locationId === location.id ? 'selected' : ''}>${escapeHtml(location.name)}</option>`).join('')}</select>${rowErrors.length ? `<small class="import-row-error">${escapeHtml(rowErrors.join(' · '))}</small>` : ''}</span><span>${financialCurrency(report.netSales)}</span><span>${financialPercent(salesChange, { signed: true })}</span><span>${financialPercent(report.laborPercent, { fraction: true })}</span><span>${Number(report.transactionCount || 0).toLocaleString()}</span></div>`;
    }).join('')}</div>`;
    preview.querySelectorAll('[data-financial-location-index]').forEach(select => {
      select.onchange = () => {
        pendingFinancialReports[Number(select.dataset.financialLocationIndex)].locationId = select.value;
        renderFinancialReportImport();
      };
    });
    importButton.disabled = !financialImportHasValidMappings() || !financialReportState.migrationReady;
    clearButton.disabled = false;
    if (financialReportState.migrationReady) status.textContent = financialImportHasValidMappings() ? 'Review complete. The report is ready to import.' : 'Choose a unique DQ OPS location for every report row and correct any workbook errors.';
  }

  const imports = financialReportState.imports || [];
  $('#financialImportHistory').innerHTML = imports.length ? imports.map(record => `<article class="financial-import-history-row"><div><b>${escapeHtml(record.reportDate || '')}</b><span>${escapeHtml(record.sourceFilename || 'Financial recap')}</span></div><div><span>${record.locationCount || 0} locations</span><small>${escapeHtml(record.importedBy || '')}${record.createdAt ? ` · ${new Date(record.createdAt).toLocaleString()}` : ''}</small></div></article>`).join('') : '<p class="hint">No financial imports have been recorded yet.</p>';

  const mappingLocation = $('#financialMappingLocation');
  if (mappingLocation) mappingLocation.innerHTML = `<option value="">Choose location…</option>${locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('')}`;
  const mappings = Object.entries(financialReportState.mappings || {}).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  $('#financialStoreMappings').innerHTML = mappings.length ? mappings.map(([code, value]) => {
    const normalized = typeof value === 'string' ? { locationId: value, sourceStoreName: '' } : value || {};
    const locationName = locations.find(location => location.id === normalized.locationId)?.name || normalized.locationId || 'Not assigned';
    return `<article class="financial-admin-row"><div><b>Store ${escapeHtml(code)}</b><small>${escapeHtml(normalized.sourceStoreName || '')}</small></div><div><span>${escapeHtml(locationName)}</span><button class="ghost compact" type="button" data-edit-financial-mapping="${escapeHtml(code)}" data-mapping-location="${escapeHtml(normalized.locationId || '')}">Change</button></div></article>`;
  }).join('') : '<p class="hint">No store-number mappings have been learned yet. Add the first one above or import a reviewed workbook.</p>';
  document.querySelectorAll('[data-edit-financial-mapping]').forEach(button => {
    button.onclick = () => {
      $('#financialMappingCode').value = button.dataset.editFinancialMapping || '';
      $('#financialMappingLocation').value = button.dataset.mappingLocation || '';
      $('#financialMappingCode').focus();
    };
  });

  const correctionRows = (financialReportState.reports || []).slice(0, 75);
  $('#financialReportCorrections').innerHTML = correctionRows.length ? correctionRows.map((report, index) => `<article class="financial-correction-row"><div><b>${escapeHtml(report.businessDate || '')} · ${escapeHtml(report.locationName || '')}</b><small>Report store ${escapeHtml(report.sourceStoreCode || report.sourceStoreName || 'unknown')} · ${financialCurrency(report.netSales)}</small></div><div><select data-financial-correction-location="${index}"><option value="">Move to…</option>${locations.filter(location => location.id !== report.locationId).map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('')}</select><button class="ghost compact" type="button" data-move-financial-report="${index}">Move</button></div></article>`).join('') : '<p class="hint">No imported daily reports are available to correct.</p>';
  document.querySelectorAll('[data-move-financial-report]').forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset.moveFinancialReport);
      const destination = document.querySelector(`[data-financial-correction-location="${index}"]`)?.value || '';
      moveFinancialReport(correctionRows[index], destination);
    };
  });

  const automation = financialReportState.emailAutomation || {};
  $('#financialEmailAutomationStatus').textContent = automation.configured
    ? `Email intake is configured${automation.inboundAddress ? ` for ${automation.inboundAddress}` : ''}. Excel and HTML attachments will be processed automatically.`
    : 'Email intake code is ready. Add the Mailgun signing key, approved sender, and inbound route in Netlify and Mailgun to activate it.';
  const emailImports = financialReportState.emailImports || [];
  $('#financialEmailImportHistory').innerHTML = emailImports.length ? emailImports.map(entry => `<article class="financial-admin-row"><div><b>${escapeHtml(entry.sourceFilename || entry.subject || 'Email report')}</b><small>${escapeHtml(entry.reportDate || '')}${entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ''}</small><small>${escapeHtml(entry.message || '')}</small></div><div><span class="status-pill ${entry.status === 'imported' ? 'done' : entry.status === 'needs_review' ? 'open' : 'critical'}">${escapeHtml(String(entry.status || 'received').replace('_', ' '))}</span>${entry.status === 'needs_review' ? `<button class="ghost compact" type="button" data-retry-financial-email="${escapeHtml(entry.id)}">Retry</button>` : ''}</div></article>`).join('') : '<p class="hint">No emailed reports have been received.</p>';
  document.querySelectorAll('[data-retry-financial-email]').forEach(button => { button.onclick = () => retryFinancialEmailImport(button.dataset.retryFinancialEmail); });
}

async function financialFileHash(buffer) {
  if (!window.crypto?.subtle) return '';
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function previewFinancialReport(file) {
  if (!file) return clearFinancialReportPreview();
  const status = $('#financialImportStatus');
  status.textContent = 'Reading financial workbook…';
  try {
    if (!window.DqOpsFinancialReports) throw new Error('The financial report parser did not load. Refresh HIS OPS and try again.');
    const buffer = await file.arrayBuffer();
    let parsed;
    if (/\.html?$/i.test(file.name) || /text\/html/i.test(file.type)) {
      parsed = window.DqOpsFinancialReports.parseFinancialHtml(new TextDecoder().decode(buffer));
    } else {
      if (!window.XLSX) throw new Error('The Excel reader did not load. Refresh HIS OPS and try again.');
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error('The workbook does not contain a worksheet');
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true });
      parsed = window.DqOpsFinancialReports.parseWorkbookRows(rows);
    }
    pendingFinancialReports = window.DqOpsFinancialReports.autoMapLocations(parsed.reports, locations, financialReportState.mappings || {});
    pendingFinancialSource = { filename: file.name, hash: await financialFileHash(buffer) };
    status.textContent = parsed.errors.length ? `${parsed.errors.length} workbook issue${parsed.errors.length === 1 ? '' : 's'} must be corrected before importing.` : 'Workbook read successfully. Review the location matches below.';
    renderFinancialReportImport();
  } catch (error) {
    pendingFinancialReports = [];
    pendingFinancialSource = { filename: '', hash: '' };
    $('#financialReportFile').value = '';
    status.textContent = error.message;
    renderFinancialReportImport();
    toast(`Financial report did not load: ${error.message}`);
  }
}

async function saveFinancialStoreMapping() {
  const sourceStoreCode = $('#financialMappingCode').value.trim();
  const locationId = $('#financialMappingLocation').value;
  if (!/^\d{4,6}$/.test(sourceStoreCode)) return toast('Enter the 4- to 6-digit store number printed on the report');
  if (!locationId) return toast('Choose the DQ OPS location for that store number');
  const button = $('#saveFinancialMappingBtn');
  button.disabled = true;
  try {
    const result = await api('/api/financial-reports/mapping', { method: 'POST', body: JSON.stringify({ sourceStoreCode, locationId }) });
    financialReportState = result.state || { ...financialReportState, mappings: result.mappings || financialReportState.mappings };
    $('#financialMappingCode').value = '';
    $('#financialMappingLocation').value = '';
    renderFinancialReportImport();
    toast(`Store ${sourceStoreCode} mapping saved`);
  } catch (error) {
    toast(`Store mapping did not save: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function moveFinancialReport(report, toLocationId, replaceTarget = false) {
  if (!report || !toLocationId) return toast('Choose the correct destination location');
  try {
    const result = await api('/api/financial-reports/reassign', {
      method: 'POST',
      body: JSON.stringify({ fromLocationId: report.locationId, toLocationId, businessDate: report.businessDate, replaceTarget })
    });
    financialReportState = result.state || financialReportState;
    await loadDashboardState();
    render();
    toast(`Sales for ${report.businessDate} moved to the correct location`);
  } catch (error) {
    if (!replaceTarget && /destination already has sales/i.test(error.message) && window.confirm(`${error.message}\n\nReplace the destination report with this one?`)) {
      return moveFinancialReport(report, toLocationId, true);
    }
    toast(`Sales were not moved: ${error.message}`);
  }
}

async function retryFinancialEmailImport(id) {
  try {
    const result = await api('/api/financial-reports/email-retry', { method: 'POST', body: JSON.stringify({ id }) });
    financialReportState = result.state || financialReportState;
    await loadDashboardState();
    render();
    toast(`${result.imported} emailed location reports imported`);
  } catch (error) {
    toast(`Email import still needs attention: ${error.message}`);
  }
}

function clearFinancialReportPreview() {
  pendingFinancialReports = [];
  pendingFinancialSource = { filename: '', hash: '' };
  if ($('#financialReportFile')) $('#financialReportFile').value = '';
  if ($('#financialImportStatus')) $('#financialImportStatus').textContent = financialReportState.migrationReady ? '' : (financialReportState.message || 'Supabase setup is required.');
  renderFinancialReportImport();
}

async function importFinancialReport() {
  if (!financialImportHasValidMappings()) return toast('Match every report store to one unique DQ OPS location');
  const button = $('#importFinancialReportBtn');
  button.disabled = true;
  button.textContent = 'Importing…';
  try {
    const result = await api('/api/financial-reports/import', {
      method: 'POST',
      body: JSON.stringify({ sourceFilename: pendingFinancialSource.filename, sourceHash: pendingFinancialSource.hash, rows: pendingFinancialReports })
    });
    financialReportState = result.state || financialReportState;
    clearFinancialReportPreview();
    await loadDashboardState();
    render();
    toast(`${result.replacedExisting ? 'Updated' : 'Imported'} ${result.imported} location reports for ${result.reportDate}`);
  } catch (error) {
    toast(`Financial report did not import: ${error.message}`);
    $('#financialImportStatus').textContent = error.message;
  } finally {
    button.textContent = 'Import reviewed report';
    button.disabled = !financialImportHasValidMappings() || !financialReportState.migrationReady;
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
    shiftmanager: 'Shift Manager',
    shiftlead: 'Shift Manager',
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
  const address = rowValue(row, ['Address', 'Street Address', 'Location Address']);
  const phone = rowValue(row, ['Phone', 'Phone Number', 'Location Phone', 'Store Phone']);
  let id = findLocationId(idValue);
  if (!id && /^store-\d+$/i.test(idValue)) id = idValue.toLowerCase().replace(/store-(\d+)/, (_, number) => `store-${String(Number(number)).padStart(2, '0')}`);
  if (!id && /^\d+$/.test(idValue)) id = `store-${String(Number(idValue)).padStart(2, '0')}`;
  const existing = locations.find(location => location.id === id) || {};
  return { id, name, address: address || existing.address || '', phone: phone || existing.phone || '' };
}

async function submitManagementReport() {
  const title = $('#managementReportTitle').value.trim();
  const details = $('#managementReportDetails').value.trim();
  if (!title || !details) return toast('Enter a subject and describe what happened');
  const locationId = $('#managementReportLocation').value;
  try {
    const result = await api('/api/management-reports/report', {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        locationName: locationName(locationId),
        type: $('#managementReportType').value,
        severity: $('#managementReportSeverity').value,
        title,
        amount: $('#managementReportAmount').value,
        occurredAt: $('#managementReportOccurredAt').value,
        details,
        immediateAction: $('#managementReportAction').value.trim()
      })
    });
    managementReports = { reports: result.reports || [] };
    $('#managementReportTitle').value = '';
    $('#managementReportAmount').value = '';
    $('#managementReportDetails').value = '';
    $('#managementReportAction').value = '';
    $('#managementReportSeverity').value = 'Medium';
    $('#managementReportOccurredAt').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    renderManagementReports();
    const delivered = (result.notifications || []).filter(item => item.delivered).length;
    const attempted = (result.notifications || []).length;
    toast(attempted ? `Report submitted · ${delivered} of ${attempted} email notification${attempted === 1 ? '' : 's'} queued` : 'Report submitted · no matching email recipient was found');
  } catch (error) {
    toast(`Report did not submit: ${error.message}`);
  }
}

async function updateManagementReport(id) {
  const status = document.querySelector(`[data-management-status="${CSS.escape(id)}"]`)?.value;
  const followUp = document.querySelector(`[data-management-followup="${CSS.escape(id)}"]`)?.value.trim();
  try {
    managementReports = await api('/api/management-reports/update', {
      method: 'POST',
      body: JSON.stringify({ id, status, followUp })
    });
    renderManagementReports();
    toast('Management follow-up saved');
  } catch (error) {
    toast(`Follow-up did not save: ${error.message}`);
  }
}

async function receiptFileToDataUrl(file) {
  if (!file.type.startsWith('image/') || file.size <= 4 * 1024 * 1024) return fileToDataUrl(file);
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  return canvas.toDataURL('image/jpeg', 0.78);
}

async function saveReceipt() {
  if (!canAddStoreDocuments()) return toast('Only Area Managers and above can upload receipts');
  const vendor = $('#receiptVendor').value.trim();
  const amount = Number($('#receiptAmount').value);
  const file = $('#receiptFile').files[0];
  if (!vendor) return toast('Enter the vendor');
  if (!Number.isFinite(amount) || amount < 0) return toast('Enter a valid amount');
  if (!file) return toast('Choose a receipt photo or PDF');
  const button = $('#saveReceiptBtn');
  button.disabled = true;
  button.textContent = 'Uploading…';
  try {
    receipts = await api('/api/receipts/receipt', {
      method: 'POST',
      body: JSON.stringify({
        locationId: $('#receiptLocation').value,
        locationName: locationName($('#receiptLocation').value),
        date: $('#receiptDate').value || dateKey,
        vendor,
        amount,
        category: $('#receiptCategory').value,
        notes: $('#receiptNotes').value.trim(),
        attachment: { name: file.name, dataUrl: await receiptFileToDataUrl(file) }
      })
    });
    $('#receiptVendor').value = '';
    $('#receiptAmount').value = '';
    $('#receiptNotes').value = '';
    $('#receiptFile').value = '';
    renderReceipts();
    toast('Receipt uploaded');
  } catch (error) {
    toast(`Receipt did not upload: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Upload receipt';
  }
}

function exportReceiptCsv() {
  const filterLocation = $('#receiptFilterLocation').value;
  const fromDate = $('#receiptFilterDate').value;
  const list = (receipts.receipts || []).filter(receipt => (filterLocation === 'all' || receipt.locationId === filterLocation) && (!fromDate || receipt.date >= fromDate));
  if (!list.length) return toast('No receipts match this view');
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Location', 'Vendor', 'Amount', 'Category', 'Notes', 'Uploaded By', 'File Name'], ...list.map(receipt => [receipt.date, locationName(receipt.locationId), receipt.vendor, Number(receipt.amount || 0).toFixed(2), receipt.category, receipt.notes, receipt.createdBy, receipt.fileName])];
  const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dqops-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function saveInspectionLegacy() {
  if (!canAddStoreDocuments()) return toast('Only Area Managers and above can complete inspections');
  const answers = (inspections.template || []).map(item => {
    const raw = document.querySelector(`[data-inspection-answer="${item.id}"]`)?.value;
    return { id: item.id, value: raw === 'na' ? null : Number(raw), comment: document.querySelector(`[data-inspection-comment="${item.id}"]`)?.value.trim() || '' };
  });
  const button = $('#saveInspectionBtn');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    inspections = await api('/api/inspections/inspection', {
      method: 'POST',
      body: JSON.stringify({ locationId: $('#inspectionLocation').value, locationName: locationName($('#inspectionLocation').value), date: $('#inspectionDate').value || dateKey, notes: $('#inspectionNotes').value.trim(), answers })
    });
    $('#inspectionNotes').value = '';
    $('#inspectionChecklist').dataset.ready = '';
    renderInspections();
    toast('Store inspection saved');
  } catch (error) {
    toast(`Inspection did not save: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Save inspection';
  }
}

async function saveInspection() {
  if (!canAddStoreDocuments()) return toast('Only Area Managers and above can complete inspections');
  const template = (inspections.templates || []).find(entry => entry.id === inspectionTemplateId);
  if (!template) return toast('Choose an inspection list');
  const button = $('#saveInspectionBtn');
  button.disabled = true;
  button.textContent = 'Uploading photos and saving…';
  try {
    const answers = await Promise.all(template.items.map(async item => {
      const raw = document.querySelector(`[data-inspection-answer="${item.id}"]`)?.value;
      const file = document.querySelector(`[data-inspection-photo="${item.id}"]`)?.files?.[0];
      const photoUrl = file ? await uploadFileDirectToSupabase(file, `inspection-photo/${template.id}`, $('#inspectionLocation').value) : '';
      return { id: item.id, value: raw === 'na' ? null : Number(raw), comment: document.querySelector(`[data-inspection-comment="${item.id}"]`)?.value.trim() || '', photoUrl, photoName: file?.name || '' };
    }));
    inspections = await api('/api/inspections/inspection', {
      method: 'POST',
      body: JSON.stringify({ templateId: template.id, locationId: $('#inspectionLocation').value, locationName: locationName($('#inspectionLocation').value), date: $('#inspectionDate').value || dateKey, notes: $('#inspectionNotes').value.trim(), answers })
    });
    $('#inspectionNotes').value = '';
    $('#inspectionChecklist').dataset.templateId = '';
    inspectionChartTemplateId = template.id;
    localStorage.setItem('inspection-chart-template', inspectionChartTemplateId);
    renderInspections();
    toast(`${template.name} saved`);
  } catch (error) {
    toast(`Inspection did not save: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'Save inspection';
  }
}

function renderKioskAdmin() {
  const card = $('#kioskAdminCard');
  if (!card) return;
  const allowed = locations.filter(location => isFullAccess() || userLocationIds().includes(location.id));
  card.style.display = canUseManage() ? '' : 'none';
  $('#kioskLocation').innerHTML = allowed.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  $('#kioskDeviceList').innerHTML = kioskDevices.length ? kioskDevices.map(device => `
    <article class="card maintenance-row compact">
      <div><b>${escapeHtml(device.name)}</b><p>${escapeHtml(locationName(device.locationId))}${device.lastSeenAt ? ` · Last used ${new Date(device.lastSeenAt).toLocaleString()}` : ''}</p></div>
      <button class="danger" data-kiosk-revoke="${escapeHtml(device.id)}" type="button">Remove</button>
    </article>
  `).join('') : '<p class="hint">No store tablets are connected yet.</p>';
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
    const path = user.role !== 'Employee' && user.email && user.temporaryPassword && !user.id ? '/api/invite' : '/api/user';
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

async function setUserPin(id, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly four digits');
  return api('/api/user/pin', { method: 'POST', body: JSON.stringify({ id, pin }) });
}

async function saveLocationRecord(location) {
  if (apiOnline) {
    locations = (await api('/api/location', { method: 'POST', body: JSON.stringify(location) })).locations;
  } else {
    const existing = locations.find(entry => entry.id === location.id);
    if (existing) Object.assign(existing, location);
    else locations.push(location);
    const fallback = JSON.parse(localStorage.getItem('dailyops-v1') || '{}');
    fallback.locations = locations;
    localStorage.setItem('dailyops-v1', JSON.stringify(fallback));
  }
}

async function saveLocation(id) {
  const name = document.querySelector(`[data-location-name="${id}"]`).value.trim();
  const address = document.querySelector(`[data-location-address="${id}"]`).value.trim();
  const phone = document.querySelector(`[data-location-phone="${id}"]`).value.trim();
  if (!name) return toast('Enter a location name');
  await saveLocationRecord({ id, name, address, phone });
  render();
  toast('Location saved');
}

$('#pushTaskBtn').onclick = async () => {
  const name = $('#newTask').value.trim();
  if (!name) return toast('Enter a task description');
  const section = $('#newTaskSection').value;
  const qrCheckpointId = $('#newTaskQrRequired').checked ? $('#newTaskQrCheckpoint').value : '';
  if ($('#newTaskQrRequired').checked && !qrCheckpointId) return toast('Choose a QR checkpoint');
  const qrCheckpointName = (qrCheckpoints.checkpoints || []).find(checkpoint => checkpoint.id === qrCheckpointId)?.name || '';
  day.tasks.push({ id: `extra-${Date.now()}`, name, section, photo: $('#photoRequired').checked, qrCheckpointId, qrCheckpointName, requiresQr: Boolean(qrCheckpointId), done: false, pushed: true });
  selectedTaskSection = section;
  localStorage.setItem('dailyops-task-section', selectedTaskSection);
  $('#newTask').value = '';
  $('#photoRequired').checked = false;
  $('#newTaskQrRequired').checked = false;
  $('#newTaskQrCheckpointLabel').hidden = true;
  await persistAndRender('Task pushed to today');
};

$('#finishBtn').onclick = async () => {
  day.complete = true;
  day.completedAt = new Date().toISOString();
  day.completedBy = currentUser().name;
  await persistAndRender('Daily checklist complete');
};

document.querySelectorAll('nav button, .ops-sidebar button[data-view]').forEach(button => {
  button.onclick = async () => {
    if (isMaintenanceTech() && button.dataset.view !== 'rolloutView' && !['homeView', 'maintenanceView', 'fpcView', 'maintenanceLogView', 'noticesView'].includes(button.dataset.view)) return toast('This role can only access Dashboard, Notices, Maintenance, FPC, Work Log, and authorized rollouts');
    if (button.dataset.view === 'platformAdminView' && !subscriptionAdmin.platformAdmin) return toast('Only an Average Guys platform administrator can access this section');
    switchView(button.dataset.view);
    if (button.dataset.view === 'platformAdminView') await loadPlatformAdmin(platformAdminSupport.tenantId || subscriptionAdmin.tenantId);
    if (!wideSidebarQuery.matches) setSidebarExpanded(false);
  };
});

$('#signOutBtn').onclick = () => window.dailyOpsSignOut ? window.dailyOpsSignOut() : toast('Sign out is available on the hosted app');
$('#createKioskCodeBtn').onclick = async () => {
  const deviceName = $('#kioskDeviceName').value.trim() || 'Store tablet';
  try {
    const enrollment = await api('/api/kiosk/enrollment', { method: 'POST', body: JSON.stringify({ deviceName, locationId: $('#kioskLocation').value }) });
    const result = $('#kioskEnrollmentResult');
    result.hidden = false;
    result.innerHTML = `<p>On the tablet, choose <b>Set up a store tablet</b> and enter:</p><strong class="kiosk-code">${escapeHtml(enrollment.code)}</strong><p>This code expires in ${enrollment.expiresInMinutes} minutes and works once.</p>`;
  } catch (error) {
    toast(`Could not create setup code: ${error.message}`);
  }
};
$('#noticesBtn').onclick = async () => { await refreshNoticesQuietly(); switchView('noticesView'); };
$('#togglePreviousNoticesBtn').onclick = () => { showPreviousNotices = !showPreviousNotices; renderNotices(); };
$('#addTemplateTaskBtn').onclick = savePermanentTask;
$('#saveQrCheckpointBtn').onclick = saveQrCheckpoint;
$('#cancelQrCheckpointBtn').onclick = cancelQrCheckpointEdit;
$('#openQrScannerBtn').onclick = () => openQrScanner();
$('#startQrScannerBtn').onclick = startQrScanner;
$('#submitQrManualBtn').onclick = () => recordQrCheckpointScan(tokenFromCheckpointInput($('#qrScannerManualToken').value), qrScannerTaskId);
$('#closeQrScannerBtn').onclick = stopQrScanner;
$('#qrScannerDialog').addEventListener('close', stopQrScanner);
$('#qrScannerDialog').addEventListener('cancel', stopQrScanner);
$('#checklistImportFile').onchange = event => previewChecklistImport(event.target.files?.[0]);
$('#importChecklistItemsBtn').onclick = importChecklistItems;
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
$('#saveTemperatureStandardsBtn').onclick = saveTemperatureStandards;
$('#addTemperatureLogBtn').onclick = () => $('#temperatureStandardsList').insertAdjacentHTML('beforeend', temperatureLogEditorHtml('', true, []));
$('#correctiveGoBackBtn').onclick = goBackToTemperature;
$('#correctiveGoBackX').onclick = goBackToTemperature;
$('#correctiveActionDialog').addEventListener('cancel', event => { event.preventDefault(); goBackToTemperature(); });
$('#cancelAlertRuleBtn').onclick = resetAlertRuleForm;
$('#previewAlertsBtn').onclick = previewAlerts;
$('#refreshNotificationLogsBtn').onclick = refreshNotificationLogs;
$('#sendStoreAlarmBtn').onclick = sendStoreAlarm;
$('#enableTabletNotificationsBtn').onclick = enableTabletNotifications;
$('#acknowledgeStoreAlarmBtn').onclick = acknowledgeStoreAlarm;
$('#enableAlarmSoundBtn').onclick = () => { soundStoreAlarmTone(); startStoreAlarmTone(); };
$('#saveFpcInspectionBtn').onclick = saveFpcInspection;
$('#saveFpcItemBtn').onclick = saveFpcItem;
$('#fpcImportFile').onchange = event => previewFpcImport(event.target.files?.[0]);
$('#importFpcItemsBtn').onclick = importFpcItems;
$('#saveFpcEditBtn').onclick = saveFpcEdit;
$('#saveStoreDocBtn').onclick = saveStoreDocument;
$('#saveReceiptBtn').onclick = saveReceipt;
$('#exportReceiptsBtn').onclick = exportReceiptCsv;
$('#saveInspectionBtn').onclick = saveInspection;
document.querySelectorAll('[data-inspection-months]').forEach(button => {
  button.onclick = () => {
    inspectionChartMonths = Number(button.dataset.inspectionMonths);
    localStorage.setItem('inspection-chart-months', inspectionChartMonths);
    renderInspections();
  };
});
$('#saveResourceBtn').onclick = saveResource;
$('#cancelResourceEditBtn').onclick = resetResourceForm;
$('#submitSmallwaresBtn').onclick = submitSmallwaresRequest;
$('#submitManagementReportBtn').onclick = submitManagementReport;
$('#refreshLocationHealthBtn').onclick = refreshLocationHealth;
$('#saveMaintenanceLogBtn').onclick = saveMaintenanceLogEntry;
$('#cancelMaintenanceLogBtn').onclick = () => {
  resetMaintenanceLogForm();
  renderMaintenanceWorkLog();
};
$('#saveMaintenanceHoursPermissionsBtn').onclick = saveMaintenanceHoursPermissions;
$('#exportMaintenanceWorkLogBtn').onclick = exportMaintenanceWorkLog;
$('#saveRolloutPermissionsBtn').onclick = saveRolloutPermissions;
$('#rolloutLocation').onchange = event => { rolloutLocationId = event.target.value; localStorage.setItem('dqops-rollout-location', rolloutLocationId); renderRollout(); };
$('#customizeDashboardBtn').onclick = () => openDashboardCustomization('personal');
$('#editCompanyDashboardBtn').onclick = () => openDashboardCustomization('company');
$('#saveDashboardBtn').onclick = saveDashboardCustomization;
$('#resetDashboardBtn').onclick = resetDashboardCustomization;
$('#sendFeedbackBtn').onclick = openFeedbackDialog;
$('#submitFeedbackBtn').onclick = submitAppFeedback;
$('#cancelFeedbackBtn').onclick = () => $('#feedbackDialog').close();
$('#refreshPlatformAdminBtn').onclick = () => loadPlatformAdmin(platformAdminSupport.tenantId);
$('#platformAdminTenant').onchange = event => loadPlatformAdmin(event.target.value);
$('#financialReportFile').onchange = event => previewFinancialReport(event.target.files?.[0]);
$('#importFinancialReportBtn').onclick = importFinancialReport;
$('#clearFinancialReportBtn').onclick = clearFinancialReportPreview;
$('#saveFinancialMappingBtn').onclick = saveFinancialStoreMapping;
$('#saveManagerNotificationPreferencesBtn').onclick = saveManagerNotificationPreferences;
$('#saveSubscriptionBtn').onclick = saveSubscriptionAdmin;
$('#reloadSubscriptionBtn').onclick = () => loadSubscriptionAdmin();
$('#subscriptionTenant').onchange = event => loadSubscriptionAdmin(event.target.value);
$('#tenantSwitch').onchange = event => {
  localStorage.setItem('dqops-tenant-id', event.target.value);
  window.location.reload();
};
$('#subscriptionPlan').onchange = () => {
  const plan = selectedSubscriptionPlan();
  if (plan) {
    $('#subscriptionLocationLimit').value = plan.limits?.locations || '';
    $('#subscriptionUserLimit').value = plan.limits?.users || '';
    $('#subscriptionHistoryDays').value = plan.limits?.history_days || '';
  }
  renderSubscriptionFeatures(false);
};
$('#cancelNoticeEditBtn').onclick = resetNoticeForm;
$('#savePopCampaignBtn').onclick = savePopCampaign;
$('#cancelPopCampaignBtn').onclick = resetPopCampaignForm;
$('#checkForUpdatesBtn').onclick = checkForAppUpdate;
$('#helpRefreshNowBtn').onclick = refreshToAppUpdate;
$('#refreshAppUpdateBtn').onclick = refreshToAppUpdate;
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
$('#loadTemperatureHistoryBtn').onclick = loadTemperatureCompliance;
$('#exportTemperatureHistoryBtn').onclick = exportTemperatureCompliance;
$('#saveTemperatureClosureBtn').onclick = () => saveTemperatureClosure(true);
$('#removeTemperatureClosureBtn').onclick = () => saveTemperatureClosure(false);

document.addEventListener('keydown', event => {
  const taskCard = event.target.closest?.('[data-task-card]');
  if (!taskCard || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  taskCard.click();
});

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

setupAppUpdateFlow();
document.addEventListener('pointerdown', unlockStoreAlarmAudio, { once: true });
loadState();
window.setInterval(loadStoreAlarmState, 20000);
window.setInterval(refreshNoticesQuietly, 60000);
window.setInterval(refreshPopCampaignsQuietly, 300000);
window.setInterval(() => {
  if (!dayTempsAvailable() && selectedTempSession === 'Day') render();
  else renderInStoreReminders();
}, 60000);
