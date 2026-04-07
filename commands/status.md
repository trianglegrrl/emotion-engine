---
name: status
description: Show current emotional state
allowed-tools: Bash, Read
---

Run the OpenFeelz state helper to get the current emotional state:

```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js query --format full
```

Parse the JSON output. If `ok` is true, display the `data` object as a readable summary:

- Show OCEAN personality traits with values
- Show PAD dimensions that deviate from baseline (elevated/lowered)
- Show active basic emotions above 0.01
- Show last 5 recent stimuli with timestamps, labels, and triggers
- Show active rumination count
- If the `tokenUsage` field is present in the query result data, show classification token usage: "Classifications: N calls, X input tokens, Y output tokens, $Z.ZZ total cost"

Format with clear headings and use intensity descriptors (mildly/moderately/strongly).

If `ok` is false, show the error message.
