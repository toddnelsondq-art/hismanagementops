const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'dailyops-uploads';
const AUTH_REQUIRED = Boolean(process.env.SUPABASE_ANON_KEY);
const FULL_ACCESS_ROLES = ['Director of Operations', 'Owner'];
const MAINTENANCE_ROLE = 'Maintenance Tech';
const DEFAULT_TENANT_ID = safeName(process.env.APP_TENANT_ID || 'his-management');
const DEFAULT_TENANT_NAME = process.env.APP_TENANT_NAME || 'HIS Management Group Inc';
const DEFAULT_TENANT_LOGO = process.env.APP_TENANT_LOGO || 'assets/his-management.png';
const ALERT_TIME_ZONE = process.env.ALERT_TIME_ZONE || 'America/Chicago';

const DEFAULT_LOCATION_ID = 'store-01';
const DEFAULT_TASK_SECTIONS = ['All Day', 'Opening', 'Mid-shift', 'Closing'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BASE_TASKS = [
  { id: 'sanitize', name: 'Sanitize all prep surfaces' },
  { id: 'coolers', name: 'Check cooler and freezer doors', photo: true },
  { id: 'labels', name: 'Verify food labels and dates' },
  { id: 'floors', name: 'Sweep and mop kitchen floors', photo: true },
  { id: 'cash', name: 'Count and record opening cash' }
];
const DEFAULT_TASK_TEMPLATES = BASE_TASKS.map(task => ({ ...task, section: 'Opening', active: true }));

const TEMPERATURE_ITEMS = {
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error('Missing Supabase environment variables');
    error.statusCode = 500;
    throw error;
  }
}

