---
name: dashboard
description: Launch the OpenFeelz web dashboard
allowed-tools: Bash
---

Launch the OpenFeelz Svelte dashboard for visual emotion monitoring.

The dashboard app is in the `dashboard-app/` directory of the plugin. To start it:

```bash
cd $CLAUDE_PLUGIN_ROOT/dashboard-app && npm run dev
```

Tell the user the URL (typically http://localhost:5173) and that they can open it in their browser.

Note: The dashboard needs the state file at $CLAUDE_PLUGIN_DATA/state.json to display data.
