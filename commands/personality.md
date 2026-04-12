---
name: personality
description: Show or set OCEAN personality traits
allowed-tools: Bash
---

**Show personality:** Run without arguments:
```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js get-personality
```

Display the OCEAN profile with trait names and values (0-1 scale).

**Set a trait:** If the user provides a trait and value (e.g., "set openness 0.8"):
```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js set-personality --trait <trait> --value <value>
```

Valid traits: openness, conscientiousness, extraversion, agreeableness, neuroticism.
Values must be between 0 and 1.

Show the updated personality profile after setting.