async function supabase(pathname, options = {}) {
  requireSupabase();
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || text || 'Supabase request failed');
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDate(timeZone = ALERT_TIME_ZONE, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeName(value = 'file') {
  return String(value).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'file';
}

function tenantId() {
  return DEFAULT_TENANT_ID;
}

function tenantQuery() {
  return `tenant_id=eq.${encodeURIComponent(tenantId())}`;
}

function withTenant(payload = {}) {
  return { tenant_id: tenantId(), ...payload };
}

function tenantConfig() {
  return {
    id: tenantId(),
    name: DEFAULT_TENANT_NAME,
    logoUrl: DEFAULT_TENANT_LOGO,
    appName: process.env.APP_NAME || 'HIS OPS',
    subtitle: process.env.APP_SUBTITLE || 'Daily operations'
  };
}

async function readTenantConfig() {
  try {
    const rows = await supabase(`/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId())}&active=eq.true&select=id,name,app_name,subtitle,logo_url`);
    const tenant = rows[0];
    if (!tenant) return tenantConfig();
    return {
      id: tenant.id,
      name: tenant.name || DEFAULT_TENANT_NAME,
      appName: tenant.app_name || 'HIS OPS',
      subtitle: tenant.subtitle || 'Daily operations',
      logoUrl: tenant.logo_url || DEFAULT_TENANT_LOGO
    };
  } catch {
    return tenantConfig();
  }
}

function scheduleDaysForTask(task = {}, locationId = DEFAULT_LOCATION_ID) {
  const locationSchedules = task.locationSchedules || {};
  const override = locationSchedules[locationId];
  const days = Array.isArray(override) ? override : task.scheduleDays;
  return Array.isArray(days) && days.length ? days : ['daily'];
}

function dayNameForDate(date = today()) {
  return WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
}

function taskScheduledForDate(task = {}, locationId = DEFAULT_LOCATION_ID, date = today()) {
  const days = scheduleDaysForTask(task, locationId);
  return days.includes('daily') || days.includes(dayNameForDate(date));
}

function templateLocationId(task = {}) {
  return task.locationId || 'all';
}

function effectiveTaskTemplates(templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID) {
  const storeSections = new Set(templates
    .filter(task => task.active !== false && templateLocationId(task) === locationId)
    .map(task => task.section || 'Opening'));
  return templates.filter(task => {
    if (task.active === false) return false;
    const taskLocation = templateLocationId(task);
    if (taskLocation === locationId) return true;
    if (taskLocation === 'all') return !storeSections.has(task.section || 'Opening');
    return false;
  });
}

function newDay(locationId, templates = DEFAULT_TASK_TEMPLATES, date = today()) {
  const activeTemplates = effectiveTaskTemplates(templates, locationId).filter(task => taskScheduledForDate(task, locationId, date));
  const tasks = activeTemplates.flatMap(task => {
    const baseTask = {
      id: task.id,
      name: task.name,
      photo: Boolean(task.photo),
      section: task.section || 'Opening',
      locationId: templateLocationId(task),
      category: task.category || '',
      prepArea: task.prepArea || '',
      managerPrep: Boolean(task.managerPrep || task.prepArea),
      done: false
    };
    if (!baseTask.managerPrep || !baseTask.prepArea) return [baseTask];
    return [
      baseTask,
      {
        ...baseTask,
        id: `prep-crew-${baseTask.id}`,
        category: baseTask.prepArea,
        linkedPrepId: baseTask.id,
        managerPrep: false,
        crewPrep: true,
        done: false
      }
    ];
  });
  return {
    locationId,
    prepQuantities: {},
    tasks,
    temps: [],
    complete: false
  };
}

function reconcileDaySchedule(payload, locationId, date, templates = DEFAULT_TASK_TEMPLATES) {
  if (!payload || payload.complete) return payload;
  const scheduled = newDay(locationId, templates, date);
  const scheduledIds = new Set(scheduled.tasks.map(task => task.id));
  const existing = new Map((payload.tasks || []).map(task => [task.id, task]));
  const scheduledTasks = scheduled.tasks.map(task => ({ ...task, ...(existing.get(task.id) || {}) }));
  const extraTasks = (payload.tasks || []).filter(task => task.pushed || !scheduledIds.has(task.id) && String(task.id || '').startsWith('extra-'));
  return {
    ...payload,
    locationId,
    tasks: [...scheduledTasks, ...extraTasks],
    temps: payload.temps || [],
    complete: false
  };
}

async function readLocations() {
  const rows = await supabase(`/rest/v1/locations?${tenantQuery()}&active=eq.true&select=id,name&order=id.asc`);
  return rows.length ? rows : Array.from({ length: 13 }, (_, index) => ({
    id: `store-${String(index + 1).padStart(2, '0')}`,
    name: `Store ${index + 1}`
  }));
}

async function readUsers() {
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&active=eq.true&select=*&order=name.asc`);
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    phone: row.phone || row.mobile_phone || row.mobile || null,
    name: row.name,
    role: row.role,
    locationId: row.location_id,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids : [row.location_id]
  }));
}

async function readDay(locationId, date) {
  const rows = await supabase(`/rest/v1/days?${tenantQuery()}&location_id=eq.${encodeURIComponent(locationId)}&date=eq.${encodeURIComponent(date)}&select=payload`);
  let templates = DEFAULT_TASK_TEMPLATES;
  try {
    templates = await readTaskTemplates();
  } catch {
    templates = DEFAULT_TASK_TEMPLATES;
  }
  if (rows[0]?.payload) return reconcileDaySchedule(rows[0].payload, locationId, date, templates);
  return newDay(locationId, templates, date);
}

async function writeDay(locationId, date, day) {
  const payload = { ...day, locationId };
  await supabase('/rest/v1/days?on_conflict=tenant_id,location_id,date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(withTenant({ location_id: locationId, date, payload, updated_at: new Date().toISOString() }))
  });
  return payload;
}

async function snoozeTask(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can snooze checklist tasks'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  const sourceDate = payload.date || today();
  const targetDate = payload.targetDate;
  const taskId = payload.taskId;
  if (!targetDate || !taskId) throw Object.assign(new Error('Choose a task and target date'), { statusCode: 400 });
  if (AUTH_REQUIRED && !isFullAccess(actor) && !userLocationIds(actor).includes(locationId)) {
    throw Object.assign(new Error('You can only snooze tasks for your assigned locations'), { statusCode: 403 });
  }
  const sourceDay = await readDay(locationId, sourceDate);
  const task = (sourceDay.tasks || []).find(entry => entry.id === taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  sourceDay.tasks = (sourceDay.tasks || []).filter(entry => entry.id !== taskId);
  sourceDay.snoozedTasks = [...(sourceDay.snoozedTasks || []), {
    taskId,
    name: task.name,
    section: task.section,
    targetDate,
    snoozedBy: actor?.name || 'Manager',
    snoozedAt: new Date().toISOString()
  }];
  await writeDay(locationId, sourceDate, sourceDay);

  const targetDay = await readDay(locationId, targetDate);
  const snoozedTask = {
    ...task,
    id: `snoozed-${task.id}-${Date.now()}`,
    done: false,
    pushed: true,
    snoozedFrom: sourceDate,
    snoozedBy: actor?.name || 'Manager'
  };
  targetDay.tasks = [...(targetDay.tasks || []), snoozedTask];
  await writeDay(locationId, targetDate, targetDay);
  return {
    day: sourceDay,
    history: await readHistory(locationId),
    overdue: await readOverdue(sourceDate)
  };
}

async function readHistory(locationId = null) {
  const filter = locationId ? `location_id=eq.${encodeURIComponent(locationId)}&` : '';
  const rows = await supabase(`/rest/v1/days?${tenantQuery()}&${filter}select=location_id,date,payload&order=date.desc`);
  return rows
    .filter(row => row.payload?.complete)
    .map(row => ({ locationId: row.location_id, date: row.date, day: row.payload }));
}

async function readOverdue(date) {
  const [locations, rows] = await Promise.all([
    readLocations(),
    supabase(`/rest/v1/days?${tenantQuery()}&date=eq.${encodeURIComponent(date)}&select=location_id,payload`)
  ]);
  const done = new Set(rows.filter(row => row.payload?.complete).map(row => row.location_id));
  return locations
    .filter(location => !done.has(location.id))
    .map(location => ({ locationId: location.id, locationName: location.name, status: 'Not completed' }));
}

function dateRange(range = 'day') {
  const todayDate = new Date();
  const end = todayDate.toISOString().slice(0, 10);
  const startDate = new Date(todayDate);
  if (range === 'week') startDate.setDate(todayDate.getDate() - todayDate.getDay());
  if (range === 'month') startDate.setDate(1);
  const start = startDate.toISOString().slice(0, 10);
  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { start, end, dates };
}

function dailyTemperatureAreas() {
  const entries = Object.entries(TEMPERATURE_ITEMS);
  const isNewFormat = entries.some(([, value]) => value?.areas);
  if (!isNewFormat) return TEMPERATURE_ITEMS;
  return entries.reduce((areas, [, list]) => {
    if (list.requiredDaily === false) return areas;
    Object.entries(list.areas || {}).forEach(([area, items]) => {
      areas[area] = items;
    });
    return areas;
  }, {});
}

function readingList(reading) {
  if (reading.list) return reading.list;
  if (String(reading.area || '').toLowerCase().includes('chill')) return 'Chill';
  return 'Grill';
}

function readingSession(reading) {
  return reading.session || 'Day';
}

function tempRequirementCount() {
  return Object.values(dailyTemperatureAreas()).reduce((sum, items) => sum + items.length, 0) * 2;
}

function dailyOpsCounts(payload = null, templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID, date = today()) {
  const source = payload || newDay(locationId, templates, date);
  const scheduledTemplates = templates.filter(task => task.active !== false && taskScheduledForDate(task, locationId, date));
  const tasks = Array.isArray(source.tasks) ? source.tasks : scheduledTemplates;
  const taskTotal = tasks.length;
  const taskDone = tasks.filter(task => task.done).length;
  const requiredTemps = new Set();
  Object.entries(dailyTemperatureAreas()).forEach(([area, items]) => {
    items.forEach(item => ['Day', 'Afternoon'].forEach(session => requiredTemps.add(`${area}|${item}|${session}`)));
  });
  const loggedTemps = new Set(((source.temps || []).filter(temp => readingList(temp) !== 'Receiving')).map(temp => `${temp.area}|${temp.item}|${temp.session || 'Day'}`));
  const tempDone = [...requiredTemps].filter(key => loggedTemps.has(key)).length;
  return {
    completed: taskDone + tempDone,
    total: taskTotal + tempRequirementCount()
  };
}

function dashboardPercent(completed, total) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function dailyOpsBreakdown(payload = null, templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID, date = today()) {
  const source = payload || newDay(locationId, templates, date);
  const scheduledTemplates = templates.filter(task => task.active !== false && taskScheduledForDate(task, locationId, date));
  const tasks = Array.isArray(source.tasks) ? source.tasks : scheduledTemplates;
  const taskRows = tasks.reduce((rows, task) => {
    const label = task.section || 'Opening';
    rows[label] ??= { label, completed: 0, total: 0 };
    rows[label].total += 1;
    if (task.done) rows[label].completed += 1;
    return rows;
  }, {});
  const tempRows = Object.entries(TEMPERATURE_ITEMS).reduce((rows, [listName, list]) => {
    if (list.requiredDaily === false) return rows;
    const total = Object.values(list.areas || {}).reduce((sum, items) => sum + items.length, 0) * 2;
    const required = new Set();
    Object.entries(list.areas || {}).forEach(([area, items]) => {
      items.forEach(item => ['Day', 'Afternoon'].forEach(session => required.add(`${area}|${item}|${session}`)));
    });
    const logged = new Set((source.temps || [])
      .filter(temp => readingList(temp) === listName)
      .map(temp => `${temp.area}|${temp.item}|${temp.session || 'Day'}`));
    rows[`${listName} Temp Logs`] = {
      label: `${listName} Temp Logs`,
      completed: [...required].filter(key => logged.has(key)).length,
      total
    };
    return rows;
  }, {});
  return Object.values({ ...taskRows, ...tempRows }).map(row => ({
    ...row,
    remaining: Math.max(row.total - row.completed, 0),
    percent: dashboardPercent(row.completed, row.total)
  }));
}

function fpcSummary(records = [], locationIds = []) {
  const scopedRecords = records.filter(record => record.active !== false && locationIds.includes(record.locationId));
  const items = scopedRecords.flatMap(record => record.items || []);
  const completed = items.filter(item => item.status === 'Completed').length;
  const open = items.filter(item => item.status !== 'Completed').length;
  const total = completed + open;
  return {
    completed,
    open,
    total,
    percent: dashboardPercent(completed, total)
  };
}

function maintenanceLocationIdsForStoreIds(storeIds, maintenanceLocations) {
  return storeIds.map(storeId => {
    const match = String(storeId).match(/store-(\d+)/);
    if (!match) return null;
    return maintenanceLocations[Number(match[1]) - 1]?.['Location ID'];
  }).filter(Boolean).map(String);
}

function dateInRange(value, start, end) {
  if (!value) return false;
  const date = String(value).slice(0, 10);
  return date >= start && date <= end;
}

async function dashboardSummary(actor, range = 'day', locationId = 'all') {
  const { start, end, dates } = dateRange(range);
  const allLocations = await readLocations();
  const actorLocations = AUTH_REQUIRED
    ? (isFullAccess(actor) ? allLocations.map(location => location.id) : userLocationIds(actor))
    : allLocations.map(location => location.id);
  const selectedLocations = locationId && locationId !== 'all'
    ? actorLocations.filter(id => id === locationId)
    : actorLocations;
  if (!selectedLocations.length) {
    return {
      range,
      locationId,
      start,
      end,
      ops: { completed: 0, remaining: 0, total: 0, percent: 0 },
      maintenance: { completed: 0, open: 0, total: 0, percent: 0 },
      fpc: { completed: 0, open: 0, total: 0, percent: 0 },
      progress: { mode: 'locations', rows: [] }
    };
  }
  const [rows, taskTemplates] = await Promise.all([
    supabase(`/rest/v1/days?${tenantQuery()}&date=gte.${start}&date=lte.${end}&select=location_id,date,payload`),
    readTaskTemplates()
  ]);
  const rowMap = new Map(rows.map(row => [`${row.location_id}|${row.date}`, row.payload]));
  const locationNames = new Map(allLocations.map(location => [location.id, location.name]));
  const locationProgress = selectedLocations.map(scopedLocationId => {
    const totals = dates.reduce((dateTotals, date) => {
      const counts = dailyOpsCounts(rowMap.get(`${scopedLocationId}|${date}`), taskTemplates, scopedLocationId, date);
      dateTotals.completed += counts.completed;
      dateTotals.total += counts.total;
      return dateTotals;
    }, { completed: 0, total: 0 });
    return {
      id: scopedLocationId,
      label: locationNames.get(scopedLocationId) || scopedLocationId,
      completed: totals.completed,
      remaining: Math.max(totals.total - totals.completed, 0),
      total: totals.total,
      percent: dashboardPercent(totals.completed, totals.total)
    };
  });
  const ops = locationProgress.reduce((totals, row) => {
    totals.completed += row.completed;
    totals.total += row.total;
    return totals;
  }, { completed: 0, total: 0 });

  const selectedBreakdown = selectedLocations.length === 1
    ? dates.reduce((rows, date) => {
      dailyOpsBreakdown(rowMap.get(`${selectedLocations[0]}|${date}`), taskTemplates, selectedLocations[0], date).forEach(row => {
        rows[row.label] ??= { label: row.label, completed: 0, total: 0 };
        rows[row.label].completed += row.completed;
        rows[row.label].total += row.total;
      });
      return rows;
    }, {})
    : null;

  const progressRows = selectedBreakdown
    ? Object.values(selectedBreakdown).map(row => ({
      ...row,
      remaining: Math.max(row.total - row.completed, 0),
      percent: dashboardPercent(row.completed, row.total)
    }))
    : locationProgress;

  const [workOrders, pmSchedule, maintenanceLocations, fpcRecords] = await Promise.all([
    readMaintenanceKey('workOrders', []),
    readMaintenanceKey('pmSchedule', []),
    readMaintenanceKey('locations', []),
    readFpcRecords()
  ]);
  const maintenanceLocationIds = locationId && locationId !== 'all'
    ? maintenanceLocationIdsForStoreIds([locationId], maintenanceLocations)
    : maintenanceLocationIdsForStoreIds(selectedLocations, maintenanceLocations);
  const scopedOrders = maintenanceLocationIds.length
    ? workOrders.filter(order => maintenanceLocationIds.includes(String(order['Location ID'])))
    : workOrders;
  const scopedPm = maintenanceLocationIds.length
    ? pmSchedule.filter(pm => maintenanceLocationIds.includes(String(pm['Location ID'])))
    : pmSchedule;
  const completedOrders = scopedOrders.filter(order =>
    String(order.Status || '').toLowerCase() === 'completed' &&
    (dateInRange(order['Date Completed'], start, end) || dateInRange(order['Date Submitted'], start, end))
  );
  const openOrders = scopedOrders.filter(order => {
    const status = String(order.Status || '').toLowerCase();
    return !['completed', 'cancelled', 'canceled'].includes(status);
  });
  const completedPm = scopedPm.filter(pm => String(pm.Status || '').toLowerCase() === 'completed');
  const openPm = scopedPm.filter(pm => String(pm.Status || 'Due').toLowerCase() !== 'completed');
  const fpc = fpcSummary(fpcRecords, selectedLocations);

  return {
    range,
    locationId,
    start,
    end,
    ops: {
      completed: ops.completed,
      remaining: Math.max(ops.total - ops.completed, 0),
      total: ops.total,
      percent: dashboardPercent(ops.completed, ops.total)
    },
    maintenance: {
      completed: completedOrders.length + completedPm.length,
      open: openOrders.length + openPm.length,
      total: completedOrders.length + completedPm.length + openOrders.length + openPm.length,
      percent: dashboardPercent(completedOrders.length + completedPm.length, completedOrders.length + completedPm.length + openOrders.length + openPm.length)
    },
    fpc,
    progress: {
      mode: selectedBreakdown ? 'single-location' : 'locations',
      rows: progressRows
    }
  };
}

async function saveUser(user) {
  const locationIds = (user.locationIds || [user.locationId || DEFAULT_LOCATION_ID]).filter(Boolean);
  const locationId = user.locationId || locationIds[0] || DEFAULT_LOCATION_ID;
  const id = user.id || safeName(user.email || user.name);
  await supabase('/rest/v1/app_users?on_conflict=tenant_id,id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(withTenant({
      id,
      auth_user_id: user.authUserId || undefined,
      email: user.email || null,
      name: user.name,
      role: user.role || 'Employee',
      location_id: locationId,
      location_ids: locationIds.length ? locationIds : [locationId],
      active: true,
      updated_at: new Date().toISOString()
    }))
  });
  return readUsers();
}

async function deactivateUser(id, actor) {
  if (!id) throw Object.assign(new Error('Missing user id'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}&select=*`);
  const target = rows[0];
  if (!target) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (target.id === actor?.id) throw Object.assign(new Error('You cannot deactivate yourself'), { statusCode: 400 });
  if (!canManage(actor)) throw Object.assign(new Error('You do not have access to manage users'), { statusCode: 403 });
  if (!allowedRoles(actor).includes(target.role || 'Employee')) throw Object.assign(new Error('You cannot deactivate that role'), { statusCode: 403 });
  if (!isFullAccess(actor)) {
    const actorLocations = userLocationIds(actor);
    const targetLocations = userLocationIds(target);
    if (targetLocations.some(locationId => !actorLocations.includes(locationId))) {
      throw Object.assign(new Error('You can only deactivate users assigned to your locations'), { statusCode: 403 });
    }
  }
  await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
  });
  return readUsers();
}

