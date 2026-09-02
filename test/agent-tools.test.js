const test = require('node:test');
const assert = require('node:assert/strict');

const agentTools = require('../app/agent-tools.js');

function fixtureActions(calls = []) {
  return {
    getDueTasks: args => ({ location: 'North St Paul', dueCount: 1, args, items: [{ name: 'Clean restroom' }] }),
    getDueTemperatures: args => ({ location: 'North St Paul', dueCount: 1, args, items: [{ item: 'Walk-in freezer', unit: '°F' }] }),
    openHelpSection: args => ({ opened: args.section, savedDataChanged: false }),
    draftMaintenanceRequest: args => { calls.push(['maintenance', args]); return { draftReady: true, submitted: false }; },
    draftIncidentReport: args => { calls.push(['incident', args]); return { draftReady: true, submitted: false }; }
  };
}

test('agent registry exposes only the approved initial HIS OPS tools', () => {
  const tools = agentTools.createToolDefinitions(fixtureActions());
  assert.deepEqual(tools.map(tool => tool.name), [
    'get_due_tasks',
    'get_due_temperatures',
    'open_help_section',
    'draft_maintenance_request',
    'draft_incident_report'
  ]);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[1].annotations.readOnlyHint, true);
  assert.equal(tools[3].annotations.readOnlyHint, false);
  assert.equal(tools[4].annotations.readOnlyHint, false);
});

test('draft tools prepare content but do not submit it', async () => {
  const calls = [];
  const tools = agentTools.createToolDefinitions(fixtureActions(calls));
  const maintenance = JSON.parse(await agentTools.executeTool(tools, 'draft_maintenance_request', { description: 'Freezer is warm' }));
  const incident = JSON.parse(await agentTools.executeTool(tools, 'draft_incident_report', { title: 'Register issue', details: 'Count did not match' }));
  assert.equal(maintenance.draftReady, true);
  assert.equal(maintenance.submitted, false);
  assert.equal(incident.draftReady, true);
  assert.equal(incident.submitted, false);
  assert.deepEqual(calls.map(call => call[0]), ['maintenance', 'incident']);
});

test('tool output stays within the recommended WebMCP character budget', async () => {
  const tools = agentTools.createToolDefinitions({
    ...fixtureActions(),
    getDueTasks: () => ({ items: [{ name: 'x'.repeat(3000) }] })
  });
  const output = await agentTools.executeTool(tools, 'get_due_tasks', {});
  assert.ok(output.length <= agentTools.MAX_OUTPUT_LENGTH);
  assert.equal(JSON.parse(output).shortened, true);
});

test('WebMCP registration is feature detected and same-document only', async () => {
  const tools = agentTools.createToolDefinitions(fixtureActions());
  const registrations = [];
  const supported = await agentTools.registerWebMcpTools({
    modelContext: {
      registerTool: async (tool, options) => registrations.push({ tool, options })
    }
  }, tools);
  assert.equal(supported.available, true);
  assert.equal(registrations.length, 5);
  assert.ok(registrations.every(entry => entry.options.signal instanceof AbortSignal));
  assert.ok(registrations.every(entry => !Object.prototype.hasOwnProperty.call(entry.options, 'exposedTo')));

  const unsupported = await agentTools.registerWebMcpTools({}, tools);
  assert.equal(unsupported.available, false);
});

test('the app loads the agent adapter and documents the review boundary', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require.resolve('../app/index.html'), 'utf8');
  const app = fs.readFileSync(require.resolve('../app/app.js'), 'utf8');
  assert.match(html, /agent-tools\.js/);
  assert.match(html, /Human review is required/);
  assert.match(app, /submitted: false, reviewRequired: true/);
  assert.doesNotMatch(app, /HISOpsAgent[\s\S]{0,500}submitManagementReport/);
});
