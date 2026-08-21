const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'dailyops-uploads';
const RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'dqops-receipts';
const AUTH_REQUIRED = Boolean(process.env.SUPABASE_ANON_KEY);
const FULL_ACCESS_ROLES = ['Director of Operations', 'Owner'];
const APP_VERSION = '1.4.0';
const MAINTENANCE_ROLE = 'Maintenance Tech';
const UNIFI_API_KEY = process.env.UNIFI_API_KEY || '';
const UNIFI_CONSOLE_ID = process.env.UNIFI_CONSOLE_ID || '';
const DEFAULT_TENANT_ID = safeName(process.env.APP_TENANT_ID || 'his-management');
const DEFAULT_TENANT_NAME = process.env.APP_TENANT_NAME || 'HIS Management Group Inc';
const DEFAULT_TENANT_LOGO = process.env.APP_TENANT_LOGO || 'assets/his-management.png';
const ALERT_TIME_ZONE = process.env.ALERT_TIME_ZONE || 'America/Chicago';
const KIOSK_TOKEN_SECRET = process.env.KIOSK_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY || '';
const KIOSK_SESSION_SECONDS = 8 * 60 * 60;

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

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function signKioskToken(payload) {
  if (!KIOSK_TOKEN_SECRET) throw Object.assign(new Error('Kiosk login is not configured'), { statusCode: 503 });
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', KIOSK_TOKEN_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyKioskToken(token, expectedType) {
  if (!token || !KIOSK_TOKEN_SECRET) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', KIOSK_TOKEN_SECRET).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.type !== expectedType || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) || payload.tenantId !== tenantId()) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(event) {
  return String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
}

function randomCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(length), byte => alphabet[byte % alphabet.length]).join('');
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
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
  let rows;
  try {
    rows = await supabase(`/rest/v1/locations?${tenantQuery()}&active=eq.true&select=id,name,address,phone&order=id.asc`);
  } catch (error) {
    // Keep older deployments working until add_location_contact_fields.sql is applied.
    rows = (await supabase(`/rest/v1/locations?${tenantQuery()}&active=eq.true&select=id,name&order=id.asc`))
      .map(location => ({ ...location, address: '', phone: '' }));
  }
  return rows.length ? rows : Array.from({ length: 13 }, (_, index) => ({
    id: `store-${String(index + 1).padStart(2, '0')}`,
    name: `Store ${index + 1}`,
    address: '',
    phone: ''
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
    pinEnabled: Boolean(row.pin_hash),
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
      phone: user.phone || null,
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
  const existing = (await readLocations()).find(entry => entry.id === location.id) || {};
  await supabase('/rest/v1/locations?on_conflict=tenant_id,id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(withTenant({
      id: location.id,
      name: location.name,
      address: String(location.address === undefined ? (existing.address || '') : (location.address || '')).trim(),
      phone: String(location.phone === undefined ? (existing.phone || '') : (location.phone || '')).trim(),
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
    phone: payload.phone,
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
    locationIds: userLocationIds(row),
    authMode: row.authMode || 'password'
  };
}

async function kioskDeviceFromToken(event) {
  const payload = verifyKioskToken(bearerToken(event), 'device');
  if (!payload?.deviceId) throw Object.assign(new Error('This tablet must be set up again'), { statusCode: 401 });
  const rows = await supabase(`/rest/v1/kiosk_devices?${tenantQuery()}&id=eq.${encodeURIComponent(payload.deviceId)}&active=eq.true&select=*`);
  const device = rows[0];
  if (!device || device.token_hash !== sha256(bearerToken(event))) throw Object.assign(new Error('This tablet is no longer authorized'), { statusCode: 401 });
  supabase(`/rest/v1/kiosk_devices?${tenantQuery()}&id=eq.${encodeURIComponent(device.id)}`, { method: 'PATCH', body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => {});
  return device;
}

async function createKioskEnrollment(payload, actor) {
  if (!canManage(actor)) throw Object.assign(new Error('Only managers can set up store tablets'), { statusCode: 403 });
  const locationId = payload.locationId || actor.location_id;
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only set up tablets for your locations'), { statusCode: 403 });
  const code = randomCode();
  await supabase('/rest/v1/kiosk_enrollments', {
    method: 'POST',
    body: JSON.stringify(withTenant({
      code_hash: sha256(code), location_id: locationId, device_name: String(payload.deviceName || 'Store tablet').slice(0, 80),
      created_by: actor.id, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    }))
  });
  return { code, expiresInMinutes: 15, locationId };
}

async function enrollKiosk(payload) {
  const code = String(payload.code || '').trim().toUpperCase();
  if (!code) throw Object.assign(new Error('Enter the setup code'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/kiosk_enrollments?${tenantQuery()}&code_hash=eq.${sha256(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
  const enrollment = rows[0];
  if (!enrollment) throw Object.assign(new Error('That setup code is invalid or expired'), { statusCode: 401 });
  const deviceId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const token = signKioskToken({ type: 'device', tenantId: tenantId(), deviceId, locationId: enrollment.location_id, exp });
  await supabase('/rest/v1/kiosk_devices', {
    method: 'POST',
    body: JSON.stringify(withTenant({ id: deviceId, location_id: enrollment.location_id, name: enrollment.device_name, token_hash: sha256(token), active: true }))
  });
  await supabase(`/rest/v1/kiosk_enrollments?${tenantQuery()}&id=eq.${encodeURIComponent(enrollment.id)}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) });
  return { token, locationId: enrollment.location_id, deviceName: enrollment.device_name };
}

async function kioskEmployees(event) {
  const device = await kioskDeviceFromToken(event);
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&location_id=eq.${encodeURIComponent(device.location_id)}&role=eq.Employee&active=eq.true&pin_hash=not.is.null&select=id,name&order=name.asc`);
  const locations = await supabase(`/rest/v1/locations?${tenantQuery()}&id=eq.${encodeURIComponent(device.location_id)}&select=id,name`);
  return { employees: rows, location: locations[0], deviceName: device.name };
}

async function kioskPinLogin(event, payload) {
  const device = await kioskDeviceFromToken(event);
  const pin = String(payload.pin || '');
  if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error('Enter a four-digit PIN'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(payload.userId || '')}&location_id=eq.${encodeURIComponent(device.location_id)}&role=eq.Employee&active=eq.true&select=*`);
  const user = rows[0];
  if (!user?.pin_hash || !user.pin_salt) throw Object.assign(new Error('PIN sign-in is not enabled for that employee'), { statusCode: 401 });
  if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) throw Object.assign(new Error('Too many attempts. Ask a manager or wait 15 minutes.'), { statusCode: 429 });
  const supplied = Buffer.from(hashPin(pin, user.pin_salt), 'hex');
  const expected = Buffer.from(user.pin_hash, 'hex');
  const matches = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!matches) {
    const failures = Number(user.pin_failures || 0) + 1;
    await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ pin_failures: failures >= 5 ? 0 : failures, pin_locked_until: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null }) });
    throw Object.assign(new Error(failures >= 5 ? 'Too many attempts. Sign-in is locked for 15 minutes.' : 'Incorrect PIN'), { statusCode: failures >= 5 ? 429 : 401 });
  }
  await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ pin_failures: 0, pin_locked_until: null, pin_last_used_at: new Date().toISOString() }) });
  const token = signKioskToken({ type: 'session', tenantId: tenantId(), deviceId: device.id, userId: user.id, locationId: device.location_id, exp: Math.floor(Date.now() / 1000) + KIOSK_SESSION_SECONDS });
  return { token, profile: appProfile({ ...user, authMode: 'kiosk' }) };
}

async function setUserPin(id, pin, actor) {
  if (!canManage(actor)) throw Object.assign(new Error('Only managers can set employee PINs'), { statusCode: 403 });
  if (!/^\d{4}$/.test(String(pin || ''))) throw Object.assign(new Error('PIN must be exactly four digits'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}&select=*`);
  const target = rows[0];
  if (!target || target.role !== 'Employee') throw Object.assign(new Error('PINs are only available for employees'), { statusCode: 400 });
  if (!canAccessLocation(actor, target.location_id)) throw Object.assign(new Error('You can only set PINs for employees at your locations'), { statusCode: 403 });
  const salt = crypto.randomBytes(16).toString('hex');
  await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ pin_salt: salt, pin_hash: hashPin(pin, salt), pin_failures: 0, pin_locked_until: null, updated_at: new Date().toISOString() }) });
  return { ok: true };
}

async function readKioskDevices(actor) {
  if (!canManage(actor)) throw Object.assign(new Error('Only managers can view store tablets'), { statusCode: 403 });
  const rows = await supabase(`/rest/v1/kiosk_devices?${tenantQuery()}&active=eq.true&select=id,name,location_id,last_seen_at,created_at&order=created_at.desc`);
  const allowed = userLocationIds(actor);
  return (isFullAccess(actor) ? rows : rows.filter(row => allowed.includes(row.location_id))).map(row => ({ id: row.id, name: row.name, locationId: row.location_id, lastSeenAt: row.last_seen_at, createdAt: row.created_at }));
}

async function revokeKioskDevice(id, actor) {
  const devices = await readKioskDevices(actor);
  if (!devices.some(device => device.id === id)) throw Object.assign(new Error('Tablet not found'), { statusCode: 404 });
  await supabase(`/rest/v1/kiosk_devices?${tenantQuery()}&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active: false, revoked_at: new Date().toISOString() }) });
  return readKioskDevices(actor);
}

function bestProfile(rows) {
  const rank = {
    Owner: 6,
    'Director of Operations': 5,
    'Area Manager': 4,
    [MAINTENANCE_ROLE]: 3,
    Manager: 3,
    'Shift Manager': 2,
    Employee: 1
  };
  return [...rows].sort((a, b) => (rank[b.role] || 0) - (rank[a.role] || 0))[0];
}

function isFullAccess(profile) {
  return FULL_ACCESS_ROLES.includes(profile?.role);
}

function canManage(profile) {
  return roleRank(profile?.role) >= roleRank('Manager');
}

function canSubmitManagementReport(profile) {
  return profile && profile.role !== 'Employee' && profile.role !== MAINTENANCE_ROLE;
}

function canAreaManage(profile) {
  return ['Area Manager', 'Director of Operations', 'Owner'].includes(profile?.role);
}

function roleRank(role = 'Employee') {
  return {
    Employee: 0,
    'Shift Manager': 1,
    Manager: 2,
    [MAINTENANCE_ROLE]: 2,
    'Area Manager': 3,
    'Director of Operations': 4,
    Owner: 5
  }[role] ?? 0;
}

function allowedRoles(profile) {
  if (isFullAccess(profile)) return ['Employee', 'Shift Manager', 'Manager', 'Area Manager', MAINTENANCE_ROLE, 'Director of Operations', 'Owner'];
  if (profile?.role === 'Area Manager') return ['Employee', 'Shift Manager', 'Manager', 'Area Manager', MAINTENANCE_ROLE];
  if (profile?.role === 'Manager') return ['Employee', 'Shift Manager', 'Manager'];
  return [];
}

async function currentProfile(event) {
  if (!AUTH_REQUIRED) return null;
  const kiosk = verifyKioskToken(bearerToken(event), 'session');
  if (kiosk?.userId) {
    const deviceRows = await supabase(`/rest/v1/kiosk_devices?${tenantQuery()}&id=eq.${encodeURIComponent(kiosk.deviceId)}&location_id=eq.${encodeURIComponent(kiosk.locationId)}&active=eq.true&select=id`);
    if (!deviceRows[0]) throw Object.assign(new Error('This tablet is no longer authorized'), { statusCode: 401 });
    const rows = await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(kiosk.userId)}&location_id=eq.${encodeURIComponent(kiosk.locationId)}&role=eq.Employee&active=eq.true&select=*`);
    if (!rows[0]) throw Object.assign(new Error('Employee session is no longer active'), { statusCode: 401 });
    return { ...rows[0], authMode: 'kiosk' };
  }
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

function normalizeSmsPhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

async function saveSmsConsentPreference(payload = {}) {
  const consent = payload.consent === true;
  const message = consent
    ? 'Your SMS opt-in preference has been recorded. Reply STOP at any time to opt out.'
    : 'Your preference has been recorded. You are not opted in to HIS OPS text messages.';
  if (String(payload.company || '').trim()) return { ok: true, consent: false, message };

  const name = String(payload.name || '').trim();
  const phone = normalizeSmsPhone(payload.phone);
  if (name.length < 2) throw Object.assign(new Error('Enter your full name'), { statusCode: 400 });
  if (!phone) throw Object.assign(new Error('Enter a valid 10-digit US mobile number'), { statusCode: 400 });

  const records = await readMaintenanceKey('smsConsentRecords', []);
  const history = Array.isArray(records) ? records : [];
  history.unshift({
    id: `SMSCONSENT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    name: name.slice(0, 100),
    phone,
    consent,
    source: 'public-web-form',
    disclosureVersion: '2026-08-07',
    submittedAt: new Date().toISOString()
  });
  await writeMaintenanceKey('smsConsentRecords', history.slice(0, 5000));
  return { ok: true, consent, message };
}

async function hasSmsConsent(phone) {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return false;
  const records = await readMaintenanceKey('smsConsentRecords', []);
  const latest = (Array.isArray(records) ? records : []).find(record => normalizeSmsPhone(record.phone) === normalized);
  return latest?.consent === true;
}

async function unifiProtectRequest(pathname, accept = 'application/json') {
  if (!UNIFI_API_KEY || !UNIFI_CONSOLE_ID) throw Object.assign(new Error('UniFi integration is not configured in Netlify'), { statusCode: 503 });
  const apiKey = UNIFI_API_KEY.trim().replace(/^["']|["']$/g, '');
  const consoleId = UNIFI_CONSOLE_ID.trim().replace(/^["']|["']$/g, '');
  const url = `https://api.ui.com/v1/connector/consoles/${encodeURI(consoleId)}/proxy/protect/integration/v1${pathname}`;
  const response = await fetch(url, { headers: { Accept: accept, 'X-API-Key': apiKey } });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`UniFi Protect returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`), { statusCode: response.status === 401 || response.status === 403 ? 502 : response.status });
  }
  return response;
}

function unifiCameraName(camera = {}) {
  if (typeof camera.name === 'string') return camera.name;
  return camera.name?.name || camera.name?.value || camera.displayName || camera.modelKey || 'UniFi camera';
}

async function unifiCameraState(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can view Location Health cameras'), { statusCode: 403 });
  if (!UNIFI_API_KEY || !UNIFI_CONSOLE_ID) return { configured: false, cameras: [], mappings: {}, canManage: isFullAccess(actor), message: 'Add UNIFI_API_KEY and UNIFI_CONSOLE_ID in Netlify.' };
  const [response, storedMappings] = await Promise.all([
    unifiProtectRequest('/cameras'),
    readMaintenanceKey('unifiCameraLocations', {})
  ]);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload.data || []);
  const mappings = storedMappings && typeof storedMappings === 'object' && !Array.isArray(storedMappings) ? storedMappings : {};
  const allowedLocations = userLocationIds(actor);
  const cameras = rows.map(camera => ({
    id: String(camera.id || ''),
    name: unifiCameraName(camera),
    model: camera.modelKey || '',
    state: camera.state || 'UNKNOWN',
    mac: camera.mac || '',
    microphoneEnabled: Boolean(camera.isMicEnabled),
    locationId: String(mappings[camera.id] || '')
  })).filter(camera => camera.id && (isFullAccess(actor) || (camera.locationId && allowedLocations.includes(camera.locationId))));
  return { configured: true, cameras, mappings: isFullAccess(actor) ? mappings : {}, canManage: isFullAccess(actor), refreshedAt: new Date().toISOString() };
}