async function setUserPassword(id, password, actor) {
  if (!id || !password) throw Object.assign(new Error('Missing user or password'), { statusCode: 400 });
  if (password.length < 6) throw Object.assign(new Error('Password must be at least 6 characters'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}&select=*`);
  const target = rows[0];
  if (!target) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (target.id !== actor?.id && !canManage(actor)) throw Object.assign(new Error('You do not have access to change this password'), { statusCode: 403 });
  if (target.id !== actor?.id && !isFullAccess(actor)) {
    const actorLocations = userLocationIds(actor);
    const targetLocations = userLocationIds(target);
    if (!allowedRoles(actor).includes(target.role || 'Employee') || targetLocations.some(locationId => !actorLocations.includes(locationId))) {
      throw Object.assign(new Error('You can only change passwords for users assigned to your locations'), { statusCode: 403 });
    }
  }
  let authUserId = target.auth_user_id;
  if (!authUserId && target.email) {
    const search = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    const payload = search.ok ? await search.json() : null;
    const authUser = (payload?.users || payload || []).find(user => String(user.email || '').toLowerCase() === String(target.email).toLowerCase());
    authUserId = authUser?.id;
  }
  if (!authUserId) throw Object.assign(new Error('No hosted login found for this user'), { statusCode: 404 });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error(await response.text());
  if (!target.auth_user_id) {
    await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
    });
  }
  return { ok: true };
}

async function createAuthUserWithPassword(payload, locationId, locationIds) {
  if (!payload.email || !payload.temporaryPassword) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.temporaryPassword,
      email_confirm: true,
      user_metadata: {
        name: payload.name,
        role: payload.role || 'Employee',
        location_id: locationId,
        location_ids: locationIds
      }
    })
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const alreadyExists = response.status === 422 && /already|registered|exists/i.test(JSON.stringify(result));
    if (alreadyExists) return null;
    const error = new Error(result?.msg || result?.message || text || 'Could not create Supabase login');
    error.statusCode = response.status;
    throw error;
  }
  return result;
}

async function saveLocation(location) {
  await supabase('/rest/v1/locations?on_conflict=tenant_id,id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(withTenant({
      id: location.id,
      name: location.name,
      active: true,
      updated_at: new Date().toISOString()
    }))
  });
  return readLocations();
}

async function createUserLogin(payload) {
  const locationIds = (payload.locationIds || [payload.locationId]).filter(Boolean);
  const locationId = payload.locationId || locationIds[0] || DEFAULT_LOCATION_ID;
  if (AUTH_REQUIRED && !payload.temporaryPassword) {
    throw Object.assign(new Error('Temporary password is required for hosted user creation'), { statusCode: 400 });
  }
  const authUser = await createAuthUserWithPassword(payload, locationId, locationIds);
  const authUserId = authUser?.id || authUser?.user?.id;
  await saveUser({
    id: payload.email ? safeName(payload.email) : undefined,
    authUserId,
    email: payload.email,
    name: payload.name,
    role: payload.role || 'Employee',
    locationId,
    locationIds
  });
  return {
    id: authUserId || safeName(payload.email || payload.name),
    authUserId,
    email: payload.email,
    passwordCreated: Boolean(payload.temporaryPassword)
  };
}

async function currentAuthUser(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

function userLocationIds(profile) {
  return Array.isArray(profile?.location_ids) && profile.location_ids.length ? profile.location_ids : [profile?.location_id || DEFAULT_LOCATION_ID];
}

function appProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locationId: row.location_id,
    locationIds: userLocationIds(row)
  };
}

function bestProfile(rows) {
  const rank = {
    Owner: 5,
    'Director of Operations': 4,
    'Area Manager': 3,
    [MAINTENANCE_ROLE]: 2,
    Manager: 2,
    Employee: 1
  };
  return [...rows].sort((a, b) => (rank[b.role] || 0) - (rank[a.role] || 0))[0];
}

function isFullAccess(profile) {
  return FULL_ACCESS_ROLES.includes(profile?.role);
}

function canManage(profile) {
  return profile && profile.role !== 'Employee';
}

function canAreaManage(profile) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(profile?.role);
}

function roleRank(role = 'Employee') {
  return {
    Employee: 0,
    Manager: 1,
    [MAINTENANCE_ROLE]: 2,
    'Area Manager': 3,
    'Director of Operations': 4,
    Owner: 5
  }[role] ?? 0;
}

function allowedRoles(profile) {
  if (isFullAccess(profile)) return ['Employee', 'Manager', 'Area Manager', MAINTENANCE_ROLE, 'Director of Operations', 'Owner'];
  if (profile?.role === 'Area Manager') return ['Employee', 'Manager', 'Area Manager', MAINTENANCE_ROLE];
  if (profile?.role === 'Manager') return ['Employee', 'Manager'];
  return [];
}

async function currentProfile(event) {
  if (!AUTH_REQUIRED) return null;
  const authUser = await currentAuthUser(event);
  if (!authUser?.email) throw Object.assign(new Error('Not signed in'), { statusCode: 401 });
  const email = authUser.email.toLowerCase();
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&or=(auth_user_id.eq.${authUser.id},email.eq.${encodeURIComponent(email)})&active=eq.true&select=*`);
  const profile = bestProfile(rows);
  if (!profile) throw Object.assign(new Error(`No active app profile found for ${email}`), { statusCode: 403 });
  return profile;
}

function assertManageAccess(actor, payload = {}) {
  if (!AUTH_REQUIRED) return;
  if (!canManage(actor)) throw Object.assign(new Error('You do not have access to manage users'), { statusCode: 403 });
  if (!allowedRoles(actor).includes(payload.role || 'Employee')) throw Object.assign(new Error('You cannot assign that role'), { statusCode: 403 });
  if (isFullAccess(actor)) return;
  const actorLocations = userLocationIds(actor);
  const requestedLocations = (payload.locationIds || [payload.locationId || DEFAULT_LOCATION_ID]).filter(Boolean);
  if (requestedLocations.some(locationId => !actorLocations.includes(locationId))) {
    throw Object.assign(new Error('You can only assign your locations'), { statusCode: 403 });
  }
}

async function sessionProfile(event) {
  const authUser = await currentAuthUser(event);
  if (!authUser?.email) throw Object.assign(new Error('Not signed in'), { statusCode: 401 });
  const email = authUser.email.toLowerCase();
  let profileRows = await supabase(`/rest/v1/app_users?${tenantQuery()}&or=(auth_user_id.eq.${authUser.id},email.eq.${encodeURIComponent(email)})&active=eq.true&select=*`);
  let profile = bestProfile(profileRows);

  if (profile) {
    if (!profile.auth_user_id) {
      await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ auth_user_id: authUser.id, accepted_at: new Date().toISOString() })
      });
      profileRows = await supabase(`/rest/v1/app_users?${tenantQuery()}&email=eq.${encodeURIComponent(email)}&select=*`);
      profile = bestProfile(profileRows);
    }
    return appProfile(profile);
  }

  if (!profile) throw Object.assign(new Error(`No active app profile found for ${email}. Create this user in Manage or add this email to app_users.`), { statusCode: 403 });
  return appProfile(profile);
}

async function readMaintenanceKey(key, fallback = []) {
  const rows = await supabase(`/rest/v1/maintenance_data?${tenantQuery()}&key=eq.${encodeURIComponent(key)}&select=payload`);
  if (rows[0]) return rows[0].payload;
  const seedPath = path.join(__dirname, '..', '..', 'data', 'maintenance_seed.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return seed[key] || fallback;
  }
  return fallback;
}

async function writeMaintenanceKey(key, payload) {
  await supabase('/rest/v1/maintenance_data?on_conflict=tenant_id,key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(withTenant({ key, payload, updated_at: new Date().toISOString() }))
  });
}

function normalizeTaskTemplate(task = {}) {
  const name = String(task.name || '').trim();
  if (!name) throw Object.assign(new Error('Task name is required'), { statusCode: 400 });
  const section = String(task.section || 'Opening').trim() || 'Opening';
  const scheduleDays = Array.isArray(task.scheduleDays) && task.scheduleDays.length ? task.scheduleDays : ['daily'];
  return {
    id: task.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    section,
    category: task.category || '',
    prepArea: task.prepArea || '',
    managerPrep: Boolean(task.managerPrep || task.prepArea),
    locationId: task.locationId || 'all',
    photo: Boolean(task.photo),
    scheduleDays,
    locationSchedules: task.locationSchedules && typeof task.locationSchedules === 'object' ? task.locationSchedules : {},
    active: task.active !== false
  };
}

