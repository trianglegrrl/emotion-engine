---
name: wizard
description: Interactive personality preset picker
allowed-tools: Bash
---

Walk the user through choosing a personality preset. Present these 10 options:

| # | Preset | Description |
|---|--------|-------------|
| 1 | Albert Einstein | High openness & conscientiousness, introspective |
| 2 | Marie Curie | Perseverance, solitary focus |
| 3 | Nelson Mandela | High agreeableness & extraversion, emotional stability |
| 4 | Wangari Maathai | Visionary, resilient |
| 5 | Frida Kahlo | High openness and emotional intensity |
| 6 | Confucius | High conscientiousness & agreeableness |
| 7 | Simon Bolivar | Visionary, charismatic, driven |
| 8 | Sitting Bull | Steadfast, calm under pressure |
| 9 | Sejong the Great | Scholarly, benevolent, humble |
| 10 | Rabindranath Tagore | Very high openness and agreeableness |

Ask the user to pick a number (or "custom" to set traits manually).

For presets, read the preset data:
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js get-personality
```

Then set each trait using the preset values. The personality presets are defined in the codebase at `src/config/personality-presets.ts`. Apply each trait:
```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js set-personality --trait openness --value <value>
node ${CLAUDE_PLUGIN_ROOT}/dist/src/helpers/state-helper.js set-personality --trait conscientiousness --value <value>
# ... etc for all 5 traits
```

For "custom", ask the user for each OCEAN trait value (0-1).

After setting, optionally ask about decay preset (slow/fast/turn).

Show the final personality profile.
