# Deployment Log

This document records every step taken to deploy the emotion-engine plugin
to a live OpenClaw instance.

## Prerequisites

- Remote OpenClaw instance accessible via SSH on port 18795
- The `gh` CLI authenticated as `trianglegrrl`
- The plugin source at `github.com:trianglegrrl/emotion-engine`

## Steps

### Step 1: SCP the plugin source to the remote machine

```bash
scp -P 18795 -r /home/a/.openclaw/workspace/source/emotion-engine/ \
  remote-host:~/emotion-engine/
```

### Step 2: SSH into the remote machine

```bash
ssh -p 18795 remote-host
```

### Step 3: Install dependencies

```bash
cd ~/emotion-engine
npm install
```

### Step 4: Run tests on the remote machine

```bash
npm test
```

### Step 5: Install the plugin into OpenClaw

```bash
openclaw plugins install ~/emotion-engine
openclaw plugins enable emotion-engine
```

### Step 6: Verify with OpenClaw CLI

```bash
openclaw plugins list          # Confirm emotion-engine appears
openclaw emotion status        # Check emotional state
openclaw emotion personality   # Verify OCEAN profile
```

### Step 7: Restart the gateway

```bash
# Restart to pick up the new plugin
openclaw gateway restart
```

### Step 8: Verify hooks are active

```bash
openclaw hooks list            # Confirm emotion-engine hooks
openclaw emotion status --json # Verify JSON output
```

---

_Steps below are filled in during actual deployment._
