# Configuration

This repo is intentionally de-sensitized.

## Required shell config

Set these in the shell before using `ctx_cli`:

```bash
export CONTEXT_HUB_BASE_URL="http://YOUR_HOST:24040"
export CONTEXT_HUB_TOKEN="YOUR_BEARER_TOKEN"
export CONTEXT_HUB_USER_ID="YOUR_USER_ID"
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
export CONTEXT_HUB_USER_ID="YOUR_USER_ID"
```

Then reload:

```bash
source ~/.zshrc
hash -r
```

## Bash login-shell caveat

Many coding-agent and server setups use `bash -lc ...`. If `~/.bash_profile` sources `~/.bashrc`, and `~/.bashrc` has an early non-interactive return like `case $- in *i*) ;; *) return;; esac` or `[ -z "$PS1" ] && return`, any exports placed after that line will be invisible to `bash -lc`.

Safer options:

1. Put the exports in `~/.bash_profile` or `~/.profile`
2. If you must use `~/.bashrc`, place the exports above the early return

Example `~/.bash_profile` snippet:

```bash
export PATH="$HOME/.local/bin:$PATH"
export CONTEXT_HUB_BASE_URL="http://YOUR_HOST:24040"
export CONTEXT_HUB_TOKEN="YOUR_BEARER_TOKEN"
export CONTEXT_HUB_USER_ID="YOUR_USER_ID"
```

Validate with:

```bash
bash -lc 'printf "%s\n" "$CONTEXT_HUB_BASE_URL" "$CONTEXT_HUB_USER_ID"'
```

If you want the npm/config-file-first path, read `docs/agent-setup.md` first.

## Three ways to use the repo

### 1. No install, use bundled wrapper

```bash
/path/to/ctx-cli-skill/scripts/ctx_cli ls ctx://YOUR_USER_ID
```

This is the most portable path for agents.

### 2. Install global executables via uv

```bash
cd /path/to/ctx-cli-skill
uv tool install --from . ctx-cli-skill --force --reinstall --refresh --no-cache
ctx_cli ls ctx://YOUR_USER_ID
```

### 3. Install npm CLI with config file support

```bash
npm install -g @shiuing/ctx-cli
ctx_cli config set baseUrl http://YOUR_HOST:24040
ctx_cli config set userId YOUR_USER_ID
printf '%s' 'YOUR_BEARER_TOKEN' | ctx_cli config set token --stdin
ctx_cli config resolve
ctx_cli doctor
ctx_cli search --query 'cloud cutover'
```

The npm CLI stores config in `~/.ctx/config.json` by default and merges values with this precedence:

1. command-line flags
2. environment variables
3. `~/.ctx/config.json`
4. built-in defaults

## Common checks

After `CONTEXT_HUB_USER_ID` is set, commands that require a user scope can omit `--user-id`.

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
- Prefer shell env vars, `ctx_cli config set token --stdin`, or a local secret store.
- Replace `YOUR_HOST`, `YOUR_BEARER_TOKEN`, and `YOUR_USER_ID` before use.
- Commands that require a user scope (`register-workspace`, `search`, `glob`, `grep`, `rg`, `reindex`) can now omit `--user-id` when `CONTEXT_HUB_USER_ID` is set or when npm config stores `userId`.
- `search` defaults to `defaultWorkspace`; only pass `--workspace-mode user` or `--workspace-mode default-first` when you intentionally want a broader scope.
