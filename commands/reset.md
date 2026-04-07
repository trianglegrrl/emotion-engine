---
name: reset
description: Reset emotional state to personality baseline
allowed-tools: Bash
---

Reset the emotional state to baseline.

**Reset all dimensions:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js reset
```

**Reset specific dimensions** (if the user specifies them):
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js reset --dimensions pleasure,arousal
```

Valid dimensions: pleasure, arousal, dominance, connection, curiosity, energy, trust.

Confirm the reset was applied and show the new state briefly.
