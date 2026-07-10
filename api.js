const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'dailyops-uploads';
const AUTH_REQUIRED = Boolean(process.env.SUPABASE_ANON_KEY);
const FULL_ACCESS_ROLES = ['Director of Operations', 'Owner'];

const DEFAULT_LOCATION_ID = 'store-01';
const BASE_TASKS = [
  { id: 'sanitize', name: 'Sanitize all prep surfaces' },
  { id: 'coolers', name: 'Check cooler and freezer doors', photo: true },
  { id: 'labels', name: 'Verify food labels and dates' },
  { id: 'floors', name: 'Sweep and mop kitchen floors', photo: true },
  { id: 'cash', name: 'Count and record opening cash' }
];

const TEMPERATURE_ITEMS = {
  'Grill Area': ['Hamburger patties', 'Chicken breast', 'Grilled fish', 'Hot holding'],
  'Chill Area': ['Walk-in cooler', 'Prep cooler', 'Dairy products', 'Prepared foods']
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

function safeName(value = 'file') {
  return String(value).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-|-$/g, '') || 'file';
}

function newDay(locationId) {
  return {
    locationId,
    tasks: BASE_TASKS.map(task => ({ ...task, section: 'Opening', done: false })),
    temps: [],
    complete: false
  };
}

async function readLocations() {
  const rows = await supabase('/rest/v1/locations?active=eq.true&select=id,name&order=id.asc');
  return rows.length ? rows : Array.from({ length: 13 }, (_, index) => ({
    id: `store-${String(index + 1).padStart(2, '0')}`,
    name: `Store ${index + 1}`
  }));
}

async function readUsers() {
  const rows = await supabase('/rest/v1/app_users?active=eq.true&select=id,email,name,role,location_id,location_ids&order=name.asc');
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locationId: row.location_id,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids : [row.location_id]
  }));
}

async function readDay(locationId, date) {
  const rows = await supabase(`/rest/v1/days?location_id=eq.${encodeURIComponent(locationId)}&date=eq.${encodeURIComponent(date)}&select=payload`);
  return rows[0]?.payload || newDay(locationId);
}

async function writeDay(locationId, date, day) {
  const payload = { ...day, locationId };
  await supabase('/rest/v1/days?on_conflict=location_id,date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ location_id: locationId, date, payload, updated_at: new Date().toISOString() })
  });
  return payload;
}

async function readHistory(locationId = null) {
  const filter = locationId ? `location_id=eq.${encodeURIComponent(locationId)}&` : '';
  const rows = await supabase(`/rest/v1/days?${filter}select=location_id,date,payload&order=date.desc`);
  return rows
    .filter(row => row.payload?.complete)
    .map(row => ({ locationId: row.location_id, date: row.date, day: row.payload }));
}

async function readOverdue(date) {
  const [locations, rows] = await Promise.all([
    readLocations(),
    supabase(`/rest/v1/days?date=eq.${encodeURIComponent(date)}&select=location_id,payload`)
  ]);
  const done = new Set(rows.filter(row => row.payload?.complete).map(row => row.location_id));
  return locations
    .filter(location => !done.has(location.id))
    .map(location => ({ locationId: location.id, locationName: location.name, status: 'Not completed' }));
}

async function saveUser(user) {
  const locationIds = (user.locationIds || [user.locationId || DEFAULT_LOCATION_ID]).filter(Boolean);
  const locationId = user.locationId || locationIds[0] || DEFAULT_LOCATION_ID;
  const id = user.id || safeName(user.email || user.name);
  await supabase('/rest/v1/app_users?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id,
      auth_user_id: user.authUserId || undefined,
      email: user.email || null,
      name: user.name,
      role: user.role || 'Employee',
      location_id: locationId,
      location_ids: locationIds.length ? locationIds : [locationId],
      active: true,
      updated_at: new Date().toISOString()
    })
  });
  return readUsers();
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
  await supabase('/rest/v1/locations?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: location.id,
      name: location.name,
      active: true,
      updated_at: new Date().toISOString()
    })
  });
  return readLocations();
}