async function readTaskTemplates() {
  const rows = await readMaintenanceKey('taskTemplates', DEFAULT_TASK_TEMPLATES);
  const templates = Array.isArray(rows) && rows.length ? rows : DEFAULT_TASK_TEMPLATES;
  return templates.map(task => ({
    ...task,
    section: task.section || 'Opening',
    locationId: task.locationId || 'all',
    scheduleDays: Array.isArray(task.scheduleDays) && task.scheduleDays.length ? task.scheduleDays : ['daily'],
    locationSchedules: task.locationSchedules && typeof task.locationSchedules === 'object' ? task.locationSchedules : {},
    active: task.active !== false
  }));
}

async function saveTaskTemplate(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit checklists'), { statusCode: 403 });
  const templates = await readTaskTemplates();
  const template = normalizeTaskTemplate(payload);
  const existing = templates.findIndex(task => task.id === template.id);
  if (existing >= 0) templates[existing] = template;
  else {
    const sectionMatch = templates.find(task => task.section === template.section && templateLocationId(task) === template.locationId);
    if (sectionMatch && !payload.scheduleDays) {
      template.scheduleDays = sectionMatch.scheduleDays || ['daily'];
      template.locationSchedules = sectionMatch.locationSchedules || {};
    }
    templates.push(template);
  }
  await writeMaintenanceKey('taskTemplates', templates);
  return templates;
}

async function copyChecklistSection(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can copy checklists'), { statusCode: 403 });
  const section = String(payload.section || '').trim();
  const locationId = String(payload.locationId || '').trim();
  if (!section || !locationId) throw Object.assign(new Error('Checklist and location are required'), { statusCode: 400 });
  const templates = await readTaskTemplates();
  const source = templates.filter(task => task.active !== false && task.section === section && templateLocationId(task) === 'all');
  if (!source.length) throw Object.assign(new Error('Company master checklist not found'), { statusCode: 404 });
  const remaining = templates.filter(task => !(task.section === section && templateLocationId(task) === locationId));
  const copied = source.map(task => ({
    ...task,
    id: `${task.id}-${locationId}`,
    locationId,
    locationSchedules: {},
    active: true
  }));
  const updated = [...remaining, ...copied];
  await writeMaintenanceKey('taskTemplates', updated);
  return updated;
}

async function importAreaChecklistTemplates(actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can import checklists'), { statusCode: 403 });
  const seedPath = path.join(__dirname, '..', '..', 'data', 'area_checklist_seed.json');
  if (!fs.existsSync(seedPath)) throw Object.assign(new Error('Area checklist seed file was not found'), { statusCode: 404 });
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const incoming = Array.isArray(seed.taskTemplates) ? seed.taskTemplates.map(normalizeTaskTemplate) : [];
  const templates = await readTaskTemplates();
  const byId = new Map(templates.map(task => [task.id, task]));
  incoming.forEach(task => byId.set(task.id, { ...(byId.get(task.id) || {}), ...task }));
  const merged = [...byId.values()];
  await writeMaintenanceKey('taskTemplates', merged);
  return merged;
}

async function saveTaskTemplateSchedule(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit checklist schedules'), { statusCode: 403 });
  const section = String(payload.section || '').trim();
  if (!section) throw Object.assign(new Error('Checklist is required'), { statusCode: 400 });
  const days = Array.isArray(payload.days) && payload.days.length ? payload.days : ['daily'];
  const locationId = String(payload.locationId || 'default');
  const templates = await readTaskTemplates();
  const updated = templates.map(task => {
    if (task.section !== section) return task;
    if (locationId === 'default') {
      return { ...task, scheduleDays: days };
    }
    return {
      ...task,
      locationSchedules: {
        ...(task.locationSchedules || {}),
        [locationId]: days
      }
    };
  });
  await writeMaintenanceKey('taskTemplates', updated);
  return updated;
}

async function deleteTaskTemplate(id, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit checklists'), { statusCode: 403 });
  const templates = (await readTaskTemplates()).filter(task => task.id !== id);
  await writeMaintenanceKey('taskTemplates', templates);
  return templates;
}

async function deleteChecklistSection(section, actor, locationId = 'all') {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit checklists'), { statusCode: 403 });
  const sectionName = String(section || '').trim();
  if (!sectionName) throw Object.assign(new Error('Checklist name is required'), { statusCode: 400 });
  const targetLocation = locationId || 'all';
  const templates = (await readTaskTemplates()).filter(task => !(task.section === sectionName && templateLocationId(task) === targetLocation));
  await writeMaintenanceKey('taskTemplates', templates);
  return templates;
}

async function readNotices(actor = null) {
  const notices = await readMaintenanceKey('notices', []);
  const actorId = actor?.id || '';
  const actorRole = actor?.role || '';
  return notices
    .filter(notice => notice.active !== false)
    .filter(notice => !Array.isArray(notice.targetRoles) || !notice.targetRoles.length || notice.targetRoles.includes(actorRole))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(notice => ({
      ...notice,
      unread: actorId ? !(notice.readBy || []).includes(actorId) : false
    }));
}

async function saveNotice(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can post notices'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const message = String(payload.message || '').trim();
  if (!title || !message) throw Object.assign(new Error('Notice title and message are required'), { statusCode: 400 });
  const notices = await readMaintenanceKey('notices', []);
  const attachmentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, kind: 'notice-attachment', name: payload.attachment.name || title })
    : payload.attachmentUrl || '';
  notices.push({
    id: `notice-${Date.now()}`,
    title,
    message,
    attachmentUrl,
    attachmentName: payload.attachment?.name || payload.attachmentName || '',
    targetRoles: Array.isArray(payload.targetRoles) && payload.targetRoles.length ? payload.targetRoles : [],
    createdBy: actor?.name || payload.createdBy || 'Manager',
    createdAt: new Date().toISOString(),
    readBy: [],
    active: true
  });
  await writeMaintenanceKey('notices', notices);
  return readNotices(actor);
}

async function markNoticeRead(id, actor) {
  if (AUTH_REQUIRED && !actor?.id) throw Object.assign(new Error('Not signed in'), { statusCode: 401 });
  const notices = await readMaintenanceKey('notices', []);
  const notice = notices.find(entry => entry.id === id);
  if (notice && actor?.id) {
    notice.readBy = [...new Set([...(notice.readBy || []), actor.id])];
    await writeMaintenanceKey('notices', notices);
  }
  return readNotices(actor);
}

async function readAlertSettings() {
  const settings = await readMaintenanceKey('alertSettings', { rules: [], logs: [] });
  return {
    rules: Array.isArray(settings.rules) ? settings.rules : [],
    logs: Array.isArray(settings.logs) ? settings.logs : []
  };
}

async function saveAlertSettings(settings) {
  await writeMaintenanceKey('alertSettings', settings);
  return settings;
}

async function saveAlertRule(payload = {}, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director of Operations and Owner can manage alerts'), { statusCode: 403 });
  const name = String(payload.name || '').trim();
  if (!name) throw Object.assign(new Error('Alert rule name is required'), { statusCode: 400 });
  const settings = await readAlertSettings();
  const id = payload.id || `ALERT-${Date.now()}`;
  const rule = {
    id,
    name,
    type: payload.type === 'temperature' ? 'temperature' : 'task',
    target: payload.target || '',
    targetLabel: payload.targetLabel || payload.target || '',
    dueTime: payload.dueTime || '17:00',
    locationId: payload.locationId || 'all',
    roles: Array.isArray(payload.roles) && payload.roles.length ? payload.roles : ['Manager', 'Area Manager', 'Director of Operations'],
    channels: Array.isArray(payload.channels) && payload.channels.length ? payload.channels : ['email'],
    active: payload.active !== false,
    updatedAt: new Date().toISOString()
  };
  const existing = settings.rules.findIndex(entry => entry.id === id);
  if (existing >= 0) settings.rules[existing] = { ...settings.rules[existing], ...rule };
  else settings.rules.unshift({ ...rule, createdAt: new Date().toISOString(), createdBy: actor?.name || 'Owner' });
  return saveAlertSettings(settings);
}

async function deleteAlertRule(id, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director of Operations and Owner can manage alerts'), { statusCode: 403 });
  const settings = await readAlertSettings();
  settings.rules = settings.rules.map(rule => rule.id === id ? { ...rule, active: false, updatedAt: new Date().toISOString() } : rule);
  return saveAlertSettings(settings);
}

function timeHasPassed(dueTime = '23:59', now = new Date()) {
  const [hour, minute] = String(dueTime).split(':').map(Number);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ALERT_TIME_ZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const dueMinutes = (Number.isFinite(hour) ? hour : 23) * 60 + (Number.isFinite(minute) ? minute : 59);
  return currentMinutes >= dueMinutes;
}

function tempRequirementForTarget(target = '') {
  const [listName, session = 'Day'] = String(target).split('|');
  const list = TEMPERATURE_ITEMS[listName];
  if (!list?.areas) return [];
  return Object.entries(list.areas).flatMap(([area, items]) => items.map(item => ({ listName, session, area, item })));
}

function taskListIncomplete(dayPayload = {}, section = '') {
  const tasks = (dayPayload.tasks || []).filter(task => task.section === section);
  if (!tasks.length) return { incomplete: false, detail: 'No tasks scheduled' };
  const remaining = tasks.filter(task => !task.done).length;
  return { incomplete: remaining > 0, detail: `${remaining} of ${tasks.length} tasks remaining` };
}