async function saveUnifiCameraMappings(payload, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only the Director of Operations or Owner can assign cameras to locations'), { statusCode: 403 });
  const locationIds = new Set((await readLocations()).map(location => String(location.id)));
  const mappings = {};
  for (const [cameraId, locationId] of Object.entries(payload.mappings || {})) {
    const cleanCameraId = String(cameraId || '').trim();
    const cleanLocationId = String(locationId || '').trim();
    if (cleanCameraId && (!cleanLocationId || locationIds.has(cleanLocationId))) mappings[cleanCameraId] = cleanLocationId;
  }
  await writeMaintenanceKey('unifiCameraLocations', mappings);
  return unifiCameraState(actor);
}

async function unifiCameraSnapshot(cameraId, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can view camera snapshots'), { statusCode: 403 });
  const state = await unifiCameraState(actor);
  if (!state.cameras.some(camera => camera.id === cameraId)) throw Object.assign(new Error('Camera not found or not assigned to an accessible location'), { statusCode: 404 });
  const response = await unifiProtectRequest(`/cameras/${encodeURIComponent(cameraId)}/snapshot?channel=main&highQuality=false`, 'image/jpeg');
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
    body: Buffer.from(await response.arrayBuffer()).toString('base64'),
    isBase64Encoded: true
  };
}

async function readNotificationLogs(actor = null) {
  const logs = await readMaintenanceKey('notificationLogs', []);
  const list = Array.isArray(logs) ? logs : [];
  if (AUTH_REQUIRED && !canManage(actor)) return [];
  if (!AUTH_REQUIRED || isFullAccess(actor)) return list.slice(0, 500);
  const allowed = userLocationIds(actor);
  return list.filter(log => log.locationId && allowed.includes(log.locationId)).slice(0, 500);
}

