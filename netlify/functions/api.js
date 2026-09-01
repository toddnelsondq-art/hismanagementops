const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const Busboy = require('busboy');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
const financialParser = require('../../app/financial-reports.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || SITE_URL;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'dailyops-uploads';
const RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'dqops-receipts';
const AUTH_REQUIRED = Boolean(process.env.SUPABASE_ANON_KEY);
const FULL_ACCESS_ROLES = ['Director of Operations', 'Owner'];
const APP_VERSION = '1.28.0';
const MAINTENANCE_ROLE = 'Maintenance Tech';
const UNIFI_API_KEY = process.env.UNIFI_API_KEY || '';
const UNIFI_CONSOLE_ID = process.env.UNIFI_CONSOLE_ID || '';
const DQOPS_GATEWAY_TOKEN = process.env.DQOPS_GATEWAY_TOKEN || '';
const DEFAULT_TENANT_ID = safeName(process.env.APP_TENANT_ID || 'his-management');
const DEFAULT_TENANT_NAME = process.env.APP_TENANT_NAME || 'HIS Management Group Inc';
const DEFAULT_TENANT_LOGO = process.env.APP_TENANT_LOGO || 'assets/his-management.png';
const ALERT_TIME_ZONE = process.env.ALERT_TIME_ZONE || 'America/Chicago';
const KIOSK_TOKEN_SECRET = process.env.KIOSK_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY || '';
const QR_CHECKPOINT_SECRET = process.env.QR_CHECKPOINT_SECRET || KIOSK_TOKEN_SECRET;
const KIOSK_SESSION_SECONDS = 8 * 60 * 60;
const tenantRequestContext = new AsyncLocalStorage();
const STORAGE_REFERENCE_PREFIX = 'dqops-storage://';
const STORAGE_SIGNED_URL_SECONDS = 6 * 60 * 60;

const FEATURE_CATALOG = [
  { key: 'daily_operations', name: 'Daily operations', description: 'Task lists, weekly cleaning, temperature logs, and history.' },
  { key: 'communications', name: 'Communications', description: 'Notices, calendar events, resources, and store documents.' },
  { key: 'food_safety_training', name: 'Food safety training', description: 'Employee and manager practice quizzes.' },
  { key: 'maintenance', name: 'Maintenance', description: 'Work orders, equipment, vendors, and planned maintenance.' },
  { key: 'fpc_repairs', name: 'FPC repairs', description: 'FPC inspections, repair lists, comments, and photos.' },
  { key: 'advanced_alerts', name: 'Advanced alerts', description: 'Custom email, text, app alerts, and tablet alarms.' },
  { key: 'inspections', name: 'Store inspections', description: 'Area-manager inspection forms, history, and score trends.' },
  { key: 'receipts', name: 'Receipt storage', description: 'Receipt upload, secure storage, and export.' },
  { key: 'advanced_reports', name: 'Advanced reports', description: 'Incident, compliance, maintenance, and scheduled reports.' },
  { key: 'smallwares', name: 'Smallwares', description: 'Smallwares requests and approval workflow.' },
  { key: 'rollouts', name: 'Location rollouts', description: 'Installer checklists and rollout progress tracking.' },
  { key: 'maintenance_work_logs', name: 'Maintenance work logs', description: 'Maintenance schedules, daily accomplishments, and hours.' }
];

const ADDON_CATALOG = [
  { key: 'thermostats', name: 'Thermostats', description: 'Venstar monitoring and remote control.' },
  { key: 'sensors', name: 'Temperature sensors', description: 'LoRaWAN equipment-temperature monitoring.' },
  { key: 'cameras', name: 'Camera package', description: 'UniFi camera viewing and location mappings.' }
];

const DEFAULT_PLAN_DEFINITIONS = {
  basic: {
    key: 'basic',
    name: 'Basic',
    description: 'Core daily operations for a single organization.',
    features: ['daily_operations', 'communications', 'food_safety_training'],
    limits: { locations: 5, users: 75, history_days: 90 }
  },
  advanced: {
    key: 'advanced',
    name: 'Advanced',
    description: 'The complete operations and management platform.',
    features: FEATURE_CATALOG.map(feature => feature.key),
    limits: { locations: 100, users: 2500, history_days: 730 }
  }
};

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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://localhost',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-DQOPS-Tenant',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
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

function verifyKioskToken(token, expectedType, expectedTenantId = tenantId()) {
  if (!token || !KIOSK_TOKEN_SECRET) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', KIOSK_TOKEN_SECRET).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if ((expectedType && payload.type !== expectedType) || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (expectedTenantId && payload.tenantId !== expectedTenantId) return null;
    return payload;
  } catch {
    return null;
  }
}

function signQrCheckpointToken(payload) {
  if (!QR_CHECKPOINT_SECRET) throw Object.assign(new Error('QR checkpoints are not configured'), { statusCode: 503 });
  const encoded = Buffer.from(JSON.stringify({ type: 'qr-checkpoint', ...payload })).toString('base64url');
  const signature = crypto.createHmac('sha256', QR_CHECKPOINT_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyQrCheckpointToken(token, expectedTenantId = tenantId()) {
  if (!token || !QR_CHECKPOINT_SECRET) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', QR_CHECKPOINT_SECRET).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.type !== 'qr-checkpoint' || !payload.checkpointId || payload.tenantId !== expectedTenantId) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(event) {
  return String(event?.headers?.authorization || event?.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
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

function storageObjectReference(bucket, pathname) {
  return `${STORAGE_REFERENCE_PREFIX}${safeName(bucket)}/${String(pathname || '').replace(/^\/+/, '')}`;
}

function parseStorageObject(value = '') {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.startsWith(STORAGE_REFERENCE_PREFIX)) {
    const remainder = text.slice(STORAGE_REFERENCE_PREFIX.length);
    const slash = remainder.indexOf('/');
    if (slash <= 0 || slash === remainder.length - 1) return null;
    return { bucket: remainder.slice(0, slash), pathname: remainder.slice(slash + 1) };
  }
  if (!SUPABASE_URL || !/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.origin !== new URL(SUPABASE_URL).origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/(?:render\/image\/)?object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), pathname: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function tenantStoragePath(payload = {}) {
  const locationId = safeName(payload.locationId || 'shared');
  const kind = safeName(payload.kind || 'attachment');
  const originalName = safeName(payload.name || 'file');
  const mimeExtension = safeName(String(payload.mimeType || '').split('/')[1] || 'bin');
  const fileName = originalName.includes('.') ? originalName : `${originalName}.${mimeExtension}`;
  return `v2/${tenantId()}/${locationId}/${kind}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;
}

function storageObjectAllowedForTenant(object) {
  const pathname = String(object?.pathname || '').replace(/^\/+/, '');
  if (!pathname) return false;
  if (pathname.startsWith('v2/')) return pathname.startsWith(`v2/${tenantId()}/`);
  // Objects created before tenant-safe paths belong to the original HIS tenant.
  return tenantId() === DEFAULT_TENANT_ID;
}

function dehydrateStorageReferences(value) {
  if (typeof value === 'string') {
    const object = parseStorageObject(value);
    return object ? storageObjectReference(object.bucket, object.pathname) : value;
  }
  if (Array.isArray(value)) return value.map(dehydrateStorageReferences);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, dehydrateStorageReferences(entry)]));
  }
  return value;
}

async function signedStorageObjectUrl(object) {
  if (!object?.bucket || !object.pathname) return '';
  if (![STORAGE_BUCKET, RECEIPTS_BUCKET].includes(object.bucket)) return '';
  if (!storageObjectAllowedForTenant(object)) return '';
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${object.bucket}/${object.pathname}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: STORAGE_SIGNED_URL_SECONDS })
  });
  if (!response.ok) return '';
  const result = await response.json();
  const signedPath = result.signedURL || result.signedUrl || '';
  if (!signedPath) return '';
  return /^https?:\/\//i.test(signedPath)
    ? signedPath
    : `${SUPABASE_URL}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
}

async function hydrateStorageReferences(value, cache = new Map()) {
  if (typeof value === 'string') {
    const object = parseStorageObject(value);
    if (!object) return value;
    const key = `${object.bucket}/${object.pathname}`;
    if (!cache.has(key)) cache.set(key, await signedStorageObjectUrl(object));
    return cache.get(key) || value;
  }
  if (Array.isArray(value)) return Promise.all(value.map(entry => hydrateStorageReferences(entry, cache)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await hydrateStorageReferences(entry, cache)]));
    return Object.fromEntries(entries);
  }
  return value;
}

function tenantId() {
  return tenantRequestContext.getStore()?.tenantId || DEFAULT_TENANT_ID;
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

function platformAdminEmails() {
  return String(process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

function isPlatformAdmin(actor) {
  const configuredEmails = platformAdminEmails();
  if (configuredEmails.length) return configuredEmails.includes(String(actor?.email || '').toLowerCase());
  // Safe bootstrap for the existing HIS workspace. Set PLATFORM_ADMIN_EMAILS before onboarding customers.
  return tenantId() === DEFAULT_TENANT_ID && isFullAccess(actor);
}

function normalizeFeatureMap(value = {}) {
  if (Array.isArray(value)) return Object.fromEntries(value.map(key => [key, true]));
  return Object.fromEntries(Object.entries(value || {}).map(([key, enabled]) => [key, Boolean(enabled)]));
}

function planFromRow(row = {}) {
  const fallback = DEFAULT_PLAN_DEFINITIONS[row.key] || DEFAULT_PLAN_DEFINITIONS.basic;
  return {
    key: row.key || fallback.key,
    name: row.name || fallback.name,
    description: row.description || fallback.description,
    features: normalizeFeatureMap(row.features || fallback.features),
    limits: { ...fallback.limits, ...(row.limits || {}) }
  };
}

function defaultSubscriptionFor(organizationId = tenantId()) {
  const preserveHisAccess = organizationId === DEFAULT_TENANT_ID;
  const plan = preserveHisAccess ? DEFAULT_PLAN_DEFINITIONS.advanced : DEFAULT_PLAN_DEFINITIONS.basic;
  return {
    tenantId: organizationId,
    planKey: plan.key,
    status: 'active',
    provider: 'manual',
    currentPeriodEnd: '',
    trialEndsAt: '',
    featuresOverride: {},
    limitsOverride: {},
    fallback: true,
    preserveHisAccess
  };
}

async function readSubscriptionPlans() {
  try {
    const rows = await supabase('/rest/v1/subscription_plans?active=eq.true&select=key,name,description,features,limits,sort_order&order=sort_order.asc');
    if (rows.length) return { plans: rows.map(planFromRow), migrationReady: true };
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) console.error('Subscription plans could not be read', error);
  }
  return { plans: Object.values(DEFAULT_PLAN_DEFINITIONS).map(planFromRow), migrationReady: false };
}

async function readTenantSubscription(organizationId = tenantId()) {
  const fallback = defaultSubscriptionFor(organizationId);
  try {
    const rows = await supabase(`/rest/v1/tenant_subscriptions?tenant_id=eq.${encodeURIComponent(organizationId)}&select=*`);
    const row = rows[0];
    if (!row) return fallback;
    return {
      tenantId: organizationId,
      planKey: row.plan_key || fallback.planKey,
      status: row.status || 'active',
      provider: row.provider || 'manual',
      providerCustomerId: row.provider_customer_id || '',
      providerSubscriptionId: row.provider_subscription_id || '',
      currentPeriodEnd: row.current_period_end || '',
      trialEndsAt: row.trial_ends_at || '',
      featuresOverride: normalizeFeatureMap(row.features_override),
      limitsOverride: row.limits_override || {},
      fallback: false,
      preserveHisAccess: false
    };
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) console.error('Tenant subscription could not be read', error);
    return fallback;
  }
}

async function readLocationAddons(organizationId = tenantId()) {
  try {
    const rows = await supabase(`/rest/v1/location_addons?tenant_id=eq.${encodeURIComponent(organizationId)}&select=location_id,addon_key,enabled,quantity,settings`);
    return rows.map(row => ({
      locationId: row.location_id,
      addonKey: row.addon_key,
      enabled: row.enabled !== false,
      quantity: Number(row.quantity || 1),
      settings: row.settings || {}
    }));
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) console.error('Location add-ons could not be read', error);
    if (organizationId === DEFAULT_TENANT_ID) {
      const locationRows = await supabase(`/rest/v1/locations?tenant_id=eq.${encodeURIComponent(organizationId)}&active=eq.true&select=id`).catch(() => []);
      return locationRows.flatMap(location => ADDON_CATALOG.map(addon => ({ locationId: location.id, addonKey: addon.key, enabled: true, quantity: 1, settings: {} })));
    }
    return [];
  }
}

async function effectiveSubscription(organizationId = tenantId()) {
  const [{ plans, migrationReady }, subscription, locationAddons] = await Promise.all([
    readSubscriptionPlans(),
    readTenantSubscription(organizationId),
    readLocationAddons(organizationId)
  ]);
  const plan = plans.find(entry => entry.key === subscription.planKey) || plans[0] || planFromRow(DEFAULT_PLAN_DEFINITIONS.basic);
  const features = { ...plan.features, ...subscription.featuresOverride };
  if (subscription.preserveHisAccess) FEATURE_CATALOG.forEach(feature => { features[feature.key] = true; });
  if (['suspended', 'canceled', 'expired'].includes(subscription.status)) {
    Object.keys(features).forEach(key => { features[key] = false; });
  }
  return {
    ...subscription,
    plan,
    plans,
    features,
    limits: { ...plan.limits, ...subscription.limitsOverride },
    locationAddons,
    migrationReady
  };
}

async function subscriptionAdminState(actor, requestedTenantId = '') {
  const platformAdmin = isPlatformAdmin(actor);
  const organizationId = platformAdmin && requestedTenantId ? safeName(requestedTenantId) : tenantId();
  if (!platformAdmin && organizationId !== tenantId()) throw Object.assign(new Error('You cannot view another organization'), { statusCode: 403 });
  const [entitlement, tenantRows, locationRows] = await Promise.all([
    effectiveSubscription(organizationId),
    platformAdmin
      ? supabase('/rest/v1/tenants?active=eq.true&select=id,name,app_name&order=name.asc').catch(() => [])
      : readTenantConfig().then(tenant => [tenant]),
    supabase(`/rest/v1/locations?tenant_id=eq.${encodeURIComponent(organizationId)}&active=eq.true&select=id,name&order=name.asc`).catch(() => [])
  ]);
  return {
    tenantId: organizationId,
    canView: Boolean(actor && (isFullAccess(actor) || platformAdmin)),
    canEdit: platformAdmin,
    platformAdmin,
    migrationReady: entitlement.migrationReady,
    subscription: {
      planKey: entitlement.planKey,
      planName: entitlement.plan.name,
      status: entitlement.status,
      provider: entitlement.provider,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      trialEndsAt: entitlement.trialEndsAt,
      features: entitlement.features,
      limits: entitlement.limits
    },
    plans: entitlement.plans,
    featureCatalog: FEATURE_CATALOG,
    addonCatalog: ADDON_CATALOG,
    locationAddons: entitlement.locationAddons,
    tenants: tenantRows,
    locations: locationRows
  };
}

async function saveSubscriptionAdmin(body = {}, actor) {
  if (!isPlatformAdmin(actor)) throw Object.assign(new Error('Only an Average Guys platform administrator can change subscriptions'), { statusCode: 403 });
  const organizationId = safeName(body.tenantId || tenantId());
  const { plans, migrationReady } = await readSubscriptionPlans();
  if (!migrationReady) throw Object.assign(new Error('Run supabase/add_subscription_entitlements.sql before saving subscription settings'), { statusCode: 409 });
  const planKey = String(body.planKey || 'basic');
  if (!plans.some(plan => plan.key === planKey)) throw Object.assign(new Error('Choose a valid subscription plan'), { statusCode: 400 });
  const allowedStatuses = ['trialing', 'active', 'past_due', 'suspended', 'canceled'];
  const status = allowedStatuses.includes(body.status) ? body.status : 'active';
  await supabase('/rest/v1/tenant_subscriptions?on_conflict=tenant_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      tenant_id: organizationId,
      plan_key: planKey,
      status,
      provider: 'manual',
      current_period_end: body.currentPeriodEnd || null,
      trial_ends_at: body.trialEndsAt || null,
      features_override: normalizeFeatureMap(body.featuresOverride),
      limits_override: body.limitsOverride || {},
      updated_by: actor?.email || actor?.name || '',
      updated_at: new Date().toISOString()
    })
  });

  await supabase(`/rest/v1/location_addons?tenant_id=eq.${encodeURIComponent(organizationId)}`, { method: 'DELETE' });
  const validLocationIds = new Set((await supabase(`/rest/v1/locations?tenant_id=eq.${encodeURIComponent(organizationId)}&select=id`)).map(location => location.id));
  const validAddonKeys = new Set(ADDON_CATALOG.map(addon => addon.key));
  const addons = (body.locationAddons || []).filter(addon => addon.enabled && validLocationIds.has(addon.locationId) && validAddonKeys.has(addon.addonKey));
  if (addons.length) {
    await supabase('/rest/v1/location_addons', {
      method: 'POST',
      body: JSON.stringify(addons.map(addon => ({
        tenant_id: organizationId,
        location_id: addon.locationId,
        addon_key: addon.addonKey,
        enabled: true,
        quantity: Math.max(1, Number(addon.quantity || 1)),
        settings: addon.settings || {},
        updated_by: actor?.email || actor?.name || '',
        updated_at: new Date().toISOString()
      })))
    });
  }
  return subscriptionAdminState(actor, organizationId);
}

async function readPlatformFeedback() {
  try {
    const rows = await supabase('/rest/v1/app_feedback?select=id,tenant_id,app_user_id,user_name,user_email,category,title,message,status,admin_notes,created_at,updated_at&order=created_at.desc&limit=500');
    return { migrationReady: true, feedback: rows || [] };
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) throw error;
    return { migrationReady: false, feedback: [] };
  }
}

async function platformAdminState(actor, requestedTenantId = '') {
  if (!isPlatformAdmin(actor)) throw Object.assign(new Error('Only an Average Guys platform administrator can open this area'), { statusCode: 403 });
  const tenants = await supabase('/rest/v1/tenants?select=id,name,app_name,active,created_at&order=name.asc');
  const requested = safeName(requestedTenantId || tenantId());
  const selectedTenant = tenants.find(entry => entry.id === requested) || tenants.find(entry => entry.id === tenantId()) || tenants[0];
  if (!selectedTenant) throw Object.assign(new Error('No organizations were found'), { statusCode: 404 });
  const [users, feedbackState] = await Promise.all([
    supabase(`/rest/v1/app_users?tenant_id=eq.${encodeURIComponent(selectedTenant.id)}&select=id,auth_user_id,email,phone,name,role,location_id,location_ids,active,updated_at&order=name.asc`),
    readPlatformFeedback()
  ]);
  return {
    platformAdmin: true,
    tenantId: selectedTenant.id,
    tenants,
    users,
    feedbackMigrationReady: feedbackState.migrationReady,
    feedback: feedbackState.feedback
  };
}

async function createPasswordRecoveryLink(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'recovery', email, redirect_to: `${APP_PUBLIC_URL.replace(/\/$/, '')}/` })
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw Object.assign(new Error(payload?.msg || payload?.message || 'A password reset link could not be created'), { statusCode: response.status });
  const link = payload.action_link || payload.properties?.action_link;
  if (!link) throw Object.assign(new Error('Supabase did not return a password reset link'), { statusCode: 502 });
  return link;
}

