from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path, PurePosixPath
import re
import shutil

from contexthub.config import Settings
from contexthub.uri import CtxUri, UriError, build_user_root_uri, build_workspace_uri, parse_ctx_uri


class FilesystemError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkspaceRoot:
    user_id: str
    workspace_kind: str
    agent_id: str | None
    path: Path

    @property
    def uri(self) -> str:
        return build_workspace_uri(
            user_id=self.user_id,
            workspace_kind=self.workspace_kind,
            agent_id=self.agent_id,
        )


class FilesystemService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._users_root.mkdir(parents=True, exist_ok=True)

    @property
    def _users_root(self) -> Path:
        return self.settings.data_dir / "users"

    def register_workspace(self, *, user_id: str, workspace_kind: str, agent_id: str | None) -> dict:
        workspace_uri = build_workspace_uri(
            user_id=user_id,
            workspace_kind=workspace_kind,
            agent_id=agent_id,
        )
        parsed = parse_ctx_uri(workspace_uri)
        root = self._workspace_root(parsed)
        root.mkdir(parents=True, exist_ok=True)
        return {
            "uri": workspace_uri,
            "workspaceKind": workspace_kind,
            "agentId": agent_id,
        }

    def mkdir(self, uri: str, *, parents: bool) -> dict:
        parsed = self._parse(uri)
        target = self._target_path(parsed)
        if parsed.is_user_root:
            target.mkdir(parents=True, exist_ok=True)
            return {"uri": parsed.raw, "created": True}
        if parsed.is_workspace_root:
            self._workspace_root(parsed).mkdir(parents=True, exist_ok=True)
            return {"uri": parsed.raw, "created": True}
        target.mkdir(parents=parents, exist_ok=True)
        return {"uri": parsed.raw, "created": True}

    def ls(self, uri: str) -> dict:
        parsed = self._parse(uri)
        target = self._target_path(parsed)
        if not target.exists():
            raise FilesystemError(f"path does not exist: {uri}")
        if not target.is_dir():
            raise FilesystemError(f"path is not a directory: {uri}")
        entries = []
        if parsed.is_user_root:
            default_root = target / "defaultWorkspace"
            if default_root.exists():
                entries.append({"name": "defaultWorkspace", "uri": f"{parsed.raw}/defaultWorkspace", "kind": "dir"})
            agent_root = target / "agentWorkspaces"
            if agent_root.exists():
                for child in sorted(agent_root.iterdir(), key=lambda item: item.name):
                    if child.is_dir():
                        entries.append(
                            {
                                "name": f"agentWorkspace/{child.name}",
                                "uri": f"{parsed.raw}/agentWorkspace/{child.name}",
                                "kind": "dir",
                            }
                        )
            return {"uri": parsed.raw, "entries": entries}

        for child in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name)):
            entries.append(
                {
                    "name": child.name,
                    "uri": self._child_uri(parsed, child.name),
                    "kind": "dir" if child.is_dir() else "file",
                }
            )
        return {"uri": parsed.raw, "entries": entries}

    def stat(self, uri: str) -> dict:
        parsed = self._parse(uri)
        target = self._target_path(parsed)
        if not target.exists():
            raise FilesystemError(f"path does not exist: {uri}")

        if parsed.is_user_root:
            name = parsed.user_id
            kind = "dir"
            child_count = len(self.ls(uri)["entries"])
            return {
                "uri": parsed.raw,
                "name": name,
                "kind": kind,
                "sizeBytes": None,
                "lineCount": None,
                "childCount": child_count,
            }

        if parsed.is_workspace_root:
            name = parsed.workspace_label
        else:
            name = target.name

        if target.is_dir():
            return {
                "uri": parsed.raw,
                "name": name,
                "kind": "dir",
                "sizeBytes": None,
                "lineCount": None,
                "childCount": len(list(target.iterdir())),
            }

        text = target.read_text(encoding="utf-8")
        return {
            "uri": parsed.raw,
            "name": name,
            "kind": "file",
            "sizeBytes": target.stat().st_size,
            "lineCount": len(text.splitlines()) if text else 0,
            "childCount": None,
        }

    def tree(self, uri: str, *, depth: int) -> dict:
        parsed = self._parse(uri)
        target = self._target_path(parsed)
        if not target.exists():
            raise FilesystemError(f"path does not exist: {uri}")

        def walk(current_path: Path, current_uri: str, remaining: int) -> dict:
            node = {
                "name": current_path.name if current_path.name else current_uri,
                "uri": current_uri,
                "kind": "dir" if current_path.is_dir() else "file",
                "children": [],
            }
            if current_path.is_dir() and remaining > 0:
                for child in sorted(current_path.iterdir(), key=lambda item: (not item.is_dir(), item.name)):
                    child_uri = f"{current_uri.rstrip('/')}/{child.name}"
                    node["children"].append(walk(child, child_uri, remaining - 1))
            return node

        return walk(target, parsed.raw, max(depth, 0))

    def read(self, uri: str) -> dict:
        parsed = self._parse(uri)
        if parsed.is_user_root or parsed.is_workspace_root:
            raise FilesystemError(f"path is not a file: {uri}")
        target = self._target_path(parsed)
        if not target.exists():
            raise FilesystemError(f"path does not exist: {uri}")
        if not target.is_file():
            raise FilesystemError(f"path is not a file: {uri}")
        text = target.read_text(encoding="utf-8")
        return {
            "uri": parsed.raw,
            "text": text,
            "lineCount": len(text.splitlines()) if text else 0,
        }

    def write(self, uri: str, *, text: str, create_parents: bool, overwrite: bool) -> dict:
        parsed = self._parse(uri)
        if parsed.is_user_root or parsed.is_workspace_root:
            raise FilesystemError("cannot write to a workspace root")
        target = self._target_path(parsed)
        if target.exists() and target.is_dir():
            raise FilesystemError(f"path is a directory: {uri}")
        if target.exists() and not overwrite:
            raise FilesystemError(f"file already exists: {uri}")
        if create_parents:
            target.parent.mkdir(parents=True, exist_ok=True)
        elif not target.parent.exists():
            raise FilesystemError(f"parent directory does not exist: {target.parent}")
        target.write_text(text, encoding="utf-8")
        return {"uri": parsed.raw, "written": True}

    def edit(self, uri: str, *, match_text: str, replace_text: str, replace_all: bool) -> dict:
        current = self.read(uri)
        text = current["text"]
        match_count = _count_substring_occurrences(text, match_text)
        if match_count == 0:
            raise FilesystemError("matchText not found")
        if match_count > 1 and not replace_all:
            raise FilesystemError("matchText matched multiple locations; set replaceAll=true")
        next_text = text.replace(match_text, replace_text, -1 if replace_all else 1)
        self.write(uri, text=next_text, create_parents=True, overwrite=True)
        return {
            "uri": uri,
            "matched": match_count,
            "replaced": match_count if replace_all else 1,
        }

    def apply_patch(self, uri: str, *, patch: str) -> dict:
        current = self.read(uri)
        current_lines = current["text"].splitlines()
        hunks = _parse_patch_hunks(patch)
        if not hunks:
            raise FilesystemError("no patch hunks found")

        applied = []
        for index, hunk in enumerate(hunks, start=1):
            preimage = [line[1:] for line in hunk if line.startswith((" ", "-"))]
            postimage = [line[1:] for line in hunk if line.startswith((" ", "+"))]
            if not preimage:
                raise FilesystemError("patch hunks must include context or removed lines")
            positions = _find_block_positions(current_lines, preimage)
            if not positions:
                raise FilesystemError(f"patch hunk {index} did not match current file")
            if len(positions) > 1:
                raise FilesystemError(f"patch hunk {index} matched multiple locations")
            start = positions[0]
            current_lines = current_lines[:start] + postimage + current_lines[start + len(preimage) :]
            applied.append(
                {
                    "index": index,
                    "startLine": start + 1,
                    "removedLines": len([line for line in hunk if line.startswith("-")]),
                    "addedLines": len([line for line in hunk if line.startswith("+")]),
                }
            )

        next_text = "\n".join(current_lines)
        self.write(uri, text=next_text, create_parents=True, overwrite=True)
        return {"uri": uri, "hunks": len(hunks), "applied": applied}

    def move(self, source_uri: str, destination_uri: str, *, create_parents: bool, overwrite: bool) -> dict:
        source = self._parse(source_uri)
        destination = self._parse(destination_uri)
        source_path = self._target_path(source)
        destination_path = self._target_path(destination)
        self._validate_mutating_uri(source)
        self._validate_mutating_uri(destination)
        if not source_path.exists():
            raise FilesystemError(f"path does not exist: {source_uri}")
        if destination_path.exists() and not overwrite:
            raise FilesystemError(f"destination already exists: {destination_uri}")
        if create_parents:
            destination_path.parent.mkdir(parents=True, exist_ok=True)
        elif not destination_path.parent.exists():
            raise FilesystemError(f"parent directory does not exist: {destination_path.parent}")
        if destination_path.exists():
            if destination_path.is_dir() and not source_path.is_dir():
                raise FilesystemError(f"destination is a directory: {destination_uri}")
            if destination_path.is_file():
                destination_path.unlink()
            else:
                shutil.rmtree(destination_path)
        shutil.move(str(source_path), str(destination_path))
        return {"sourceUri": source_uri, "destinationUri": destination_uri, "moved": True}

    def copy(self, source_uri: str, destination_uri: str, *, create_parents: bool, overwrite: bool) -> dict:
        source = self._parse(source_uri)
        destination = self._parse(destination_uri)
        source_path = self._target_path(source)
        destination_path = self._target_path(destination)
        self._validate_mutating_uri(source)
        self._validate_mutating_uri(destination)
        if not source_path.exists():
            raise FilesystemError(f"path does not exist: {source_uri}")
        if destination_path.exists() and not overwrite:
            raise FilesystemError(f"destination already exists: {destination_uri}")
        if create_parents:
            destination_path.parent.mkdir(parents=True, exist_ok=True)
        elif not destination_path.parent.exists():
            raise FilesystemError(f"parent directory does not exist: {destination_path.parent}")
        if destination_path.exists():
            if destination_path.is_file():
                destination_path.unlink()
            else:
                shutil.rmtree(destination_path)
        if source_path.is_dir():
            shutil.copytree(source_path, destination_path)
        else:
            shutil.copy2(source_path, destination_path)
        return {"sourceUri": source_uri, "destinationUri": destination_uri, "copied": True}

    def remove(self, uri: str, *, recursive: bool) -> dict:
        parsed = self._parse(uri)
        self._validate_mutating_uri(parsed)
        target = self._target_path(parsed)
        if not target.exists():
            raise FilesystemError(f"path does not exist: {uri}")
        kind = "dir" if target.is_dir() else "file"
        if target.is_file():
            target.unlink()
            return {"uri": uri, "kind": kind, "removed": True}
        if recursive:
            shutil.rmtree(target)
            return {"uri": uri, "kind": kind, "removed": True}
        try:
            target.rmdir()
        except OSError as exc:
            raise FilesystemError(f"directory is not empty: {uri}; set recursive=true") from exc
        return {"uri": uri, "kind": kind, "removed": True}

    def search(self, *, user_id: str, query: str, scope_uri: str | None, limit: int) -> dict:
        hits = self._grep_hits(
            user_id=user_id,
            pattern=query,
            scope_uri=scope_uri,
            limit=limit,
            case_sensitive=False,
            glob_pattern=None,
            regex_mode=False,
        )
        return {"query": query, "scopeUri": scope_uri, "hits": hits}

    def glob(self, *, user_id: str, pattern: str, scope_uri: str | None, limit: int) -> dict:
        cleaned = pattern.strip()
        if not cleaned:
            raise FilesystemError("pattern is required")
        hits = []
        for path, uri, kind, relative in self._iter_scope_nodes(user_id=user_id, scope_uri=scope_uri):
            rel_value = relative.as_posix() if relative else path.name
            if fnmatch(rel_value, cleaned) or fnmatch(path.name, cleaned):
                hits.append({"uri": uri, "kind": kind})
                if len(hits) >= limit:
                    break
        return {"pattern": pattern, "scopeUri": scope_uri, "hits": hits}

    def grep(self, *, user_id: str, pattern: str, scope_uri: str | None, limit: int, case_sensitive: bool, glob_pattern: str | None) -> dict:
        hits = self._grep_hits(
            user_id=user_id,
            pattern=pattern,
            scope_uri=scope_uri,
            limit=limit,
            case_sensitive=case_sensitive,
            glob_pattern=glob_pattern,
            regex_mode=False,
        )
        return {"pattern": pattern, "scopeUri": scope_uri, "hits": hits}

    def rg(self, *, user_id: str, pattern: str, scope_uri: str | None, limit: int, case_sensitive: bool, glob_pattern: str | None) -> dict:
        hits = self._grep_hits(
            user_id=user_id,
            pattern=pattern,
            scope_uri=scope_uri,
            limit=limit,
            case_sensitive=case_sensitive,
            glob_pattern=glob_pattern,
            regex_mode=True,
        )
        return {"pattern": pattern, "scopeUri": scope_uri, "hits": hits}

    def _parse(self, uri: str) -> CtxUri:
        try:
            return parse_ctx_uri(uri)
        except UriError as exc:
            raise FilesystemError(str(exc)) from exc

    def _workspace_root(self, parsed: CtxUri) -> Path:
        user_root = self._users_root / parsed.user_id
        if parsed.workspace_kind == "defaultWorkspace":
            return user_root / "defaultWorkspace"
        if parsed.workspace_kind == "agentWorkspace":
            return user_root / "agentWorkspaces" / str(parsed.agent_id)
        return user_root

    def _target_path(self, parsed: CtxUri) -> Path:
        root = self._workspace_root(parsed)
        if parsed.is_user_root or parsed.is_workspace_root:
            return root
        return root / Path(str(parsed.relative_path))

    def _child_uri(self, parent: CtxUri, child_name: str) -> str:
        base = parent.raw.rstrip("/")
        return f"{base}/{child_name}"

    def _all_workspace_roots(self, user_id: str) -> list[WorkspaceRoot]:
        user_root = self._users_root / user_id
        roots = [
            WorkspaceRoot(
                user_id=user_id,
                workspace_kind="defaultWorkspace",
                agent_id=None,
                path=user_root / "defaultWorkspace",
            )
        ]
        agent_root = user_root / "agentWorkspaces"
        if agent_root.exists():
            for child in sorted(agent_root.iterdir()):
                if child.is_dir():
                    roots.append(
                        WorkspaceRoot(
                            user_id=user_id,
                            workspace_kind="agentWorkspace",
                            agent_id=child.name,
                            path=child,
                        )
                    )
        return roots

    def _scope_roots(self, parsed: CtxUri) -> list[WorkspaceRoot]:
        if parsed.is_user_root:
            return self._all_workspace_roots(parsed.user_id)
        return [
            WorkspaceRoot(
                user_id=parsed.user_id,
                workspace_kind=parsed.workspace_kind,
                agent_id=parsed.agent_id,
                path=self._workspace_root(parsed),
            )
        ]

    def _validate_mutating_uri(self, parsed: CtxUri) -> None:
        if parsed.is_user_root or parsed.is_workspace_root:
            raise FilesystemError("cannot mutate a user root or workspace root directly")

    def _iter_scope_nodes(self, *, user_id: str, scope_uri: str | None):
        if scope_uri is None:
            for root in self._all_workspace_roots(user_id):
                if not root.path.exists():
                    continue
                yield from self._iter_root_nodes(root)
            return

        scope = self._parse(scope_uri)
        if scope.is_user_root:
            for root in self._all_workspace_roots(scope.user_id):
                if not root.path.exists():
                    continue
                yield from self._iter_root_nodes(root)
            return

        root = WorkspaceRoot(
            user_id=scope.user_id,
            workspace_kind=scope.workspace_kind,
            agent_id=scope.agent_id,
            path=self._workspace_root(scope),
        )
        scope_path = self._target_path(scope)
        if not scope_path.exists():
            raise FilesystemError(f"path does not exist: {scope_uri}")
        if scope_path.is_file():
            yield scope_path, scope.raw, "file", PurePosixPath(scope_path.name)
            return
        yield scope_path, scope.raw, "dir", PurePosixPath(".")
        for child in sorted(scope_path.rglob("*")):
            relative = PurePosixPath(child.relative_to(scope_path).as_posix())
            child_uri = f"{scope.raw.rstrip('/')}/{relative.as_posix()}"
            yield child, child_uri, ("dir" if child.is_dir() else "file"), relative

    def _iter_root_nodes(self, root: WorkspaceRoot):
        yield root.path, root.uri, "dir", PurePosixPath(".")
        for path in sorted(root.path.rglob("*")):
            relative = PurePosixPath(path.relative_to(root.path).as_posix())
            yield path, self._path_to_uri(root, path), ("dir" if path.is_dir() else "file"), relative

    def _grep_hits(
        self,
        *,
        user_id: str,
        pattern: str,
        scope_uri: str | None,
        limit: int,
        case_sensitive: bool,
        glob_pattern: str | None,
        regex_mode: bool,
    ) -> list[dict]:
        cleaned = pattern.strip()
        if not cleaned:
            raise FilesystemError("pattern is required")
        flags = 0 if case_sensitive else re.IGNORECASE
        compiled = re.compile(cleaned, flags) if regex_mode else None
        literal = cleaned if case_sensitive else cleaned.lower()
        hits = []
        for path, uri, kind, relative in self._iter_scope_nodes(user_id=user_id, scope_uri=scope_uri):
            if kind != "file":
                continue
            rel_value = relative.as_posix() if relative else path.name
            if glob_pattern and not (fnmatch(rel_value, glob_pattern) or fnmatch(path.name, glob_pattern)):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for line_number, line in enumerate(text.splitlines(), start=1):
                matched = bool(compiled.search(line)) if compiled else (literal in (line if case_sensitive else line.lower()))
                if matched:
                    hits.append({"uri": uri, "lineNumber": line_number, "text": line})
                    if len(hits) >= limit:
                        return hits
        return hits

    def _path_to_uri(self, root: WorkspaceRoot, path: Path) -> str:
        rel = PurePosixPath(path.relative_to(root.path).as_posix())
        base = root.uri
        if str(rel) == ".":
            return base
        return f"{base}/{rel.as_posix()}"


