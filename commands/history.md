---
name: history
description: Show recent emotional stimuli
allowed-tools: Bash
---

Show recent emotional stimuli:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js history --limit 20
```

Display each stimulus with:
- Timestamp
- Emotion label and intensity (mildly/moderately/strongly)
- Trigger text
- Source role (user/assistant/system)

If the user requests a different limit, adjust the --limit flag.
