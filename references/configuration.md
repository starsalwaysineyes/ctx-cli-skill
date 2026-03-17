# Configuration

This repo is intentionally de-sensitized.

## Required shell config

Set these in the shell before using `ctx_cli`:

```bash
export CONTEXT_HUB_BASE_URL="http://YOUR_HOST:24040"
export CONTEXT_HUB_TOKEN="YOUR_BEARER_TOKEN"
```

Optional convenience:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Example zshrc snippet

```zsh
export PATH="$HOME/.local/bin:$PATH"
export CONTEXT_HUB_BASE_URL="http://YOUR_HOST:24040"
export CONTEXT_HUB_TOKEN="YOUR_BEARER_TOKEN"
```

Then reload:

```bash
source ~/.zshrc
hash -r
```

## Two ways to use the repo

### 1. No install, use bundled wrapper

```bash
/path/to/ctx-cli-skill/scripts/ctx_cli ls ctx://YOUR_USER_ID
```

This is the most portable path for agents.

### 2. Install global executables

```bash
cd /path/to/ctx-cli-skill
uv tool install --from . ctx-cli-skill --force
ctx_cli ls ctx://YOUR_USER_ID
```

## Common checks

List root:

```bash
/path/to/ctx-cli-skill/scripts/ctx_cli ls ctx://YOUR_USER_ID
```

Read a file:

```bash
/path/to/ctx-cli-skill/scripts/ctx_cli read ctx://YOUR_USER_ID/defaultWorkspace/memory/2026-03-17.md
```

Write a file:

```bash
/path/to/ctx-cli-skill/scripts/ctx_cli write ctx://YOUR_USER_ID/defaultWorkspace/tasks/today.md --text "hello"
```

## Security notes

- Never commit a real bearer token into this repo.
- Prefer shell env vars or a local secret store.
- Replace `YOUR_HOST`, `YOUR_BEARER_TOKEN`, and `YOUR_USER_ID` before use.