async function sendPlatformPasswordReset(body = {}, actor) {
  if (!isPlatformAdmin(actor)) throw Object.assign(new Error('Only an Average Guys platform administrator can send password resets'), { statusCode: 403 });
  const organizationId = safeName(body.tenantId || '');
  const userId = String(body.userId || '').trim();
  if (!organizationId || !userId) throw Object.assign(new Error('Choose an organization and user'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/app_users?tenant_id=eq.${encodeURIComponent(organizationId)}&id=eq.${encodeURIComponent(userId)}&active=eq.true&select=id,email,name,role&limit=1`);
  const target = rows[0];
  if (!target?.email) throw Object.assign(new Error('That user does not have an email login'), { statusCode: 400 });
  const actionLink = await createPasswordRecoveryLink(target.email);
  const delivery = await sendEmailMessage({
    to: target.email,
    subject: 'Reset your DQ OPS password',
    text: `Hello ${target.name || 'DQ OPS user'},\n\nAn Average Guys Business Services administrator received a request to reset your DQ OPS password. Use this secure, single-use link to choose a new password:\n\n${actionLink}\n\nIf you did not request help, you may ignore this message.\n\nAverage Guys Business Services`
  });
  if (!delivery.delivered) throw Object.assign(new Error(delivery.reason || 'The reset email provider did not accept the message'), { statusCode: 502 });
  return { ok: true, userId: target.id, email: target.email, delivered: true, provider: delivery.provider || 'email' };
}

async function saveAppFeedback(body = {}, actor) {
  if (!actor?.id) throw Object.assign(new Error('Sign in before sending feedback'), { statusCode: 401 });
  const category = ['Idea', 'Problem', 'Question', 'Other'].includes(body.category) ? body.category : 'Idea';
  const title = String(body.title || '').trim().slice(0, 140);
  const message = String(body.message || '').trim().slice(0, 5000);
  if (!title || !message) throw Object.assign(new Error('Add a short title and description'), { statusCode: 400 });
  let rows;
  try {
    rows = await supabase('/rest/v1/app_feedback?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_id: tenantId(),
        app_user_id: actor.id,
        user_name: actor.name || '',
        user_email: actor.email || '',
        category,
        title,
        message,
        status: 'New',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) throw Object.assign(new Error('Feedback storage is not set up yet. Run supabase/add_app_feedback.sql.'), { statusCode: 409 });
    throw error;
  }
  const feedback = rows?.[0];
  const feedbackEmail = String(process.env.PLATFORM_FEEDBACK_EMAIL || platformAdminEmails()[0] || '').trim();
  if (feedbackEmail) {
    sendEmailMessage({
      to: feedbackEmail,
      subject: `[DQ OPS feedback] ${category}: ${title}`,
      text: `${actor.name || actor.email || actor.id} from ${tenantId()} submitted feedback.\n\n${message}\n\nReview it in Platform Admin.`
    }).catch(error => console.error('Feedback email failed', error));
  }
  return { ok: true, feedback };
}

async function updateAppFeedback(body = {}, actor) {
  if (!isPlatformAdmin(actor)) throw Object.assign(new Error('Only an Average Guys platform administrator can update feedback'), { statusCode: 403 });
  const id = String(body.id || '').trim();
  const status = ['New', 'Reviewing', 'Planned', 'Completed', 'Declined'].includes(body.status) ? body.status : 'New';
  if (!id) throw Object.assign(new Error('Missing feedback item'), { statusCode: 400 });
  await supabase(`/rest/v1/app_feedback?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_notes: String(body.adminNotes || '').trim().slice(0, 2000), updated_at: new Date().toISOString() })
  });
  return readPlatformFeedback();
}

async function deleteAppFeedback(body = {}, actor) {
  if (!isPlatformAdmin(actor)) throw Object.assign(new Error('Only an Average Guys platform administrator can delete feedback'), { statusCode: 403 });
  const id = String(body.id || '').trim();
  if (!id) throw Object.assign(new Error('Missing feedback item'), { statusCode: 400 });
  await supabase(`/rest/v1/app_feedback?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  return readPlatformFeedback();
}

async function assertSubscribedFeature(actor, featureKey, locationId = '') {
  if (!AUTH_REQUIRED || !actor) return;
  const entitlement = await effectiveSubscription(tenantId());
  if (featureKey.startsWith('addon:')) {
    const addonKey = featureKey.slice(6);
    const enabled = entitlement.locationAddons.some(addon => addon.enabled && addon.addonKey === addonKey && (!locationId || addon.locationId === locationId));
    if (!enabled) throw Object.assign(new Error(`${ADDON_CATALOG.find(addon => addon.key === addonKey)?.name || 'This add-on'} is not enabled for this location`), { statusCode: 403 });
    return;
  }
  if (!entitlement.features[featureKey]) {
    const feature = FEATURE_CATALOG.find(entry => entry.key === featureKey);
    throw Object.assign(new Error(`${feature?.name || 'This feature'} is not included in this organization's subscription`), { statusCode: 403 });
  }
}

async function assertSubscriptionLimit(resource, existingId = '') {
  const entitlement = await effectiveSubscription(tenantId());
  const limit = Number(entitlement.limits?.[resource] || 0);
  if (!limit) return;
  const table = resource === 'locations' ? 'locations' : 'app_users';
  const idFilter = existingId ? `&id=eq.${encodeURIComponent(existingId)}` : '';
  if (existingId) {
    const existing = await supabase(`/rest/v1/${table}?${tenantQuery()}${idFilter}&select=id`);
    if (existing[0]) return;
  }
  const rows = await supabase(`/rest/v1/${table}?${tenantQuery()}&active=eq.true&select=id`);
  if (rows.length >= limit) {
    throw Object.assign(new Error(`This subscription allows ${limit} active ${resource}. Change the plan or limit before adding another.`), { statusCode: 403 });
  }
}

async function clientSubscriptionState(actor) {
  const entitlement = await effectiveSubscription(tenantId());
  const platformAdmin = isPlatformAdmin(actor);
  return {
    tenantId: tenantId(),
    canView: Boolean(actor && (isFullAccess(actor) || platformAdmin)),
    canEdit: platformAdmin,
    platformAdmin,
    migrationReady: entitlement.migrationReady,
    subscription: {
      planKey: entitlement.planKey,
      planName: entitlement.plan.name,
      status: entitlement.status,
      provider: entitlement.provider,
      currentPeriodEnd: entitlement.currentPeriodEnd,
      trialEndsAt: entitlement.trialEndsAt,
      features: entitlement.features,
      limits: entitlement.limits
    },
    featureCatalog: FEATURE_CATALOG,
    addonCatalog: ADDON_CATALOG,
    locationAddons: entitlement.locationAddons
  };
}

function requiredFeatureForPath(apiPath = '') {
  if (apiPath === '/day' || apiPath.startsWith('/task/') || apiPath.startsWith('/qr-checkpoints/') || apiPath === '/photo' || apiPath.startsWith('/temperature-')) return 'daily_operations';
  if (apiPath === '/notices' || apiPath.startsWith('/notice') || apiPath.startsWith('/calendar/') || apiPath.startsWith('/resources/') || apiPath.startsWith('/store-documents/')) return 'communications';
  if (apiPath.startsWith('/maintenance-log/')) return 'maintenance_work_logs';
  if (apiPath.startsWith('/maintenance/')) return 'maintenance';
  if (apiPath.startsWith('/fpc/')) return 'fpc_repairs';
  if (apiPath.startsWith('/receipts/')) return 'receipts';
  if (apiPath.startsWith('/inspections/')) return 'inspections';
  if (apiPath.startsWith('/management-reports/')) return 'advanced_reports';
  if (apiPath.startsWith('/financial-reports/')) return 'advanced_reports';
  if (apiPath.startsWith('/notification-preferences') || apiPath.startsWith('/pop-campaigns/')) return 'advanced_alerts';
  if (apiPath.startsWith('/alerts/') || apiPath.startsWith('/store-alarms/')) return 'advanced_alerts';
  if (apiPath.startsWith('/smallwares/')) return 'smallwares';
  if (apiPath.startsWith('/rollout/')) return 'rollouts';
  if (apiPath.startsWith('/location-health/thermostat')) return 'addon:thermostats';
  if (apiPath.startsWith('/location-health/camera')) return 'addon:cameras';
  return '';
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
      area: task.area || '',
      prepArea: task.prepArea || '',
      managerPrep: Boolean(task.managerPrep || task.prepArea),
      qrCheckpointId: task.qrCheckpointId || '',
      qrCheckpointName: task.qrCheckpointName || '',
      requiresQr: Boolean(task.qrCheckpointId),
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
  const [rows, maintenanceEligibleUserIds] = await Promise.all([
    supabase(`/rest/v1/app_users?${tenantQuery()}&active=eq.true&select=*&order=name.asc`),
    readMaintenanceKey('maintenanceEligibleUserIds', []).catch(() => [])
  ]);
  const maintenanceIds = new Set((maintenanceEligibleUserIds || []).map(String));
  return rows.map(row => ({
    id: row.id,
    email: row.email,
    phone: row.phone || row.mobile_phone || row.mobile || null,
    name: row.name,
    role: row.role,
    pinEnabled: Boolean(row.pin_hash),
    locationId: row.location_id,
    locationIds: Array.isArray(row.location_ids) ? row.location_ids : [row.location_id],
    maintenance: row.role === MAINTENANCE_ROLE || maintenanceIds.has(String(row.id))
  }));
}

function localHour(timeZone = ALERT_TIME_ZONE, date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
}

async function readDay(locationId, date) {
  const rows = await supabase(`/rest/v1/days?${tenantQuery()}&location_id=eq.${encodeURIComponent(locationId)}&date=eq.${encodeURIComponent(date)}&select=payload`);
  let templates = DEFAULT_TASK_TEMPLATES;
  try {
    templates = await readTaskTemplates();
  } catch {
    templates = DEFAULT_TASK_TEMPLATES;
  }
  if (rows[0]?.payload) return hydrateStorageReferences(reconcileDaySchedule(rows[0].payload, locationId, date, templates));
  return newDay(locationId, templates, date);
}

async function writeDay(locationId, date, day) {
  const payload = dehydrateStorageReferences({ ...day, locationId });
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
  const history = rows
    .filter(row => row.payload?.complete)
    .map(row => ({ locationId: row.location_id, date: row.date, day: row.payload }));
  return hydrateStorageReferences(history);
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

function dailyTemperatureAreas(definitions = TEMPERATURE_ITEMS) {
  const entries = Object.entries(definitions);
  const isNewFormat = entries.some(([, value]) => value?.areas);
  if (!isNewFormat) return definitions;
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

function tempRequirementCount(definitions = TEMPERATURE_ITEMS) {
  return Object.values(definitions).filter(list => list.requiredDaily !== false)
    .reduce((sum, list) => sum + Object.values(list.areas || {}).reduce((itemSum, items) => itemSum + items.length, 0), 0) * 2;
}

function qrCheckpointToken(checkpoint) {
  return signQrCheckpointToken({ tenantId: tenantId(), checkpointId: checkpoint.id });
}

function qrCheckpointClient(checkpoint, includeCode = false) {
  const result = {
    id: checkpoint.id,
    locationId: checkpoint.location_id,
    name: checkpoint.name,
    area: checkpoint.area || '',
    targetVisits: Number(checkpoint.target_visits || 0),
    active: checkpoint.active !== false,
    createdBy: checkpoint.created_by || '',
    createdAt: checkpoint.created_at || '',
    updatedAt: checkpoint.updated_at || ''
  };
  if (includeCode) {
    result.token = qrCheckpointToken(checkpoint);
    result.scanUrl = `${APP_PUBLIC_URL.replace(/\/$/, '')}/?checkpoint=${encodeURIComponent(result.token)}`;
  }
  return result;
}

async function qrCheckpointState(actor, query = {}) {
  const requestedLocationId = String(query.locationId || '').trim();
  if (requestedLocationId && requestedLocationId !== 'all' && AUTH_REQUIRED && !canAccessLocation(actor, requestedLocationId)) {
    throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  }
  const locationFilter = requestedLocationId && requestedLocationId !== 'all'
    ? `&location_id=eq.${encodeURIComponent(requestedLocationId)}`
    : '';
  try {
    const rows = await supabase(`/rest/v1/qr_checkpoints?${tenantQuery()}${locationFilter}&select=*&order=location_id.asc,name.asc`);
    const accessible = rows.filter(row => !AUTH_REQUIRED || canAccessLocation(actor, row.location_id));
    const mayManage = !AUTH_REQUIRED || canManage(actor);
    const scanDate = String(query.date || localDate());
    let scans = [];
    if (mayManage) {
      scans = await supabase(`/rest/v1/qr_checkpoint_scans?${tenantQuery()}${locationFilter}&scan_date=eq.${encodeURIComponent(scanDate)}&select=*&order=scanned_at.desc&limit=1000`);
    }
    return {
      migrationReady: true,
      canManage: mayManage,
      checkpoints: accessible.map(row => qrCheckpointClient(row, mayManage)),
      scans: scans.filter(row => !AUTH_REQUIRED || canAccessLocation(actor, row.location_id)).map(row => ({
        id: row.id,
        checkpointId: row.checkpoint_id,
        locationId: row.location_id,
        userId: row.app_user_id,
        userName: row.user_name,
        taskId: row.task_id || '',
        taskName: row.task_name || '',
        scanDate: row.scan_date,
        scannedAt: row.scanned_at
      }))
    };
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) return { migrationReady: false, canManage: !AUTH_REQUIRED || canManage(actor), checkpoints: [], scans: [] };
    throw error;
  }
}

async function saveQrCheckpoint(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can manage QR checkpoints'), { statusCode: 403 });
  const locationId = String(payload.locationId || '').trim();
  const name = String(payload.name || '').trim().slice(0, 120);
  if (!locationId || !name) throw Object.assign(new Error('Choose a location and enter a checkpoint name'), { statusCode: 400 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  const id = String(payload.id || '').trim();
  const row = withTenant({
    ...(id ? { id } : {}),
    location_id: locationId,
    name,
    area: String(payload.area || '').trim().slice(0, 120),
    target_visits: Math.min(100, Math.max(0, Number(payload.targetVisits || 0))),
    active: payload.active !== false,
    created_by: String(payload.createdBy || actor?.name || ''),
    updated_at: new Date().toISOString()
  });
  try {
    const rows = await supabase('/rest/v1/qr_checkpoints?on_conflict=tenant_id,id&select=*', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row)
    });
    return qrCheckpointClient(rows[0], true);
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) throw Object.assign(new Error('QR checkpoint storage is not set up yet. Run supabase/add_qr_checkpoints.sql.'), { statusCode: 409 });
    throw error;
  }
}

async function deactivateQrCheckpoint(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can manage QR checkpoints'), { statusCode: 403 });
  const rows = await supabase(`/rest/v1/qr_checkpoints?${tenantQuery()}&id=eq.${encodeURIComponent(payload.id || '')}&select=*`);
  const checkpoint = rows[0];
  if (!checkpoint) throw Object.assign(new Error('Checkpoint not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, checkpoint.location_id)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  await supabase(`/rest/v1/qr_checkpoints?${tenantQuery()}&id=eq.${encodeURIComponent(checkpoint.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
  });
  return { ok: true };
}

async function qrCheckpointSvg(query = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can print QR checkpoints'), { statusCode: 403 });
  const rows = await supabase(`/rest/v1/qr_checkpoints?${tenantQuery()}&id=eq.${encodeURIComponent(query.id || '')}&active=eq.true&select=*`);
  const checkpoint = rows[0];
  if (!checkpoint) throw Object.assign(new Error('Active checkpoint not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, checkpoint.location_id)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  const client = qrCheckpointClient(checkpoint, true);
  return { checkpoint: client, svg: await QRCode.toString(client.scanUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 720 }) };
}

async function scanQrCheckpoint(payload = {}, actor) {
  if (!actor?.id && AUTH_REQUIRED) throw Object.assign(new Error('Sign in or enter your employee PIN before scanning'), { statusCode: 401 });
  const tokenData = verifyQrCheckpointToken(payload.token);
  if (!tokenData) throw Object.assign(new Error('This QR checkpoint is not valid for this organization'), { statusCode: 400 });
  const rows = await supabase(`/rest/v1/qr_checkpoints?${tenantQuery()}&id=eq.${encodeURIComponent(tokenData.checkpointId)}&active=eq.true&select=*`);
  const checkpoint = rows[0];
  if (!checkpoint) throw Object.assign(new Error('This QR checkpoint is inactive or no longer exists'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, checkpoint.location_id)) throw Object.assign(new Error('This checkpoint belongs to a different location'), { statusCode: 403 });
  // Physical scans always belong to the server's current store day; clients cannot backdate proof of presence.
  const scanDate = localDate();
  let taskId = String(payload.taskId || '').trim();
  let task = null;
  let taskDay = null;
  if (!taskId) {
    taskDay = await readDay(checkpoint.location_id, scanDate);
    task = (taskDay.tasks || []).find(entry => !entry.done && String(entry.qrCheckpointId || '') === String(checkpoint.id));
    taskId = task?.id || '';
  }
  if (taskId) {
    taskDay ||= await readDay(checkpoint.location_id, scanDate);
    task ||= (taskDay.tasks || []).find(entry => String(entry.id) === taskId);
    if (!task) throw Object.assign(new Error('That task is not on today’s checklist'), { statusCode: 404 });
    if (String(task.qrCheckpointId || '') !== String(checkpoint.id)) throw Object.assign(new Error('This is not the checkpoint assigned to that task'), { statusCode: 403 });
    if (task.done) return { duplicate: true, taskComplete: true, checkpoint: qrCheckpointClient(checkpoint), task };
  }
  if (!task) {
    const duplicateSince = new Date(Date.now() - 60 * 1000).toISOString();
    const duplicateRows = await supabase(`/rest/v1/qr_checkpoint_scans?${tenantQuery()}&checkpoint_id=eq.${encodeURIComponent(checkpoint.id)}&app_user_id=eq.${encodeURIComponent(actor?.id || 'local-user')}&scanned_at=gte.${encodeURIComponent(duplicateSince)}&select=*&order=scanned_at.desc&limit=1`);
    if (duplicateRows[0]) return { duplicate: true, taskComplete: false, checkpoint: qrCheckpointClient(checkpoint), scan: duplicateRows[0] };
  }
  const inserted = await supabase('/rest/v1/qr_checkpoint_scans?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(withTenant({
      checkpoint_id: checkpoint.id,
      location_id: checkpoint.location_id,
      app_user_id: actor?.id || 'local-user',
      user_name: actor?.name || 'Store employee',
      task_id: task?.id || null,
      task_name: task?.name || null,
      scan_date: scanDate,
      scanned_at: new Date().toISOString()
    }))
  });
  const scan = inserted[0];
  if (task && taskDay) {
    task.done = true;
    task.completedBy = actor?.name || 'Store employee';
    task.completedById = actor?.id || '';
    task.completedAt = scan.scanned_at;
    task.qrScanEventId = scan.id;
    await writeDay(checkpoint.location_id, scanDate, taskDay);
  }
  const countRows = await supabase(`/rest/v1/qr_checkpoint_scans?${tenantQuery()}&checkpoint_id=eq.${encodeURIComponent(checkpoint.id)}&scan_date=eq.${encodeURIComponent(scanDate)}&select=id`);
  return { duplicate: false, taskComplete: Boolean(task), checkpoint: qrCheckpointClient(checkpoint), scan, countToday: countRows.length, day: taskDay };
}

async function assertQrTaskCompletions(savedDay = {}, submittedDay = {}) {
  const priorTasks = new Map((savedDay.tasks || []).map(task => [String(task.id), task]));
  const newlyCompleted = (submittedDay.tasks || []).filter(task => task.qrCheckpointId && task.done && !priorTasks.get(String(task.id))?.done);
  for (const task of newlyCompleted) {
    if (!task.qrScanEventId) throw Object.assign(new Error(`Scan the assigned QR checkpoint to complete “${task.name}”`), { statusCode: 403 });
    const scans = await supabase(`/rest/v1/qr_checkpoint_scans?${tenantQuery()}&id=eq.${encodeURIComponent(task.qrScanEventId)}&checkpoint_id=eq.${encodeURIComponent(task.qrCheckpointId)}&task_id=eq.${encodeURIComponent(task.id)}&select=id&limit=1`);
    if (!scans[0]) throw Object.assign(new Error(`A valid QR scan was not found for “${task.name}”`), { statusCode: 403 });
  }
}

function complianceDateRange(start, end) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
  const rangeEnd = valid(end) ? end : localDate();
  if (rangeEnd > localDate()) throw Object.assign(new Error('Temperature history cannot include future dates'), { statusCode: 400 });
  const fallbackStart = new Date(`${rangeEnd}T12:00:00Z`);
  fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 59);
  const rangeStart = valid(start) ? start : fallbackStart.toISOString().slice(0, 10);
  if (rangeStart > rangeEnd) throw Object.assign(new Error('The start date must be before the end date'), { statusCode: 400 });
  const dates = [];
  const cursor = new Date(`${rangeStart}T12:00:00Z`);
  const last = new Date(`${rangeEnd}T12:00:00Z`);
  while (cursor <= last && dates.length <= 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (cursor <= last) throw Object.assign(new Error('Temperature reports are limited to 367 days at a time'), { statusCode: 400 });
  return { start: rangeStart, end: rangeEnd, dates };
}

function scheduledTemperatureRequirements(definitions, locationId, date) {
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const requirements = [];
  Object.entries(definitions || {}).forEach(([listName, list]) => {
    const scheduledDays = list?.deliveryDaysByLocation?.[locationId];
    const scheduled = list?.requiredDaily !== false || (Array.isArray(scheduledDays) && scheduledDays.includes(weekday));
    if (!scheduled) return;
    Object.entries(list?.areas || {}).forEach(([area, items]) => {
      const sessions = list?.requiredDaily === false ? ['Any'] : ['Day', 'Afternoon'];
      items.forEach(item => sessions.forEach(session => requirements.push({
        key: `${listName}|${area}|${item}|${session}`,
        list: listName,
        area,
        item,
        session
      })));
    });
  });
  return requirements;
}