async function appendNotificationLogs(entries = []) {
  const cleanEntries = entries.filter(Boolean).map(entry => ({
    id: entry.id || `NOTIFY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: entry.createdAt || new Date().toISOString(),
    type: entry.type || 'Notification',
    channel: entry.channel || '',
    title: entry.title || '',
    detail: entry.detail || '',
    locationId: entry.locationId || '',
    locationName: entry.locationName || '',
    recipientId: entry.recipientId || '',
    recipientName: entry.recipientName || '',
    to: entry.to || '',
    delivered: Boolean(entry.delivered),
    skipped: Boolean(entry.skipped),
    status: entry.status || '',
    reason: entry.reason || ''
  }));
  if (!cleanEntries.length) return [];
  const current = await readMaintenanceKey('notificationLogs', []);
  const next = [...cleanEntries, ...(Array.isArray(current) ? current : [])].slice(0, 500);
  await writeMaintenanceKey('notificationLogs', next);
  return next;
}

async function storeAlarmIncompleteState(locationId, date = localDate()) {
  const day = await readDay(locationId, date);
  const missingTasks = (day.tasks || []).filter(task => !task.done).map(task => ({ type: 'task', label: `${task.section || 'Checklist'}: ${task.name}` }));
  const logged = new Set((day.temps || []).map(temp => `${readingList(temp)}|${readingSession(temp)}|${temp.area}|${temp.item}`));
  const missingTemps = [];
  Object.entries(TEMPERATURE_ITEMS).forEach(([listName, list]) => {
    if (list?.requiredDaily === false || !list?.areas) return;
    Object.entries(list.areas).forEach(([area, items]) => items.forEach(item => ['Day', 'Afternoon'].forEach(session => {
      if (!logged.has(`${listName}|${session}|${area}|${item}`)) missingTemps.push({ type: 'temperature', label: `${listName} ${session}: ${item}` });
    })));
  });
  return { missingTasks, missingTemps, missing: [...missingTasks, ...missingTemps], summary: `${missingTasks.length} checklist item${missingTasks.length === 1 ? '' : 's'} and ${missingTemps.length} temperature reading${missingTemps.length === 1 ? '' : 's'} remaining` };
}

async function readStoreAlarms() {
  const stored = await readMaintenanceKey('storeAlarms', []);
  return Array.isArray(stored) ? stored : [];
}

async function refreshStoreAlarmStatuses(alarms) {
  let changed = false;
  for (const alarm of alarms.filter(item => ['Active', 'Acknowledged'].includes(item.status))) {
    const incomplete = await storeAlarmIncompleteState(alarm.locationId, alarm.date);
    alarm.incomplete = incomplete;
    if (!incomplete.missing.length) {
      alarm.status = 'Resolved'; alarm.resolvedAt = new Date().toISOString(); alarm.resolvedBy = 'DQ OPS — required work completed'; changed = true;
    }
  }
  if (changed) await writeMaintenanceKey('storeAlarms', alarms.slice(0, 1000));
  return alarms;
}

function alarmVisibleTo(actor, alarm) {
  return !AUTH_REQUIRED || isFullAccess(actor) || canAccessLocation(actor, alarm.locationId);
}

async function storeAlarmState(actor) {
  const alarms = await refreshStoreAlarmStatuses(await readStoreAlarms());
  const visible = alarms.filter(alarm => alarmVisibleTo(actor, alarm));
  return { canSend: !AUTH_REQUIRED || canAreaManage(actor), active: visible.filter(alarm => alarm.status === 'Active'), history: canAreaManage(actor) || !AUTH_REQUIRED ? visible.slice(0, 100) : visible.filter(alarm => alarm.status === 'Acknowledged').slice(0, 20) };
}

async function sendStoreAlarm(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can send a store alarm'), { statusCode: 403 });
  const locationId = String(payload.locationId || '');
  if (!locationId || (AUTH_REQUIRED && !canAccessLocation(actor, locationId))) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  const date = payload.date || localDate();
  const incomplete = await storeAlarmIncompleteState(locationId, date);
  if (!incomplete.missing.length) throw Object.assign(new Error('All required cleaning and temperature work is already complete'), { statusCode: 400 });
  const locations = await readLocations();
  const location = locations.find(item => item.id === locationId);
  const alarms = await readStoreAlarms();
  if (alarms.some(item => item.locationId === locationId && item.date === date && item.status === 'Active')) throw Object.assign(new Error('This location already has an active tablet alarm'), { statusCode: 409 });
  const alarm = { id: `ALARM-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, locationId, locationName: location?.name || locationId, date, reason: String(payload.reason || 'Required daily work is incomplete').trim(), message: String(payload.message || '').trim(), incomplete, status: 'Active', sentAt: new Date().toISOString(), sentBy: actor?.name || 'Area Manager', sentByRole: actor?.role || 'Area Manager', escalateAfterMinutes: Math.max(5, Math.min(60, Number(payload.escalateAfterMinutes) || 10)) };
  alarms.unshift(alarm);
  await writeMaintenanceKey('storeAlarms', alarms.slice(0, 1000));
  await appendNotificationLogs([{ type: 'Store tablet alarm', channel: 'in-app', title: alarm.reason, detail: alarm.incomplete.summary, locationId, locationName: alarm.locationName, recipientName: 'Store tablet', delivered: true, status: 'Active' }]);
  return storeAlarmState(actor);
}

async function acknowledgeStoreAlarm(payload, actor) {
  const alarms = await readStoreAlarms();
  const alarm = alarms.find(item => item.id === payload.id);
  if (!alarm || !alarmVisibleTo(actor, alarm)) throw Object.assign(new Error('Alarm not found'), { statusCode: 404 });
  if (alarm.status === 'Active') {
    alarm.status = 'Acknowledged'; alarm.acknowledgedAt = new Date().toISOString(); alarm.acknowledgedBy = actor?.name || 'Store employee'; alarm.acknowledgedByRole = actor?.role || 'Employee';
    await writeMaintenanceKey('storeAlarms', alarms.slice(0, 1000));
    await appendNotificationLogs([{ type: 'Store tablet alarm', channel: 'in-app', title: 'Alarm acknowledged', detail: `${alarm.acknowledgedBy} acknowledged ${alarm.reason}`, locationId: alarm.locationId, locationName: alarm.locationName, recipientName: alarm.sentBy, delivered: true, status: 'Acknowledged' }]);
  }
  return storeAlarmState(actor);
}

async function cancelStoreAlarm(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can cancel a store alarm'), { statusCode: 403 });
  const alarms = await readStoreAlarms();
  const alarm = alarms.find(item => item.id === payload.id && alarmVisibleTo(actor, item));
  if (!alarm) throw Object.assign(new Error('Alarm not found'), { statusCode: 404 });
  alarm.status = 'Cancelled'; alarm.cancelledAt = new Date().toISOString(); alarm.cancelledBy = actor?.name || 'Area Manager';
  await writeMaintenanceKey('storeAlarms', alarms.slice(0, 1000));
  return storeAlarmState(actor);
}

async function escalateStoreAlarms(now = new Date()) {
  const alarms = await refreshStoreAlarmStatuses(await readStoreAlarms());
  const users = await readUsers();
  const logs = []; let changed = false;
  for (const alarm of alarms.filter(item => item.status === 'Active' && !item.escalatedAt)) {
    if (now.getTime() - new Date(alarm.sentAt).getTime() < alarm.escalateAfterMinutes * 60000) continue;
    const recipients = users.filter(user => user.role === 'Manager' && userLocationIds(user).includes(alarm.locationId));
    const text = `HIS OPS URGENT: ${alarm.locationName} has not acknowledged the tablet alarm. ${alarm.reason}. ${alarm.incomplete?.summary || ''}`;
    alarm.escalatedAt = now.toISOString(); alarm.escalationResults = [];
    for (const recipient of recipients) {
      const result = await sendTwilioSms(recipient.phone, text);
      alarm.escalationResults.push({ recipientName: recipient.name, delivered: Boolean(result.delivered), reason: result.reason || '' });
      logs.push({ type: 'Store alarm escalation', channel: 'sms', title: alarm.reason, detail: alarm.incomplete?.summary || '', locationId: alarm.locationId, locationName: alarm.locationName, recipientId: recipient.id, recipientName: recipient.name, to: recipient.phone, delivered: Boolean(result.delivered), skipped: Boolean(result.skipped), status: result.status ? String(result.status) : '', reason: result.reason || '' });
    }
    changed = true;
  }
  if (changed) await writeMaintenanceKey('storeAlarms', alarms.slice(0, 1000));
  if (logs.length) await appendNotificationLogs(logs);
  return alarms.filter(item => item.escalatedAt && item.status === 'Active');
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
  let rows = await readMaintenanceKey('taskTemplates', DEFAULT_TASK_TEMPLATES);
  const reset = await readMaintenanceKey('checklistItemsReset20260820', null);
  if (!reset?.completedAt) {
    const source = Array.isArray(rows) ? rows : DEFAULT_TASK_TEMPLATES;
    const shells = [...new Map(source.map(task => [`${task.locationId || 'all'}|${task.section || 'Opening'}`, {
      id: `checklist-shell-${safeName(task.locationId || 'all')}-${safeName(task.section || 'Opening')}`,
      name: '', section: task.section || 'Opening', locationId: task.locationId || 'all', active: false, checklistShell: true,
      scheduleDays: task.scheduleDays || ['daily'], locationSchedules: task.locationSchedules || {}
    }])).values()];
    rows = shells;
    await writeMaintenanceKey('taskTemplates', shells);
    await writeMaintenanceKey('checklistItemsReset20260820', { completedAt: new Date().toISOString(), sectionsPreserved: shells.length });
  }
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
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can manage alerts'), { statusCode: 403 });
  if (AUTH_REQUIRED && payload.locationId !== 'all' && !canAccessLocation(actor, payload.locationId)) throw Object.assign(new Error('You can only create alerts for assigned locations'), { statusCode: 403 });
  if (AUTH_REQUIRED && payload.locationId === 'all' && !canAreaManage(actor) && !isFullAccess(actor)) payload.locationId = userLocationIds(actor)[0];
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
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can manage alerts'), { statusCode: 403 });
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
  const [listName, session = 'Day', targetArea = '', targetItem = ''] = String(target).split('|');
  const list = TEMPERATURE_ITEMS[listName];
  if (!list?.areas) return [];
  return Object.entries(list.areas).flatMap(([area, items]) => items.map(item => ({ listName, session, area, item })))
    .filter(entry => (!targetArea || entry.area === targetArea) && (!targetItem || entry.item === targetItem));
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
    if ((alert.channels || []).includes('email')) {
      let delivered = dryRun;
      let skipped = false;
      let reason = '';
      let status = '';
      if (!dryRun) {
        const emailResult = await sendEmailMessage({ to: recipient.email, subject: 'HIS OPS overdue alert', text });
        delivered = Boolean(emailResult.delivered);
        skipped = Boolean(emailResult.skipped);
        status = emailResult.status ? String(emailResult.status) : '';
        reason = emailResult.reason || '';
      }
      sent.push({ userId: recipient.id, userName: recipient.name, channel: 'email', to: recipient.email, dryRun, delivered, skipped, status, reason });
    }
    if ((alert.channels || []).includes('sms')) {
      const sms = dryRun ? { delivered: true } : await sendTwilioSms(recipient.phone, text);
      sent.push({ userId: recipient.id, userName: recipient.name, channel: 'sms', to: recipient.phone, dryRun, delivered: Boolean(sms.delivered), skipped: Boolean(sms.skipped), status: sms.status ? String(sms.status) : '', reason: sms.reason || '' });
    }
  }
  return sent;
}

function twilioIsReady() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function emailProviderIsReady() {
  return Boolean(
    (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && (process.env.MAILGUN_FROM_EMAIL || process.env.ALERT_EMAIL_FROM)) ||
    (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM)
  );
}

async function sendEmailMessage({ to, subject, text }) {
  if (!to) return { skipped: true, reason: 'No email address' };
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
    const from = process.env.MAILGUN_FROM_EMAIL || process.env.ALERT_EMAIL_FROM || `HIS OPS <mailgun@${process.env.MAILGUN_DOMAIN}>`;
    const baseUrl = process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';
    const body = new URLSearchParams({ from, to, subject, text });
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v3/${process.env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    let detail = '';
    if (!response.ok) {
      try {
        const payload = await response.json();
        detail = payload.message || response.statusText || '';
      } catch {
        detail = response.statusText || '';
      }
    }
    return { delivered: response.ok, status: response.status, provider: 'mailgun', reason: detail };
  }
  if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM, to, subject, text })
    });
    return { delivered: response.ok, status: response.status, provider: 'resend', reason: response.ok ? '' : `Email provider returned ${response.status}` };
  }
  return { skipped: true, reason: 'Email provider is not configured' };
}