async function sendInvite(payload) {
  const locationIds = (payload.locationIds || [payload.locationId]).filter(Boolean);
  const locationId = payload.locationId || locationIds[0] || DEFAULT_LOCATION_ID;
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
  if (payload.temporaryPassword) {
    return {
      id: authUser?.id || `password-${Date.now()}`,
      authUserId,
      email: payload.email,
      passwordCreated: true
    };
  }
  const inviteRows = await supabase('/rest/v1/invites', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      email: payload.email,
      name: payload.name,
      role: payload.role || 'Employee',
      location_id: locationId,
      location_ids: locationIds,
      invited_by: payload.invitedBy || null
    })
  });
  const redirectTo = `${SITE_URL}/?invite=${inviteRows[0].id}`;
  try {
    await supabase('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({
        email: payload.email,
        data: {
          invite_id: inviteRows[0].id,
          name: payload.name,
          role: payload.role || 'Employee',
          location_id: locationId,
          location_ids: locationIds
        },
        redirect_to: redirectTo
      })
    });
  } catch (error) {
    error.message = `User profile saved, but invite email failed: ${error.message}`;
    throw error;
  }
  return inviteRows[0];
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

function allowedRoles(profile) {
  if (isFullAccess(profile)) return ['Employee', 'Manager', 'Area Manager', 'Director of Operations', 'Owner'];
  if (profile?.role === 'Area Manager') return ['Employee', 'Manager', 'Area Manager'];
  if (profile?.role === 'Manager') return ['Employee', 'Manager'];
  return [];
}

async function currentProfile(event) {
  if (!AUTH_REQUIRED) return null;
  const authUser = await currentAuthUser(event);
  if (!authUser?.email) throw Object.assign(new Error('Not signed in'), { statusCode: 401 });
  const email = authUser.email.toLowerCase();
  const rows = await supabase(`/rest/v1/app_users?or=(auth_user_id.eq.${authUser.id},email.eq.${encodeURIComponent(email)})&active=eq.true&select=*`);
  if (!rows[0]) throw Object.assign(new Error('No active profile found for this login'), { statusCode: 403 });
  return rows[0];
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

async function acceptInvite(event) {
  const authUser = await currentAuthUser(event);
  if (!authUser?.email) throw Object.assign(new Error('Not signed in'), { statusCode: 401 });
  const email = authUser.email.toLowerCase();
  let profileRows = await supabase(`/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&select=*`);
  let profile = bestProfile(profileRows);

  if (profile) {
    if (!profile.auth_user_id) {
      await supabase(`/rest/v1/app_users?id=eq.${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ auth_user_id: authUser.id, accepted_at: new Date().toISOString() })
      });
      profileRows = await supabase(`/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&select=*`);
      profile = bestProfile(profileRows);
    }
    return appProfile(profile);
  }

  const inviteRows = await supabase(`/rest/v1/invites?email=eq.${encodeURIComponent(email)}&accepted_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc&limit=1`);
  if (inviteRows[0]) {
    const invite = inviteRows[0];
    await supabase(`/rest/v1/invites?id=eq.${invite.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        accepted_by: authUser.id,
        accepted_at: new Date().toISOString()
      })
    });
    await supabase('/rest/v1/app_users?on_conflict=email', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id: safeName(email),
        auth_user_id: authUser.id,
        email,
        name: invite.name,
        role: invite.role,
        location_id: invite.location_id,
        location_ids: invite.location_ids?.length ? invite.location_ids : [invite.location_id],
        active: true,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });
    profileRows = await supabase(`/rest/v1/app_users?email=eq.${encodeURIComponent(email)}&select=*`);
    profile = bestProfile(profileRows);
  }

  if (!profile) throw Object.assign(new Error('No invite found for this email'), { statusCode: 403 });
  return appProfile(profile);
}

async function readMaintenanceKey(key, fallback = []) {
  const rows = await supabase(`/rest/v1/maintenance_data?key=eq.${encodeURIComponent(key)}&select=payload`);
  if (rows[0]) return rows[0].payload;
  const seedPath = path.join(__dirname, '..', '..', 'data', 'maintenance_seed.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return seed[key] || fallback;
  }
  return fallback;
}