function temperatureComplianceEntry(location, date, payload, definitions) {
  const readings = Array.isArray(payload?.temps) ? payload.temps : [];
  const requirements = scheduledTemperatureRequirements(definitions, location.id, date);
  const logged = new Set(readings.flatMap(reading => [
    `${readingList(reading)}|${reading.area}|${reading.item}|${readingSession(reading)}`,
    `${readingList(reading)}|${reading.area}|${reading.item}|Any`
  ]));
  const completed = requirements.filter(requirement => logged.has(requirement.key));
  const closure = payload?.temperatureCompliance?.locationClosed ? payload.temperatureCompliance : null;
  let status = 'No temperatures recorded';
  let statusCode = 'none';
  if (closure) { status = 'Location closed'; statusCode = 'closed'; }
  else if (!requirements.length) { status = 'Not scheduled'; statusCode = 'not-scheduled'; }
  else if (completed.length === requirements.length) { status = 'Complete'; statusCode = 'complete'; }
  else if (readings.length) { status = 'Partial'; statusCode = 'partial'; }
  const listNames = [...new Set(requirements.map(requirement => requirement.list))];
  const logs = listNames.map(list => {
    const expected = requirements.filter(requirement => requirement.list === list);
    return { list, expected: expected.length, completed: expected.filter(requirement => logged.has(requirement.key)).length };
  });
  return {
    locationId: location.id,
    locationName: location.name,
    date,
    status,
    statusCode,
    expected: requirements.length,
    completed: completed.length,
    missing: Math.max(requirements.length - completed.length, 0),
    readings,
    logs,
    closedReason: closure?.reason || '',
    closedBy: closure?.markedBy || '',
    closedAt: closure?.markedAt || ''
  };
}

async function temperatureComplianceHistory(actor, query = {}) {
  const { start, end, dates } = complianceDateRange(query.start, query.end);
  const allLocations = await readLocations();
  const allowedIds = AUTH_REQUIRED && actor && !isFullAccess(actor) ? userLocationIds(actor) : allLocations.map(location => location.id);
  const requestedLocationId = String(query.locationId || allowedIds[0] || '');
  const selectedLocations = requestedLocationId === 'all'
    ? allLocations.filter(location => allowedIds.includes(location.id))
    : allLocations.filter(location => location.id === requestedLocationId && allowedIds.includes(location.id));
  if (!selectedLocations.length) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  const [rows, definitions] = await Promise.all([
    supabase(`/rest/v1/days?${tenantQuery()}&date=gte.${encodeURIComponent(start)}&date=lte.${encodeURIComponent(end)}&select=location_id,date,payload`),
    readTemperatureDefinitions()
  ]);
  const payloads = new Map(rows.map(row => [`${row.location_id}|${row.date}`, row.payload]));
  const entries = selectedLocations.flatMap(location => dates.map(date => temperatureComplianceEntry(location, date, payloads.get(`${location.id}|${date}`), definitions)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.locationName.localeCompare(b.locationName));
  const totals = entries.reduce((summary, entry) => {
    summary[entry.statusCode] = (summary[entry.statusCode] || 0) + 1;
    return summary;
  }, {});
  return { start, end, locationId: requestedLocationId, entries, totals, canMarkClosed: !AUTH_REQUIRED || canManage(actor) };
}

async function setTemperatureComplianceClosure(payload = {}, actor) {
  const locationId = String(payload.locationId || '');
  const date = String(payload.date || '');
  const closed = payload.closed === true;
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can mark a location closed'), { statusCode: 403 });
  if (!canAccessLocation(actor, locationId)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate()) throw Object.assign(new Error('Choose today or an earlier date'), { statusCode: 400 });
  const day = await readDay(locationId, date);
  if (closed && (day.temps || []).length) throw Object.assign(new Error('A day with recorded temperatures cannot be marked closed'), { statusCode: 400 });
  if (closed) {
    const reason = String(payload.reason || '').trim();
    if (!reason) throw Object.assign(new Error('Enter why the location was closed'), { statusCode: 400 });
    day.temperatureCompliance = { locationClosed: true, reason, markedBy: actor?.name || 'Manager', markedById: actor?.id || '', markedAt: new Date().toISOString() };
  } else {
    delete day.temperatureCompliance;
  }
  await writeDay(locationId, date, day);
  return temperatureComplianceHistory(actor, { ...payload, locationId: payload.reportLocationId || locationId });
}

function dailyOpsCounts(payload = null, templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID, date = today(), definitions = TEMPERATURE_ITEMS) {
  const source = payload || newDay(locationId, templates, date);
  const scheduledTemplates = templates.filter(task => task.active !== false && taskScheduledForDate(task, locationId, date));
  const tasks = Array.isArray(source.tasks) ? source.tasks : scheduledTemplates;
  const taskTotal = tasks.length;
  const taskDone = tasks.filter(task => task.done).length;
  const requiredTemps = new Set();
  Object.entries(definitions).filter(([, list]) => list.requiredDaily !== false).forEach(([listName, list]) => Object.entries(list.areas || {}).forEach(([area, items]) => {
    items.forEach(item => ['Day', 'Afternoon'].forEach(session => requiredTemps.add(`${listName}|${area}|${item}|${session}`)));
  }));
  const loggedTemps = new Set((source.temps || []).map(temp => `${readingList(temp)}|${temp.area}|${temp.item}|${temp.session || 'Day'}`));
  const tempDone = [...requiredTemps].filter(key => loggedTemps.has(key)).length;
  return {
    completed: taskDone + tempDone,
    total: taskTotal + tempRequirementCount(definitions)
  };
}

function dashboardPercent(completed, total) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function dailyOpsBreakdown(payload = null, templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID, date = today(), definitions = TEMPERATURE_ITEMS) {
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
  const tempRows = Object.entries(definitions).reduce((rows, [listName, list]) => {
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

function maintenanceLocationIdsForStoreIds(storeIds, maintenanceLocations, appLocations = []) {
  const selectedNames = new Set(appLocations
    .filter(location => storeIds.includes(location.id))
    .map(location => maintenanceLocationKey(location.name))
    .filter(Boolean));
  return maintenanceLocations
    .filter(location => selectedNames.has(maintenanceLocationKey(location['Location Name'])))
    .map(location => String(location['Location ID']));
}

function dateInRange(value, start, end) {
  if (!value) return false;
  const date = String(value).slice(0, 10);
  return date >= start && date <= end;
}

function financialPercentChange(current, prior) {
  const currentValue = Number(current || 0);
  const priorValue = Number(prior || 0);
  return priorValue > 0 ? Math.round(((currentValue - priorValue) / priorValue) * 1000) / 10 : null;
}

function financialDateRange(range = 'day', anchorDate = localDate()) {
  const safeAnchor = /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDate || '')) ? String(anchorDate) : localDate();
  const endDate = new Date(`${safeAnchor}T12:00:00Z`);
  const startDate = new Date(endDate);
  if (range === 'week') startDate.setUTCDate(endDate.getUTCDate() - endDate.getUTCDay());
  if (range === 'month') startDate.setUTCDate(1);
  return { start: startDate.toISOString().slice(0, 10), end: safeAnchor };
}

function financialEmptySummary(range, locationId, start, end, extra = {}) {
  return {
    allowed: true,
    migrationReady: true,
    range,
    locationId,
    start,
    end,
    reportCount: 0,
    locationCount: 0,
    totals: {
      netSales: 0,
      comparisonNetSales: 0,
      netSalesLy: 0,
      salesVsLyPercent: null,
      laborCost: 0,
      laborHours: 0,
      laborPercent: null,
      transactions: 0,
      comparisonTransactions: 0,
      transactionsLy: 0,
      transactionChangePercent: null,
      averageTicket: null,
      digitalSales: 0,
      cashOverShort: 0
    },
    byLocation: [],
    standouts: [],
    comparisonCoverage: { matchedReports: 0, totalReports: 0 },
    ...extra
  };
}

function financialAggregate(rows = []) {
  const totals = rows.reduce((summary, row) => {
    const netSales = Number(row.net_sales || 0);
    const netSalesLy = Number(row.net_sales_ly || 0);
    const transactions = Number(row.transaction_count || 0);
    const transactionsLy = Number(row.transaction_count_ly || 0);
    summary.netSales += netSales;
    summary.laborCost += Number(row.labor_cost || 0);
    summary.laborHours += Number(row.labor_hours || 0);
    summary.transactions += transactions;
    summary.digitalSales += Number(row.digital_sales || 0);
    summary.cashOverShort += Number(row.cash_over_short || 0);
    if (netSalesLy > 0) {
      summary.comparisonNetSales += netSales;
      summary.netSalesLy += netSalesLy;
      summary.matchedReports += 1;
    }
    if (transactionsLy > 0) {
      summary.comparisonTransactions += transactions;
      summary.transactionsLy += transactionsLy;
    }
    return summary;
  }, {
    netSales: 0,
    comparisonNetSales: 0,
    netSalesLy: 0,
    laborCost: 0,
    laborHours: 0,
    transactions: 0,
    comparisonTransactions: 0,
    transactionsLy: 0,
    digitalSales: 0,
    cashOverShort: 0,
    matchedReports: 0
  });
  Object.keys(totals).forEach(key => {
    if (typeof totals[key] === 'number' && key !== 'matchedReports') totals[key] = Math.round(totals[key] * 100) / 100;
  });
  return {
    ...totals,
    salesVsLyPercent: financialPercentChange(totals.comparisonNetSales, totals.netSalesLy),
    laborPercent: totals.netSales > 0 ? Math.round((totals.laborCost / totals.netSales) * 10000) / 10000 : null,
    transactionChangePercent: financialPercentChange(totals.comparisonTransactions, totals.transactionsLy),
    averageTicket: totals.transactions > 0 ? Math.round((totals.netSales / totals.transactions) * 100) / 100 : null
  };
}

async function financialSummary(actor, range = 'day', locationId = 'all') {
  const { start, end } = financialDateRange(range);
  if (AUTH_REQUIRED) {
    const entitlement = await effectiveSubscription(tenantId());
    if (!entitlement.features.advanced_reports) return { ...financialEmptySummary(range, locationId, start, end), allowed: false };
  }
  if (AUTH_REQUIRED && roleRank(actor?.role) < roleRank('Manager')) {
    return { ...financialEmptySummary(range, locationId, start, end), allowed: false };
  }
  const allLocations = await readLocations();
  const actorLocationIds = AUTH_REQUIRED && !isFullAccess(actor) ? userLocationIds(actor) : allLocations.map(location => location.id);
  const selectedLocationIds = locationId && locationId !== 'all'
    ? actorLocationIds.filter(id => id === locationId)
    : actorLocationIds;
  if (!selectedLocationIds.length) return financialEmptySummary(range, locationId, start, end);
  const queryStartDate = new Date(`${end}T12:00:00Z`);
  queryStartDate.setUTCDate(queryStartDate.getUTCDate() - 400);
  const queryStart = queryStartDate.toISOString().slice(0, 10);
  let rows;
  try {
    rows = await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&business_date=gte.${encodeURIComponent(queryStart)}&business_date=lte.${encodeURIComponent(end)}&select=*`);
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) {
      return financialEmptySummary(range, locationId, start, end, {
        migrationReady: false,
        message: 'Run supabase/add_financial_reports.sql in Supabase before importing reports.'
      });
    }
    throw error;
  }
  const available = rows.filter(row => selectedLocationIds.includes(row.location_id));
  if (!available.length) return financialEmptySummary(range, locationId, start, end);
  const latestDate = available.reduce((latest, row) => String(row.business_date) > latest ? String(row.business_date) : latest, '');
  const anchoredRange = financialDateRange(range, latestDate);
  const selected = available.filter(row => dateInRange(row.business_date, anchoredRange.start, anchoredRange.end));
  const locationNames = new Map(allLocations.map(location => [location.id, location.name]));
  const totals = financialAggregate(selected);
  const grouped = selected.reduce((groups, row) => {
    groups[row.location_id] ??= [];
    groups[row.location_id].push(row);
    return groups;
  }, {});
  const byLocation = Object.entries(grouped).map(([scopedLocationId, locationRows]) => ({
    locationId: scopedLocationId,
    locationName: locationNames.get(scopedLocationId) || locationRows[0]?.source_store_name || scopedLocationId,
    reportCount: locationRows.length,
    ...financialAggregate(locationRows)
  })).sort((a, b) => a.locationName.localeCompare(b.locationName));
  const standouts = byLocation.flatMap(location => {
    const items = [];
    if (location.salesVsLyPercent !== null && location.salesVsLyPercent <= -5) items.push({ type: 'sales', severity: 'attention', locationId: location.locationId, locationName: location.locationName, message: `Sales are ${Math.abs(location.salesVsLyPercent).toFixed(1)}% below last year` });
    if (location.laborPercent !== null && location.laborPercent >= 0.25) items.push({ type: 'labor', severity: 'attention', locationId: location.locationId, locationName: location.locationName, message: `Labor is ${(location.laborPercent * 100).toFixed(1)}%` });
    if (location.transactionChangePercent !== null && location.transactionChangePercent <= -10) items.push({ type: 'transactions', severity: 'review', locationId: location.locationId, locationName: location.locationName, message: `Transactions are ${Math.abs(location.transactionChangePercent).toFixed(1)}% below last year` });
    return items;
  });
  return {
    allowed: true,
    migrationReady: true,
    range,
    locationId,
    start: anchoredRange.start,
    end: anchoredRange.end,
    latestBusinessDate: latestDate,
    reportCount: selected.length,
    locationCount: byLocation.length,
    totals,
    byLocation,
    standouts,
    comparisonCoverage: { matchedReports: totals.matchedReports, totalReports: selected.length }
  };
}

function cleanFinancialNumber(value, { integer = false, percent = false, required = false } = {}) {
  if ((value === null || value === undefined || value === '') && !required) return null;
  let number = Number(value);
  if (!Number.isFinite(number)) throw Object.assign(new Error('The financial workbook contains an invalid number'), { statusCode: 400 });
  if (percent && number > 1 && number <= 100) number /= 100;
  return integer ? Math.round(number) : Math.round(number * 100000) / 100000;
}

function uniqueFinancialImportRows(rows = [], limit = 20) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const sourceIdentity = row.source_hash || row.source_filename || row.id;
    const key = `${row.report_date || ''}|${sourceIdentity || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

async function recentFinancialImports(actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) return [];
  try {
    const rows = await supabase(`/rest/v1/financial_report_imports?${tenantQuery()}&select=*&order=created_at.desc&limit=100`);
    return uniqueFinancialImportRows(rows).map(row => ({
      id: row.id,
      reportDate: row.report_date,
      comparisonDate: row.comparison_date,
      sourceFilename: row.source_filename,
      locationCount: row.location_count,
      importedBy: row.imported_by,
      createdAt: row.created_at
    }));
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) return [];
    throw error;
  }
}

function normalizeFinancialStoreMapping(value) {
  if (typeof value === 'string') return { locationId: value, sourceStoreName: '' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { locationId: '', sourceStoreName: '' };
  return { locationId: String(value.locationId || ''), sourceStoreName: String(value.sourceStoreName || '').slice(0, 160) };
}

async function readFinancialStoreMappings(allLocations = null) {
  const locations = allLocations || await readLocations();
  const locationIds = new Set(locations.map(location => location.id));
  const mappings = {};
  try {
    const rows = await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&source_store_code=not.is.null&select=source_store_code,source_store_name,location_id,business_date&order=business_date.desc&limit=500`);
    for (const row of rows) {
      const code = String(row.source_store_code || '').trim();
      if (code && !mappings[code] && locationIds.has(row.location_id)) {
        mappings[code] = { locationId: row.location_id, sourceStoreName: String(row.source_store_name || '') };
      }
    }
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) throw error;
  }
  // A store number written into a DQ OPS location name is stronger than an old guessed import.
  for (const location of locations) {
    for (const code of String(location.name || '').match(/\b\d{4,6}\b/g) || []) {
      mappings[code] = { locationId: location.id, sourceStoreName: location.name };
    }
  }
  const stored = await readMaintenanceKey('financialStoreMappings', {}).catch(() => ({}));
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [code, value] of Object.entries(stored)) {
      const normalized = normalizeFinancialStoreMapping(value);
      if (/^[a-z0-9-]{1,40}$/i.test(code) && locationIds.has(normalized.locationId)) mappings[code] = normalized;
    }
  }
  return mappings;
}

async function rememberFinancialStoreMappings(rows = [], actor = null) {
  const locations = await readLocations();
  const locationIds = new Set(locations.map(location => location.id));
  const stored = await readMaintenanceKey('financialStoreMappings', {}).catch(() => ({}));
  const mappings = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
  let changed = false;
  for (const row of rows) {
    const code = String(row.sourceStoreCode || row.source_store_code || '').trim();
    const locationId = String(row.locationId || row.location_id || '');
    if (!/^[a-z0-9-]{1,40}$/i.test(code) || !locationIds.has(locationId)) continue;
    mappings[code] = {
      locationId,
      sourceStoreName: String(row.sourceStoreName || row.source_store_name || row.sourceStoreLabel || '').slice(0, 160),
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.name || actor?.email || 'Automatic import'
    };
    changed = true;
  }
  if (changed) await writeMaintenanceKey('financialStoreMappings', mappings);
  return mappings;
}

async function saveFinancialStoreMapping(payload = {}, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Directors and Owners can change financial store mappings'), { statusCode: 403 });
  const sourceStoreCode = String(payload.sourceStoreCode || '').trim();
  const locationId = String(payload.locationId || '');
  if (!/^\d{4,6}$/.test(sourceStoreCode)) throw Object.assign(new Error('Enter the 4- to 6-digit store number from the report'), { statusCode: 400 });
  const locations = await readLocations();
  if (!locations.some(location => location.id === locationId)) throw Object.assign(new Error('Choose a valid DQ OPS location'), { statusCode: 400 });
  await rememberFinancialStoreMappings([{ sourceStoreCode, sourceStoreName: payload.sourceStoreName || '', locationId }], actor);
  return { mappings: await readFinancialStoreMappings(locations), state: await financialReportState(actor, { range: 'day', locationId: 'all' }) };
}

async function recentFinancialReportRows(actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) return [];
  try {
    const rows = await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&select=location_id,business_date,source_store_code,source_store_name,net_sales,labor_percent,source_filename,imported_at&order=business_date.desc,location_id.asc&limit=250`);
    const names = new Map((await readLocations()).map(location => [location.id, location.name]));
    return rows.map(row => ({
      locationId: row.location_id,
      locationName: names.get(row.location_id) || row.location_id,
      businessDate: row.business_date,
      sourceStoreCode: row.source_store_code || '',
      sourceStoreName: row.source_store_name || '',
      netSales: row.net_sales,
      laborPercent: row.labor_percent,
      sourceFilename: row.source_filename || '',
      importedAt: row.imported_at || ''
    }));
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) return [];
    throw error;
  }
}

async function readFinancialEmailImports() {
  const value = await readMaintenanceKey('financialEmailImports', []).catch(() => []);
  return Array.isArray(value) ? value.slice(0, 50) : [];
}

async function writeFinancialEmailImport(entry) {
  const entries = await readFinancialEmailImports();
  entries.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry });
  await writeMaintenanceKey('financialEmailImports', entries.slice(0, 50));
}

async function financialReportState(actor, query = {}) {
  const summary = await financialSummary(actor, query.range || 'day', query.locationId || 'all');
  const canImport = !AUTH_REQUIRED || isFullAccess(actor);
  const [imports, mappings, reports, emailImports] = await Promise.all([
    recentFinancialImports(actor),
    canImport ? readFinancialStoreMappings() : Promise.resolve({}),
    canImport ? recentFinancialReportRows(actor) : Promise.resolve([]),
    canImport ? readFinancialEmailImports() : Promise.resolve([])
  ]);
  return {
    ...summary,
    canImport,
    imports,
    mappings,
    reports,
    emailImports: emailImports.map(entry => ({ ...entry, rows: undefined })),
    emailAutomation: canImport ? {
      configured: Boolean(process.env.MAILGUN_WEBHOOK_SIGNING_KEY && process.env.FINANCIAL_REPORT_ALLOWED_SENDERS && process.env.FINANCIAL_REPORT_INBOUND_ADDRESS),
      inboundAddress: process.env.FINANCIAL_REPORT_INBOUND_ADDRESS || ''
    } : { configured: false, inboundAddress: '' }
  };
}

