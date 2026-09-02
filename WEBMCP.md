# HIS OPS agent tools and WebMCP

HIS OPS includes an experimental, progressively enhanced WebMCP adapter. The normal web and Android applications do not depend on WebMCP and continue to work when the browser does not support it.

## Initial tools

| Tool | Purpose | Saved-data effect |
| --- | --- | --- |
| `get_due_tasks` | Lists incomplete checklist tasks for an assigned location and date, with category, store-area, and section filters. | Read only |
| `get_due_temperatures` | Lists missing temperature readings for an assigned location and date, with session and list filters. | Read only |
| `open_help_section` | Opens a named Help topic. | Navigation only |
| `draft_maintenance_request` | Opens and prefills the normal maintenance form. | Draft only; never submits |
| `draft_incident_report` | Opens and prefills the normal incident form. | Draft only; never submits |

The browser-neutral registry is exposed as `window.HISOpsAgent` after sign-in. This is the same narrow interface a future in-app conversational assistant can use. If `document.modelContext.registerTool` is available, the tools are also registered with WebMCP.

## Security boundaries

- Existing HIS OPS authentication, role, subscription, tenant, and assigned-location checks remain authoritative.
- A location-scoped tool automatically uses the store only when the user has exactly one assigned location. Multi-location users must identify an assigned location by name or ID; the tool never silently falls back to the home location.
- Every task and temperature result repeats the location name used for the query.
- No tools are exposed to cross-origin frames or sites.
- Operational data returned by tools is annotated as untrusted content.
- Read-only tools are marked with `readOnlyHint: true`.
- Tool output is capped below 1,500 characters.
- The two draft tools only fill visible forms. The signed-in user must review and press the existing submit button.
- There is no tool for completing tasks, recording temperatures, changing thermostat settings, sending alerts, resetting passwords, or submitting operational records.

## Browser support

WebMCP is experimental. A supported Chrome release, flag, or origin-trial configuration may be required. The Help page reports whether WebMCP registered in the current browser. Unsupported browsers still receive the complete standard HIS OPS experience.

## Testing from the browser console

After signing in, developers can inspect the browser-neutral registry:

```js
HISOpsAgent.listTools()
```

The same local adapter can be exercised without WebMCP:

```js
await HISOpsAgent.executeTool('get_due_tasks', {
  location: 'North St Paul',
  scope: 'now',
  category: 'Manager',
  area: 'Exterior'
})
```

Do not add a new write-capable tool without a permission review, narrow input schema, explicit confirmation boundary, and automated test proving what it cannot submit.