async function writeMaintenanceKey(key, payload) {
  await supabase('/rest/v1/maintenance_data?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, payload, updated_at: new Date().toISOString() })
  });
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
  let [workOrders, equipment, pmSchedule, vendors, locations, lists] = await Promise.all([
    readMaintenanceKey('workOrders', []),
    readMaintenanceKey('equipment', []),
    readMaintenanceKey('pmSchedule', []),
    readMaintenanceKey('vendors', []),
    readMaintenanceKey('locations', []),
    maintenanceLists()
  ]);
  if (locationId && locationId !== 'all') {
    workOrders = workOrders.filter(row => String(row['Location ID']) === String(locationId));
    equipment = equipment.filter(row => String(row['Location ID']) === String(locationId));
    pmSchedule = pmSchedule.filter(row => String(row['Location ID']) === String(locationId));
  }
  return { locations, equipment, workOrders, pmSchedule, vendors, lists };
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
    'Vendor ID': payload.vendorId,
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
    vendorId: 'Vendor ID',
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
  row['Total Cost'] = Number(row['Parts Cost'] || 0) + Number(row['Vendor Cost'] || 0);
  row['Last Updated'] = today();
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
    Status: payload.status || 'Due',
    'Instructions / Checklist': payload.instructions,
    'Manual Link': payload.manualLink,
    'Photo Link': payload.photoLink,
    'Auto Create Work Order?': payload.autoCreateWorkOrder || 'Yes',
    Notes: payload.notes
  };
  pmSchedule.push(item);
  await writeMaintenanceKey('pmSchedule', pmSchedule);
  return item;
}

async function saveAttachment(payload) {
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
        authEnabled: Boolean(SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
      });
    }

    if (method === 'POST' && apiPath === '/accept-invite') {
      return json(200, { profile: await acceptInvite(event), users: await readUsers() });
    }

    const actor = AUTH_REQUIRED ? await currentProfile(event) : null;

    if (method === 'GET' && apiPath === '/state') {
      const date = query.date;
      const locationId = query.locationId || DEFAULT_LOCATION_ID;
      const historyScope = query.historyScope || 'location';
      return json(200, {
        day: await readDay(locationId, date),
        history: await readHistory(historyScope === 'all' ? null : locationId),
        overdue: await readOverdue(date),
        temperatureItems: TEMPERATURE_ITEMS,
        users: await readUsers(),
        locations: await readLocations()
      });
    }

    if (method === 'GET' && apiPath === '/users') return json(200, { users: await readUsers() });
    if (method === 'GET' && apiPath === '/locations') return json(200, { locations: await readLocations() });
    if (method === 'GET' && apiPath === '/overdue') return json(200, { overdue: await readOverdue(query.date) });
    if (method === 'GET' && apiPath === '/maintenance/state') return json(200, await maintenanceState(query.locationId || 'all'));

    if (method === 'POST' && apiPath === '/day') {
      await writeDay(body.locationId || DEFAULT_LOCATION_ID, body.date, body.day);
      return json(200, {
        history: await readHistory(body.locationId || DEFAULT_LOCATION_ID),
        overdue: await readOverdue(body.date)
      });
    }

    if (method === 'POST' && apiPath === '/photo') return json(200, { url: await saveAttachment({ ...body, kind: body.taskId || 'checklist-photo', name: `${body.date}-${body.taskId}` }) });
    if (method === 'POST' && apiPath === '/user') {
      assertManageAccess(actor, body);
      return json(200, { users: await saveUser(body) });
    }
    if (method === 'POST' && apiPath === '/invite') {
      assertManageAccess(actor, body);
      return json(200, { invite: await sendInvite({ ...body, invitedBy: body.invitedBy || actor?.name }), users: await readUsers() });
    }
    if (method === 'POST' && apiPath === '/location') {
      if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director or Owner can edit store names'), { statusCode: 403 });
      return json(200, { locations: await saveLocation(body) });
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
    if (method === 'POST' && apiPath === '/maintenance/pm') {
      const pmTask = await writePmTask(body);
      return json(200, { pmTask, state: await maintenanceState('all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/attachment') return json(200, { url: await saveAttachment(body) });

    return json(404, { error: `Unknown route: ${method} ${apiPath}` });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Server error' });
  }
};