async function sendTwilioSms(to, text) {
  if (!to) return { skipped: true, reason: 'No phone number' };
  const normalizedTo = normalizeSmsPhone(to);
  if (!normalizedTo) return { skipped: true, reason: 'Invalid phone number' };
  if (!(await hasSmsConsent(normalizedTo))) return { skipped: true, reason: 'Recipient has not opted in to SMS' };
  if (!twilioIsReady()) return { skipped: true, reason: 'Twilio is not configured' };
  const body = new URLSearchParams({ To: normalizedTo, From: process.env.TWILIO_FROM_NUMBER, Body: text });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  let detail = '';
  if (!response.ok) {
    try {
      const payload = await response.json();
      detail = payload.message || payload.more_info || '';
    } catch {
      detail = response.statusText || '';
    }
  }
  return { delivered: response.ok, status: response.status, reason: detail };
}

function assignmentChannels(value = 'none', cadence = 'immediate') {
  const normalized = String(value || 'none').toLowerCase();
  if (cadence === 'immediate') {
    if (normalized === 'immediate' || normalized === 'immediate-email') return ['email'];
    if (normalized === 'immediate-sms') return ['sms'];
    if (normalized === 'immediate-both') return ['email', 'sms'];
  }
  if (cadence === 'weekly') {
    if (normalized === 'weekly' || normalized === 'weekly-email') return ['email'];
    if (normalized === 'weekly-sms') return ['sms'];
    if (normalized === 'weekly-both') return ['email', 'sms'];
  }
  return [];
}

async function sendAssignmentEmail(task = {}, kind = 'task') {
  const channels = assignmentChannels(task.assignmentNotify, 'immediate');
  if (task.assignmentType !== 'internal' || channels.length === 0) return { skipped: true };
  if (task.assignmentEmail?.assigneeId === task.assigneeId && task.assignmentEmail?.notify === task.assignmentNotify && task.assignmentEmail?.delivered) return task.assignmentEmail;
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
  const result = { delivered: false, assigneeId: task.assigneeId, notify: task.assignmentNotify, sentAt: new Date().toISOString() };
  if (channels.includes('email')) {
    result.email = await sendEmailMessage({ to: task.assigneeEmail, subject: `HIS OPS assignment: ${title}`, text });
    result.email.to = task.assigneeEmail;
    result.delivered = result.delivered || Boolean(result.email.delivered);
  }
  if (channels.includes('sms')) {
    const smsText = [`HIS OPS ${kind} assigned`, location ? `Location: ${location}` : '', `Task: ${title}`, due ? `Due: ${due}` : '', 'Sign in for details.'].filter(Boolean).join('\n').slice(0, 1500);
    result.sms = await sendTwilioSms(task.assigneePhone, smsText);
    result.delivered = result.delivered || Boolean(result.sms?.delivered);
  }
  await appendNotificationLogs(channels.map(channel => {
    const channelResult = result[channel] || {};
    return {
      type: `${kind} assignment`,
      channel,
      title,
      detail: due ? `Due/target date: ${due}` : '',
      locationId: task.locationId || task['Location ID'] || '',
      locationName: location,
      recipientId: task.assigneeId,
      recipientName: task.assigneeName || task['Assigned To'] || '',
      to: channel === 'email' ? task.assigneeEmail : task.assigneePhone,
      delivered: Boolean(channelResult.delivered),
      skipped: Boolean(channelResult.skipped),
      status: channelResult.status ? String(channelResult.status) : '',
      reason: channelResult.reason || ''
    };
  }));
  return result;
}

async function sendWeeklyAssignmentDigest(query = {}) {
  if (query.secret !== process.env.ALERT_CRON_SECRET) throw Object.assign(new Error('Invalid digest secret'), { statusCode: 403 });
  const emailReady = emailProviderIsReady();
  const [workOrders, pmSchedule, fpcRecords] = await Promise.all([
    readMaintenanceKey('workOrders', []),
    readMaintenanceKey('pmSchedule', []),
    readFpcRecords()
  ]);
  const assigned = [];
  workOrders
    .filter(order => order.assignmentType === 'internal' && assignmentChannels(order.assignmentNotify, 'weekly').length && !['Completed', 'Cancelled', 'Canceled'].includes(order.Status))
    .forEach(order => assigned.push({ email: order.assigneeEmail, phone: order.assigneePhone, channels: assignmentChannels(order.assignmentNotify, 'weekly'), name: order.assigneeName || order['Assigned To'] || '', label: `Work order ${order['Work Order ID']}: ${order['Issue Description'] || order.Category || 'Work order'} (${order['Location Name'] || ''})` }));
  pmSchedule
    .filter(pm => pm.assignmentType === 'internal' && assignmentChannels(pm.assignmentNotify, 'weekly').length && pm.Status !== 'Completed')
    .forEach(pm => assigned.push({ email: pm.assigneeEmail, phone: pm.assigneePhone, channels: assignmentChannels(pm.assignmentNotify, 'weekly'), name: pm.assigneeName || pm['Assigned To'] || '', label: `PM ${pm['PM ID']}: ${pm.Task || 'PM task'} (${pm['Location Name'] || ''})` }));
  fpcRecords.forEach(record => (record.items || [])
    .filter(item => item.assignmentType === 'internal' && assignmentChannels(item.assignmentNotify, 'weekly').length && item.status !== 'Completed')
    .forEach(item => assigned.push({ email: item.assigneeEmail, phone: item.assigneePhone, channels: assignmentChannels(item.assignmentNotify, 'weekly'), name: item.assigneeName || item.assignedTo || '', label: `FPC: ${item.description || 'Repair item'} (${record.locationName || ''})` })));
  const grouped = assigned.reduce((map, item) => {
    const key = item.email || item.phone;
    if (!key) return map;
    map[key] ??= { email: item.email, phone: item.phone, name: item.name, labels: [], channels: new Set() };
    item.channels.forEach(channel => map[key].channels.add(channel));
    map[key].labels.push(item.label);
    return map;
  }, {});
  const sent = [];
  for (const group of Object.values(grouped)) {
    const text = [`${group.name || 'Hello'},`, '', 'Here are your current HIS OPS assigned items:', '', ...group.labels.map(label => `- ${label}`), '', 'Please sign in to HIS OPS to review details.'].join('\n');
    const channels = Array.from(group.channels);
    const itemResult = { to: group.email || group.phone, count: group.labels.length };
    if (channels.includes('email')) {
      if (group.email && emailReady) {
        itemResult.email = await sendEmailMessage({ to: group.email, subject: 'HIS OPS weekly assignment digest', text });
      } else {
        itemResult.email = { skipped: true, reason: group.email ? 'Email provider is not configured' : 'No email address' };
      }
    }
    if (channels.includes('sms')) {
      const smsText = `HIS OPS weekly assignments: ${group.labels.length} open item(s). ${group.labels.slice(0, 2).join(' | ')}${group.labels.length > 2 ? ' | More in HIS OPS.' : ''}`.slice(0, 1500);
      itemResult.sms = await sendTwilioSms(group.phone, smsText);
    }
    itemResult.delivered = Boolean(itemResult.email?.delivered || itemResult.sms?.delivered);
    sent.push(itemResult);
    await appendNotificationLogs(channels.map(channel => {
      const channelResult = itemResult[channel] || {};
      return {
        type: 'Weekly assignment digest',
        channel,
        title: `${group.labels.length} open assigned item${group.labels.length === 1 ? '' : 's'}`,
        detail: group.labels.slice(0, 3).join(' | '),
        recipientName: group.name,
        to: channel === 'email' ? group.email : group.phone,
        delivered: Boolean(channelResult.delivered),
        skipped: Boolean(channelResult.skipped),
        status: channelResult.status ? String(channelResult.status) : '',
        reason: channelResult.reason || ''
      };
    }));
  }
  return { sent };
}