function tempListIncomplete(dayPayload = {}, target = '') {
  const required = tempRequirementForTarget(target);
  if (!required.length) return { incomplete: false, detail: 'No temperatures scheduled' };
  const logged = new Set((dayPayload.temps || []).map(temp => `${readingList(temp)}|${readingSession(temp)}|${temp.area}|${temp.item}`));
  const missing = required.filter(req => !logged.has(`${req.listName}|${req.session}|${req.area}|${req.item}`)).length;
  return { incomplete: missing > 0, detail: `${missing} of ${required.length} readings missing` };
}

function alertRecipients(users = [], rule = {}, locationId = DEFAULT_LOCATION_ID) {
  const roles = rule.roles || [];
  return users.filter(user => {
    if (!roles.includes(user.role)) return false;
    if (FULL_ACCESS_ROLES.includes(user.role)) return true;
    return (user.locationIds || [user.locationId]).includes(locationId);
  });
}

async function sendAlertMessages(alert, recipients, dryRun = true) {
  const sent = [];
  const text = `${alert.locationName}: ${alert.ruleName} is overdue. ${alert.detail}`;
  for (const recipient of recipients) {
    if ((alert.channels || []).includes('email') && recipient.email) {
      let delivered = dryRun;
      if (!dryRun && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM, to: recipient.email, subject: 'HIS OPS overdue alert', text })
        });
        delivered = true;
      }
      sent.push({ userId: recipient.id, channel: 'email', to: recipient.email, dryRun, delivered });
    }
    if ((alert.channels || []).includes('sms') && recipient.phone) {
      let delivered = dryRun;
      const twilioReady = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER;
      if (!dryRun && twilioReady) {
        const body = new URLSearchParams({ To: recipient.phone, From: process.env.TWILIO_FROM_NUMBER, Body: text });
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        delivered = true;
      }
      sent.push({ userId: recipient.id, channel: 'sms', to: recipient.phone, dryRun, delivered });
    }
  }
  return sent;
}

async function sendAssignmentEmail(task = {}, kind = 'task') {
  if (task.assignmentType !== 'internal' || task.assignmentNotify !== 'immediate' || !task.assigneeEmail) return { skipped: true };
  if (task.assignmentEmail?.assigneeId === task.assigneeId && task.assignmentEmail?.delivered) return task.assignmentEmail;
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_FROM) return { skipped: true, reason: 'Email provider is not configured' };
  const location = task.locationName || task['Location Name'] || '';
  const title = task.title || task.description || task.Task || task['Issue Description'] || kind;
  const due = task.targetDate || task['Target Date'] || task['Next Due'] || '';
  const text = [
    `You have been assigned a HIS OPS ${kind}.`,
    location ? `Location: ${location}` : '',
    `Task: ${title}`,
    due ? `Due/target date: ${due}` : '',
    '',
    'Please sign in to HIS OPS to review the details.'
  ].filter(Boolean).join('\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM,
      to: task.assigneeEmail,
      subject: `HIS OPS assignment: ${title}`,
      text
    })
  });
  return { delivered: response.ok, status: response.status, assigneeId: task.assigneeId, sentAt: new Date().toISOString() };
}

async function sendWeeklyAssignmentDigest(query = {}) {
  if (query.secret !== process.env.ALERT_CRON_SECRET) throw Object.assign(new Error('Invalid digest secret'), { statusCode: 403 });
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_FROM) return { sent: [], skipped: 'Email provider is not configured' };
  const [workOrders, pmSchedule, fpcRecords] = await Promise.all([
    readMaintenanceKey('workOrders', []),
    readMaintenanceKey('pmSchedule', []),
    readFpcRecords()
  ]);
  const assigned = [];
  workOrders
    .filter(order => order.assignmentType === 'internal' && order.assignmentNotify === 'weekly' && order.assigneeEmail && !['Completed', 'Cancelled', 'Canceled'].includes(order.Status))
    .forEach(order => assigned.push({ email: order.assigneeEmail, name: order.assigneeName || order['Assigned To'] || '', label: `Work order ${order['Work Order ID']}: ${order['Issue Description'] || order.Category || 'Work order'} (${order['Location Name'] || ''})` }));
  pmSchedule
    .filter(pm => pm.assignmentType === 'internal' && pm.assignmentNotify === 'weekly' && pm.assigneeEmail && pm.Status !== 'Completed')
    .forEach(pm => assigned.push({ email: pm.assigneeEmail, name: pm.assigneeName || pm['Assigned To'] || '', label: `PM ${pm['PM ID']}: ${pm.Task || 'PM task'} (${pm['Location Name'] || ''})` }));
  fpcRecords.forEach(record => (record.items || [])
    .filter(item => item.assignmentType === 'internal' && item.assignmentNotify === 'weekly' && item.assigneeEmail && item.status !== 'Completed')
    .forEach(item => assigned.push({ email: item.assigneeEmail, name: item.assigneeName || item.assignedTo || '', label: `FPC: ${item.description || 'Repair item'} (${record.locationName || ''})` })));
  const grouped = assigned.reduce((map, item) => {
    map[item.email] ??= { email: item.email, name: item.name, labels: [] };
    map[item.email].labels.push(item.label);
    return map;
  }, {});
  const sent = [];
  for (const group of Object.values(grouped)) {
    const text = [`${group.name || 'Hello'},`, '', 'Here are your current HIS OPS assigned items:', '', ...group.labels.map(label => `- ${label}`), '', 'Please sign in to HIS OPS to review details.'].join('\n');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM, to: group.email, subject: 'HIS OPS weekly assignment digest', text })
    });
    sent.push({ to: group.email, count: group.labels.length, delivered: response.ok, status: response.status });
  }
  return { sent };
}

async function checkAlerts(query = {}, actor = null) {
  if (AUTH_REQUIRED && actor && !isFullAccess(actor)) throw Object.assign(new Error('Only Director of Operations and Owner can preview alerts'), { statusCode: 403 });
  const dryRun = query.dryRun !== 'false';
  const date = query.date || localDate();
  const now = query.now ? new Date(query.now) : new Date();
  const [settings, locations, users] = await Promise.all([readAlertSettings(), readLocations(), readUsers()]);
  const activeRules = settings.rules.filter(rule => rule.active !== false && timeHasPassed(rule.dueTime, now));
  const alerts = [];
  for (const rule of activeRules) {
    const scopedLocations = locations.filter(location => rule.locationId === 'all' || rule.locationId === location.id);
    for (const location of scopedLocations) {
      const dayPayload = await readDay(location.id, date);
      const status = rule.type === 'temperature' ? tempListIncomplete(dayPayload, rule.target) : taskListIncomplete(dayPayload, rule.target);
      if (!status.incomplete) continue;
      const alreadySent = !dryRun && (settings.logs || []).some(log =>
        log.ruleId === rule.id &&
        log.locationId === location.id &&
        log.target === rule.target &&
        String(log.date || '').slice(0, 10) === date
      );
      if (alreadySent) continue;
      const recipients = alertRecipients(users, rule, location.id);
      const alert = {
        date,
        ruleId: rule.id,
        ruleName: rule.name,
        type: rule.type,
        target: rule.target,
        targetLabel: rule.targetLabel || rule.target,
        locationId: location.id,
        locationName: location.name,
        detail: status.detail,
        channels: rule.channels || ['email'],
        recipients: recipients.map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role }))
      };
      alert.sent = await sendAlertMessages(alert, recipients, dryRun);
      alerts.push(alert);
    }
  }
  const deliveredAlerts = alerts.filter(alert => (alert.sent || []).some(entry => entry.delivered));
  if (!dryRun && deliveredAlerts.length) {
    const latest = await readAlertSettings();
    latest.logs = [...(latest.logs || []), ...deliveredAlerts.map(alert => ({ ...alert, checkedAt: new Date().toISOString(), dryRun }))].slice(-500);
    await saveAlertSettings(latest);
  }
  return { dryRun, date, alerts };
}

async function readFpcRecords() {
  const records = await readMaintenanceKey('fpcRecords', []);
  return Array.isArray(records) ? records : [];
}

