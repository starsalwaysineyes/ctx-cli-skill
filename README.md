# ctx-cli

npm-installable `ctx_cli` for ContextHub phase-1 filesystem access.

## Install

```bash
npm install -g @shiuing/ctx-cli
```

## Configure

```bash
ctx_cli config set baseUrl http://38.55.39.92:24040
ctx_cli config set userId shiuing
printf '%s' 'YOUR_BEARER_TOKEN' | ctx_cli config set token --stdin
```

For a fuller agent-oriented walkthrough, see `docs/agent-setup.md`.
You can also inspect bundled docs after install:

```bash
ctx_cli docs list
ctx_cli docs read agent-setup.md
```

## Use

```bash
ctx_cli search --query "cloud cutover"
ctx_cli reindex --scope-uri ctx://shiuing/defaultWorkspace
ctx_cli read ctx://shiuing/defaultWorkspace/docs/ctx-usage-experience.md
```

Config is stored at `~/.ctx/config.json` by default.