def _count_substring_occurrences(text: str, needle: str) -> int:
    if not needle:
        return 0
    count = start = 0
    while True:
        index = text.find(needle, start)
        if index < 0:
            return count
        count += 1
        start = index + len(needle)


def _parse_patch_hunks(patch_text: str) -> list[list[str]]:
    hunks: list[list[str]] = []
    current: list[str] = []
    saw_patch_marker = False

    for raw_line in patch_text.splitlines():
        if raw_line.startswith("*** Begin Patch"):
            saw_patch_marker = True
            continue
        if raw_line.startswith("*** End Patch"):
            break
        if raw_line.startswith(("*** Update File:", "*** Delete File:", "*** Add File:", "--- ", "+++ ")):
            saw_patch_marker = True
            continue
        if raw_line.startswith("@@"):
            saw_patch_marker = True
            if current:
                hunks.append(current)
                current = []
            continue
        if raw_line.startswith("\\"):
            continue
        if raw_line.startswith((" ", "+", "-")):
            saw_patch_marker = True
            current.append(raw_line)
            continue
        if raw_line.strip() == "":
            if current:
                raise FilesystemError("blank lines inside hunks must keep a diff prefix")
            continue
        if saw_patch_marker:
            raise FilesystemError(f"invalid patch line: {raw_line}")

    if current:
        hunks.append(current)
    return hunks


def _find_block_positions(lines: list[str], needle: list[str]) -> list[int]:
    positions = []
    if not needle:
        return positions
    max_start = len(lines) - len(needle)
    for start in range(max_start + 1):
        if lines[start : start + len(needle)] == needle:
            positions.append(start)
    return positions
