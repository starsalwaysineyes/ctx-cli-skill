---
name: ctx-cli
description: Use the bundled ctx_cli executable to access a ContextHub phase-1 ctx:// cloud filesystem without relying on an OpenClaw plugin. Use when a coding agent, Codex shell, or other CLI-only environment needs `ls/tree/stat/read/write/edit/apply-patch/search/import-tree` against ContextHub.
---

# ctx-cli

This repo now ships two usable `ctx_cli` entrypoints:

- the original `uv`/Python wrapper in `./scripts/ctx_cli`
- an npm-installable Node CLI that reads `~/.ctx/config.json`

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
   - `CONTEXT_HUB_USER_ID`
2. If the target machine uses Bash, prefer login-shell startup files (`~/.bash_profile` or `~/.profile`) for these exports, or place them above any non-interactive early `return` in `~/.bashrc`; many agents use `bash -lc`, so exports placed after that return will be invisible.
3. Use the bundled wrapper:

```bash
./scripts/ctx_cli ls ctx://YOUR_USER_ID
./scripts/ctx_cli tree ctx://YOUR_USER_ID/defaultWorkspace --depth 2
./scripts/ctx_cli read ctx://YOUR_USER_ID/defaultWorkspace/memory/2026-03-17.md
```

## Common commands

```bash
export CONTEXT_HUB_USER_ID="YOUR_USER_ID"

./scripts/ctx_cli register-workspace --default
./scripts/ctx_cli mkdir ctx://YOUR_USER_ID/defaultWorkspace/tasks
./scripts/ctx_cli stat ctx://YOUR_USER_ID/defaultWorkspace/tasks
./scripts/ctx_cli write ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md --text "hello"
./scripts/ctx_cli edit ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md --match hello --replace world
./scripts/ctx_cli rm ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md
```

Search/import examples:

```bash
./scripts/ctx_cli search --query ContextHub --scope-uri ctx://YOUR_USER_ID/defaultWorkspace
./scripts/ctx_cli search --query 'cloud cutover' --mode hybrid
./scripts/ctx_cli search --query 'phase1' --workspace-mode user --mode lexical --expansion import-tree --expansion 24040
./scripts/ctx_cli reindex --scope-uri ctx://YOUR_USER_ID/defaultWorkspace
./scripts/ctx_cli grep --pattern cloud --scope-uri ctx://YOUR_USER_ID/defaultWorkspace --glob 'tasks/*.md'
./scripts/ctx_cli import-tree /path/to/memory ctx://YOUR_USER_ID/defaultWorkspace/memory --include '*.md'
```

## Optional global install

### Python / uv path

```bash
uv tool install --from . ctx-cli-skill --force --reinstall --refresh --no-cache
ctx_cli ls ctx://YOUR_USER_ID
```

### npm path

If the caller wants a config-file-first CLI without relying on shell exports:

```bash
npm install -g @starsalwaysineyes/ctx-cli
ctx_cli config set baseUrl http://YOUR_HOST:24040
ctx_cli config set userId YOUR_USER_ID
printf '%s' 'YOUR_BEARER_TOKEN' | ctx_cli config set token --stdin
ctx_cli search --query 'cloud cutover'
```

## Notes

- `ctx_cli` is the cloud/filesystem operator surface.
- The npm CLI stores config in `~/.ctx/config.json`; command-line flags and env vars still override it.
- The legacy Python wrapper still reads auth from shell env.
- Keep examples generic; do not commit real bearer tokens or private endpoints into downstream repos.