async function checkAlerts(query = {}, actor = null) {
  if (AUTH_REQUIRED && actor && !canManage(actor)) throw Object.assign(new Error('Only managers and above can preview alerts'), { statusCode: 403 });
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
  if (!dryRun && alerts.length) {
    await appendNotificationLogs(alerts.flatMap(alert => (alert.sent || []).map(entry => ({
      type: alert.type === 'temperature' ? 'Temperature alert' : 'Checklist alert',
      channel: entry.channel,
      title: alert.ruleName,
      detail: alert.detail,
      locationId: alert.locationId,
      locationName: alert.locationName,
      recipientId: entry.userId,
      recipientName: entry.userName,
      to: entry.to,
      delivered: entry.delivered,
      skipped: entry.skipped,
      status: entry.status,
      reason: entry.reason
    }))));
  }
  const storeAlarmEscalations = dryRun ? [] : await escalateStoreAlarms(now);
  return { dryRun, date, alerts, storeAlarmEscalations };
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
    assigneePhone: payload.assigneePhone || '',
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
  ['description', 'priority', 'status', 'assignedTo', 'assignmentType', 'assigneeId', 'assigneeName', 'assigneeEmail', 'assigneePhone', 'vendorId', 'vendorName', 'assignmentNotify', 'targetDate', 'photoUrl', 'photoName'].forEach(key => {
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

async function readTemperatureStandards() {
  const stored = await readMaintenanceKey('temperatureStandards', {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

async function saveTemperatureStandards(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can set temperature standards'), { statusCode: 403 });
  const incoming = payload.standards && typeof payload.standards === 'object' ? payload.standards : {};
  const clean = {};
  Object.entries(incoming).forEach(([key, value]) => {
    const min = value.min === '' || value.min == null ? null : Number(value.min);
    const max = value.max === '' || value.max == null ? null : Number(value.max);
    clean[key] = { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null,
      belowActions: Array.isArray(value.belowActions) ? value.belowActions.map(String).map(item => item.trim()).filter(Boolean) : [],
      aboveActions: Array.isArray(value.aboveActions) ? value.aboveActions.map(String).map(item => item.trim()).filter(Boolean) : [] };
  });
  await writeMaintenanceKey('temperatureStandards', clean);
  return { standards: clean };
}

async function readReceipts() {
  const receipts = await readMaintenanceKey('purchaseReceipts', []);
  return Array.isArray(receipts) ? receipts : [];
}

async function signedReceiptUrl(pathname) {
  if (!pathname) return '';
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${RECEIPTS_BUCKET}/${pathname}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  if (!response.ok) return '';
  const result = await response.json();
  const signedPath = result.signedURL || result.signedUrl || '';
  return signedPath ? `${SUPABASE_URL}/storage/v1${signedPath}` : '';
}

async function receiptState(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can access receipts'), { statusCode: 403 });
  const allowed = userLocationIds(actor);
  const receipts = (await readReceipts()).filter(receipt => receipt.active !== false && (!AUTH_REQUIRED || isFullAccess(actor) || allowed.includes(receipt.locationId)));
  return { receipts: await Promise.all(receipts.map(async receipt => ({ ...receipt, downloadUrl: await signedReceiptUrl(receipt.storagePath) }))) };
}

async function saveReceipt(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can upload receipts'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only upload receipts for your assigned locations'), { statusCode: 403 });
  const vendor = String(payload.vendor || '').trim();
  const amount = Number(payload.amount);
  if (!vendor) throw Object.assign(new Error('Vendor is required'), { statusCode: 400 });
  if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error('Enter a valid receipt amount'), { statusCode: 400 });
  if (!payload.attachment?.dataUrl) throw Object.assign(new Error('Choose a receipt photo or PDF'), { statusCode: 400 });
  const [header, encoded] = payload.attachment.dataUrl.split(',');
  if (!encoded || payload.attachment.dataUrl.length > 5_500_000) throw Object.assign(new Error('Receipt file must be under 4 MB'), { statusCode: 413 });
  const mimeType = header.split(';')[0].replace('data:', '') || 'application/octet-stream';
  const originalName = safeName(payload.attachment.name || '');
  const extension = originalName.includes('.') ? originalName.split('.').pop() : (mimeType.split('/')[1] || 'bin');
  const storagePath = `${safeName(locationId)}/${payload.date || today()}/${Date.now()}-${safeName(vendor)}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${RECEIPTS_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': mimeType, 'x-upsert': 'false' },
    body: Buffer.from(encoded, 'base64')
  });
  if (!response.ok) throw new Error(await response.text());
  const receipts = await readReceipts();
  receipts.unshift({
    id: `RECEIPT-${Date.now()}`, locationId, locationName: payload.locationName || '', date: payload.date || today(), vendor,
    amount: Math.round(amount * 100) / 100, category: payload.category || 'Other', notes: String(payload.notes || '').trim(),
    fileName: payload.attachment.name || 'Receipt', storagePath, createdBy: actor?.name || 'Area Manager', createdById: actor?.id || '', createdAt: new Date().toISOString(), active: true
  });
  await writeMaintenanceKey('purchaseReceipts', receipts);
  return receiptState(actor);
}

const STORE_VISIT_ITEMS = [
  ['Exterior', 'Parking lot, sidewalks, landscaping, and exterior appearance'],
  ['Exterior', 'Drive-thru menu boards, windows, and approach are clean and operational'],
  ['Guest areas', 'Lobby, restrooms, tables, floors, and trash areas are clean'],
  ['Guest areas', 'Team provides friendly, accurate, and timely service'],
  ['Food safety', 'Handwashing, glove use, and employee hygiene meet standards'],
  ['Food safety', 'Products are labeled, dated, rotated, and stored correctly'],
  ['Food safety', 'Required temperatures and food-safety logs are complete'],
  ['Operations', 'Grill and chill stations are clean, stocked, and organized'],
  ['Operations', 'Product quality and portioning meet standards'],
  ['Operations', 'Opening, shift, and closing checklists are being completed'],
  ['People', 'Employees are in uniform and assigned effectively'],
  ['People', 'Manager is coaching the team and following up on priorities'],
  ['Equipment', 'Critical equipment is operating and repair needs are documented'],
  ['Financial controls', 'Cash handling, deposits, discounts, and void controls are followed'],
  ['Brand readiness', 'Required signage, promotions, and merchandising are current']
].map((item, index) => ({ id: `visit-${index + 1}`, category: item[0], label: item[1] }));

const FOOD_SAFETY_CRITICAL_ITEMS = [
  'Chemicals are correctly stored and labeled.',
  'Ice machine internal ice contact surfaces are maintained clean.',
  'Soda dispensing nozzles, Misty dispensing nozzles, and the Misty Machine internal product reservoir are maintained clean.',
  'Approved cake labels are in use in the cake display freezer.',
  'Hot dogs are held at a minimum internal temperature of 140°F (60°C).',
  'Gravy is held at a minimum internal temperature of 140°F (60°C).',
  'Handwashing sinks are stocked, unobstructed, and properly functioning.',
  'Chili is held at a minimum internal temperature of 140°F (60°C).',
  'Chicken strips are held at a minimum internal temperature of 140°F (60°C).',
  'Hot dogs are cooked to a minimum internal temperature of 150°F (66°C).'
].map((label, index) => ({ id: `food-critical-${index + 1}`, category: 'Food Safety Critical', label }));

const CLEANLINESS_RED_ITEMS = [
  'Behind the counter fryers and hood are maintained clean.',
  'Chemicals are properly stored and labeled.',
  'Behind the counter floors and walls are maintained clean.',
  'Behind the counter warmer drawers and food warmers are maintained clean.',
  'Approved cake labels are in use in the cake display freezer.',
  'Behind the counter coolers and freezers are maintained clean.',
  'Dumpster area is maintained clean.',
  'Behind the counter grills and grill hood are maintained clean.',
  'Behind the counter shelving, drawers, and dry racks, including legs and casters, are maintained clean.',
  'Ice machine internal ice contact surfaces are maintained clean.'
].map((label, index) => ({ id: `cleanliness-red-${index + 1}`, category: 'Cleanliness Red', label }));

const VISIT_TEMPLATES = [
  { id: 'store-visit', name: 'Store Visit Inspection', items: STORE_VISIT_ITEMS },
  { id: 'food-safety-criticals', name: 'Top 10 Food Safety Criticals', items: FOOD_SAFETY_CRITICAL_ITEMS },
  { id: 'cleanliness-reds', name: 'Top 10 Cleanliness Reds', items: CLEANLINESS_RED_ITEMS }
];

async function readVisitInspections() {
  const inspections = await readMaintenanceKey('visitInspections', []);
  return Array.isArray(inspections) ? inspections : [];
}

async function inspectionState(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can access store inspections'), { statusCode: 403 });
  const allowed = userLocationIds(actor);
  const inspections = (await readVisitInspections()).filter(entry => entry.active !== false && (!AUTH_REQUIRED || isFullAccess(actor) || allowed.includes(entry.locationId)));
  return { template: STORE_VISIT_ITEMS, templates: VISIT_TEMPLATES, inspections };
}

async function saveVisitInspection(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can complete store inspections'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only inspect your assigned locations'), { statusCode: 403 });
  const template = VISIT_TEMPLATES.find(entry => entry.id === payload.templateId) || VISIT_TEMPLATES[0];
  const submitted = Array.isArray(payload.answers) ? payload.answers : [];
  const answers = template.items.map(item => {
    const answer = submitted.find(entry => entry.id === item.id) || {};
    const value = answer.value === null || answer.value === 'na' ? null : Number(answer.value);
    if (value !== null && ![0, 1, 2].includes(value)) throw Object.assign(new Error('Every inspection answer must use a valid score'), { statusCode: 400 });
    return { ...item, value, comment: String(answer.comment || '').trim().slice(0, 500), photoUrl: String(answer.photoUrl || '').trim(), photoName: String(answer.photoName || '').trim().slice(0, 180) };
  });
  const scored = answers.filter(answer => answer.value !== null);
  if (!scored.length) throw Object.assign(new Error('Score at least one inspection item'), { statusCode: 400 });
  const score = Math.round(scored.reduce((sum, answer) => sum + answer.value, 0) / (scored.length * 2) * 100);
  const inspections = await readVisitInspections();
  inspections.unshift({
    id: `VISIT-${Date.now()}`, templateId: template.id, templateName: template.name, locationId, locationName: payload.locationName || '', date: payload.date || today(), score, answers,
    notes: String(payload.notes || '').trim(), completedBy: actor?.name || 'Area Manager', completedById: actor?.id || '', createdAt: new Date().toISOString(), active: true
  });
  await writeMaintenanceKey('visitInspections', inspections);
  return inspectionState(actor);
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

async function readManagementReports() {
  const reports = await readMaintenanceKey('managementReports', []);
  return Array.isArray(reports) ? reports : [];
}

function reportLocationIds(user = {}) {
  if (Array.isArray(user.locationIds) && user.locationIds.length) return user.locationIds;
  if (Array.isArray(user.location_ids) && user.location_ids.length) return user.location_ids;
  return [user.locationId || user.location_id || DEFAULT_LOCATION_ID].filter(Boolean);
}

function managementReportMinimumViewerRole(report = {}) {
  if (report.reportedByRole === 'Shift Manager') return 'Manager';
  if (report.reportedByRole === 'Manager') return 'Area Manager';
  if (report.reportedByRole === 'Area Manager') return 'Director of Operations';
  if (report.reportedByRole === 'Director of Operations') return 'Owner';
  return 'Owner';
}

function canViewManagementReport(actor, report = {}) {
  if (!AUTH_REQUIRED) return true;
  if (!actor || !canSubmitManagementReport(actor)) return false;
  if (report.reportedById && report.reportedById === actor.id) return true;
  if (roleRank(actor.role) < roleRank(managementReportMinimumViewerRole(report))) return false;
  if (isFullAccess(actor)) return true;
  return reportLocationIds(actor).includes(report.locationId);
}

async function managementReportsState(actor) {
  const reports = await readManagementReports();
  return { reports: reports.filter(report => report.active !== false && canViewManagementReport(actor, report)) };
}

function managementReportNotificationRecipients(reporter, users, locationId) {
  const reporterRole = reporter?.role || '';
  return users.filter(user => {
    if (!user.email || user.id === reporter?.id) return false;
    if (reporterRole === 'Shift Manager') return user.role === 'Manager' && reportLocationIds(user).includes(locationId);
    if (reporterRole === 'Manager') return ['Area Manager', 'Director of Operations', 'Owner'].includes(user.role) && (isFullAccess(user) || reportLocationIds(user).includes(locationId));
    if (reporterRole === 'Area Manager') return ['Director of Operations', 'Owner'].includes(user.role);
    if (reporterRole === 'Director of Operations') return user.role === 'Owner';
    return false;
  });
}

async function notifyManagementReport(report, actor) {
  const recipients = managementReportNotificationRecipients(actor, await readUsers(), report.locationId);
  const amountLine = report.amount !== null ? `Amount: $${Number(report.amount).toFixed(2)}` : '';
  const text = [
    `A ${report.severity.toLowerCase()}-severity management report was submitted in HIS OPS.`,
    `Location: ${report.locationName}`,
    `Type: ${report.type}`,
    `Subject: ${report.title}`,
    amountLine,
    `Reported by: ${report.reportedBy} (${report.reportedByRole})`,
    `Occurred: ${report.occurredAt}`,
    '',
    report.details,
    report.immediateAction ? `Immediate action: ${report.immediateAction}` : '',
    '',
    'Sign in to HIS OPS to review and follow up.'
  ].filter(Boolean).join('\n');
  const attempts = [];
  for (const recipient of recipients) {
    let result;
    try {
      result = await sendEmailMessage({ to: recipient.email, subject: `HIS OPS management report: ${report.title}`, text });
    } catch (error) {
      result = { delivered: false, reason: error.message || 'Email request failed' };
    }
    attempts.push({
      type: 'Management report', channel: 'email', title: report.title,
      detail: `${report.type} · ${report.severity}`, locationId: report.locationId,
      locationName: report.locationName, recipientId: recipient.id,
      recipientName: recipient.name, to: recipient.email,
      delivered: Boolean(result.delivered), skipped: Boolean(result.skipped),
      status: result.status ? String(result.status) : '', reason: result.reason || ''
    });
  }
  await appendNotificationLogs(attempts);
  return attempts;
}

async function saveManagementReport(payload, actor) {
  if (AUTH_REQUIRED && !canSubmitManagementReport(actor)) throw Object.assign(new Error('Only Shift Managers and above can submit management reports'), { statusCode: 403 });
  const locationId = payload.locationId || reportLocationIds(actor)[0];
  if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only report an issue for your assigned location'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const details = String(payload.details || '').trim();
  if (!title || !details) throw Object.assign(new Error('Subject and details are required'), { statusCode: 400 });
  const reports = await readManagementReports();
  const amount = payload.amount === '' || payload.amount === null || payload.amount === undefined ? null : Number(payload.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw Object.assign(new Error('Enter a valid shortage or variance amount'), { statusCode: 400 });
  const report = {
    id: `REPORT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    locationId,
    locationName: String(payload.locationName || '').trim(),
    type: String(payload.type || 'Other').trim(),
    severity: ['Low', 'Medium', 'High', 'Critical'].includes(payload.severity) ? payload.severity : 'Medium',
    title,
    amount,
    occurredAt: String(payload.occurredAt || new Date().toISOString()),
    details,
    immediateAction: String(payload.immediateAction || '').trim(),
    status: 'Open',
    followUp: '',
    reportedBy: actor?.name || payload.reportedBy || 'Manager',
    reportedById: actor?.id || payload.reportedById || '',
    reportedByRole: actor?.role || payload.reportedByRole || 'Manager',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true
  };
  reports.unshift(report);
  await writeMaintenanceKey('managementReports', reports.slice(0, 2000));
  const notifications = await notifyManagementReport(report, actor);
  return { ...(await managementReportsState(actor)), report, notifications };
}

async function updateManagementReport(payload, actor) {
  const reports = await readManagementReports();
  const report = reports.find(entry => entry.id === payload.id && entry.active !== false);
  if (!report || !canViewManagementReport(actor, report)) throw Object.assign(new Error('Management report not found'), { statusCode: 404 });
  const minimumRole = managementReportMinimumViewerRole(report);
  if (AUTH_REQUIRED && roleRank(actor?.role) < roleRank(minimumRole)) throw Object.assign(new Error(`Only ${minimumRole}s and above can update this report`), { statusCode: 403 });
  report.status = ['Open', 'Reviewing', 'Resolved'].includes(payload.status) ? payload.status : report.status;
  report.followUp = String(payload.followUp || '').trim();
  report.reviewedBy = actor?.name || '';
  report.reviewedById = actor?.id || '';
  report.updatedAt = new Date().toISOString();
  if (report.status === 'Resolved') report.resolvedAt = new Date().toISOString();
  await writeMaintenanceKey('managementReports', reports);
  return managementReportsState(actor);
}

const DASHBOARD_WIDGETS = ['shortcuts', 'alerts', 'upcoming', 'incidents', 'operations', 'maintenance', 'fpc', 'inspections', 'progress'];

function defaultDashboardPreferences() {
  return { visible: [...DASHBOARD_WIDGETS], order: [...DASHBOARD_WIDGETS], defaultRange: 'day', defaultLocationId: 'all' };
}

function normalizeDashboardPreferences(value = {}) {
  const defaults = defaultDashboardPreferences();
  const visible = Array.isArray(value.visible) ? value.visible.filter(id => DASHBOARD_WIDGETS.includes(id)) : defaults.visible;
  const suppliedOrder = Array.isArray(value.order) ? value.order.filter(id => DASHBOARD_WIDGETS.includes(id)) : [];
  const order = [...new Set([...suppliedOrder, ...DASHBOARD_WIDGETS])];
  return {
    visible: [...new Set(visible)],
    order,
    defaultRange: ['day', 'week', 'month'].includes(value.defaultRange) ? value.defaultRange : 'day',
    defaultLocationId: String(value.defaultLocationId || 'all')
  };
}

async function dashboardPreferencesState(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) return { preferences: defaultDashboardPreferences(), customizable: false };
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  const preferences = normalizeDashboardPreferences(stored?.[actor?.id] || {});
  return { preferences, customizable: true };
}

async function saveDashboardPreferences(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can customize dashboards'), { statusCode: 403 });
  const preferences = normalizeDashboardPreferences(payload.preferences || payload);
  if (preferences.defaultLocationId !== 'all' && !canAccessLocation(actor, preferences.defaultLocationId)) {
    throw Object.assign(new Error('You cannot use that location as your dashboard default'), { statusCode: 403 });
  }
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  stored[actor?.id || 'local-user'] = preferences;
  await writeMaintenanceKey('dashboardPreferences', stored);
  return { preferences, customizable: true };
}

async function resetDashboardPreferences(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can reset dashboard settings'), { statusCode: 403 });
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  delete stored[actor?.id || 'local-user'];
  await writeMaintenanceKey('dashboardPreferences', stored);
  return { preferences: defaultDashboardPreferences(), customizable: true };
}

async function readMaintenanceWorkLogs() {
  const entries = await readMaintenanceKey('maintenanceWorkLogs', []);
  return Array.isArray(entries) ? entries : [];
}

async function readMaintenanceHoursPermissions() {
  const stored = await readMaintenanceKey('maintenanceHoursPermissions', { areaManagerIds: [] });
  return { areaManagerIds: Array.isArray(stored?.areaManagerIds) ? [...new Set(stored.areaManagerIds.map(String))] : [] };
}

function canViewMaintenanceHours(actor, permissions) {
  if (!AUTH_REQUIRED) return true;
  if (isFullAccess(actor) || actor?.role === MAINTENANCE_ROLE) return true;
  return actor?.role === 'Area Manager' && permissions.areaManagerIds.includes(String(actor.id));
}

function calculateWorkHours(date, start, end, breakMinutes = 0) {
  if (!date || !start || !end) return null;
  const startAt = new Date(`${date}T${start}:00`);
  let endAt = new Date(`${date}T${end}:00`);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) return null;
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
  const hours = (endAt - startAt) / 3600000 - Math.max(0, Number(breakMinutes) || 0) / 60;
  return Math.max(0, Math.round(hours * 100) / 100);
}

