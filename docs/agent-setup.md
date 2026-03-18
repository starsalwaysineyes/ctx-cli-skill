# Agent Setup with npm ctx_cli

This is the fastest path for a new agent or coding environment that needs ContextHub access without relying on shell exports.

## Install

```bash
npm install -g @shiuing/ctx-cli
ctx_cli docs list
ctx_cli docs read agent-setup.md
```

## Configure

Set the minimum required values once:

```bash
ctx_cli config set baseUrl http://YOUR_HOST:24040
ctx_cli config set userId YOUR_USER_ID
printf '%s' 'YOUR_BEARER_TOKEN' | ctx_cli config set token --stdin
```

Config is stored in `~/.ctx/config.json` by default.

## Verify

```bash
ctx_cli config list
ctx_cli search --query 'cloud cutover' --limit 1
ctx_cli reindex --scope-uri ctx://YOUR_USER_ID/defaultWorkspace/docs
ctx_cli read ctx://YOUR_USER_ID/defaultWorkspace/docs/ctx-usage-experience.md
```

Expected search behavior:

- no `--user-id`
- no `--workspace-mode`
- default `workspaceMode=default-only`
- default `scopeUri=ctx://YOUR_USER_ID/defaultWorkspace`

## When to widen scope

Only add `--workspace-mode user` or `--workspace-mode default-first` when you intentionally want a broader search scope.

## Notes

- Runtime precedence is: command-line flags > environment variables > `~/.ctx/config.json` > built-in defaults.
- Use `ctx_cli config set token --stdin` so secrets do not land in shell history.
- If you prefer env-based setup, keep using the Python/uv wrapper path documented in `references/configuration.md`.
