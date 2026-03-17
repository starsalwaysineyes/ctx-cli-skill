---
name: ctx-cli
description: Use the bundled ctx_cli executable to access a ContextHub phase-1 ctx:// cloud filesystem without relying on an OpenClaw plugin. Use when a coding agent, Codex shell, or other CLI-only environment needs `ls/tree/stat/read/write/edit/apply-patch/search/import-tree` against ContextHub.
---

# ctx-cli

This skill ships a usable `ctx_cli` with the repo itself.

## Use this first

Preferred entrypoint inside the skill repo:

```bash
./scripts/ctx_cli ls ctx://YOUR_USER_ID
```

The wrapper runs the bundled Python package through `uv`, so the caller does not need the OpenClaw plugin runtime.

## Quick start

1. Read `references/configuration.md` and set:
   - `CONTEXT_HUB_BASE_URL`
   - `CONTEXT_HUB_TOKEN`
2. Use the bundled wrapper:

```bash
./scripts/ctx_cli ls ctx://YOUR_USER_ID
./scripts/ctx_cli tree ctx://YOUR_USER_ID/defaultWorkspace --depth 2
./scripts/ctx_cli read ctx://YOUR_USER_ID/defaultWorkspace/memory/2026-03-17.md
```

## Common commands

```bash
./scripts/ctx_cli register-workspace --user-id YOUR_USER_ID --default
./scripts/ctx_cli mkdir ctx://YOUR_USER_ID/defaultWorkspace/tasks
./scripts/ctx_cli stat ctx://YOUR_USER_ID/defaultWorkspace/tasks
./scripts/ctx_cli write ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md --text "hello"
./scripts/ctx_cli edit ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md --match hello --replace world
./scripts/ctx_cli rm ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md
```

Search/import examples:

```bash
./scripts/ctx_cli search --user-id YOUR_USER_ID --query ContextHub --scope-uri ctx://YOUR_USER_ID/defaultWorkspace
./scripts/ctx_cli grep --user-id YOUR_USER_ID --pattern cloud --scope-uri ctx://YOUR_USER_ID/defaultWorkspace --glob 'tasks/*.md'
./scripts/ctx_cli import-tree /path/to/memory ctx://YOUR_USER_ID/defaultWorkspace/memory --include '*.md'
```

## Optional global install

If the caller wants a real shell command on `PATH`:

```bash
uv tool install --from . ctx-cli-skill --force
ctx_cli ls ctx://YOUR_USER_ID
```

## Notes

- `ctx_cli` is the cloud/filesystem operator surface.
- It reads auth from shell env, not from hardcoded repo secrets.
- Keep examples generic; do not commit real bearer tokens or private endpoints into downstream repos.