function nextFpcId(records) {
  const highest = records.reduce((max, record) => {
    const match = String(record.id || '').match(/FPC-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FPC-${String(highest + 1).padStart(4, '0')}`;
}

async function fpcState() {
  return { records: await readFpcRecords() };
}

async function saveFpcInspection(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can update FPC records'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  const records = await readFpcRecords();
  const attachmentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, kind: 'fpc-inspection', name: payload.attachment.name || `${locationId}-fpc` })
    : payload.inspectionUrl || '';
  const record = {
    id: nextFpcId(records),
    locationId,
    locationName: payload.locationName || '',
    inspectionDate: payload.inspectionDate || today(),
    inspectionUrl: attachmentUrl,
    inspectionName: payload.attachment?.name || payload.inspectionName || 'FPC inspection',
    createdBy: actor?.name || payload.createdBy || 'Manager',
    createdAt: new Date().toISOString(),
    items: [],
    active: true
  };
  records.unshift(record);
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState();
}

async function saveFpcItem(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  let record = records.find(entry => entry.id === payload.recordId);
  if (!record) {
    record = {
      id: nextFpcId(records),
      locationId: payload.locationId || DEFAULT_LOCATION_ID,
      locationName: payload.locationName || '',
      inspectionDate: payload.inspectionDate || today(),
      createdBy: actor?.name || payload.createdBy || 'Manager',
      createdAt: new Date().toISOString(),
      items: [],
      active: true
    };
    records.unshift(record);
  }
  const description = String(payload.description || '').trim();
  if (!description) throw Object.assign(new Error('FPC item description is required'), { statusCode: 400 });
  const item = {
    id: payload.itemId || `FPCITEM-${Date.now()}`,
    description,
    priority: payload.priority || 'Medium',
    status: payload.status || 'Open',
    assignedTo: payload.assignedTo || '',
    assignmentType: payload.assignmentType || '',
    assigneeId: payload.assigneeId || '',
    assigneeName: payload.assigneeName || '',
    assigneeEmail: payload.assigneeEmail || '',
    vendorId: payload.vendorId || '',
    vendorName: payload.vendorName || '',
    assignmentNotify: payload.assignmentNotify || 'none',
    targetDate: payload.targetDate || '',
    photoUrl: payload.photoUrl || '',
    photoName: payload.photoName || '',
    comments: payload.comments || [],
    createdBy: actor?.name || payload.createdBy || 'Manager',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const existing = record.items.findIndex(entry => entry.id === item.id);
  if (existing >= 0) record.items[existing] = { ...record.items[existing], ...item, comments: record.items[existing].comments || [] };
  else record.items.unshift(item);
  item.assignmentEmail = await sendAssignmentEmail({ ...item, locationName: record.locationName || payload.locationName }, 'FPC repair item');
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState();
}

async function updateFpcItem(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  const record = records.find(entry => entry.id === payload.recordId);
  const item = record?.items?.find(entry => entry.id === payload.itemId);
  if (!item) throw Object.assign(new Error('FPC item not found'), { statusCode: 404 });
  ['description', 'priority', 'status', 'assignedTo', 'assignmentType', 'assigneeId', 'assigneeName', 'assigneeEmail', 'vendorId', 'vendorName', 'assignmentNotify', 'targetDate', 'photoUrl', 'photoName'].forEach(key => {
    if (payload[key] !== undefined) item[key] = payload[key];
  });
  item.assignmentEmail = await sendAssignmentEmail({ ...item, locationName: record.locationName }, 'FPC repair item');
  item.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState();
}

async function addFpcComment(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can comment on FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  const record = records.find(entry => entry.id === payload.recordId);
  const item = record?.items?.find(entry => entry.id === payload.itemId);
  if (!item) throw Object.assign(new Error('FPC item not found'), { statusCode: 404 });
  const text = String(payload.comment || '').trim();
  if (!text) throw Object.assign(new Error('Comment is required'), { statusCode: 400 });
  item.comments = item.comments || [];
  item.comments.push({
    id: `FPCCOMMENT-${Date.now()}`,
    text,
    createdBy: actor?.name || payload.createdBy || 'Manager',
    createdAt: new Date().toISOString()
  });
  item.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState();
}

async function readStoreDocuments() {
  const docs = await readMaintenanceKey('storeDocuments', []);
  return Array.isArray(docs) ? docs : [];
}

async function storeDocumentsState() {
  return { documents: await readStoreDocuments() };
}

async function saveStoreDocument(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can add store documents'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  if (!title) throw Object.assign(new Error('Document title is required'), { statusCode: 400 });
  if (!payload.attachment?.dataUrl && !payload.url) throw Object.assign(new Error('Choose a document to upload'), { statusCode: 400 });
  const documents = await readStoreDocuments();
  const documentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, kind: 'store-document', name: payload.attachment.name || title })
    : payload.url;
  documents.unshift({
    id: `DOC-${Date.now()}`,
    locationId: payload.locationId || DEFAULT_LOCATION_ID,
    locationName: payload.locationName || '',
    title,
    category: payload.category || 'General',
    notes: payload.notes || '',
    url: documentUrl,
    fileName: payload.attachment?.name || payload.fileName || title,
    createdBy: actor?.name || payload.createdBy || 'Area Manager',
    createdAt: new Date().toISOString(),
    active: true
  });
  await writeMaintenanceKey('storeDocuments', documents);
  return storeDocumentsState();
}

async function readResources() {
  const resources = await readMaintenanceKey('resources', []);
  return Array.isArray(resources) ? resources : [];
}

async function resourcesState() {
  return { resources: await readResources() };
}

async function saveResource(payload, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director of Operations and Owner can manage resources'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const url = String(payload.url || '').trim();
  if (!title) throw Object.assign(new Error('Resource title is required'), { statusCode: 400 });
  if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('Resource link must start with http:// or https://'), { statusCode: 400 });
  const resources = await readResources();
  const id = payload.id || `RESOURCE-${Date.now()}`;
  let resource = resources.find(entry => entry.id === id);
  if (!resource) {
    resource = {
      id,
      createdAt: new Date().toISOString(),
      createdBy: actor?.name || payload.createdBy || 'Manager',
      createdById: actor?.id || ''
    };
    resources.unshift(resource);
  }
  Object.assign(resource, {
    title,
    url,
    category: payload.category || 'General',
    minRole: payload.minRole || 'Employee',
    locationId: payload.locationId || 'all',
    locationName: payload.locationName || '',
    notes: payload.notes || '',
    updatedAt: new Date().toISOString(),
    active: true
  });
  await writeMaintenanceKey('resources', resources);
  return resourcesState();
}

async function deleteResource(id, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director of Operations and Owner can remove resources'), { statusCode: 403 });
  const resources = await readResources();
  const resource = resources.find(entry => entry.id === id);
  if (!resource) throw Object.assign(new Error('Resource link not found'), { statusCode: 404 });
  resource.active = false;
  resource.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('resources', resources);
  return resourcesState();
}

async function readSmallwaresRequests() {
  const requests = await readMaintenanceKey('smallwaresRequests', []);
  return Array.isArray(requests) ? requests : [];
}

async function smallwaresState() {
  return { requests: await readSmallwaresRequests() };
}

function canAccessLocation(actor, locationId) {
  if (!AUTH_REQUIRED) return true;
  if (isFullAccess(actor)) return true;
  if (locationId === 'all') return canAreaManage(actor);
  return userLocationIds(actor).includes(locationId);
}

async function readCalendarEvents(actor = null) {
  const storedEvents = await readMaintenanceKey('calendarEvents', []);
  const events = Array.isArray(storedEvents) ? storedEvents : [];
  const list = Array.isArray(events) ? events : [];
  if (!AUTH_REQUIRED || !actor) return list.filter(event => event.active !== false);
  const allowed = userLocationIds(actor);
  return list.filter(event => event.active !== false && (event.locationId === 'all' || isFullAccess(actor) || allowed.includes(event.locationId)));
}

async function calendarState(actor = null) {
  return { events: await readCalendarEvents(actor) };
}

async function saveCalendarEvent(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can manage calendar events'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const date = String(payload.date || '').trim();
  const locationId = payload.locationId || 'all';
  if (!title) throw Object.assign(new Error('Calendar event title is required'), { statusCode: 400 });
  if (!date) throw Object.assign(new Error('Calendar event date is required'), { statusCode: 400 });
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only schedule events for your assigned locations'), { statusCode: 403 });
  const storedEvents = await readMaintenanceKey('calendarEvents', []);
  const events = Array.isArray(storedEvents) ? storedEvents : [];
  const id = payload.id || `EVENT-${Date.now()}`;
  let event = events.find(entry => entry.id === id);
  if (!event) {
    event = {
      id,
      createdAt: new Date().toISOString(),
      createdBy: actor?.name || payload.createdBy || 'Area Manager',
      createdById: actor?.id || ''
    };
    events.unshift(event);
  }
  Object.assign(event, {
    title,
    type: payload.type || 'Other',
    date,
    time: payload.time || '',
    locationId,
    locationName: payload.locationName || '',
    notes: payload.notes || '',
    active: true,
    updatedAt: new Date().toISOString()
  });
  await writeMaintenanceKey('calendarEvents', events);
  return calendarState(actor);
}

async function deleteCalendarEvent(id, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can remove calendar events'), { statusCode: 403 });
  const events = await readMaintenanceKey('calendarEvents', []);
  const event = events.find(entry => entry.id === id);
  if (!event) throw Object.assign(new Error('Calendar event not found'), { statusCode: 404 });
  if (!canAccessLocation(actor, event.locationId || 'all')) throw Object.assign(new Error('You can only remove events for your assigned locations'), { statusCode: 403 });
  event.active = false;
  event.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('calendarEvents', events);
  return calendarState(actor);
}

async function saveSmallwaresRequest(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can request smallwares'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only request items for your assigned locations'), { statusCode: 403 });
  const item = String(payload.item || '').trim();
  if (!item) throw Object.assign(new Error('Item is required'), { statusCode: 400 });
  const requests = await readSmallwaresRequests();
  requests.unshift({
    id: payload.id || `SMALLWARE-${Date.now()}`,
    locationId,
    locationName: payload.locationName || '',
    item,
    quantity: Number(payload.quantity) || 1,
    notes: payload.notes || '',
    status: payload.status || 'Requested',
    requestedBy: actor?.name || payload.requestedBy || 'Manager',
    requestedById: actor?.id || payload.requestedById || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true
  });
  await writeMaintenanceKey('smallwaresRequests', requests);
  return smallwaresState();
}

async function updateSmallwaresRequest(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers or above can approve smallwares requests'), { statusCode: 403 });
  const requests = await readSmallwaresRequests();
  const request = requests.find(entry => entry.id === payload.id);
  if (!request) throw Object.assign(new Error('Smallwares request not found'), { statusCode: 404 });
  if (!canAccessLocation(actor, request.locationId)) throw Object.assign(new Error('You can only approve requests for your assigned locations'), { statusCode: 403 });
  request.status = payload.status || request.status;
  request.updatedAt = new Date().toISOString();
  if (request.status === 'Approved') {
    request.approvedBy = actor?.name || payload.approvedBy || 'Area Manager';
    request.approvedById = actor?.id || payload.approvedById || '';
    request.approvedAt = new Date().toISOString();
  }
  if (request.status === 'Declined') {
    request.declinedBy = actor?.name || payload.declinedBy || 'Area Manager';
    request.declinedAt = new Date().toISOString();
  }
  await writeMaintenanceKey('smallwaresRequests', requests);
  return smallwaresState();
}

async function maintenanceLists() {
  const rows = await readMaintenanceKey('lists', []);
  const keys = {
    priorities: 'Priority',
    statuses: 'Status',
    categories: 'Category',
    equipmentTypes: 'Equipment Type',
    pmFrequencies: 'PM Frequency'
  };
  const result = {};
  for (const [outputKey, sourceKey] of Object.entries(keys)) {
    result[outputKey] = [...new Set(rows.map(row => row[sourceKey]).filter(Boolean))];
  }
  return result;
}

async function maintenanceState(locationId = 'all') {
  let [workOrders, equipment, pmSchedule, vendors, locations, lists, priorityOrder] = await Promise.all([
    readMaintenanceKey('workOrders', []),
    readMaintenanceKey('equipment', []),
    readMaintenanceKey('pmSchedule', []),
    readMaintenanceKey('vendors', []),
    readMaintenanceKey('locations', []),
    maintenanceLists(),
    readMaintenanceKey('maintenancePriorityOrder', [])
  ]);
  if (locationId && locationId !== 'all') {
    workOrders = workOrders.filter(row => String(row['Location ID']) === String(locationId));
    equipment = equipment.filter(row => String(row['Location ID']) === String(locationId));
    pmSchedule = pmSchedule.filter(row => String(row['Location ID']) === String(locationId));
  }
  return { locations, equipment, workOrders, pmSchedule, vendors, lists, priorityOrder: Array.isArray(priorityOrder) ? priorityOrder : [] };
}

async function saveMaintenancePriorityOrder(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can reorder maintenance priorities'), { statusCode: 403 });
  const order = Array.isArray(payload.order) ? payload.order.map(String) : [];
  await writeMaintenanceKey('maintenancePriorityOrder', order);
  return { priorityOrder: order };
}

function nextPrefixedId(rows, key, prefix) {
  const highest = rows.reduce((max, row) => {
    const value = String(row[key] || '');
    if (!value.startsWith(`${prefix}-`)) return max;
    const number = Number(value.split('-')[1]);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`;
}

async function writeWorkOrder(payload) {
  const workOrders = await readMaintenanceKey('workOrders', []);
  const equipment = await readMaintenanceKey('equipment', []);
  const selectedEquipment = equipment.find(row => row['Equipment ID'] === payload.equipmentId) || {};
  const item = {
    'Work Order ID': nextPrefixedId(workOrders, 'Work Order ID', 'WO'),
    'Date Submitted': today(),
    'Location ID': payload.locationId,
    'Location Name': payload.locationName || selectedEquipment['Location Name'],
    'Requested By': payload.requestedBy || 'App User',
    Category: payload.category,
    'Equipment ID': payload.equipmentId,
    'Equipment Name': payload.equipmentName || selectedEquipment['Equipment Name'],
    Priority: payload.priority || 'Medium',
    Status: payload.status || 'New',
    'Assigned To': payload.assignedTo,
    assignmentType: payload.assignmentType || '',
    assigneeId: payload.assigneeId || '',
    assigneeName: payload.assigneeName || '',
    assigneeEmail: payload.assigneeEmail || '',
    'Vendor ID': payload.vendorId,
    vendorId: payload.vendorId || '',
    vendorName: payload.vendorName || '',
    assignmentNotify: payload.assignmentNotify || 'none',
    'Issue Description': payload.issueDescription,
    'Photo Link': payload.photoLink,
    'Manual Link': payload.manualLink,
    'Target Date': payload.targetDate,
    'Date Completed': null,
    'Days Open': 0,
    'Labor Hours': null,
    'Parts Cost': null,
    'Vendor Cost': null,
    'Total Cost': 0,
    'Resolution Notes': null,
    'Invoice Link': null,
    'Last Updated': today()
  };
  workOrders.push(item);
  item.assignmentEmail = await sendAssignmentEmail({ ...item, title: item['Issue Description'], locationName: item['Location Name'] }, 'work order');
  await writeMaintenanceKey('workOrders', workOrders);
  return item;
}

async function updateWorkOrder(payload) {
  const workOrders = await readMaintenanceKey('workOrders', []);
  const row = workOrders.find(entry => entry['Work Order ID'] === payload.workOrderId);
  if (!row) throw Object.assign(new Error('Work order not found'), { statusCode: 404 });
  const mapping = {
    status: 'Status',
    assignedTo: 'Assigned To',
    assignmentType: 'assignmentType',
    assigneeId: 'assigneeId',
    assigneeName: 'assigneeName',
    assigneeEmail: 'assigneeEmail',
    vendorId: 'Vendor ID',
    vendorName: 'vendorName',
    assignmentNotify: 'assignmentNotify',
    targetDate: 'Target Date',
    dateCompleted: 'Date Completed',
    laborHours: 'Labor Hours',
    partsCost: 'Parts Cost',
    vendorCost: 'Vendor Cost',
    resolutionNotes: 'Resolution Notes',
    invoiceLink: 'Invoice Link',
    photoLink: 'Photo Link',
    manualLink: 'Manual Link',
    issueDescription: 'Issue Description',
    priority: 'Priority'
  };
  for (const [source, destination] of Object.entries(mapping)) {
    if (payload[source] !== undefined && payload[source] !== null && payload[source] !== '') row[destination] = payload[source];
  }
  if (payload.vendorId !== undefined) row.vendorId = payload.vendorId;
  row['Total Cost'] = Number(row['Parts Cost'] || 0) + Number(row['Vendor Cost'] || 0);
  row['Last Updated'] = today();
  row.assignmentEmail = await sendAssignmentEmail({ ...row, title: row['Issue Description'], locationName: row['Location Name'] }, 'work order');
  await writeMaintenanceKey('workOrders', workOrders);
  return row;
}

async function writeEquipment(payload) {
  const equipment = await readMaintenanceKey('equipment', []);
  const item = {
    'Equipment ID': nextPrefixedId(equipment, 'Equipment ID', 'EQ'),
    'Location ID': payload.locationId,
    'Location Name': payload.locationName,
    'Equipment Name': payload.equipmentName,
    'Equipment Type': payload.equipmentType,
    Manufacturer: payload.manufacturer,
    Model: payload.model,
    'Serial Number': payload.serialNumber,
    'Manual Link': payload.manualLink,
    Active: 'Yes',
    Notes: payload.notes
  };
  equipment.push(item);
  await writeMaintenanceKey('equipment', equipment);
  return item;
}

async function updateEquipment(payload) {
  const equipment = await readMaintenanceKey('equipment', []);
  const row = equipment.find(entry => entry['Equipment ID'] === payload.equipmentId);
  if (!row) throw Object.assign(new Error('Equipment not found'), { statusCode: 404 });
  const mapping = {
    equipmentName: 'Equipment Name',
    equipmentType: 'Equipment Type',
    manufacturer: 'Manufacturer',
    model: 'Model',
    serialNumber: 'Serial Number',
    manualLink: 'Manual Link',
    notes: 'Notes',
    active: 'Active'
  };
  for (const [source, destination] of Object.entries(mapping)) {
    if (payload[source] !== undefined && payload[source] !== null && payload[source] !== '') row[destination] = payload[source];
  }
  await writeMaintenanceKey('equipment', equipment);
  return row;
}

async function writePmTask(payload) {
  const pmSchedule = await readMaintenanceKey('pmSchedule', []);
  const item = {
    'PM ID': nextPrefixedId(pmSchedule, 'PM ID', 'PM'),
    'Location ID': payload.locationId,
    'Location Name': payload.locationName,
    'Equipment ID': payload.equipmentId,
    'Equipment Name': payload.equipmentName,
    Task: payload.task,
    Frequency: payload.frequency,
    'Next Due': payload.nextDue,
    'Assigned To': payload.assignedTo,
    assignmentType: payload.assignmentType || '',
    assigneeId: payload.assigneeId || '',
    assigneeName: payload.assigneeName || '',
    assigneeEmail: payload.assigneeEmail || '',
    vendorId: payload.vendorId || '',
    vendorName: payload.vendorName || '',
    assignmentNotify: payload.assignmentNotify || 'none',
    Status: payload.status || 'Due',
    'Instructions / Checklist': payload.instructions,
    'Manual Link': payload.manualLink,
    'Photo Link': payload.photoLink,
    'Auto Create Work Order?': payload.autoCreateWorkOrder || 'Yes',
    Notes: payload.notes
  };
  pmSchedule.push(item);
  item.assignmentEmail = await sendAssignmentEmail({ ...item, title: item.Task, locationName: item['Location Name'] }, 'PM task');
  await writeMaintenanceKey('pmSchedule', pmSchedule);
  return item;
}

async function updatePmTask(payload) {
  const pmSchedule = await readMaintenanceKey('pmSchedule', []);
  const row = pmSchedule.find(entry => entry['PM ID'] === payload.pmId);
  if (!row) throw Object.assign(new Error('PM task not found'), { statusCode: 404 });
  const mapping = {
    task: 'Task',
    frequency: 'Frequency',
    nextDue: 'Next Due',
    assignedTo: 'Assigned To',
    assignmentType: 'assignmentType',
    assigneeId: 'assigneeId',
    assigneeName: 'assigneeName',
    assigneeEmail: 'assigneeEmail',
    vendorId: 'vendorId',
    vendorName: 'vendorName',
    assignmentNotify: 'assignmentNotify',
    status: 'Status',
    instructions: 'Instructions / Checklist',
    manualLink: 'Manual Link',
    photoLink: 'Photo Link',
    notes: 'Notes'
  };
  for (const [source, destination] of Object.entries(mapping)) {
    if (payload[source] !== undefined && payload[source] !== null) row[destination] = payload[source];
  }
  if (payload.status === 'Completed') {
    row['Date Completed'] = payload.completedDate || today();
    if (!payload.nextDue) row['Next Due'] = '';
  }
  row.assignmentEmail = await sendAssignmentEmail({ ...row, title: row.Task, locationName: row['Location Name'] }, 'PM task');
  await writeMaintenanceKey('pmSchedule', pmSchedule);
  return row;
}

async function saveVendor(payload) {
  const vendors = await readMaintenanceKey('vendors', []);
  const id = payload.vendorId || nextPrefixedId(vendors, 'Vendor ID', 'VEN');
  let row = vendors.find(entry => entry['Vendor ID'] === id);
  if (!row) {
    row = { 'Vendor ID': id };
    vendors.push(row);
  }
  Object.assign(row, {
    'Vendor Name': payload.vendorName,
    Category: payload.category,
    'Service Area': payload.serviceArea,
    'Contact Name': payload.contactName,
    Phone: payload.phone,
    Email: payload.email,
    Preferred: payload.preferred || 'Yes',
    Notes: payload.notes
  });
  await writeMaintenanceKey('vendors', vendors);
  return row;
}

async function importMaintenanceWorkbook(payload) {
  const allowed = ['locations', 'equipment', 'pmSchedule', 'vendors', 'lists'];
  const updated = [];
  for (const key of allowed) {
    if (Array.isArray(payload[key])) {
      await writeMaintenanceKey(key, payload[key]);
      updated.push(key);
    }
  }
  return { updated, state: await maintenanceState('all') };
}

async function saveAttachment(payload) {
  if (payload.dataUrl && payload.dataUrl.length > 5_500_000) {
    throw Object.assign(new Error('This file is too large for the current uploader. Please use a file under 4 MB or compress the PDF.'), { statusCode: 413 });
  }
  const [header, encoded] = payload.dataUrl.split(',');
  const mimeType = header.split(';')[0].replace('data:', '') || 'application/octet-stream';
  const extension = mimeType.split('/')[1] || 'bin';
  const filename = `${safeName(payload.kind || 'file')}/${Date.now()}-${safeName(payload.name || 'attachment')}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: Buffer.from(encoded, 'base64')
  });
  if (!response.ok) throw new Error(await response.text());
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filename}`;
}

exports.handler = async event => {
  try {
    const apiPath = event.path.replace(/^\/api/, '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
    const method = event.httpMethod;
    const query = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === 'GET' && apiPath === '/public-config') {
      return json(200, {
        supabaseUrl: SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
        storageBucket: STORAGE_BUCKET,
        tenant: await readTenantConfig(),
        authEnabled: Boolean(SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
      });
    }

    if ((method === 'POST' && apiPath === '/session-profile') || (method === 'POST' && apiPath === '/accept-invite')) {
      return json(200, { profile: await sessionProfile(event), users: await readUsers() });
    }

    if (method === 'GET' && apiPath === '/alerts/check' && query.secret && query.secret === process.env.ALERT_CRON_SECRET) {
      return json(200, await checkAlerts(query, null));
    }
    if (method === 'GET' && apiPath === '/assignments/digest' && query.secret && query.secret === process.env.ALERT_CRON_SECRET) {
      return json(200, await sendWeeklyAssignmentDigest(query));
    }

    const actor = AUTH_REQUIRED ? await currentProfile(event) : null;

    if (method === 'GET' && apiPath === '/state') {
      const date = query.date;
      const locationId = query.locationId || DEFAULT_LOCATION_ID;
      const historyScope = query.historyScope || 'location';
      const [day, history, overdue, taskTemplates, notices, alertSettings, calendarEvents, users, locations] = await Promise.all([
        readDay(locationId, date),
        readHistory(historyScope === 'all' ? null : locationId),
        readOverdue(date),
        readTaskTemplates().catch(() => DEFAULT_TASK_TEMPLATES),
        readNotices(actor).catch(() => []),
        readAlertSettings().catch(() => ({ rules: [], logs: [] })),
        calendarState(actor).catch(() => ({ events: [] })),
        readUsers(),
        readLocations()
      ]);
      return json(200, {
        day,
        history,
        overdue,
        temperatureItems: TEMPERATURE_ITEMS,
        taskTemplates,
        notices,
        alertSettings,
        calendarEvents,
        users,
        locations
      });
    }

    if (method === 'GET' && apiPath === '/users') return json(200, { users: await readUsers() });
    if (method === 'GET' && apiPath === '/locations') return json(200, { locations: await readLocations() });
    if (method === 'GET' && apiPath === '/overdue') return json(200, { overdue: await readOverdue(query.date) });
    if (method === 'GET' && apiPath === '/dashboard') return json(200, await dashboardSummary(actor, query.range || 'day', query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/maintenance/state') return json(200, await maintenanceState(query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/notices') return json(200, { notices: await readNotices(actor) });
    if (method === 'GET' && apiPath === '/calendar/state') return json(200, await calendarState(actor));
    if (method === 'GET' && apiPath === '/alerts/state') return json(200, await readAlertSettings());
    if (method === 'GET' && apiPath === '/alerts/check') return json(200, await checkAlerts(query, actor));
    if (method === 'GET' && apiPath === '/fpc/state') return json(200, await fpcState());
    if (method === 'GET' && apiPath === '/store-documents/state') return json(200, await storeDocumentsState());
    if (method === 'GET' && apiPath === '/resources/state') return json(200, await resourcesState());
    if (method === 'GET' && apiPath === '/smallwares/state') return json(200, await smallwaresState());

    if (method === 'POST' && apiPath === '/day') {
      await writeDay(body.locationId || DEFAULT_LOCATION_ID, body.date, body.day);
      return json(200, {
        history: await readHistory(body.locationId || DEFAULT_LOCATION_ID),
        overdue: await readOverdue(body.date)
      });
    }
    if (method === 'POST' && apiPath === '/task/snooze') {
      return json(200, await snoozeTask(body, actor));
    }

    if (method === 'POST' && apiPath === '/photo') return json(200, { url: await saveAttachment({ ...body, kind: body.taskId || 'checklist-photo', name: `${body.date}-${body.taskId}` }) });
    if (method === 'POST' && apiPath === '/user') {
      assertManageAccess(actor, body);
      return json(200, { users: await saveUser(body) });
    }
    if (method === 'POST' && apiPath === '/user/deactivate') {
      return json(200, { users: await deactivateUser(body.id, actor) });
    }
    if (method === 'POST' && apiPath === '/user/password') {
      return json(200, await setUserPassword(body.id || actor?.id, body.password, actor));
    }
    if (method === 'POST' && apiPath === '/invite') {
      assertManageAccess(actor, body);
      return json(200, { login: await createUserLogin({ ...body, invitedBy: body.invitedBy || actor?.name }), users: await readUsers() });
    }
    if (method === 'POST' && apiPath === '/location') {
      if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director or Owner can edit store names'), { statusCode: 403 });
      return json(200, { locations: await saveLocation(body) });
    }
    if (method === 'POST' && apiPath === '/task-template') {
      return json(200, { taskTemplates: await saveTaskTemplate(body, actor) });
    }
    if (method === 'POST' && apiPath === '/task-template/copy-section') {
      return json(200, { taskTemplates: await copyChecklistSection(body, actor) });
    }
    if (method === 'POST' && apiPath === '/task-template/schedule') {
      return json(200, { taskTemplates: await saveTaskTemplateSchedule(body, actor) });
    }
    if (method === 'POST' && apiPath === '/task-template/delete') {
      return json(200, { taskTemplates: await deleteTaskTemplate(body.id, actor) });
    }
    if (method === 'POST' && apiPath === '/task-template/delete-section') {
      return json(200, { taskTemplates: await deleteChecklistSection(body.section, actor, body.locationId || 'all') });
    }
    if (method === 'POST' && apiPath === '/task-templates/import-area-checklists') {
      return json(200, { taskTemplates: await importAreaChecklistTemplates(actor) });
    }
    if (method === 'POST' && apiPath === '/notice') {
      return json(200, { notices: await saveNotice(body, actor) });
    }
    if (method === 'POST' && apiPath === '/notice/read') {
      return json(200, { notices: await markNoticeRead(body.id, actor) });
    }
    if (method === 'POST' && apiPath === '/calendar/event') {
      return json(200, await saveCalendarEvent(body, actor));
    }
    if (method === 'POST' && apiPath === '/calendar/event/delete') {
      return json(200, await deleteCalendarEvent(body.id, actor));
    }
    if (method === 'POST' && apiPath === '/alerts/rule') {
      return json(200, await saveAlertRule(body, actor));
    }
    if (method === 'POST' && apiPath === '/alerts/rule/delete') {
      return json(200, await deleteAlertRule(body.id, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/inspection') {
      return json(200, await saveFpcInspection(body, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/item') {
      return json(200, await saveFpcItem(body, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/item/update') {
      return json(200, await updateFpcItem(body, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/comment') {
      return json(200, await addFpcComment(body, actor));
    }
    if (method === 'POST' && apiPath === '/store-documents/document') {
      return json(200, await saveStoreDocument(body, actor));
    }
    if (method === 'POST' && apiPath === '/resources/resource') {
      return json(200, await saveResource(body, actor));
    }
    if (method === 'POST' && apiPath === '/resources/resource/delete') {
      return json(200, await deleteResource(body.id, actor));
    }
    if (method === 'POST' && apiPath === '/smallwares/request') {
      return json(200, await saveSmallwaresRequest(body, actor));
    }
    if (method === 'POST' && apiPath === '/smallwares/request/update') {
      return json(200, await updateSmallwaresRequest(body, actor));
    }

    if (method === 'POST' && apiPath === '/maintenance/work-order') {
      const workOrder = await writeWorkOrder(body);
      return json(200, { workOrder, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/work-order/update') {
      const workOrder = await updateWorkOrder(body);
      return json(200, { workOrder, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/equipment') {
      const equipment = await writeEquipment(body);
      return json(200, { equipment, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/equipment/update') {
      const equipment = await updateEquipment(body);
      return json(200, { equipment, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/pm') {
      const pmTask = await writePmTask(body);
      return json(200, { pmTask, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/pm/update') {
      const pmTask = await updatePmTask(body);
      return json(200, { pmTask, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/priority-order') {
      return json(200, await saveMaintenancePriorityOrder(body, actor));
    }
    if (method === 'POST' && apiPath === '/maintenance/vendor') {
      const vendor = await saveVendor(body);
      return json(200, { vendor, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/import') {
      return json(200, await importMaintenanceWorkbook(body));
    }
    if (method === 'POST' && apiPath === '/maintenance/attachment') return json(200, { url: await saveAttachment(body) });

    return json(404, { error: `Unknown route: ${method} ${apiPath}` });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Server error' });
  }
};
