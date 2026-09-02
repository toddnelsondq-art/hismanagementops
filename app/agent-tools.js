(function initDqOpsAgentTools(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DqOpsAgentTools = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAgentToolsModule() {
  const MAX_OUTPUT_LENGTH = 1450;

  function asText(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.length <= MAX_OUTPUT_LENGTH) return text;
    return JSON.stringify({
      shortened: true,
      message: 'The result was shortened. Open HIS OPS to review the complete information.',
      excerpt: text.slice(0, 1200)
    });
  }

  function requiredAction(actions, name) {
    if (typeof actions?.[name] !== 'function') throw new Error(`Missing HIS OPS agent action: ${name}`);
    return actions[name];
  }

  function locationKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\bsaint\b/g, 'st')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function locationTokenKey(value = '') {
    return locationKey(value).split(' ').filter(Boolean).sort().join('|');
  }

  function resolveAssignedLocation(allLocations = [], allowedLocationIds = [], reference = '', options = {}) {
    const allowed = new Set((allowedLocationIds || []).map(String));
    const available = (allLocations || []).filter(location => allowed.has(String(location.id)));
    if (!available.length) throw new Error('No HIS OPS locations are assigned to this account.');
    const explicitReference = String(reference || '').trim();
    if (!explicitReference && options.requireExplicitForMultiple && available.length > 1) {
      throw new Error(`Choose a location before continuing. Available locations: ${available.map(location => location.name).join(', ')}.`);
    }
    const requested = explicitReference || String(options.fallbackLocationId || available[0].id);
    const requestedKey = locationKey(requested);
    const requestedTokenKey = locationTokenKey(requested);
    const location = available.find(entry => String(entry.id) === requested)
      || available.find(entry => locationKey(entry.name) === requestedKey)
      || available.find(entry => locationTokenKey(entry.name) === requestedTokenKey);
    if (!location) {
      throw new Error(`Choose an assigned HIS OPS location. Available locations: ${available.map(entry => entry.name).join(', ')}.`);
    }
    return location;
  }

  function createToolDefinitions(actions = {}) {
    const invoke = name => async (args = {}, execution = {}) => {
      if (execution.signal?.aborted) throw new DOMException('Tool execution was cancelled', 'AbortError');
      const result = await requiredAction(actions, name)(args, execution);
      return asText(result);
    };

    return [
      {
        name: 'get_due_tasks',
        description: 'List incomplete checklist tasks for an assigned HIS OPS location and date. Multi-location users must identify the location. Does not change any record.',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Assigned HIS OPS location name or ID. Required when the signed-in user can access multiple locations.' },
            scope: { type: 'string', enum: ['now', 'today'], description: 'Use now for the current daypart or today for every incomplete task.' },
            category: { type: 'string', enum: ['all', 'Manager', 'Chill', 'Grill', 'Service'], description: 'Optional checklist category filter.' },
            area: { type: 'string', enum: ['Service', 'Chill', 'Grill', 'Exterior', 'Back of house'], description: 'Optional store-area filter.' },
            section: { type: 'string', description: 'Optional exact checklist section name.' }
          },
          additionalProperties: false
        },
        execute: invoke('getDueTasks'),
        annotations: { readOnlyHint: true, untrustedContentHint: true }
      },
      {
        name: 'get_due_temperatures',
        description: 'List missing temperature readings for an assigned HIS OPS location and date. Multi-location users must identify the location. Does not record a temperature.',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Assigned HIS OPS location name or ID. Required when the signed-in user can access multiple locations.' },
            session: { type: 'string', enum: ['Day', 'Afternoon'], description: 'Temperature session to review.' },
            list: { type: 'string', description: 'Optional exact temperature-list name, such as Grill or Chill.' }
          },
          additionalProperties: false
        },
        execute: invoke('getDueTemperatures'),
        annotations: { readOnlyHint: true, untrustedContentHint: true }
      },
      {
        name: 'open_help_section',
        description: 'Open an HIS OPS Help topic for the signed-in user. This only navigates the interface and does not change saved data.',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: ['contents', 'navigation', 'dashboard', 'tasks', 'temperatures', 'maintenance', 'incidents', 'users', 'notifications', 'agent-tools'],
              description: 'Help topic to open.'
            }
          },
          required: ['section'],
          additionalProperties: false
        },
        execute: invoke('openHelpSection'),
        annotations: { readOnlyHint: false, untrustedContentHint: false }
      },
      {
        name: 'draft_maintenance_request',
        description: 'Open and prefill a new HIS OPS maintenance request. Never submits it; the signed-in user must review and press Create work order.',
        inputSchema: {
          type: 'object',
          properties: {
            description: { type: 'string', maxLength: 2000, description: 'Issue, symptoms, and anything already checked.' },
            location: { type: 'string', description: 'Assigned HIS OPS location name or ID. Required when the signed-in user can access multiple locations.' },
            location_id: { type: 'string', description: 'Legacy assigned HIS OPS location ID. Use location for new integrations.' },
            category: { type: 'string', description: 'Optional maintenance category.' },
            priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Emergency'], description: 'Optional priority.' },
            target_date: { type: 'string', format: 'date', description: 'Optional target date in YYYY-MM-DD format.' }
          },
          required: ['description'],
          additionalProperties: false
        },
        execute: invoke('draftMaintenanceRequest'),
        annotations: { readOnlyHint: false, untrustedContentHint: true }
      },
      {
        name: 'draft_incident_report',
        description: 'Open and prefill a new HIS OPS incident report. Never submits it; the signed-in user must review and press Submit management report.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 120, description: 'Short subject.' },
            details: { type: 'string', maxLength: 4000, description: 'Relevant facts and how the issue was discovered.' },
            location: { type: 'string', description: 'Assigned HIS OPS location name or ID. Required when the signed-in user can access multiple locations.' },
            location_id: { type: 'string', description: 'Legacy assigned HIS OPS location ID. Use location for new integrations.' },
            issue_type: { type: 'string', description: 'Optional incident type shown in HIS OPS.' },
            severity: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'], description: 'Optional severity.' },
            immediate_action: { type: 'string', maxLength: 2000, description: 'Optional action already taken.' },
            amount: { type: 'number', minimum: 0, description: 'Optional cash amount.' }
          },
          required: ['title', 'details'],
          additionalProperties: false
        },
        execute: invoke('draftIncidentReport'),
        annotations: { readOnlyHint: false, untrustedContentHint: true }
      }
    ];
  }

  async function registerWebMcpTools(documentRef, tools, controller = new AbortController()) {
    const modelContext = documentRef?.modelContext;
    if (!modelContext?.registerTool) return { available: false, controller, names: [] };
    for (const tool of tools) await modelContext.registerTool(tool, { signal: controller.signal });
    return { available: true, controller, names: tools.map(tool => tool.name) };
  }

  async function executeTool(tools, name, args = {}) {
    const tool = tools.find(entry => entry.name === name);
    if (!tool) throw new Error(`Unknown HIS OPS agent tool: ${name}`);
    return tool.execute(args, {});
  }

  return { createToolDefinitions, registerWebMcpTools, executeTool, resolveAssignedLocation, MAX_OUTPUT_LENGTH };
});