function maintenanceHoursOnlyEntry(entry = {}) {
  return {
    id: entry.id,
    date: entry.date,
    technicianId: entry.technicianId,
    technicianName: entry.technicianName,
    actualHours: entry.actualHours,
    status: entry.status
  };
}

async function maintenanceWorkLogState(actor) {
  const permissions = await readMaintenanceHoursPermissions();
  if (AUTH_REQUIRED && !canViewMaintenanceHours(actor, permissions)) throw Object.assign(new Error('Maintenance hours access has not been granted'), { statusCode: 403 });
  const allEntries = (await readMaintenanceWorkLogs()).filter(entry => entry.active !== false);
  const users = await readUsers();
  const technicians = users.filter(user => user.role === MAINTENANCE_ROLE).map(user => ({ id: user.id, name: user.name }));
  const areaManagers = isFullAccess(actor) ? users.filter(user => user.role === 'Area Manager').map(user => ({ id: user.id, name: user.name, locationIds: user.locationIds || [] })) : [];
  const mode = actor?.role === 'Area Manager' ? 'hours-only' : 'full';
  const scoped = actor?.role === MAINTENANCE_ROLE ? allEntries.filter(entry => entry.technicianId === actor.id) : allEntries;
  const entries = (mode === 'hours-only' ? scoped.map(maintenanceHoursOnlyEntry) : scoped).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return {
    mode,
    canEdit: actor?.role === MAINTENANCE_ROLE || !AUTH_REQUIRED,
    canManagePermissions: isFullAccess(actor) || !AUTH_REQUIRED,
    entries,
    technicians,
    areaManagers,
    permissions: isFullAccess(actor) || !AUTH_REQUIRED ? permissions : { areaManagerIds: [] }
  };
}