async function importFinancialReports(payload = {}, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Directors and Owners can import company financial reports'), { statusCode: 403 });
  const sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!sourceRows.length || sourceRows.length > 100) throw Object.assign(new Error('The import must contain between 1 and 100 store reports'), { statusCode: 400 });
  const allLocations = await readLocations();
  const locationIds = new Set(allLocations.map(location => location.id));
  const seen = new Set();
  let importId = crypto.randomUUID();
  const importedAt = new Date().toISOString();
  const sourceFilename = String(payload.sourceFilename || 'Financial recap.xlsx').slice(0, 200);
  const sourceHash = String(payload.sourceHash || '').slice(0, 128);
  const reportRows = sourceRows.map((row, index) => {
    const rowNumber = index + 1;
    const locationId = String(row.locationId || '');
    const businessDate = String(row.businessDate || '');
    if (!locationIds.has(locationId)) throw Object.assign(new Error(`Import row ${rowNumber}: Choose a valid DQ OPS location`), { statusCode: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw Object.assign(new Error(`Import row ${rowNumber}: A valid report date is required`), { statusCode: 400 });
    const key = `${locationId}|${businessDate}`;
    if (seen.has(key)) throw Object.assign(new Error(`Import row ${rowNumber}: That location and date appear more than once`), { statusCode: 400 });
    seen.add(key);
    const netSales = cleanFinancialNumber(row.netSales, { required: true });
    return withTenant({
      location_id: locationId,
      business_date: businessDate,
      comparison_date: /^\d{4}-\d{2}-\d{2}$/.test(String(row.comparisonDate || '')) ? row.comparisonDate : null,
      source_store_code: String(row.sourceStoreCode || '').slice(0, 40),
      source_store_name: String(row.sourceStoreName || row.sourceStoreLabel || '').slice(0, 160),
      gross_sales: cleanFinancialNumber(row.grossSales),
      total_discounts: cleanFinancialNumber(row.totalDiscounts),
      net_sales: netSales,
      net_sales_ly: cleanFinancialNumber(row.netSalesLy),
      transaction_count: cleanFinancialNumber(row.transactionCount, { integer: true }),
      transaction_count_ly: cleanFinancialNumber(row.transactionCountLy, { integer: true }),
      average_ticket: cleanFinancialNumber(row.averageTicket),
      labor_hours: cleanFinancialNumber(row.laborHours),
      labor_cost: cleanFinancialNumber(row.laborCost),
      labor_percent: cleanFinancialNumber(row.laborPercent, { percent: true }),
      sales_per_labor_hour: cleanFinancialNumber(row.salesPerLaborHour),
      average_hourly_wage: cleanFinancialNumber(row.averageHourlyWage),
      digital_sales: cleanFinancialNumber(row.digitalSales),
      cash_over_short: cleanFinancialNumber(row.cashOverShort),
      cancel_count: cleanFinancialNumber(row.cancelCount, { integer: true }),
      void_count: cleanFinancialNumber(row.voidCount, { integer: true }),
      source_filename: sourceFilename,
      source_hash: sourceHash,
      import_id: importId,
      imported_by: actor?.name || actor?.email || 'Director',
      imported_at: importedAt,
      raw_metrics: { sourceSection: row.sectionNumber || rowNumber }
    });
  });
  const reportDates = [...new Set(reportRows.map(row => row.business_date))];
  if (reportDates.length !== 1) throw Object.assign(new Error('Each workbook import must contain one current report date'), { statusCode: 400 });
  let replacedExisting = false;
  try {
    const sourceFilter = sourceHash
      ? `source_hash=eq.${encodeURIComponent(sourceHash)}`
      : `source_filename=eq.${encodeURIComponent(sourceFilename)}`;
    const existingImports = await supabase(`/rest/v1/financial_report_imports?${tenantQuery()}&report_date=eq.${encodeURIComponent(reportDates[0])}&${sourceFilter}&select=id&order=created_at.asc&limit=1`);
    const auditPayload = withTenant({
      report_date: reportDates[0],
      comparison_date: reportRows.find(row => row.comparison_date)?.comparison_date || null,
      source_filename: sourceFilename,
      source_hash: sourceHash,
      location_count: reportRows.length,
      imported_by: actor?.name || actor?.email || 'Director',
      imported_by_id: actor?.id || '',
      created_at: importedAt
    });
    if (existingImports[0]?.id) {
      importId = existingImports[0].id;
      replacedExisting = true;
      reportRows.forEach(row => { row.import_id = importId; });
      await supabase(`/rest/v1/financial_report_imports?${tenantQuery()}&id=eq.${encodeURIComponent(importId)}`, {
        method: 'PATCH',
        body: JSON.stringify(auditPayload)
      });
    } else {
      await supabase('/rest/v1/financial_report_imports', {
        method: 'POST',
        body: JSON.stringify({ ...auditPayload, id: importId })
      });
    }
    await supabase('/rest/v1/financial_daily_metrics?on_conflict=tenant_id,location_id,business_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(reportRows)
    });
    await rememberFinancialStoreMappings(sourceRows, actor);
  } catch (error) {
    if ([400, 404].includes(error.statusCode)) {
      throw Object.assign(new Error('Financial reporting is not set up in Supabase yet. Run supabase/add_financial_reports.sql and try again.'), { statusCode: 409 });
    }
    throw error;
  }
  return { imported: reportRows.length, reportDate: reportDates[0], replacedExisting, state: await financialReportState(actor, { range: 'day', locationId: 'all' }) };
}

async function reassignFinancialReport(payload = {}, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Directors and Owners can correct financial reports'), { statusCode: 403 });
  const fromLocationId = String(payload.fromLocationId || '');
  const toLocationId = String(payload.toLocationId || '');
  const businessDate = String(payload.businessDate || '');
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) throw Object.assign(new Error('Choose a different destination location'), { statusCode: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw Object.assign(new Error('Choose a valid report date'), { statusCode: 400 });
  const locations = await readLocations();
  if (!locations.some(location => location.id === toLocationId)) throw Object.assign(new Error('Choose a valid destination location'), { statusCode: 400 });
  const sourceRows = await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&location_id=eq.${encodeURIComponent(fromLocationId)}&business_date=eq.${encodeURIComponent(businessDate)}&select=*&limit=1`);
  const source = sourceRows[0];
  if (!source) throw Object.assign(new Error('That source report no longer exists'), { statusCode: 404 });
  const targetRows = await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&location_id=eq.${encodeURIComponent(toLocationId)}&business_date=eq.${encodeURIComponent(businessDate)}&select=location_id&limit=1`);
  if (targetRows.length && payload.replaceTarget !== true) {
    throw Object.assign(new Error('The destination already has sales for that date. Confirm that you want to replace it.'), { statusCode: 409, code: 'FINANCIAL_TARGET_EXISTS' });
  }
  const corrected = {
    ...source,
    tenant_id: tenantId(),
    location_id: toLocationId,
    imported_by: actor?.name || actor?.email || 'Director',
    imported_at: new Date().toISOString()
  };
  await supabase('/rest/v1/financial_daily_metrics?on_conflict=tenant_id,location_id,business_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(corrected)
  });
  await supabase(`/rest/v1/financial_daily_metrics?${tenantQuery()}&location_id=eq.${encodeURIComponent(fromLocationId)}&business_date=eq.${encodeURIComponent(businessDate)}`, { method: 'DELETE' });
  await rememberFinancialStoreMappings([corrected], actor);
  return { moved: true, businessDate, state: await financialReportState(actor, { range: 'day', locationId: 'all' }) };
}

function parseMultipartForm(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
    if (!/^multipart\/form-data/i.test(contentType)) return reject(Object.assign(new Error('Expected a multipart email request'), { statusCode: 400 }));
    const fields = {};
    const files = [];
    let parser;
    try {
      parser = Busboy({ headers: { 'content-type': contentType }, limits: { files: 12, fileSize: 4 * 1024 * 1024, fields: 80 } });
    } catch (error) {
      return reject(Object.assign(error, { statusCode: 400 }));
    }
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => reject(Object.assign(new Error(`${info.filename || 'Attachment'} exceeds the 4 MB email import limit`), { statusCode: 413 })));
      stream.on('end', () => files.push({ fieldName: name, filename: info.filename || name, mimeType: info.mimeType || '', buffer: Buffer.concat(chunks) }));
    });
    parser.on('error', reject);
    parser.on('finish', () => resolve({ fields, files }));
    parser.end(Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8'));
  });
}

function mailgunSenderAddress(value = '') {
  const angle = String(value).match(/<([^>]+)>/);
  return String(angle?.[1] || value).trim().toLowerCase();
}

function verifyMailgunRequest(fields = {}) {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '';
  if (!signingKey) throw Object.assign(new Error('Financial email intake is not configured'), { statusCode: 503 });
  const timestamp = String(fields.timestamp || '');
  const token = String(fields.token || '');
  const suppliedHex = String(fields.signature || '').toLowerCase();
  if (!timestamp || !token || !/^[a-f0-9]{64}$/.test(suppliedHex)) throw Object.assign(new Error('Mailgun signature is missing'), { statusCode: 406 });
  const expected = crypto.createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  const timestampAge = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected) || !Number.isFinite(timestampAge) || timestampAge > 24 * 60 * 60) {
    throw Object.assign(new Error('Mailgun signature could not be verified'), { statusCode: 406 });
  }
  const sender = mailgunSenderAddress(fields.sender || fields.from || '');
  const allowed = String(process.env.FINANCIAL_REPORT_ALLOWED_SENDERS || '').split(',').map(mailgunSenderAddress).filter(Boolean);
  if (!allowed.length) throw Object.assign(new Error('No financial report senders are configured'), { statusCode: 503 });
  if (!allowed.includes(sender)) throw Object.assign(new Error('This sender is not approved for financial report imports'), { statusCode: 406 });
  return sender;
}

function parseFinancialAttachment(file) {
  const extension = path.extname(file.filename || '').toLowerCase();
  if (['.html', '.htm'].includes(extension) || /text\/html/i.test(file.mimeType)) {
    return financialParser.parseFinancialHtml(file.buffer.toString('utf8'));
  }
  if (['.xlsx', '.xls'].includes(extension) || /spreadsheet|excel/i.test(file.mimeType)) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) throw new Error('The workbook does not contain a worksheet');
    return financialParser.parseWorkbookRows(XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true }));
  }
  return null;
}

function financialRowsReady(rows = []) {
  const locationIds = rows.map(row => row.locationId).filter(Boolean);
  return rows.length > 0 && rows.every(row => row.locationId && !(row.errors || []).length) && new Set(locationIds).size === locationIds.length;
}

async function receiveFinancialReportEmail(event) {
  requireSupabase();
  const entitlement = await effectiveSubscription(tenantId());
  if (!entitlement.features.advanced_reports) throw Object.assign(new Error('Financial reports are not enabled for this subscription'), { statusCode: 406 });
  const { fields, files } = await parseMultipartForm(event);
  const sender = verifyMailgunRequest(fields);
  const subject = String(fields.subject || 'Daily financial report').slice(0, 200);
  const locations = await readLocations();
  const mappings = await readFinancialStoreMappings(locations);
  const automatedActor = { id: 'financial-email', name: 'Automatic financial report email', email: sender, role: 'Owner' };
  let importedFiles = 0;
  let reviewFiles = 0;
  for (const file of files) {
    let parsed;
    try {
      parsed = parseFinancialAttachment(file);
      if (!parsed) continue;
      const rows = financialParser.autoMapLocations(parsed.reports, locations, mappings);
      const sourceHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
      if (!financialRowsReady(rows)) {
        reviewFiles += 1;
        await writeFinancialEmailImport({ status: 'needs_review', sender, subject, sourceFilename: file.filename, sourceHash, reportDate: rows[0]?.businessDate || '', reportCount: rows.length, message: parsed.errors?.join(' · ') || 'One or more report stores need a saved DQ OPS location mapping.', rows });
        continue;
      }
      const result = await importFinancialReports({ sourceFilename: file.filename, sourceHash, rows }, automatedActor);
      importedFiles += 1;
      await writeFinancialEmailImport({ status: 'imported', sender, subject, sourceFilename: file.filename, sourceHash, reportDate: result.reportDate, reportCount: result.imported, message: `${result.imported} location reports imported automatically.` });
    } catch (error) {
      reviewFiles += 1;
      await writeFinancialEmailImport({ status: 'failed', sender, subject, sourceFilename: file.filename, reportDate: '', reportCount: 0, message: error.message });
    }
  }
  if (!importedFiles && !reviewFiles) await writeFinancialEmailImport({ status: 'failed', sender, subject, sourceFilename: '', reportDate: '', reportCount: 0, message: 'No supported .xlsx, .xls, .html, or .htm attachment was found.' });
  return json(200, { accepted: true, importedFiles, reviewFiles });
}

