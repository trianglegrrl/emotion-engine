---
name: decay
description: Show or change decay preset
allowed-tools: Bash
---

**Show current preset:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js set-decay --preset current
```

**Change preset:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js set-decay --preset <slow|fast|turn>
```

Presets:
- **slow** — Time-based, ~12h half-life. Human-like emotional rhythms.
- **fast** — Time-based, ~1h half-life. Quick-cycling AI agent.
- **turn** — Turn-based, ~5 turns to baseline. Emotions decay each conversation turn regardless of wall clock time.

Note: Changing the preset takes effect on the next session start.