async function saveMaintenanceWorkLog(payload, actor) {
  if (AUTH_REQUIRED && actor?.role !== MAINTENANCE_ROLE) throw Object.assign(new Error('Only Maintenance Techs can save their schedule and daily work log'), { statusCode: 403 });
  const date = String(payload.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('A valid work date is required'), { statusCode: 400 });
  const scheduledStart = String(payload.scheduledStart || '').trim();
  const scheduledEnd = String(payload.scheduledEnd || '').trim();
  const actualStart = String(payload.actualStart || '').trim();
  const actualEnd = String(payload.actualEnd || '').trim();
  if ((scheduledStart && !scheduledEnd) || (!scheduledStart && scheduledEnd)) throw Object.assign(new Error('Enter both scheduled start and end times'), { statusCode: 400 });
  if ((actualStart && !actualEnd) || (!actualStart && actualEnd)) throw Object.assign(new Error('Enter both actual start and end times'), { statusCode: 400 });
  const breakMinutes = Math.max(0, Math.min(1440, Number(payload.breakMinutes) || 0));
  const locationIds = Array.isArray(payload.locationIds) ? [...new Set(payload.locationIds.map(String).filter(Boolean))] : [];
  if (AUTH_REQUIRED && locationIds.some(locationId => !canAccessLocation(actor, locationId))) throw Object.assign(new Error('You can only log assigned locations'), { statusCode: 403 });
  const entries = await readMaintenanceWorkLogs();
  let entry = payload.id ? entries.find(item => item.id === payload.id && item.active !== false) : null;
  if (payload.id && (!entry || (AUTH_REQUIRED && entry.technicianId !== actor.id))) throw Object.assign(new Error('Work-log entry not found'), { statusCode: 404 });
  const now = new Date().toISOString();
  const values = {
    date,
    scheduledStart,
    scheduledEnd,
    scheduledHours: calculateWorkHours(date, scheduledStart, scheduledEnd, 0),
    actualStart,
    actualEnd,
    breakMinutes,
    actualHours: calculateWorkHours(date, actualStart, actualEnd, breakMinutes),
    locationIds,
    plannedWork: String(payload.plannedWork || '').trim(),
    accomplishments: String(payload.accomplishments || '').trim(),
    notes: String(payload.notes || '').trim(),
    status: actualStart && actualEnd ? 'Completed' : 'Scheduled',
    updatedAt: now
  };
  if (entry) Object.assign(entry, values);
  else {
    entry = {
      id: `MWL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      technicianId: actor?.id || payload.technicianId || '',
      technicianName: actor?.name || payload.technicianName || 'Maintenance Tech',
      createdAt: now,
      active: true,
      ...values
    };
    entries.unshift(entry);
  }
  await writeMaintenanceKey('maintenanceWorkLogs', entries.slice(0, 5000));
  return maintenanceWorkLogState(actor);
}

async function saveMaintenanceHoursPermissions(payload, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only the Director of Operations or Owner can grant maintenance-hours access'), { statusCode: 403 });
  const users = await readUsers();
  const validAreaManagerIds = new Set(users.filter(user => user.role === 'Area Manager').map(user => String(user.id)));
  const areaManagerIds = Array.isArray(payload.areaManagerIds) ? [...new Set(payload.areaManagerIds.map(String).filter(id => validAreaManagerIds.has(id)))] : [];
  await writeMaintenanceKey('maintenanceHoursPermissions', { areaManagerIds, updatedBy: actor?.name || '', updatedAt: new Date().toISOString() });
  return maintenanceWorkLogState(actor);
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
    assigneePhone: payload.assigneePhone || '',
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

async function updateWorkOrder(payload, actor) {
  const workOrders = await readMaintenanceKey('workOrders', []);
  const row = workOrders.find(entry => entry['Work Order ID'] === payload.workOrderId);
  if (!row) throw Object.assign(new Error('Work order not found'), { statusCode: 404 });
  const technician = actor?.role === MAINTENANCE_ROLE;
  if (AUTH_REQUIRED && technician && !canAccessLocation(actor, String(row['Location ID'] || ''))) throw Object.assign(new Error('You do not have access to this work order location'), { statusCode: 403 });
  if (AUTH_REQUIRED && !technician && !canManage(actor)) throw Object.assign(new Error('You do not have permission to update work orders'), { statusCode: 403 });
  const managerMapping = {
    status: 'Status',
    assignedTo: 'Assigned To',
    assignmentType: 'assignmentType',
    assigneeId: 'assigneeId',
    assigneeName: 'assigneeName',
    assigneeEmail: 'assigneeEmail',
    assigneePhone: 'assigneePhone',
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
  const technicianMapping = {
    status: 'Status',
    dateCompleted: 'Date Completed',
    laborHours: 'Labor Hours',
    resolutionNotes: 'Resolution Notes',
    photoLink: 'Photo Link',
    manualLink: 'Manual Link'
  };
  const mapping = technician ? technicianMapping : managerMapping;
  for (const [source, destination] of Object.entries(mapping)) {
    if (payload[source] !== undefined && payload[source] !== null && payload[source] !== '') row[destination] = payload[source];
  }
  if (!technician && payload.vendorId !== undefined) row.vendorId = payload.vendorId;
  if (row.Status === 'Completed' && !row['Date Completed']) row['Date Completed'] = today();
  row['Total Cost'] = Number(row['Parts Cost'] || 0) + Number(row['Vendor Cost'] || 0);
  row['Last Updated'] = today();
  if (!technician) row.assignmentEmail = await sendAssignmentEmail({ ...row, title: row['Issue Description'], locationName: row['Location Name'] }, 'work order');
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
    assigneePhone: payload.assigneePhone || '',
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
    assigneePhone: 'assigneePhone',
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

    if (method === 'GET' && apiPath === '/version') {
      return json(200, {
        version: APP_VERSION,
        build: process.env.DEPLOY_ID || process.env.COMMIT_REF || '2026.08.20.2'
      });
    }

    if (method === 'GET' && apiPath === '/public-config') {
      return json(200, {
        supabaseUrl: SUPABASE_URL || '',
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
        storageBucket: STORAGE_BUCKET,
        tenant: await readTenantConfig(),
        authEnabled: Boolean(SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
      });
    }

    if (method === 'POST' && apiPath === '/sms-consent') {
      return json(200, await saveSmsConsentPreference(body));
    }

    if ((method === 'POST' && apiPath === '/session-profile') || (method === 'POST' && apiPath === '/accept-invite')) {
      return json(200, { profile: await sessionProfile(event), users: await readUsers() });
    }

    if (method === 'POST' && apiPath === '/kiosk/enroll') return json(200, await enrollKiosk(body));
    if (method === 'GET' && apiPath === '/kiosk/employees') return json(200, await kioskEmployees(event));
    if (method === 'POST' && apiPath === '/kiosk/login') return json(200, await kioskPinLogin(event, body));
    if (method === 'POST' && apiPath === '/kiosk/session-profile') {
      const profile = await currentProfile(event);
      if (profile?.authMode !== 'kiosk') throw Object.assign(new Error('Employee session is not active'), { statusCode: 401 });
      return json(200, { profile: appProfile(profile) });
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
      const requestedLocationId = actor?.authMode === 'kiosk' ? actor.location_id : (query.locationId || DEFAULT_LOCATION_ID);
      const assignedLocationIds = userLocationIds(actor).filter(Boolean);
      const locationId = AUTH_REQUIRED && !canAccessLocation(actor, requestedLocationId)
        ? assignedLocationIds[0]
        : requestedLocationId;
      if (!locationId || (AUTH_REQUIRED && !canAccessLocation(actor, locationId))) {
        throw Object.assign(new Error('No accessible location is assigned to this account'), { statusCode: 403 });
      }
      const historyScope = actor?.authMode === 'kiosk' ? 'location' : (query.historyScope || 'location');
      const [day, history, overdue, taskTemplates, notices, alertSettings, notificationLogs, calendarEvents, managementReports, dashboardPreferences, users, locations] = await Promise.all([
        readDay(locationId, date),
        readHistory(historyScope === 'all' ? null : locationId),
        readOverdue(date),
        readTaskTemplates().catch(() => DEFAULT_TASK_TEMPLATES),
        readNotices(actor).catch(() => []),
        readAlertSettings().catch(() => ({ rules: [], logs: [] })),
        readNotificationLogs(actor).catch(() => []),
        calendarState(actor).catch(() => ({ events: [] })),
        managementReportsState(actor).catch(() => ({ reports: [] })),
        dashboardPreferencesState(actor).catch(() => ({ preferences: defaultDashboardPreferences(), customizable: false })),
        readUsers(),
        readLocations()
      ]);
      return json(200, {
        locationId,
        day,
        history,
        overdue,
        temperatureItems: TEMPERATURE_ITEMS,
        taskTemplates,
        notices,
        alertSettings,
        notificationLogs,
        calendarEvents,
        managementReports,
        dashboardPreferences,
        users: actor?.authMode === 'kiosk' ? users.filter(user => user.id === actor.id) : users,
        locations
      });
    }

    if (method === 'GET' && apiPath === '/users') return json(200, { users: await readUsers() });
    if (method === 'GET' && apiPath === '/kiosk/devices') return json(200, { devices: await readKioskDevices(actor) });
    if (method === 'GET' && apiPath === '/locations') return json(200, { locations: await readLocations() });
    if (method === 'GET' && apiPath === '/overdue') return json(200, { overdue: await readOverdue(query.date) });
    if (method === 'GET' && apiPath === '/dashboard') return json(200, await dashboardSummary(actor, query.range || 'day', query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/maintenance/state') return json(200, await maintenanceState(query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/maintenance-log/state') return json(200, await maintenanceWorkLogState(actor));
    if (method === 'GET' && apiPath === '/location-health/cameras') return json(200, await unifiCameraState(actor));
    if (method === 'GET' && apiPath === '/location-health/camera-snapshot') return unifiCameraSnapshot(String(query.cameraId || ''), actor);
    if (method === 'GET' && apiPath === '/notices') return json(200, { notices: await readNotices(actor) });
    if (method === 'GET' && apiPath === '/notification-logs') return json(200, { logs: await readNotificationLogs(actor) });
    if (method === 'GET' && apiPath === '/store-alarms/state') return json(200, await storeAlarmState(actor));
    if (method === 'GET' && apiPath === '/calendar/state') return json(200, await calendarState(actor));
    if (method === 'GET' && apiPath === '/alerts/state') return json(200, await readAlertSettings());
    if (method === 'GET' && apiPath === '/temperature-standards') return json(200, { standards: await readTemperatureStandards() });
    if (method === 'GET' && apiPath === '/alerts/check') return json(200, await checkAlerts(query, actor));
    if (method === 'GET' && apiPath === '/fpc/state') return json(200, await fpcState());
    if (method === 'GET' && apiPath === '/store-documents/state') return json(200, await storeDocumentsState());
    if (method === 'GET' && apiPath === '/resources/state') return json(200, await resourcesState());
    if (method === 'GET' && apiPath === '/receipts/state') return json(200, await receiptState(actor));
    if (method === 'GET' && apiPath === '/inspections/state') return json(200, await inspectionState(actor));
    if (method === 'GET' && apiPath === '/smallwares/state') return json(200, await smallwaresState());
    if (method === 'GET' && apiPath === '/management-reports/state') return json(200, await managementReportsState(actor));
    if (method === 'GET' && apiPath === '/dashboard/preferences') return json(200, await dashboardPreferencesState(actor));

    if (method === 'POST' && apiPath === '/day') {
      const locationId = body.locationId || DEFAULT_LOCATION_ID;
      if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
      await writeDay(locationId, body.date, body.day);
      return json(200, {
        history: await readHistory(locationId),
        overdue: await readOverdue(body.date)
      });
    }
    if (method === 'POST' && apiPath === '/task/snooze') {
      return json(200, await snoozeTask(body, actor));
    }

    if (method === 'POST' && apiPath === '/photo') return json(200, { url: await saveAttachment({ ...body, kind: body.taskId || 'checklist-photo', name: `${body.date}-${body.taskId}` }) });
    if (method === 'POST' && apiPath === '/user') {
      assertManageAccess(actor, body);
      await saveUser(body);
      if (body.pin) await setUserPin(body.id || safeName(body.email || body.name), body.pin, actor);
      return json(200, { users: await readUsers() });
    }
    if (method === 'POST' && apiPath === '/user/deactivate') {
      return json(200, { users: await deactivateUser(body.id, actor) });
    }
    if (method === 'POST' && apiPath === '/user/password') {
      return json(200, await setUserPassword(body.id || actor?.id, body.password, actor));
    }
    if (method === 'POST' && apiPath === '/user/pin') return json(200, await setUserPin(body.id, body.pin, actor));
    if (method === 'POST' && apiPath === '/kiosk/enrollment') return json(200, await createKioskEnrollment(body, actor));
    if (method === 'POST' && apiPath === '/kiosk/revoke') return json(200, { devices: await revokeKioskDevice(body.id, actor) });
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
    if (method === 'POST' && apiPath === '/store-alarms/send') return json(200, await sendStoreAlarm(body, actor));
    if (method === 'POST' && apiPath === '/store-alarms/acknowledge') return json(200, await acknowledgeStoreAlarm(body, actor));
    if (method === 'POST' && apiPath === '/store-alarms/cancel') return json(200, await cancelStoreAlarm(body, actor));
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
    if (method === 'POST' && apiPath === '/temperature-standards') return json(200, await saveTemperatureStandards(body, actor));
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
    if (method === 'POST' && apiPath === '/receipts/receipt') return json(200, await saveReceipt(body, actor));
    if (method === 'POST' && apiPath === '/inspections/inspection') return json(200, await saveVisitInspection(body, actor));
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
    if (method === 'POST' && apiPath === '/management-reports/report') return json(200, await saveManagementReport(body, actor));
    if (method === 'POST' && apiPath === '/management-reports/update') return json(200, await updateManagementReport(body, actor));
    if (method === 'POST' && apiPath === '/dashboard/preferences') return json(200, await saveDashboardPreferences(body, actor));
    if (method === 'POST' && apiPath === '/dashboard/preferences/reset') return json(200, await resetDashboardPreferences(actor));

    if (method === 'POST' && apiPath === '/maintenance/work-order') {
      const workOrder = await writeWorkOrder(body);
      return json(200, { workOrder, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/work-order/update') {
      const workOrder = await updateWorkOrder(body, actor);
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
    if (method === 'POST' && apiPath === '/maintenance-log/entry') return json(200, await saveMaintenanceWorkLog(body, actor));
    if (method === 'POST' && apiPath === '/maintenance-log/permissions') return json(200, await saveMaintenanceHoursPermissions(body, actor));
    if (method === 'POST' && apiPath === '/location-health/camera-mappings') return json(200, await saveUnifiCameraMappings(body, actor));

    return json(404, { error: `Unknown route: ${method} ${apiPath}` });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Server error' });
  }
};