async function retryFinancialEmailImport(payload = {}, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Directors and Owners can retry financial imports'), { statusCode: 403 });
  const entries = await readFinancialEmailImports();
  const index = entries.findIndex(entry => entry.id === String(payload.id || ''));
  if (index < 0 || !Array.isArray(entries[index].rows) || !entries[index].rows.length) throw Object.assign(new Error('That pending email import is no longer available'), { statusCode: 404 });
  const locations = await readLocations();
  const mappings = await readFinancialStoreMappings(locations);
  const rows = financialParser.autoMapLocations(entries[index].rows, locations, mappings);
  if (!financialRowsReady(rows)) throw Object.assign(new Error('Save a location mapping for every report store before retrying'), { statusCode: 400 });
  const result = await importFinancialReports({ sourceFilename: entries[index].sourceFilename, sourceHash: entries[index].sourceHash, rows }, actor);
  entries[index] = { ...entries[index], status: 'imported', rows: undefined, reportDate: result.reportDate, reportCount: result.imported, message: `${result.imported} location reports imported after review.`, completedAt: new Date().toISOString() };
  await writeMaintenanceKey('financialEmailImports', entries.slice(0, 50));
  return { imported: result.imported, reportDate: result.reportDate, state: await financialReportState(actor, { range: 'day', locationId: 'all' }) };
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
      taskLists: { completed: 0, remaining: 0, total: 0, percent: 0 },
      weeklyCleaning: { completed: 0, remaining: 0, total: 0, percent: 0 },
      tempLogs: { completed: 0, remaining: 0, total: 0, percent: 0 },
      maintenance: { completed: 0, open: 0, total: 0, percent: 0 },
      fpc: { completed: 0, open: 0, total: 0, percent: 0 },
      financials: await financialSummary(actor, range, locationId),
      progress: { mode: 'locations', rows: [] }
    };
  }
  const [rows, taskTemplates, temperatureDefinitions] = await Promise.all([
    supabase(`/rest/v1/days?${tenantQuery()}&date=gte.${start}&date=lte.${end}&select=location_id,date,payload`),
    readTaskTemplates(),
    readTemperatureDefinitions()
  ]);
  const rowMap = new Map(rows.map(row => [`${row.location_id}|${row.date}`, row.payload]));
  const locationNames = new Map(allLocations.map(location => [location.id, location.name]));
  const locationProgress = selectedLocations.map(scopedLocationId => {
    const totals = dates.reduce((dateTotals, date) => {
      const counts = dailyOpsCounts(rowMap.get(`${scopedLocationId}|${date}`), taskTemplates, scopedLocationId, date, temperatureDefinitions);
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
  const categoryTotals = selectedLocations.reduce((totals, scopedLocationId) => {
    dates.forEach(date => {
      const counts = dailyOpsCategoryCounts(rowMap.get(`${scopedLocationId}|${date}`), taskTemplates, scopedLocationId, date, temperatureDefinitions);
      Object.keys(totals).forEach(key => {
        totals[key].completed += counts[key].completed;
        totals[key].total += counts[key].total;
      });
    });
    return totals;
  }, {
    taskLists: { completed: 0, total: 0 },
    weeklyCleaning: { completed: 0, total: 0 },
    tempLogs: { completed: 0, total: 0 }
  });
  const categoryMetric = counts => ({
    completed: counts.completed,
    remaining: Math.max(counts.total - counts.completed, 0),
    total: counts.total,
    percent: dashboardPercent(counts.completed, counts.total)
  });

  const selectedBreakdown = selectedLocations.length === 1
    ? dates.reduce((rows, date) => {
      dailyOpsBreakdown(rowMap.get(`${selectedLocations[0]}|${date}`), taskTemplates, selectedLocations[0], date, temperatureDefinitions).forEach(row => {
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
    ? maintenanceLocationIdsForStoreIds([locationId], maintenanceLocations, allLocations)
    : maintenanceLocationIdsForStoreIds(selectedLocations, maintenanceLocations, allLocations);
  const scopedOrders = workOrders.filter(order => maintenanceLocationIds.includes(String(order['Location ID'])));
  const scopedPm = pmSchedule.filter(pm => maintenanceLocationIds.includes(String(pm['Location ID'])));
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
  const financials = await financialSummary(actor, range, locationId);

  return {
    range,
    locationId,
    start,
    end,
    taskLists: categoryMetric(categoryTotals.taskLists),
    weeklyCleaning: categoryMetric(categoryTotals.weeklyCleaning),
    tempLogs: categoryMetric(categoryTotals.tempLogs),
    maintenance: {
      completed: completedOrders.length + completedPm.length,
      open: openOrders.length + openPm.length,
      total: completedOrders.length + completedPm.length + openOrders.length + openPm.length,
      percent: dashboardPercent(completedOrders.length + completedPm.length, completedOrders.length + completedPm.length + openOrders.length + openPm.length)
    },
    fpc,
    financials,
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
  if (typeof user.maintenance === 'boolean' || user.role === MAINTENANCE_ROLE) {
    const savedIds = await readMaintenanceKey('maintenanceEligibleUserIds', []);
    const maintenanceIds = new Set((savedIds || []).map(String));
    if (user.maintenance || user.role === MAINTENANCE_ROLE) maintenanceIds.add(String(id));
    else maintenanceIds.delete(String(id));
    await writeMaintenanceKey('maintenanceEligibleUserIds', [...maintenanceIds]);
  }
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
    maintenance: Boolean(payload.maintenance || payload.role === MAINTENANCE_ROLE),
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
  const header = event.headers?.authorization || event.headers?.Authorization || '';
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

function eventHeader(event, name) {
  const headers = event?.headers || {};
  const wanted = String(name).toLowerCase();
  const key = Object.keys(headers).find(entry => entry.toLowerCase() === wanted);
  return key ? String(headers[key] || '').trim() : '';
}

function requestedTenantId(event) {
  const value = eventHeader(event, 'x-dqops-tenant');
  return value ? safeName(value).replace(/^[.-]+|[.-]+$/g, '') : '';
}

function selectTenantMembership(memberships = [], requested = '') {
  const active = memberships.filter(membership => membership?.active !== false && membership?.tenant_id);
  if (requested) return active.find(membership => membership.tenant_id === requested) || null;
  return active.find(membership => membership.is_default) || active[0] || null;
}

function eligibleTenantProfileCandidates(candidates = [], authUser = {}, membershipsReady = false) {
  if (!membershipsReady) return candidates;
  // A matching email with no Auth ID is a normal invitation. A different Auth
  // ID means the Supabase account was recreated and the old link is stale.
  // A matching Auth ID with no active membership is an intentional revocation.
  return candidates.filter(candidate => !candidate.auth_user_id || candidate.auth_user_id !== authUser.id);
}

async function readAuthTenantMemberships(authUser) {
  if (!authUser?.id) return [];
  try {
    return await supabase(`/rest/v1/tenant_memberships?auth_user_id=eq.${encodeURIComponent(authUser.id)}&active=eq.true&select=tenant_id,app_user_id,is_default,active,created_at&order=is_default.desc,created_at.asc`);
  } catch (error) {
    // Allows the current HIS deployment to keep working until the membership migration is run.
    if (![400, 404].includes(error.statusCode)) throw error;
    return null;
  }
}

async function readAuthProfileCandidates(authUser) {
  if (!authUser?.email) return [];
  const email = authUser.email.toLowerCase();
  return supabase(`/rest/v1/app_users?or=(auth_user_id.eq.${encodeURIComponent(authUser.id)},email.eq.${encodeURIComponent(email)})&active=eq.true&select=tenant_id,id,auth_user_id,email`);
}

async function resolveTenantForEvent(event) {
  const requested = requestedTenantId(event);
  const token = bearerToken(event);
  const kiosk = verifyKioskToken(token, 'session', '') || verifyKioskToken(token, 'device', '');
  if (kiosk?.tenantId) return kiosk.tenantId;

  const apiPath = String(event?.path || '').replace(/^\/api/, '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  if (apiPath === '/kiosk/enroll' && event?.body) {
    try {
      const code = String(JSON.parse(event.body)?.code || '').trim().toUpperCase();
      if (code) {
        const rows = await supabase(`/rest/v1/kiosk_enrollments?code_hash=eq.${sha256(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=tenant_id&limit=2`);
        if (rows.length === 1) return rows[0].tenant_id;
      }
    } catch (error) {
      if (error.statusCode) throw error;
    }
  }

  const authUser = token ? await currentAuthUser(event) : null;
  if (authUser?.id) {
    const memberships = await readAuthTenantMemberships(authUser);
    if (memberships?.length) {
      const selected = selectTenantMembership(memberships, requested);
      if (!selected) throw Object.assign(new Error('You do not have access to that organization'), { statusCode: 403 });
      return selected.tenant_id;
    }

    const candidates = await readAuthProfileCandidates(authUser);
    // Once memberships exist, only an unclaimed email profile may bootstrap a
    // first login. A removed/inactive membership must never fall back to the
    // app_users row and silently restore access.
    const eligibleCandidates = eligibleTenantProfileCandidates(candidates, authUser, memberships !== null);
    const candidateTenants = [...new Set(eligibleCandidates.map(candidate => candidate.tenant_id || DEFAULT_TENANT_ID))];
    if (requested) {
      if (!candidateTenants.includes(requested)) throw Object.assign(new Error('You do not have access to that organization'), { statusCode: 403 });
      return requested;
    }
    if (candidateTenants.length === 1) return candidateTenants[0];
    if (candidateTenants.length > 1) {
      throw Object.assign(new Error('This account belongs to more than one organization. Select an organization to continue.'), { statusCode: 409 });
    }
    if (memberships !== null) throw Object.assign(new Error('This account is not assigned to an active organization'), { statusCode: 403 });
  }

  // A remembered tenant may be used only for public branding, and only when it is active.
  if (!token && requested && apiPath === '/public-config') {
    try {
      const rows = await supabase(`/rest/v1/tenants?id=eq.${encodeURIComponent(requested)}&active=eq.true&select=id&limit=1`);
      if (rows[0]) return rows[0].id;
    } catch (error) {
      if (![400, 404, 500].includes(error.statusCode)) throw error;
    }
  }
  return DEFAULT_TENANT_ID;
}

async function ensureTenantMembership(profile, authUser) {
  if (!profile?.id || !authUser?.id) return false;
  try {
    const existingMemberships = await readAuthTenantMemberships(authUser);
    await supabase('/rest/v1/tenant_memberships?on_conflict=tenant_id,auth_user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        tenant_id: tenantId(),
        auth_user_id: authUser.id,
        app_user_id: profile.id,
        active: true,
        is_default: !existingMemberships?.length
      })
    });
    return true;
  } catch (error) {
    if (![400, 404].includes(error.statusCode)) throw error;
    return false;
  }
}

async function availableTenantsForAuthUser(event) {
  const authUser = await currentAuthUser(event);
  if (!authUser?.id) return [];
  const memberships = await readAuthTenantMemberships(authUser);
  const tenantIds = [...new Set((memberships || []).map(membership => membership.tenant_id).filter(Boolean))];
  if (!tenantIds.length) return [{ ...(await readTenantConfig()), isDefault: true }];
  const encodedIds = tenantIds.map(id => `\"${id.replace(/\"/g, '')}\"`).join(',');
  const rows = await supabase(`/rest/v1/tenants?id=in.(${encodedIds})&active=eq.true&select=id,name,app_name,subtitle,logo_url`);
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    appName: row.app_name,
    subtitle: row.subtitle,
    logoUrl: row.logo_url,
    isDefault: Boolean((memberships || []).find(membership => membership.tenant_id === row.id)?.is_default)
  }));
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
    tenantId: row.tenant_id || tenantId(),
    locationId: row.location_id,
    locationIds: userLocationIds(row),
    authMode: row.authMode || 'password'
  };
}

function isWeeklyCleaningTask(task = {}) {
  return String(task.section || '').trim().toLowerCase().includes('weekly cleaning');
}

function dailyOpsCategoryCounts(payload = null, templates = DEFAULT_TASK_TEMPLATES, locationId = DEFAULT_LOCATION_ID, date = today(), definitions = TEMPERATURE_ITEMS) {
  const source = payload || newDay(locationId, templates, date);
  const scheduledTemplates = templates.filter(task => task.active !== false && taskScheduledForDate(task, locationId, date));
  const tasks = Array.isArray(source.tasks) ? source.tasks : scheduledTemplates;
  const weeklyTasks = tasks.filter(isWeeklyCleaningTask);
  const standardTasks = tasks.filter(task => !isWeeklyCleaningTask(task));
  const requiredTemps = new Set();
  Object.entries(definitions).filter(([, list]) => list.requiredDaily !== false).forEach(([listName, list]) => Object.entries(list.areas || {}).forEach(([area, items]) => {
    items.forEach(item => ['Day', 'Afternoon'].forEach(session => requiredTemps.add(`${listName}|${area}|${item}|${session}`)));
  }));
  const loggedTemps = new Set((source.temps || []).map(temp => `${readingList(temp)}|${temp.area}|${temp.item}|${temp.session || 'Day'}`));
  return {
    taskLists: { completed: standardTasks.filter(task => task.done).length, total: standardTasks.length },
    weeklyCleaning: { completed: weeklyTasks.filter(task => task.done).length, total: weeklyTasks.length },
    tempLogs: { completed: [...requiredTemps].filter(key => loggedTemps.has(key)).length, total: requiredTemps.size }
  };
}

function maintenanceLocationKey(value = '') {
  return String(value).toLowerCase()
    .replace(/dairy\s*queen|\bdq\b|\bstore\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

async function canAccessMaintenanceRecord(actor, record = {}) {
  if (!AUTH_REQUIRED || !actor || isFullAccess(actor) || actor.role === MAINTENANCE_ROLE) return true;
  const assigned = (await readLocations()).filter(location => userLocationIds(actor).includes(location.id));
  const allowedNames = new Set(assigned.map(location => maintenanceLocationKey(location.name)));
  return allowedNames.has(maintenanceLocationKey(record['Location Name']));
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
    if (!profile.auth_user_id || profile.auth_user_id !== authUser.id) {
      await supabase(`/rest/v1/app_users?${tenantQuery()}&id=eq.${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ auth_user_id: authUser.id, accepted_at: new Date().toISOString() })
      });
      profileRows = await supabase(`/rest/v1/app_users?${tenantQuery()}&email=eq.${encodeURIComponent(email)}&select=*`);
      profile = bestProfile(profileRows);
    }
    await ensureTenantMembership(profile, authUser);
    return appProfile(profile);
  }

  if (!profile) throw Object.assign(new Error(`No active app profile found for ${email}. Create this user in Manage or add this email to app_users.`), { statusCode: 403 });
  return appProfile(profile);
}

async function readMaintenanceKey(key, fallback = []) {
  const rows = await supabase(`/rest/v1/maintenance_data?${tenantQuery()}&key=eq.${encodeURIComponent(key)}&select=payload`);
  if (rows[0]) return hydrateStorageReferences(rows[0].payload);
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
    body: JSON.stringify(withTenant({ key, payload: dehydrateStorageReferences(payload), updated_at: new Date().toISOString() }))
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

function secureTokenMatches(provided = '', expected = '') {
  if (!provided || !expected) return false;
  const left = crypto.createHash('sha256').update(String(provided)).digest();
  const right = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(left, right);
}

function gatewayToken(event) {
  const headers = event.headers || {};
  return headers['x-dqops-gateway-token'] || headers['X-Dqops-Gateway-Token'] || '';
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function saveThermostatReport(event, payload = {}) {
  if (!DQOPS_GATEWAY_TOKEN) throw Object.assign(new Error('The thermostat gateway is not configured in Netlify'), { statusCode: 503 });
  if (!secureTokenMatches(gatewayToken(event), DQOPS_GATEWAY_TOKEN)) throw Object.assign(new Error('Unauthorized gateway'), { statusCode: 401 });
  const rawGatewayId = String(payload.gatewayId || '').trim();
  const rawDeviceId = String(payload.deviceId || '').trim();
  const gatewayId = safeName(rawGatewayId);
  const deviceId = safeName(rawDeviceId);
  const locationId = String(payload.locationId || '').trim();
  if (!rawGatewayId || !rawDeviceId || !locationId) throw Object.assign(new Error('gatewayId, deviceId, and locationId are required'), { statusCode: 400 });
  const validLocations = new Set((await readLocations()).map(location => String(location.id)));
  if (!validLocations.has(locationId)) throw Object.assign(new Error('Unknown DQ OPS location'), { statusCode: 400 });
  const source = payload.info && typeof payload.info === 'object' ? payload.info : {};
  const info = {
    mode: finiteNumber(source.mode), state: finiteNumber(source.state), activeStage: finiteNumber(source.activestage),
    fan: finiteNumber(source.fan), fanState: finiteNumber(source.fanstate), temperatureUnits: finiteNumber(source.tempunits),
    spaceTemp: finiteNumber(source.spacetemp), heatTemp: finiteNumber(source.heattemp), coolTemp: finiteNumber(source.cooltemp),
    humidity: finiteNumber(source.hum), availableModes: finiteNumber(source.availablemodes)
  };
  const storedValue = await readMaintenanceKey('locationHealthThermostats', { devices: {}, commands: [] });
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : { devices: {}, commands: [] };
  const devices = stored.devices && typeof stored.devices === 'object' && !Array.isArray(stored.devices) ? stored.devices : {};
  const commands = Array.isArray(stored.commands) ? stored.commands : [];
  const key = `${gatewayId}|${deviceId}`;
  devices[key] = {
    id: deviceId, gatewayId, locationId,
    name: String(payload.name || 'Venstar thermostat').trim().slice(0, 100),
    model: String(payload.model || 'Venstar').trim().slice(0, 100),
    lastSeenAt: new Date().toISOString(),
    observedAt: String(payload.observedAt || new Date().toISOString()).slice(0, 40), info
  };
  const result = payload.commandResult && typeof payload.commandResult === 'object' ? payload.commandResult : null;
  if (result?.id) {
    const completed = commands.find(command => command.id === String(result.id) && command.deviceKey === key);
    if (completed) {
      completed.status = result.success === true ? 'Applied' : 'Failed';
      completed.completedAt = new Date().toISOString();
      completed.message = String(result.message || '').slice(0, 500);
    }
  }
  const pending = commands.find(command => command.deviceKey === key && command.status === 'Queued');
  if (pending) {
    pending.status = 'Sent';
    pending.sentAt = new Date().toISOString();
  }
  await writeMaintenanceKey('locationHealthThermostats', { devices, commands: commands.slice(0, 500), updatedAt: new Date().toISOString() });
  return { ok: true, receivedAt: devices[key].lastSeenAt, command: pending ? { id: pending.id, control: pending.control } : null };
}

async function thermostatState(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can view thermostats'), { statusCode: 403 });
  const stored = await readMaintenanceKey('locationHealthThermostats', { devices: {}, commands: [] });
  const allowed = new Set(userLocationIds(actor));
  const devices = Object.values(stored?.devices || {}).filter(device => !AUTH_REQUIRED || isFullAccess(actor) || allowed.has(device.locationId));
  const visibleKeys = new Set(devices.map(device => `${device.gatewayId}|${device.id}`));
  const commands = (Array.isArray(stored?.commands) ? stored.commands : []).filter(command => visibleKeys.has(command.deviceKey)).slice(0, 50);
  return { configured: Boolean(DQOPS_GATEWAY_TOKEN), canControl: !AUTH_REQUIRED || canAreaManage(actor), devices: devices.map(device => ({ ...device, online: Date.now() - new Date(device.lastSeenAt).getTime() < 10 * 60 * 1000 })), commands, refreshedAt: new Date().toISOString() };
}

async function queueThermostatCommand(payload, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can control thermostats'), { statusCode: 403 });
  const gatewayId = safeName(payload.gatewayId || '');
  const deviceId = safeName(payload.deviceId || '');
  const deviceKey = `${gatewayId}|${deviceId}`;
  const stored = await readMaintenanceKey('locationHealthThermostats', { devices: {}, commands: [] });
  const device = stored?.devices?.[deviceKey];
  if (!device) throw Object.assign(new Error('Thermostat not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, device.locationId)) throw Object.assign(new Error('You do not have access to this thermostat location'), { statusCode: 403 });
  if (Date.now() - new Date(device.lastSeenAt).getTime() >= 10 * 60 * 1000) throw Object.assign(new Error('The thermostat gateway is offline'), { statusCode: 409 });
  const mode = Number(payload.mode), fan = Number(payload.fan), heatTemp = Number(payload.heatTemp), coolTemp = Number(payload.coolTemp);
  if (![0, 1, 2, 3].includes(mode)) throw Object.assign(new Error('Choose a valid thermostat mode'), { statusCode: 400 });
  if (![0, 1].includes(fan)) throw Object.assign(new Error('Choose Auto or On for the fan'), { statusCode: 400 });
  if (!Number.isFinite(heatTemp) || heatTemp < 55 || heatTemp > 78) throw Object.assign(new Error('The heating setpoint must be between 55°F and 78°F'), { statusCode: 400 });
  if (!Number.isFinite(coolTemp) || coolTemp < 65 || coolTemp > 85) throw Object.assign(new Error('The cooling setpoint must be between 65°F and 85°F'), { statusCode: 400 });
  if (coolTemp - heatTemp < 2) throw Object.assign(new Error('Cooling must be at least 2°F above heating'), { statusCode: 400 });
  const commands = Array.isArray(stored.commands) ? stored.commands : [];
  commands.forEach(command => { if (command.deviceKey === deviceKey && command.status === 'Queued') command.status = 'Replaced'; });
  commands.unshift({
    id: `THERM-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    deviceKey, gatewayId, deviceId, locationId: device.locationId, deviceName: device.name,
    control: { mode, fan, heattemp: heatTemp, cooltemp: coolTemp }, status: 'Queued',
    requestedAt: new Date().toISOString(), requestedBy: actor?.name || 'DQ OPS', requestedById: actor?.id || ''
  });
  await writeMaintenanceKey('locationHealthThermostats', { ...stored, commands: commands.slice(0, 500), updatedAt: new Date().toISOString() });
  return thermostatState(actor);
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
  const definitions = await readTemperatureDefinitions();
  const missingTasks = (day.tasks || []).filter(task => !task.done).map(task => ({ type: 'task', label: `${task.section || 'Checklist'}: ${task.name}` }));
  const logged = new Set((day.temps || []).map(temp => `${readingList(temp)}|${readingSession(temp)}|${temp.area}|${temp.item}`));
  const missingTemps = [];
  Object.entries(definitions).forEach(([listName, list]) => {
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
    area: task.area || '',
    prepArea: task.prepArea || '',
    managerPrep: Boolean(task.managerPrep || task.prepArea),
    qrCheckpointId: task.qrCheckpointId || '',
    qrCheckpointName: task.qrCheckpointName || '',
    requiresQr: Boolean(task.qrCheckpointId),
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
  const canAdminister = !AUTH_REQUIRED || canAreaManage(actor);
  return notices
    .filter(notice => notice.active !== false)
    .filter(notice => {
      const userMatch = !Array.isArray(notice.targetUserIds) || !notice.targetUserIds.length || notice.targetUserIds.includes(actorId);
      const roleMatch = !Array.isArray(notice.targetRoles) || !notice.targetRoles.length || notice.targetRoles.includes(actorRole);
      const administrableNotice = canAdminister && (!Array.isArray(notice.targetUserIds) || !notice.targetUserIds.length);
      return administrableNotice || (userMatch && roleMatch);
    })
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(notice => {
      const userMatch = !Array.isArray(notice.targetUserIds) || !notice.targetUserIds.length || notice.targetUserIds.includes(actorId);
      const roleMatch = !Array.isArray(notice.targetRoles) || !notice.targetRoles.length || notice.targetRoles.includes(actorRole);
      const visibleToActor = userMatch && roleMatch;
      return {
        ...notice,
        visibleToActor,
        expired: Boolean(notice.endDate && notice.endDate < localDate()),
        unread: visibleToActor && actorId ? !(notice.readBy || []).includes(actorId) : false,
        editable: canAdminister
      };
    });
}

async function saveNotice(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can post notices'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const message = String(payload.message || '').trim();
  if (!title || !message) throw Object.assign(new Error('Notice title and message are required'), { statusCode: 400 });
  const notices = await readMaintenanceKey('notices', []);
  const id = payload.id || `notice-${Date.now()}`;
  let notice = notices.find(entry => entry.id === id);
  if (notice && AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can edit notices'), { statusCode: 403 });
  const attachmentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, locationId: 'shared', kind: 'notice-attachment', name: payload.attachment.name || title })
    : payload.attachmentUrl || notice?.attachmentUrl || '';
  if (!notice) {
    notice = {
      id,
      createdBy: actor?.name || payload.createdBy || 'Manager',
      createdAt: new Date().toISOString(),
      readBy: [],
      active: true
    };
    notices.push(notice);
  }
  Object.assign(notice, {
    title,
    message,
    attachmentUrl,
    attachmentName: payload.attachment?.name || payload.attachmentName || notice.attachmentName || '',
    targetRoles: Array.isArray(payload.targetRoles) && payload.targetRoles.length ? payload.targetRoles : [],
    endDate: String(payload.endDate || '').trim(),
    updatedBy: actor?.name || 'Manager',
    updatedAt: new Date().toISOString(),
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

function tempRequirementForTarget(target = '', definitions = TEMPERATURE_ITEMS) {
  const [listName, session = 'Day', targetArea = '', targetItem = ''] = String(target).split('|');
  const list = definitions[listName];
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

function tempListIncomplete(dayPayload = {}, target = '', definitions = TEMPERATURE_ITEMS) {
  const required = tempRequirementForTarget(target, definitions);
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
  const [settings, locations, users, temperatureDefinitions] = await Promise.all([readAlertSettings(), readLocations(), readUsers(), readTemperatureDefinitions()]);
  const activeRules = settings.rules.filter(rule => rule.active !== false && timeHasPassed(rule.dueTime, now));
  const alerts = [];
  for (const rule of activeRules) {
    const scopedLocations = locations.filter(location => rule.locationId === 'all' || rule.locationId === location.id);
    for (const location of scopedLocations) {
      const dayPayload = await readDay(location.id, date);
      const status = rule.type === 'temperature' ? tempListIncomplete(dayPayload, rule.target, temperatureDefinitions) : taskListIncomplete(dayPayload, rule.target);
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
  const managerNotifications = dryRun ? { sent: [] } : await checkManagerNotificationSchedules(now);
  return { dryRun, date, alerts, storeAlarmEscalations, managerNotifications };
}

async function deleteNotice(id, actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can delete notices'), { statusCode: 403 });
  const notices = await readMaintenanceKey('notices', []);
  const notice = notices.find(entry => entry.id === id);
  if (!notice) throw Object.assign(new Error('Notice not found'), { statusCode: 404 });
  notice.active = false;
  notice.updatedBy = actor?.name || 'Area Manager';
  notice.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('notices', notices);
  return readNotices(actor);
}

function localWeekday(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: ALERT_TIME_ZONE, weekday: 'long' }).format(now);
}

function reportPeriodKey(cadence, date) {
  if (cadence === 'daily') return date;
  if (cadence === 'monthly') return date.slice(0, 7);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value.toISOString().slice(0, 10);
}

function reportIsDue(report, now) {
  if (!report || report.cadence === 'none' || !timeHasPassed(report.sendTime, now)) return false;
  if (report.cadence === 'weekly') return localWeekday(now) === 'Monday';
  if (report.cadence === 'monthly') return localDate(ALERT_TIME_ZONE, now).endsWith('-01');
  return report.cadence === 'daily';
}

async function performanceReportText(user, preferences) {
  const range = preferences.performanceReport.cadence === 'daily' ? 'day' : preferences.performanceReport.cadence === 'weekly' ? 'week' : 'month';
  const summary = await dashboardSummary(user, range, 'all');
  const { dates } = dateRange(range);
  const [locations, templates, definitions] = await Promise.all([readLocations(), readTaskTemplates(), readTemperatureDefinitions()]);
  const assigned = isFullAccess(user) ? locations : locations.filter(location => userLocationIds(user).includes(location.id));
  const tasks = { completed: 0, total: 0 }, temps = { completed: 0, total: 0 };
  for (const location of assigned) for (const date of dates) {
    const payload = await readDay(location.id, date);
    const scheduled = Array.isArray(payload.tasks) ? payload.tasks : templates.filter(task => task.active !== false && taskScheduledForDate(task, location.id, date));
    tasks.total += scheduled.length;
    tasks.completed += scheduled.filter(task => task.done).length;
    const required = new Set();
    Object.entries(definitions).filter(([, list]) => list.requiredDaily !== false).forEach(([listName, list]) => Object.entries(list.areas || {}).forEach(([area, items]) => items.forEach(item => ['Day', 'Afternoon'].forEach(session => required.add(`${listName}|${area}|${item}|${session}`)))));
    const logged = new Set((payload.temps || []).map(temp => `${readingList(temp)}|${temp.area}|${temp.item}|${readingSession(temp)}`));
    temps.total += required.size;
    temps.completed += [...required].filter(key => logged.has(key)).length;
  }
  const lines = [`HIS OPS ${preferences.performanceReport.cadence} performance report`, `${summary.start} through ${summary.end}`];
  if (preferences.performanceReport.includeTasks) lines.push(`Tasks: ${tasks.completed} of ${tasks.total} completed (${dashboardPercent(tasks.completed, tasks.total)}%).`);
  if (preferences.performanceReport.includeTemps) lines.push(`Temperature checks: ${temps.completed} of ${temps.total} completed (${dashboardPercent(temps.completed, temps.total)}%).`);
  if (preferences.performanceReport.includePm) lines.push(`Maintenance and PM: ${summary.maintenance.completed} completed; ${summary.maintenance.open} still open.`);
  if (summary.progress?.mode === 'locations') (summary.progress.rows || []).forEach(row => lines.push(`${row.label}: ${row.percent}% of daily operations completed.`));
  return lines.join('\n');
}

async function checkManagerNotificationSchedules(now = new Date()) {
  const [users, locations, stored, deliveryState, definitions] = await Promise.all([
    readUsers(), readLocations(), readMaintenanceKey('managerNotificationPreferences', {}),
    readMaintenanceKey('managerNotificationDeliveryState', {}), readTemperatureDefinitions()
  ]);
  const date = localDate(ALERT_TIME_ZONE, now);
  const sent = [];
  for (const user of users.filter(managerNotificationAllowed)) {
    const preferences = normalizeManagerNotificationPreferences(stored[user.id] || {});
    const assigned = isFullAccess(user) ? locations : locations.filter(location => userLocationIds(user).includes(location.id));
    if (preferences.incompleteTemps.enabled && timeHasPassed(preferences.incompleteTemps.dueTime, now)) {
      for (const location of assigned) {
        const key = `${user.id}|incompleteTemps|${location.id}|${date}`;
        if (deliveryState[key]) continue;
        const dayPayload = await readDay(location.id, date);
        const required = Object.keys(definitions).filter(name => definitions[name]?.requiredDaily !== false);
        const details = required.flatMap(name => ['Day', 'Afternoon'].map(session => ({ name, session, ...tempListIncomplete(dayPayload, `${name}|${session}`, definitions) }))).filter(item => item.incomplete);
        if (!details.length) continue;
        const text = `${location.name}: required temperature logs are incomplete after ${preferences.incompleteTemps.dueTime}. ${details.map(item => `${item.name} ${item.session}: ${item.detail}`).join('; ')}`;
        sent.push(...await sendPreferredNotification({ recipient: user, channels: preferences.incompleteTemps.channels, type: 'Incomplete temperature log', title: 'HIS OPS temperature log reminder', text, locationId: location.id, locationName: location.name }));
        deliveryState[key] = new Date().toISOString();
      }
    }
    if (reportIsDue(preferences.performanceReport, now)) {
      const period = reportPeriodKey(preferences.performanceReport.cadence, date);
      const key = `${user.id}|performanceReport|${preferences.performanceReport.cadence}|${period}`;
      if (!deliveryState[key]) {
        const text = await performanceReportText(user, preferences);
        sent.push(...await sendPreferredNotification({ recipient: user, channels: preferences.performanceReport.channels, type: 'Performance report', title: `HIS OPS ${preferences.performanceReport.cadence} performance report`, text }));
        deliveryState[key] = new Date().toISOString();
      }
    }
  }
  await writeMaintenanceKey('managerNotificationDeliveryState', deliveryState);
  return { sent };
}

async function notifyOutOfRangeTemperature(locationId, readings = []) {
  if (!readings.length) return [];
  const [users, locations, stored] = await Promise.all([readUsers(), readLocations(), readMaintenanceKey('managerNotificationPreferences', {})]);
  const location = locations.find(item => item.id === locationId);
  const sent = [];
  for (const user of users.filter(managerNotificationAllowed).filter(item => isFullAccess(item) || userLocationIds(item).includes(locationId))) {
    const preferences = normalizeManagerNotificationPreferences(stored[user.id] || {});
    if (!preferences.outOfRangeTemps.enabled) continue;
    const text = readings.map(reading => {
      const unit = reading.unit === '%' || (String(reading.list || '').toLowerCase() === 'chill' && String(reading.item || '').toLowerCase() === 'overrun') ? '%' : '°F';
      return `${location?.name || locationId}: ${reading.item || 'Temperature'} was ${reading.value}${unit}. Action: ${reading.correctiveAction || 'Corrective action recorded'}.`;
    }).join('\n');
    sent.push(...await sendPreferredNotification({ recipient: user, channels: preferences.outOfRangeTemps.channels, type: 'Out-of-range temperature', title: 'HIS OPS out-of-range temperature', text, locationId, locationName: location?.name || locationId }));
  }
  return sent;
}

async function notifyNewMaintenanceRequest(workOrder) {
  const [users, appLocations, maintenanceLocations, stored] = await Promise.all([readUsers(), readLocations(), readMaintenanceKey('locations', []), readMaintenanceKey('managerNotificationPreferences', {})]);
  const maintenanceLocation = maintenanceLocations.find(item => String(item['Location ID']) === String(workOrder['Location ID']));
  const locationName = workOrder['Location Name'] || maintenanceLocation?.['Location Name'] || '';
  const appLocation = appLocations.find(item => item.name === locationName);
  const sent = [];
  for (const user of users.filter(item => canAreaManage(item) && (isFullAccess(item) || (appLocation && userLocationIds(item).includes(appLocation.id))))) {
    const preferences = normalizeManagerNotificationPreferences(stored[user.id] || {});
    if (!preferences.newMaintenanceRequest.enabled) continue;
    const text = `${locationName || 'An assigned location'} submitted ${workOrder['Work Order ID']}: ${workOrder['Issue Description'] || workOrder.Category || 'New maintenance request'}. Priority: ${workOrder.Priority || 'Medium'}.`;
    sent.push(...await sendPreferredNotification({ recipient: user, channels: preferences.newMaintenanceRequest.channels, type: 'New maintenance request', title: 'HIS OPS new maintenance request', text, locationId: appLocation?.id || '', locationName }));
  }
  return sent;
}

async function readFpcRecords() {
  const records = await readMaintenanceKey('fpcRecords', []);
  return Array.isArray(records) ? records : [];
}

function fpcInspectionFiles(record = {}) {
  const source = Array.isArray(record.inspectionFiles)
    ? record.inspectionFiles
    : (record.inspectionUrl ? [{ url: record.inspectionUrl, name: record.inspectionName || 'Open inspection' }] : []);
  const seen = new Set();
  return source
    .map(file => typeof file === 'string' ? { url: file, name: 'Open inspection' } : file)
    .map(file => ({ url: String(file?.url || '').trim(), name: String(file?.name || 'Open inspection').trim().slice(0, 180) }))
    .filter(file => file.url && !seen.has(file.url) && seen.add(file.url));
}

function consolidateFpcRecords(records = [], appLocations = []) {
  const source = Array.isArray(records) ? records : [];
  const locationNames = new Map(appLocations.map(location => [String(location.id), String(location.name || location.id)]));
  const consolidated = [];
  const grouped = new Map();

  source.forEach((record, index) => {
    if (!record || record.active === false) {
      consolidated.push(record);
      return;
    }
    const locationId = String(record.locationId || '');
    const inspectionDate = String(record.inspectionDate || '');
    const key = locationId && inspectionDate ? `${locationId}\u0000${inspectionDate}` : `record\u0000${record.id || index}`;
    const liveLocationName = locationNames.get(locationId) || String(record.locationName || locationId);
    const files = fpcInspectionFiles(record);
    const normalized = {
      ...record,
      locationName: liveLocationName,
      inspectionUrl: files[0]?.url || '',
      inspectionName: files[0]?.name || '',
      inspectionFiles: files,
      items: Array.isArray(record.items) ? [...record.items] : []
    };
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, normalized);
      consolidated.push(normalized);
      return;
    }

    const mergedFiles = fpcInspectionFiles({ inspectionFiles: [...fpcInspectionFiles(existing), ...files] });
    const itemIndex = new Map((existing.items || []).map((item, itemPosition) => [String(item.id || `existing-${itemPosition}`), itemPosition]));
    normalized.items.forEach((item, itemPosition) => {
      const itemKey = String(item.id || `incoming-${index}-${itemPosition}`);
      if (!itemIndex.has(itemKey)) {
        itemIndex.set(itemKey, existing.items.length);
        existing.items.push(item);
        return;
      }
      const existingPosition = itemIndex.get(itemKey);
      const current = existing.items[existingPosition];
      if (String(item.updatedAt || item.createdAt || '') > String(current.updatedAt || current.createdAt || '')) existing.items[existingPosition] = item;
    });
    existing.locationName = liveLocationName;
    existing.inspectionFiles = mergedFiles;
    existing.inspectionUrl = mergedFiles[0]?.url || '';
    existing.inspectionName = mergedFiles[0]?.name || '';
    if (String(normalized.createdAt || '') && (!existing.createdAt || normalized.createdAt < existing.createdAt)) {
      existing.createdAt = normalized.createdAt;
      existing.createdBy = normalized.createdBy || existing.createdBy;
    }
    existing.updatedAt = new Date().toISOString();
  });

  return { records: consolidated, changed: JSON.stringify(consolidated) !== JSON.stringify(source) };
}

function nextFpcId(records) {
  const highest = records.reduce((max, record) => {
    const match = String(record.id || '').match(/FPC-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FPC-${String(highest + 1).padStart(4, '0')}`;
}

async function fpcState(actor = null) {
  const [storedRecords, appLocations] = await Promise.all([readFpcRecords(), readLocations()]);
  const repaired = consolidateFpcRecords(storedRecords, appLocations);
  if (repaired.changed) await writeMaintenanceKey('fpcRecords', repaired.records);
  const records = repaired.records.filter(record => record && record.active !== false);
  if (!AUTH_REQUIRED || !actor || isFullAccess(actor)) return { records };
  const allowed = userLocationIds(actor);
  return { records: records.filter(record => allowed.includes(record.locationId)) };
}

async function saveFpcInspection(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can update FPC records'), { statusCode: 403 });
  const locationId = payload.locationId || DEFAULT_LOCATION_ID;
  if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only update FPC records for your assigned location'), { statusCode: 403 });
  const records = await readFpcRecords();
  const attachmentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, locationId, kind: 'fpc-inspection', name: payload.attachment.name || `${locationId}-fpc` })
    : payload.inspectionUrl || '';
  if (!attachmentUrl) throw Object.assign(new Error('Choose an FPC inspection file or shared link'), { statusCode: 400 });
  const inspectionDate = payload.inspectionDate || today();
  const inspectionFile = { url: attachmentUrl, name: payload.attachment?.name || payload.inspectionName || 'FPC inspection' };
  let record = records.find(entry => entry.active !== false && entry.locationId === locationId && entry.inspectionDate === inspectionDate);
  if (record) {
    const files = fpcInspectionFiles({ inspectionFiles: [...fpcInspectionFiles(record), inspectionFile] });
    Object.assign(record, {
      locationName: payload.locationName || record.locationName || '',
      inspectionUrl: files[0]?.url || '',
      inspectionName: files[0]?.name || '',
      inspectionFiles: files,
      updatedBy: actor?.name || payload.createdBy || 'Manager',
      updatedAt: new Date().toISOString()
    });
  } else {
    record = {
      id: nextFpcId(records),
      locationId,
      locationName: payload.locationName || '',
      inspectionDate,
      inspectionUrl: inspectionFile.url,
      inspectionName: inspectionFile.name,
      inspectionFiles: [inspectionFile],
      createdBy: actor?.name || payload.createdBy || 'Manager',
      createdAt: new Date().toISOString(),
      items: [],
      active: true
    };
    records.unshift(record);
  }
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState(actor);
}

function normalizeFpcPhotos(payload = {}) {
  const source = Array.isArray(payload.photos)
    ? payload.photos
    : (payload.photoUrl ? [{ url: payload.photoUrl, name: payload.photoName || 'FPC photo' }] : []);
  if (source.length > 9) throw Object.assign(new Error('An FPC repair item can have no more than 9 photos or links'), { statusCode: 400 });
  const seen = new Set();
  return source.map(photo => typeof photo === 'string' ? { url: photo, name: 'FPC photo' } : photo)
    .map(photo => ({ url: String(photo?.url || '').trim(), name: String(photo?.name || 'FPC photo').trim().slice(0, 180) }))
    .filter(photo => photo.url && !seen.has(photo.url) && seen.add(photo.url))
    .map(photo => {
      const storageObject = parseStorageObject(photo.url);
      if (!/^https?:\/\//i.test(photo.url) && !storageObject) throw Object.assign(new Error('Every FPC photo link must be an uploaded file or begin with http:// or https://'), { statusCode: 400 });
      if (storageObject && !storageObjectAllowedForTenant(storageObject)) throw Object.assign(new Error('That uploaded file belongs to another organization'), { statusCode: 403 });
      return photo;
    });
}

async function saveFpcItem(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  let record = records.find(entry => entry.id === payload.recordId);
  if (record && AUTH_REQUIRED && !canAccessLocation(actor, record.locationId)) throw Object.assign(new Error('You can only update FPC records for your assigned location'), { statusCode: 403 });
  if (!record) {
    if (AUTH_REQUIRED && !canAccessLocation(actor, payload.locationId || DEFAULT_LOCATION_ID)) throw Object.assign(new Error('You can only update FPC records for your assigned location'), { statusCode: 403 });
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
  const photos = normalizeFpcPhotos(payload);
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
    photos,
    photoUrl: photos[0]?.url || '',
    photoName: photos[0]?.name || '',
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
  return fpcState(actor);
}

async function importFpcItems(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can import FPC repair items'), { statusCode: 403 });
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw Object.assign(new Error('No FPC repair items were provided'), { statusCode: 400 });
  if (items.length > 500) throw Object.assign(new Error('Import no more than 500 FPC repair items at once'), { statusCode: 400 });
  const [records, appLocations] = await Promise.all([readFpcRecords(), readLocations()]);
  const locationMap = new Map(appLocations.map(location => [String(location.id), location]));
  const priorities = new Map(['High', 'Medium', 'Low'].map(value => [value.toLowerCase(), value]));
  const statuses = new Map(['Open', 'In Progress', 'Completed'].map(value => [value.toLowerCase(), value]));
  let createdCount = 0;
  let updatedCount = 0;

  items.forEach((source, index) => {
    const rowNumber = index + 1;
    const locationId = String(source.locationId || '').trim();
    const location = locationMap.get(locationId);
    const inspectionDate = String(source.inspectionDate || '').slice(0, 10);
    const targetDate = String(source.targetDate || '').slice(0, 10);
    const description = String(source.description || '').trim();
    const priority = priorities.get(String(source.priority || 'Medium').toLowerCase());
    const status = statuses.get(String(source.status || 'Open').toLowerCase());
    const photos = normalizeFpcPhotos(source);
    if (!location || (AUTH_REQUIRED && !canAccessLocation(actor, locationId))) throw Object.assign(new Error(`Import row ${rowNumber}: You do not have access to that location`), { statusCode: 403 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) throw Object.assign(new Error(`Import row ${rowNumber}: Inspection Date is invalid`), { statusCode: 400 });
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw Object.assign(new Error(`Import row ${rowNumber}: Target Date is invalid`), { statusCode: 400 });
    if (!description) throw Object.assign(new Error(`Import row ${rowNumber}: Repair Item is required`), { statusCode: 400 });
    if (!priority) throw Object.assign(new Error(`Import row ${rowNumber}: Priority is invalid`), { statusCode: 400 });
    if (!status) throw Object.assign(new Error(`Import row ${rowNumber}: Status is invalid`), { statusCode: 400 });

    let record = records.find(entry => entry.active !== false && entry.locationId === locationId && entry.inspectionDate === inspectionDate);
    if (!record) {
      record = {
        id: nextFpcId(records), locationId, locationName: location.name, inspectionDate,
        inspectionName: 'Imported repair list', createdBy: actor?.name || 'Manager',
        createdAt: new Date().toISOString(), items: [], active: true
      };
      records.unshift(record);
    }
    record.items ||= [];
    const existing = record.items.find(item => String(item.description || '').trim().toLowerCase() === description.toLowerCase());
    const values = {
      description, priority, status, targetDate,
      assignedTo: String(source.assignedTo || '').trim(),
      photos, photoUrl: photos[0]?.url || '', photoName: photos[0]?.name || '',
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      Object.assign(existing, values);
      updatedCount += 1;
    } else {
      record.items.push({
        id: `FPCITEM-${Date.now()}-${index}`, ...values,
        assignmentType: '', assigneeId: '', assigneeName: '', assigneeEmail: '', assigneePhone: '',
        vendorId: '', vendorName: '', assignmentNotify: 'none', comments: [],
        createdBy: actor?.name || 'Manager', createdAt: new Date().toISOString()
      });
      createdCount += 1;
    }
  });

  await writeMaintenanceKey('fpcRecords', records);
  return { importedCount: items.length, createdCount, updatedCount, state: await fpcState(actor) };
}

async function updateFpcItem(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  const record = records.find(entry => entry.id === payload.recordId);
  const item = record?.items?.find(entry => entry.id === payload.itemId);
  if (!item) throw Object.assign(new Error('FPC item not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, record.locationId)) throw Object.assign(new Error('You can only update FPC records for your assigned location'), { statusCode: 403 });
  ['description', 'priority', 'status', 'assignedTo', 'assignmentType', 'assigneeId', 'assigneeName', 'assigneeEmail', 'assigneePhone', 'vendorId', 'vendorName', 'assignmentNotify', 'targetDate'].forEach(key => {
    if (payload[key] !== undefined) item[key] = payload[key];
  });
  if (payload.photos !== undefined || payload.photoUrl !== undefined) {
    item.photos = normalizeFpcPhotos(payload);
    item.photoUrl = item.photos[0]?.url || '';
    item.photoName = item.photos[0]?.name || '';
  }
  item.assignmentEmail = await sendAssignmentEmail({ ...item, locationName: record.locationName }, 'FPC repair item');
  item.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('fpcRecords', records);
  return fpcState(actor);
}

async function addFpcComment(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can comment on FPC records'), { statusCode: 403 });
  const records = await readFpcRecords();
  const record = records.find(entry => entry.id === payload.recordId);
  const item = record?.items?.find(entry => entry.id === payload.itemId);
  if (!item) throw Object.assign(new Error('FPC item not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !canAccessLocation(actor, record.locationId)) throw Object.assign(new Error('You can only comment on FPC records for your assigned location'), { statusCode: 403 });
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
  return fpcState(actor);
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
    ? await saveAttachment({ ...payload.attachment, locationId: payload.locationId || DEFAULT_LOCATION_ID, kind: 'store-document', name: payload.attachment.name || title })
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

function defaultManagerNotificationPreferences() {
  return {
    incompleteTemps: { enabled: false, dueTime: '14:00', channels: ['in-app'] },
    outOfRangeTemps: { enabled: false, channels: ['in-app'] },
    newMaintenanceRequest: { enabled: false, channels: ['in-app'] },
    performanceReport: { cadence: 'none', sendTime: '08:00', channels: ['email'], includeTasks: true, includeTemps: true, includePm: true }
  };
}

function managerNotificationAllowed(actor) {
  return Boolean(actor && actor.role !== MAINTENANCE_ROLE && canManage(actor));
}

function cleanChannels(channels, fallback = ['in-app']) {
  const allowed = new Set(['email', 'sms', 'in-app']);
  const clean = Array.isArray(channels) ? [...new Set(channels.filter(channel => allowed.has(channel)))] : [];
  return clean.length ? clean : fallback;
}

function normalizeManagerNotificationPreferences(input = {}) {
  const defaults = defaultManagerNotificationPreferences();
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
  const cadence = ['none', 'daily', 'weekly', 'monthly'].includes(input.performanceReport?.cadence) ? input.performanceReport.cadence : 'none';
  return {
    incompleteTemps: {
      enabled: Boolean(input.incompleteTemps?.enabled),
      dueTime: validTime(input.incompleteTemps?.dueTime) ? input.incompleteTemps.dueTime : defaults.incompleteTemps.dueTime,
      channels: cleanChannels(input.incompleteTemps?.channels)
    },
    outOfRangeTemps: { enabled: Boolean(input.outOfRangeTemps?.enabled), channels: cleanChannels(input.outOfRangeTemps?.channels) },
    newMaintenanceRequest: { enabled: Boolean(input.newMaintenanceRequest?.enabled), channels: cleanChannels(input.newMaintenanceRequest?.channels) },
    performanceReport: {
      cadence,
      sendTime: validTime(input.performanceReport?.sendTime) ? input.performanceReport.sendTime : defaults.performanceReport.sendTime,
      channels: cleanChannels(input.performanceReport?.channels, ['email']),
      includeTasks: input.performanceReport?.includeTasks !== false,
      includeTemps: input.performanceReport?.includeTemps !== false,
      includePm: input.performanceReport?.includePm !== false
    }
  };
}

async function managerNotificationPreferencesState(actor) {
  const allowed = !AUTH_REQUIRED || managerNotificationAllowed(actor);
  if (!allowed) return { allowed: false, preferences: defaultManagerNotificationPreferences() };
  const stored = await readMaintenanceKey('managerNotificationPreferences', {});
  return { allowed: true, preferences: normalizeManagerNotificationPreferences(stored?.[actor?.id] || {}) };
}

async function saveManagerNotificationPreferences(payload, actor) {
  if (AUTH_REQUIRED && !managerNotificationAllowed(actor)) throw Object.assign(new Error('Notification settings are available to Managers and above'), { statusCode: 403 });
  const stored = await readMaintenanceKey('managerNotificationPreferences', {});
  const preferences = normalizeManagerNotificationPreferences(payload.preferences || payload);
  stored[actor?.id || 'local-manager'] = { ...preferences, updatedAt: new Date().toISOString() };
  await writeMaintenanceKey('managerNotificationPreferences', stored);
  return { allowed: true, preferences };
}

async function addPersonalAppNotice(recipient, title, message) {
  const notices = await readMaintenanceKey('notices', []);
  notices.push({ id: `notice-personal-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, title, message, targetUserIds: [recipient.id], createdBy: 'HIS OPS', createdAt: new Date().toISOString(), readBy: [], active: true });
  await writeMaintenanceKey('notices', notices.slice(-2000));
  return { delivered: true };
}

async function sendPreferredNotification({ recipient, channels, type, title, text, locationId = '', locationName = '' }) {
  const logs = [];
  for (const channel of cleanChannels(channels)) {
    let result;
    try {
      if (channel === 'email') result = await sendEmailMessage({ to: recipient.email, subject: title, text });
      else if (channel === 'sms') result = await sendTwilioSms(recipient.phone, text);
      else result = await addPersonalAppNotice(recipient, title, text);
    } catch (error) {
      result = { delivered: false, reason: error.message || 'Notification provider failed' };
    }
    logs.push({ type, channel, title, detail: text, locationId, locationName, recipientId: recipient.id, recipientName: recipient.name, to: channel === 'email' ? recipient.email : channel === 'sms' ? recipient.phone : 'HIS OPS', delivered: Boolean(result.delivered), skipped: Boolean(result.skipped), status: result.status ? String(result.status) : '', reason: result.reason || '' });
  }
  await appendNotificationLogs(logs);
  return logs;
}

async function importSpreadsheetChecklistTemplates(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can import checklists'), { statusCode: 403 });
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw Object.assign(new Error('No checklist items were provided'), { statusCode: 400 });
  if (items.length > 2000) throw Object.assign(new Error('Import files are limited to 2,000 checklist items'), { statusCode: 400 });
  const incoming = items.map(normalizeTaskTemplate);
  const templates = await readTaskTemplates();
  const keyFor = task => `${templateLocationId(task)}|${String(task.section || '').trim()}|${String(task.category || '').trim()}|${String(task.name || '').trim()}`.toLowerCase();
  const byKey = new Map(templates.filter(task => task.name).map(task => [keyFor(task), task]));
  let createdCount = 0;
  let updatedCount = 0;
  incoming.forEach(task => {
    const key = keyFor(task);
    const existing = byKey.get(key);
    if (existing) {
      Object.assign(existing, { ...task, id: existing.id, locationSchedules: existing.locationSchedules || task.locationSchedules || {} });
      updatedCount += 1;
    } else {
      templates.push(task);
      byKey.set(key, task);
      createdCount += 1;
    }
  });
  await writeMaintenanceKey('taskTemplates', templates);
  return { taskTemplates: templates, importedCount: incoming.length, createdCount, updatedCount };
}

async function readTemperatureStandards() {
  const stored = await readMaintenanceKey('temperatureStandards', {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function cleanTemperatureDefinitions(input = {}) {
  const clean = {};
  Object.entries(input || {}).forEach(([rawName, rawList]) => {
    const name = String(rawName || '').trim();
    if (!name || !rawList || typeof rawList !== 'object') return;
    const items = [...new Set(Object.values(rawList.areas || {}).flat().map(String).map(item => item.trim()).filter(Boolean))];
    const deliveryDaysByLocation = {};
    Object.entries(rawList.deliveryDaysByLocation || {}).forEach(([locationId, days]) => {
      deliveryDaysByLocation[String(locationId)] = Array.isArray(days) ? [...new Set(days.map(String).filter(day => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].includes(day)))] : [];
    });
    clean[name] = { requiredDaily: rawList.requiredDaily !== false, areas: { 'Products and equipment': items }, ...(Object.keys(deliveryDaysByLocation).length ? { deliveryDaysByLocation } : {}) };
  });
  return clean;
}

async function readTemperatureDefinitions() {
  const stored = await readMaintenanceKey('temperatureDefinitions', TEMPERATURE_ITEMS);
  const clean = cleanTemperatureDefinitions(stored);
  return Object.keys(clean).length ? clean : TEMPERATURE_ITEMS;
}

async function saveTemperatureDefinitions(payload = {}, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and above can edit temperature logs'), { statusCode: 403 });
  const definitions = cleanTemperatureDefinitions(payload.definitions);
  if (!Object.keys(definitions).length) throw Object.assign(new Error('Keep at least one temperature log'), { statusCode: 400 });
  if (Object.values(definitions).some(list => !Object.values(list.areas).flat().length)) throw Object.assign(new Error('Each temperature log needs at least one item'), { statusCode: 400 });
  await writeMaintenanceKey('temperatureDefinitions', definitions);
  return { definitions };
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
  return pathname ? signedStorageObjectUrl({ bucket: RECEIPTS_BUCKET, pathname }) : '';
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
  const storagePath = tenantStoragePath({ locationId, kind: `receipt-${payload.date || today()}`, name: payload.attachment.name || vendor, mimeType });
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
    locationIds: Array.isArray(payload.locationIds) ? [...new Set(payload.locationIds.map(String).filter(Boolean))] : [],
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

async function readPopCampaigns() {
  const campaigns = await readMaintenanceKey('popReaderboardCampaigns', []);
  return Array.isArray(campaigns) ? campaigns : [];
}

function popCampaignVisible(campaign, actor) {
  if (!AUTH_REQUIRED || isFullAccess(actor)) return true;
  const assigned = userLocationIds(actor);
  return (campaign.locationIds || []).some(locationId => assigned.includes(locationId));
}

async function popCampaignState(actor) {
  const campaigns = (await readPopCampaigns())
    .filter(campaign => campaign.active !== false && popCampaignVisible(campaign, actor))
    .sort((a, b) => String(a.startDate || a.dueDate).localeCompare(String(b.startDate || b.dueDate)))
    .map(campaign => ({ ...campaign, editable: !AUTH_REQUIRED || (actor?.role !== MAINTENANCE_ROLE && canManage(actor) && (isFullAccess(actor) || (campaign.locationIds || []).every(locationId => userLocationIds(actor).includes(locationId)))) }));
  return { campaigns, canManage: !AUTH_REQUIRED || (actor?.role !== MAINTENANCE_ROLE && canManage(actor)) };
}

async function savePopCampaign(payload, actor) {
  if (AUTH_REQUIRED && (actor?.role === MAINTENANCE_ROLE || !canManage(actor))) throw Object.assign(new Error('Only Managers and above can manage POP updates'), { statusCode: 403 });
  const title = String(payload.title || '').trim();
  const startDate = String(payload.startDate || '').trim();
  const dueDate = String(payload.dueDate || startDate).trim();
  if (!title || !startDate) throw Object.assign(new Error('Campaign name and display date are required'), { statusCode: 400 });
  const permitted = isFullAccess(actor) ? (await readLocations()).map(location => location.id) : userLocationIds(actor);
  const requested = Array.isArray(payload.locationIds) ? [...new Set(payload.locationIds.map(String))] : [];
  const locationIds = requested.filter(locationId => permitted.includes(locationId));
  if (!locationIds.length) throw Object.assign(new Error('Choose at least one assigned location'), { statusCode: 400 });
  const campaigns = await readPopCampaigns();
  const id = payload.id || `POP-${Date.now()}`;
  let campaign = campaigns.find(item => item.id === id);
  if (campaign && !popCampaignVisible(campaign, actor)) throw Object.assign(new Error('You cannot edit this POP update'), { statusCode: 403 });
  if (AUTH_REQUIRED && campaign && !isFullAccess(actor) && (campaign.locationIds || []).some(locationId => !permitted.includes(locationId))) throw Object.assign(new Error('Only a Director or Owner can edit a multi-area POP update'), { statusCode: 403 });
  const attachmentUrl = payload.attachment?.dataUrl
    ? await saveAttachment({ ...payload.attachment, locationId: (payload.locationIds || [])[0] || 'shared', kind: 'pop-readerboard', name: payload.attachment.name || title })
    : String(payload.attachmentUrl || campaign?.attachmentUrl || '').trim();
  if (!campaign) {
    campaign = { id, completions: {}, createdAt: new Date().toISOString(), createdBy: actor?.name || 'Manager', active: true };
    campaigns.push(campaign);
  }
  Object.assign(campaign, {
    title, startDate, dueDate, locationIds,
    popInstructions: String(payload.popInstructions || '').trim(),
    readerboardMessage: String(payload.readerboardMessage || '').trim(),
    attachmentUrl,
    attachmentName: payload.attachment?.name || payload.attachmentName || campaign.attachmentName || '',
    updatedAt: new Date().toISOString(), updatedBy: actor?.name || 'Manager', active: true
  });
  campaign.completions ||= {};
  await writeMaintenanceKey('popReaderboardCampaigns', campaigns);
  return popCampaignState(actor);
}

async function completePopCampaign(payload, actor) {
  const campaigns = await readPopCampaigns();
  const campaign = campaigns.find(item => item.id === payload.id && item.active !== false);
  if (!campaign || !popCampaignVisible(campaign, actor)) throw Object.assign(new Error('POP update was not found'), { statusCode: 404 });
  const locationId = actor?.authMode === 'kiosk' ? actor.location_id : String(payload.locationId || userLocationIds(actor)[0] || '');
  if (!campaign.locationIds.includes(locationId) || (AUTH_REQUIRED && !canAccessLocation(actor, locationId))) throw Object.assign(new Error('You cannot complete this update for that location'), { statusCode: 403 });
  campaign.completions ||= {};
  if (payload.completed === false) delete campaign.completions[locationId];
  else campaign.completions[locationId] = { completedAt: new Date().toISOString(), completedBy: actor?.name || 'Store employee', completedById: actor?.id || '' };
  campaign.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('popReaderboardCampaigns', campaigns);
  return popCampaignState(actor);
}

async function deletePopCampaign(id, actor) {
  if (AUTH_REQUIRED && (actor?.role === MAINTENANCE_ROLE || !canManage(actor))) throw Object.assign(new Error('Only Managers and above can remove POP updates'), { statusCode: 403 });
  const campaigns = await readPopCampaigns();
  const campaign = campaigns.find(item => item.id === id);
  if (!campaign || !popCampaignVisible(campaign, actor)) throw Object.assign(new Error('POP update was not found'), { statusCode: 404 });
  if (AUTH_REQUIRED && !isFullAccess(actor) && (campaign.locationIds || []).some(locationId => !userLocationIds(actor).includes(locationId))) throw Object.assign(new Error('Only a Director or Owner can remove a multi-area POP update'), { statusCode: 403 });
  campaign.active = false;
  campaign.updatedAt = new Date().toISOString();
  await writeMaintenanceKey('popReaderboardCampaigns', campaigns);
  return popCampaignState(actor);
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

const DASHBOARD_WIDGETS = ['financials', 'alerts', 'upcoming', 'marketing', 'incidents', 'taskLists', 'weeklyCleaning', 'tempLogs', 'maintenance', 'fpc', 'inspections', 'progress'];
const COMPANY_DASHBOARD_DEFAULT_KEY = '__company_default__';

function defaultDashboardPreferences() {
  return { visible: [...DASHBOARD_WIDGETS], order: [...DASHBOARD_WIDGETS], defaultRange: 'day', defaultLocationId: 'all' };
}

function normalizeDashboardPreferences(value = {}) {
  const defaults = defaultDashboardPreferences();
  const migratedVisible = Array.isArray(value.visible) && value.visible.includes('operations') ? [...value.visible, 'taskLists', 'weeklyCleaning', 'tempLogs'] : value.visible;
  const visible = Array.isArray(migratedVisible) ? [...new Set([...migratedVisible.filter(id => DASHBOARD_WIDGETS.includes(id)), 'marketing'])] : defaults.visible;
  const migratedOrder = Array.isArray(value.order) ? value.order.flatMap(id => id === 'operations' ? ['taskLists', 'weeklyCleaning', 'tempLogs'] : id) : [];
  const suppliedOrder = migratedOrder.filter(id => DASHBOARD_WIDGETS.includes(id));
  const order = [...new Set([...suppliedOrder, ...DASHBOARD_WIDGETS])];
  return {
    visible: [...new Set(visible)],
    order,
    defaultRange: ['day', 'week', 'month'].includes(value.defaultRange) ? value.defaultRange : 'day',
    defaultLocationId: String(value.defaultLocationId || 'all')
  };
}

function dashboardPreferencesForActor(storedValue, actor) {
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  const companyDefault = normalizeDashboardPreferences(stored[COMPANY_DASHBOARD_DEFAULT_KEY] || {});
  companyDefault.defaultLocationId = 'all';
  const personal = stored[actor?.id || 'local-user'];
  return {
    preferences: normalizeDashboardPreferences(personal || companyDefault),
    customizable: !AUTH_REQUIRED || canAreaManage(actor),
    hasPersonalPreferences: Boolean(personal),
    companyDefault,
    companyDefaultEditable: !AUTH_REQUIRED || actor?.role === 'Owner'
  };
}

async function dashboardPreferencesState(actor) {
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  return dashboardPreferencesForActor(storedValue, actor);
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
  return dashboardPreferencesForActor(stored, actor);
}

async function resetDashboardPreferences(actor) {
  if (AUTH_REQUIRED && !canAreaManage(actor)) throw Object.assign(new Error('Only Area Managers and above can reset dashboard settings'), { statusCode: 403 });
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  delete stored[actor?.id || 'local-user'];
  await writeMaintenanceKey('dashboardPreferences', stored);
  return dashboardPreferencesForActor(stored, actor);
}

async function saveCompanyDashboardDefault(payload, actor) {
  if (AUTH_REQUIRED && actor?.role !== 'Owner') throw Object.assign(new Error('Only the company Owner can change the company dashboard default'), { statusCode: 403 });
  const preferences = normalizeDashboardPreferences(payload.preferences || payload);
  preferences.defaultLocationId = 'all';
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  stored[COMPANY_DASHBOARD_DEFAULT_KEY] = preferences;
  await writeMaintenanceKey('dashboardPreferences', stored);
  return dashboardPreferencesForActor(stored, actor);
}

async function resetCompanyDashboardDefault(actor) {
  if (AUTH_REQUIRED && actor?.role !== 'Owner') throw Object.assign(new Error('Only the company Owner can reset the company dashboard default'), { statusCode: 403 });
  const storedValue = await readMaintenanceKey('dashboardPreferences', {});
  const stored = storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue) ? storedValue : {};
  delete stored[COMPANY_DASHBOARD_DEFAULT_KEY];
  await writeMaintenanceKey('dashboardPreferences', stored);
  return dashboardPreferencesForActor(stored, actor);
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

const ROLLOUT_SECTIONS = [
  { id: 'required', name: 'Required equipment', items: ['Tablet','Protective case and mount','Tablet charger and power','DQ OPS tablet enrollment','Raspberry Pi gateway','Pi power supply, case, and microSD card','Venstar thermostats for every HVAC zone','C-wire verified','Equipment labels'] },
  { id: 'network', name: 'Network and configuration', items: ['Wi-Fi credentials available','Pi and thermostats on the same private network','Wi-Fi signal verified','Unique Pi hostname','Unique DQ OPS gateway ID','Correct DQ OPS location ID','Thermostats named','Venstar Local API enabled','DHCP reservations created','Gateway security token installed','Gateway restarts after power loss'] },
  { id: 'verification', name: 'Installation verification', items: ['Tablet opens DQ OPS','Employee PIN sign-in tested','Tablet locked to correct location','Cleaning lists verified','Temperature lists verified','Notices verified','Store alarm tested','Thermostats visible in Location Health','Temperature readings verified','Remote setpoint change tested','Thermostat keypad locked','Pi reporting verified after reboot'] },
  { id: 'cameras', name: 'Optional cameras', optional: true, items: ['UniFi console or recorder installed','Storage configured','Cameras and mounts installed','Network cabling and PoE verified','Cameras adopted and named','Cameras assigned in DQ OPS','Snapshots verified','Retention period configured','Privacy and viewing angles checked'] },
  { id: 'future', name: 'Optional future equipment', optional: true, items: ['Equipment temperature sensors','Door sensors','Water-leak sensors','Power-loss alarms','Cellular backup','UPS battery backup','Spare charger','Spare Pi and microSD card','Printed quick-start guide'] },
  { id: 'handoff', name: 'Final handoff', items: ['Store manager trained','Employees trained on PIN sign-in','Manager trained on alarms','Area Manager trained on Location Health','Support information posted','Installation date recorded','Installer recorded','Follow-up scheduled'] }
];

async function rolloutState(actor) {
  const permissions = await readMaintenanceKey('rolloutPermissions', { userIds: [] });
  const allowed = !AUTH_REQUIRED || isFullAccess(actor) || (permissions.userIds || []).includes(String(actor?.id));
  if (!allowed) throw Object.assign(new Error('Location rollout access has not been granted'), { statusCode: 403 });
  const records = await readMaintenanceKey('locationRollouts', {});
  return { allowed: true, canManagePermissions: !AUTH_REQUIRED || isFullAccess(actor), sections: ROLLOUT_SECTIONS, records, installerUserIds: permissions.userIds || [], users: isFullAccess(actor) ? await readUsers() : [] };
}

async function saveRolloutItem(payload, actor) {
  const state = await rolloutState(actor);
  const locationId = String(payload.locationId || '');
  if (!(await readLocations()).some(location => String(location.id) === locationId)) throw Object.assign(new Error('Location not found'), { statusCode: 404 });
  const section = ROLLOUT_SECTIONS.find(value => value.id === payload.sectionId);
  const itemIndex = Number(payload.itemIndex);
  if (!section || !Number.isInteger(itemIndex) || !section.items[itemIndex]) throw Object.assign(new Error('Checklist item not found'), { statusCode: 404 });
  const records = state.records && typeof state.records === 'object' ? state.records : {};
  records[locationId] ||= {};
  const key = `${section.id}:${itemIndex}`;
  records[locationId][key] = { checked: payload.checked === true, updatedAt: new Date().toISOString(), updatedBy: actor?.name || 'Installer' };
  await writeMaintenanceKey('locationRollouts', records);
  return rolloutState(actor);
}

async function saveRolloutPermissions(payload, actor) {
  if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only the Director of Operations or Owner can assign installers'), { statusCode: 403 });
  const valid = new Set((await readUsers()).map(user => String(user.id)));
  const userIds = Array.isArray(payload.userIds) ? [...new Set(payload.userIds.map(String).filter(id => valid.has(id)))] : [];
  await writeMaintenanceKey('rolloutPermissions', { userIds, updatedAt: new Date().toISOString(), updatedBy: actor?.name || '' });
  return rolloutState(actor);
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

async function writeWorkOrder(payload, actor) {
  const technician = actor?.role === MAINTENANCE_ROLE;
  if (AUTH_REQUIRED && !technician && !canManage(actor)) {
    throw Object.assign(new Error('You do not have permission to create work orders'), { statusCode: 403 });
  }
  if (AUTH_REQUIRED && !technician && !isFullAccess(actor)) {
    const [appLocations, maintenanceLocations] = await Promise.all([readLocations(), readMaintenanceKey('locations', [])]);
    const assigned = appLocations.filter(location => userLocationIds(actor).includes(location.id));
    const names = new Set(assigned.map(location => maintenanceLocationKey(location.name)));
    const selected = maintenanceLocations.find(location => String(location['Location ID']) === String(payload.locationId));
    const selectedName = maintenanceLocationKey(payload.locationName || selected?.['Location Name'] || '');
    if (!names.has(selectedName)) throw Object.assign(new Error('You can only create work orders for your assigned location'), { statusCode: 403 });
  }
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
  await notifyNewMaintenanceRequest(item).catch(error => console.error('Manager maintenance notification failed', error));
  return item;
}

async function maintenanceStateForActor(actor, locationId = 'all') {
  const state = await maintenanceState(locationId);
  if (!AUTH_REQUIRED || !actor || isFullAccess(actor) || actor.role === MAINTENANCE_ROLE) return state;
  const appLocations = await readLocations();
  const assignedStores = appLocations.filter(location => userLocationIds(actor).includes(location.id));
  const assignedNames = new Set(assignedStores.map(location => maintenanceLocationKey(location.name)).filter(Boolean));
  const allowedMaintenanceIds = new Set(state.locations
    .filter(location => assignedNames.has(maintenanceLocationKey(location['Location Name'])))
    .map(location => String(location['Location ID'])));
  const allowedRow = row => allowedMaintenanceIds.has(String(row['Location ID'])) || assignedNames.has(maintenanceLocationKey(row['Location Name']));
  return {
    ...state,
    locations: state.locations.filter(allowedRow),
    equipment: state.equipment.filter(allowedRow),
    workOrders: state.workOrders.filter(allowedRow),
    pmSchedule: state.pmSchedule.filter(allowedRow)
  };
}

async function updateWorkOrder(payload, actor) {
  const workOrders = await readMaintenanceKey('workOrders', []);
  const row = workOrders.find(entry => entry['Work Order ID'] === payload.workOrderId);
  if (!row) throw Object.assign(new Error('Work order not found'), { statusCode: 404 });
  const technician = actor?.role === MAINTENANCE_ROLE;
  if (AUTH_REQUIRED && !technician && !canManage(actor)) throw Object.assign(new Error('You do not have permission to update work orders'), { statusCode: 403 });
  if (!(await canAccessMaintenanceRecord(actor, row))) throw Object.assign(new Error('You can only update work orders for your assigned location'), { statusCode: 403 });
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

async function createStorageUploadIntent(payload, actor) {
  if (AUTH_REQUIRED && !canManage(actor)) throw Object.assign(new Error('Only managers and authorized team members can upload documents'), { statusCode: 403 });
  const locationId = String(payload.locationId || userLocationIds(actor)[0] || DEFAULT_LOCATION_ID);
  if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You can only upload files for an assigned location'), { statusCode: 403 });
  const size = Number(payload.size || 0);
  if (!Number.isFinite(size) || size <= 0 || size > 50 * 1024 * 1024) throw Object.assign(new Error('Files must be between 1 byte and 50 MB'), { statusCode: 413 });
  const mimeType = String(payload.mimeType || 'application/octet-stream').slice(0, 150);
  const pathname = tenantStoragePath({ locationId, kind: payload.kind, name: payload.name, mimeType });
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${STORAGE_BUCKET}/${pathname}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || 'Secure upload could not be prepared'), { statusCode: response.status });
  const signedUrl = result.url ? new URL(String(result.url), `${SUPABASE_URL}/storage/v1/`) : null;
  const token = String(result.token || signedUrl?.searchParams.get('token') || '');
  if (!token) throw Object.assign(new Error('Secure upload token was not returned'), { statusCode: 502 });
  return { bucket: STORAGE_BUCKET, pathname, token, reference: storageObjectReference(STORAGE_BUCKET, pathname) };
}

async function saveAttachment(payload) {
  if (payload.dataUrl && payload.dataUrl.length > 5_500_000) {
    throw Object.assign(new Error('This file is too large for the current uploader. Please use a file under 4 MB or compress the PDF.'), { statusCode: 413 });
  }
  const [header, encoded] = payload.dataUrl.split(',');
  if (!encoded) throw Object.assign(new Error('Choose a file to upload'), { statusCode: 400 });
  const mimeType = header.split(';')[0].replace('data:', '') || 'application/octet-stream';
  const filename = tenantStoragePath({ ...payload, mimeType });
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
  return storageObjectReference(STORAGE_BUCKET, filename);
}

if (process.env.NODE_ENV === 'test') exports.__test = {
  financialDateRange,
  uniqueFinancialImportRows,
  platformAdminEmails,
  isPlatformAdmin,
  normalizeDashboardPreferences,
  dashboardPreferencesForActor,
  parseMultipartForm,
  parseFinancialAttachment,
  financialRowsReady,
  verifyMailgunRequest,
  requestedTenantId,
  selectTenantMembership,
  eligibleTenantProfileCandidates,
  signKioskToken,
  verifyKioskToken,
  storageObjectReference,
  parseStorageObject,
  tenantStoragePath,
  storageObjectAllowedForTenant,
  dehydrateStorageReferences,
  fpcInspectionFiles,
  consolidateFpcRecords,
  signQrCheckpointToken,
  verifyQrCheckpointToken
};

async function routeRequest(event) {
  try {
    const apiPath = event.path.replace(/^\/api/, '').replace(/^\/\.netlify\/functions\/api/, '') || '/';
    const method = event.httpMethod;
    const query = event.queryStringParameters || {};

    if (method === 'OPTIONS') return json(200, {});
    if (method === 'POST' && apiPath === '/financial-reports/email-ingest') return await receiveFinancialReportEmail(event);
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === 'GET' && apiPath === '/version') {
      return json(200, {
        version: APP_VERSION,
        build: process.env.DEPLOY_ID || process.env.COMMIT_REF || '2026.09.01.1'
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

    if (method === 'POST' && apiPath === '/gateway/thermostat/report') {
      return json(200, await saveThermostatReport(event, body));
    }

    if ((method === 'POST' && apiPath === '/session-profile') || (method === 'POST' && apiPath === '/accept-invite')) {
      const profile = await sessionProfile(event);
      return json(200, {
        profile,
        users: await readUsers(),
        tenant: await readTenantConfig(),
        availableTenants: await availableTenantsForAuthUser(event)
      });
    }

    if (method === 'POST' && apiPath === '/kiosk/enroll') return json(200, await enrollKiosk(body));
    if (method === 'GET' && apiPath === '/kiosk/employees') return json(200, await kioskEmployees(event));
    if (method === 'POST' && apiPath === '/kiosk/login') return json(200, await kioskPinLogin(event, body));
    if (method === 'POST' && apiPath === '/kiosk/session-profile') {
      const profile = await currentProfile(event);
      if (profile?.authMode !== 'kiosk') throw Object.assign(new Error('Employee session is not active'), { statusCode: 401 });
      return json(200, { profile: appProfile(profile), tenant: await readTenantConfig() });
    }

    if (method === 'GET' && apiPath === '/alerts/check' && query.secret && query.secret === process.env.ALERT_CRON_SECRET) {
      return json(200, await checkAlerts(query, null));
    }
    if (method === 'GET' && apiPath === '/assignments/digest' && query.secret && query.secret === process.env.ALERT_CRON_SECRET) {
      return json(200, await sendWeeklyAssignmentDigest(query));
    }

    const actor = AUTH_REQUIRED ? await currentProfile(event) : null;

    if (method === 'GET' && apiPath === '/subscription/admin') return json(200, await subscriptionAdminState(actor, query.tenantId || ''));
    if (method === 'POST' && apiPath === '/subscription/admin') return json(200, await saveSubscriptionAdmin(body, actor));
    if (method === 'GET' && apiPath === '/platform/admin') return json(200, await platformAdminState(actor, query.tenantId || ''));
    if (method === 'POST' && apiPath === '/platform/password-reset') return json(200, await sendPlatformPasswordReset(body, actor));
    if (method === 'POST' && apiPath === '/feedback') return json(200, await saveAppFeedback(body, actor));
    if (method === 'POST' && apiPath === '/platform/feedback') return json(200, await updateAppFeedback(body, actor));
    if (method === 'DELETE' && apiPath === '/platform/feedback') return json(200, await deleteAppFeedback(body, actor));

    const requiredFeature = requiredFeatureForPath(apiPath);
    if (requiredFeature) await assertSubscribedFeature(actor, requiredFeature, body.locationId || query.locationId || '');

    if (method === 'POST' && apiPath === '/storage/upload-intent') return json(200, await createStorageUploadIntent(body, actor));

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
      const [day, history, overdue, taskTemplates, notices, alertSettings, notificationLogs, calendarEvents, managementReports, dashboardPreferences, managerNotificationPreferences, popCampaigns, users, locations, subscription] = await Promise.all([
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
        managerNotificationPreferencesState(actor).catch(() => ({ allowed: false, preferences: defaultManagerNotificationPreferences() })),
        popCampaignState(actor).catch(() => ({ campaigns: [], canManage: false })),
        readUsers(),
        readLocations(),
        clientSubscriptionState(actor).catch(() => ({
          tenantId: tenantId(),
          canView: false,
          canEdit: false,
          migrationReady: false,
          subscription: { planKey: 'advanced', planName: 'Advanced', status: 'active', features: normalizeFeatureMap(FEATURE_CATALOG.map(feature => feature.key)), limits: DEFAULT_PLAN_DEFINITIONS.advanced.limits },
          locationAddons: []
        }))
      ]);
      return json(200, {
        locationId,
        day,
        history,
        overdue,
        temperatureItems: await readTemperatureDefinitions(),
        taskTemplates,
        notices,
        alertSettings,
        notificationLogs,
        calendarEvents,
        managementReports,
        dashboardPreferences,
        managerNotificationPreferences,
        popCampaigns,
        subscription,
        users: actor?.authMode === 'kiosk' ? users.filter(user => user.id === actor.id) : users,
        locations
      });
    }

    if (method === 'GET' && apiPath === '/users') return json(200, { users: await readUsers() });
    if (method === 'GET' && apiPath === '/kiosk/devices') return json(200, { devices: await readKioskDevices(actor) });
    if (method === 'GET' && apiPath === '/locations') return json(200, { locations: await readLocations() });
    if (method === 'GET' && apiPath === '/overdue') return json(200, { overdue: await readOverdue(query.date) });
    if (method === 'GET' && apiPath === '/dashboard') return json(200, await dashboardSummary(actor, query.range || 'day', query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/financial-reports/state') return json(200, await financialReportState(actor, query));
    if (method === 'GET' && apiPath === '/maintenance/state') return json(200, await maintenanceStateForActor(actor, query.locationId || 'all'));
    if (method === 'GET' && apiPath === '/maintenance-log/state') return json(200, await maintenanceWorkLogState(actor));
    if (method === 'GET' && apiPath === '/rollout/state') return json(200, await rolloutState(actor));
    if (method === 'GET' && apiPath === '/location-health/cameras') return json(200, await unifiCameraState(actor));
    if (method === 'GET' && apiPath === '/location-health/thermostats') return json(200, await thermostatState(actor));
    if (method === 'GET' && apiPath === '/location-health/camera-snapshot') return unifiCameraSnapshot(String(query.cameraId || ''), actor);
    if (method === 'GET' && apiPath === '/notices') return json(200, { notices: await readNotices(actor) });
    if (method === 'GET' && apiPath === '/notification-logs') return json(200, { logs: await readNotificationLogs(actor) });
    if (method === 'GET' && apiPath === '/store-alarms/state') return json(200, await storeAlarmState(actor));
    if (method === 'GET' && apiPath === '/calendar/state') return json(200, await calendarState(actor));
    if (method === 'GET' && apiPath === '/alerts/state') return json(200, await readAlertSettings());
    if (method === 'GET' && apiPath === '/temperature-standards') return json(200, { standards: await readTemperatureStandards() });
    if (method === 'GET' && apiPath === '/temperature-definitions') return json(200, { definitions: await readTemperatureDefinitions() });
    if (method === 'GET' && apiPath === '/temperature-compliance') return json(200, await temperatureComplianceHistory(actor, query));
    if (method === 'GET' && apiPath === '/alerts/check') return json(200, await checkAlerts(query, actor));
    if (method === 'GET' && apiPath === '/fpc/state') return json(200, await fpcState(actor));
    if (method === 'GET' && apiPath === '/store-documents/state') return json(200, await storeDocumentsState());
    if (method === 'GET' && apiPath === '/resources/state') return json(200, await resourcesState());
    if (method === 'GET' && apiPath === '/receipts/state') return json(200, await receiptState(actor));
    if (method === 'GET' && apiPath === '/inspections/state') return json(200, await inspectionState(actor));
    if (method === 'GET' && apiPath === '/smallwares/state') return json(200, await smallwaresState());
    if (method === 'GET' && apiPath === '/management-reports/state') return json(200, await managementReportsState(actor));
    if (method === 'GET' && apiPath === '/dashboard/preferences') return json(200, await dashboardPreferencesState(actor));
    if (method === 'GET' && apiPath === '/notification-preferences') return json(200, await managerNotificationPreferencesState(actor));
    if (method === 'GET' && apiPath === '/pop-campaigns/state') return json(200, await popCampaignState(actor));
    if (method === 'GET' && apiPath === '/qr-checkpoints/state') return json(200, await qrCheckpointState(actor, query));
    if (method === 'GET' && apiPath === '/qr-checkpoints/qr') return json(200, await qrCheckpointSvg(query, actor));

    if (method === 'POST' && apiPath === '/day') {
      const locationId = body.locationId || DEFAULT_LOCATION_ID;
      if (AUTH_REQUIRED && !canAccessLocation(actor, locationId)) throw Object.assign(new Error('You do not have access to that location'), { statusCode: 403 });
      const savedDay = await readDay(locationId, body.date);
      if (savedDay.temperatureCompliance?.locationClosed && (body.day?.temps || []).length > (savedDay.temps || []).length) {
        throw Object.assign(new Error('This location is marked closed for the selected day. Remove the closed status before recording temperatures.'), { statusCode: 409 });
      }
      if (body.date === localDate() && localHour() >= 14) {
        const savedDayTemps = (savedDay.temps || []).filter(reading => readingSession(reading) === 'Day').length;
        const submittedDayTemps = (body.day?.temps || []).filter(reading => readingSession(reading) === 'Day').length;
        if (submittedDayTemps > savedDayTemps) {
          throw Object.assign(new Error('Day temperatures close at 2:00 PM'), { statusCode: 403 });
        }
      }
      await assertQrTaskCompletions(savedDay, body.day || {});
      await writeDay(locationId, body.date, body.day);
      const readingKey = reading => `${reading.list || ''}|${reading.session || ''}|${reading.area || ''}|${reading.item || ''}|${reading.value}|${reading.time || ''}`;
      const priorReadings = new Set((savedDay.temps || []).map(readingKey));
      const newOutOfRange = (body.day?.temps || []).filter(reading => (reading.outOfRange || reading.correctiveAction) && !priorReadings.has(readingKey(reading)));
      if (newOutOfRange.length) await notifyOutOfRangeTemperature(locationId, newOutOfRange).catch(error => console.error('Temperature notification failed', error));
      return json(200, {
        history: await readHistory(locationId),
        overdue: await readOverdue(body.date)
      });
    }
    if (method === 'POST' && apiPath === '/task/snooze') {
      return json(200, await snoozeTask(body, actor));
    }
    if (method === 'POST' && apiPath === '/qr-checkpoints/checkpoint') return json(200, { checkpoint: await saveQrCheckpoint(body, actor) });
    if (method === 'POST' && apiPath === '/qr-checkpoints/deactivate') return json(200, await deactivateQrCheckpoint(body, actor));
    if (method === 'POST' && apiPath === '/qr-checkpoints/scan') return json(200, await scanQrCheckpoint(body, actor));

    if (method === 'POST' && apiPath === '/photo') {
      const reference = await saveAttachment({ ...body, kind: body.taskId || 'checklist-photo', name: `${body.date}-${body.taskId}` });
      return json(200, { url: await hydrateStorageReferences(reference) });
    }
    if (method === 'POST' && apiPath === '/user') {
      assertManageAccess(actor, body);
      await assertSubscriptionLimit('users', body.id || safeName(body.email || body.name));
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
    if (method === 'POST' && apiPath === '/temperature-compliance/closure') return json(200, await setTemperatureComplianceClosure(body, actor));
    if (method === 'POST' && apiPath === '/user/pin') return json(200, await setUserPin(body.id, body.pin, actor));
    if (method === 'POST' && apiPath === '/kiosk/enrollment') return json(200, await createKioskEnrollment(body, actor));
    if (method === 'POST' && apiPath === '/kiosk/revoke') return json(200, { devices: await revokeKioskDevice(body.id, actor) });
    if (method === 'POST' && apiPath === '/invite') {
      assertManageAccess(actor, body);
      await assertSubscriptionLimit('users', body.id || safeName(body.email || body.name));
      return json(200, { login: await createUserLogin({ ...body, invitedBy: body.invitedBy || actor?.name }), users: await readUsers() });
    }
    if (method === 'POST' && apiPath === '/location') {
      if (AUTH_REQUIRED && !isFullAccess(actor)) throw Object.assign(new Error('Only Director or Owner can edit store names'), { statusCode: 403 });
      await assertSubscriptionLimit('locations', body.id || safeName(body.name));
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
    if (method === 'POST' && apiPath === '/task-templates/import-spreadsheet') {
      return json(200, await importSpreadsheetChecklistTemplates(body, actor));
    }
    if (method === 'POST' && apiPath === '/notice') {
      return json(200, { notices: await saveNotice(body, actor) });
    }
    if (method === 'POST' && apiPath === '/notice/read') {
      return json(200, { notices: await markNoticeRead(body.id, actor) });
    }
    if (method === 'POST' && apiPath === '/notice/delete') return json(200, { notices: await deleteNotice(body.id, actor) });
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
    if (method === 'POST' && apiPath === '/temperature-definitions') return json(200, await saveTemperatureDefinitions(body, actor));
    if (method === 'POST' && apiPath === '/fpc/inspection') {
      return json(200, await saveFpcInspection(body, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/item') {
      return json(200, await saveFpcItem(body, actor));
    }
    if (method === 'POST' && apiPath === '/fpc/items/import') {
      return json(200, await importFpcItems(body, actor));
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
    if (method === 'POST' && apiPath === '/dashboard/company-default') return json(200, await saveCompanyDashboardDefault(body, actor));
    if (method === 'POST' && apiPath === '/dashboard/company-default/reset') return json(200, await resetCompanyDashboardDefault(actor));
    if (method === 'POST' && apiPath === '/financial-reports/import') return json(200, await importFinancialReports(body, actor));
    if (method === 'POST' && apiPath === '/financial-reports/reassign') return json(200, await reassignFinancialReport(body, actor));
    if (method === 'POST' && apiPath === '/financial-reports/mapping') return json(200, await saveFinancialStoreMapping(body, actor));
    if (method === 'POST' && apiPath === '/financial-reports/email-retry') return json(200, await retryFinancialEmailImport(body, actor));
    if (method === 'POST' && apiPath === '/notification-preferences') return json(200, await saveManagerNotificationPreferences(body, actor));
    if (method === 'POST' && apiPath === '/pop-campaigns/campaign') return json(200, await savePopCampaign(body, actor));
    if (method === 'POST' && apiPath === '/pop-campaigns/complete') return json(200, await completePopCampaign(body, actor));
    if (method === 'POST' && apiPath === '/pop-campaigns/delete') return json(200, await deletePopCampaign(body.id, actor));

    if (method === 'POST' && apiPath === '/maintenance/work-order') {
      const workOrder = await writeWorkOrder(body, actor);
      return json(200, { workOrder, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/work-order/update') {
      const workOrder = await updateWorkOrder(body, actor);
      return json(200, { workOrder, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/equipment') {
      const equipment = await writeEquipment(body);
      return json(200, { equipment, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/equipment/update') {
      const equipment = await updateEquipment(body);
      return json(200, { equipment, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/pm') {
      const pmTask = await writePmTask(body);
      return json(200, { pmTask, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/pm/update') {
      const pmTask = await updatePmTask(body);
      return json(200, { pmTask, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/priority-order') {
      return json(200, await saveMaintenancePriorityOrder(body, actor));
    }
    if (method === 'POST' && apiPath === '/maintenance/vendor') {
      const vendor = await saveVendor(body);
      return json(200, { vendor, state: await maintenanceStateForActor(actor, 'all') });
    }
    if (method === 'POST' && apiPath === '/maintenance/import') {
      return json(200, await importMaintenanceWorkbook(body));
    }
    if (method === 'POST' && apiPath === '/maintenance/attachment') return json(200, { url: await saveAttachment(body) });
    if (method === 'POST' && apiPath === '/maintenance-log/entry') return json(200, await saveMaintenanceWorkLog(body, actor));
    if (method === 'POST' && apiPath === '/maintenance-log/permissions') return json(200, await saveMaintenanceHoursPermissions(body, actor));
    if (method === 'POST' && apiPath === '/rollout/item') return json(200, await saveRolloutItem(body, actor));
    if (method === 'POST' && apiPath === '/rollout/permissions') return json(200, await saveRolloutPermissions(body, actor));
    if (method === 'POST' && apiPath === '/location-health/camera-mappings') return json(200, await saveUnifiCameraMappings(body, actor));
    if (method === 'POST' && apiPath === '/location-health/thermostat-command') return json(200, await queueThermostatCommand(body, actor));

    return json(404, { error: `Unknown route: ${method} ${apiPath}` });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Server error' });
  }
};

exports.handler = async event => {
  try {
    const resolvedTenantId = await resolveTenantForEvent(event);
    return await tenantRequestContext.run({ tenantId: resolvedTenantId }, () => routeRequest(event));
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'Server error' });
  }
};
