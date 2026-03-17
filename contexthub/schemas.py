from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterWorkspaceRequest(BaseModel):
    user_id: str = Field(alias="userId")
    workspace_kind: str = Field(alias="workspaceKind")
    agent_id: str | None = Field(default=None, alias="agentId")


class MkdirRequest(BaseModel):
    uri: str
    parents: bool = True


class RemoveRequest(BaseModel):
    uri: str
    recursive: bool = False


class WriteFileRequest(BaseModel):
    uri: str
    text: str
    create_parents: bool = Field(default=True, alias="createParents")
    overwrite: bool = True


class EditFileRequest(BaseModel):
    uri: str
    match_text: str = Field(alias="matchText")
    replace_text: str = Field(alias="replaceText")
    replace_all: bool = Field(default=False, alias="replaceAll")


class ApplyPatchRequest(BaseModel):
    uri: str
    patch: str


class MoveRequest(BaseModel):
    source_uri: str = Field(alias="sourceUri")
    destination_uri: str = Field(alias="destinationUri")
    create_parents: bool = Field(default=True, alias="createParents")
    overwrite: bool = False


class CopyRequest(BaseModel):
    source_uri: str = Field(alias="sourceUri")
    destination_uri: str = Field(alias="destinationUri")
    create_parents: bool = Field(default=True, alias="createParents")
    overwrite: bool = False


class SearchRequest(BaseModel):
    user_id: str = Field(alias="userId")
    query: str
    scope_uri: str | None = Field(default=None, alias="scopeUri")
    limit: int = 20


class GlobRequest(BaseModel):
    user_id: str = Field(alias="userId")
    pattern: str
    scope_uri: str | None = Field(default=None, alias="scopeUri")
    limit: int = 100


class GrepRequest(BaseModel):
    user_id: str = Field(alias="userId")
    pattern: str
    scope_uri: str | None = Field(default=None, alias="scopeUri")
    limit: int = 100
    case_sensitive: bool = Field(default=False, alias="caseSensitive")
    glob: str | None = None


class RgRequest(BaseModel):
    user_id: str = Field(alias="userId")
    pattern: str
    scope_uri: str | None = Field(default=None, alias="scopeUri")
    limit: int = 100
    case_sensitive: bool = Field(default=False, alias="caseSensitive")
    glob: str | None = None


class LsEntry(BaseModel):
    name: str
    uri: str
    kind: str


class LsResponse(BaseModel):
    uri: str
    entries: list[LsEntry]


class TreeNode(BaseModel):
    name: str
    uri: str
    kind: str
    children: list["TreeNode"] = []


class StatResponse(BaseModel):
    uri: str
    name: str
    kind: str
    size_bytes: int | None = Field(default=None, alias="sizeBytes")
    line_count: int | None = Field(default=None, alias="lineCount")
    child_count: int | None = Field(default=None, alias="childCount")


class ReadFileResponse(BaseModel):
    uri: str
    text: str
    line_count: int = Field(alias="lineCount")


class SearchHit(BaseModel):
    uri: str
    line_number: int = Field(alias="lineNumber")
    text: str


class SearchResponse(BaseModel):
    query: str
    scope_uri: str | None = Field(alias="scopeUri")
    hits: list[SearchHit]


class GlobHit(BaseModel):
    uri: str
    kind: str


class GlobResponse(BaseModel):
    pattern: str
    scope_uri: str | None = Field(alias="scopeUri")
    hits: list[GlobHit]


class GrepResponse(BaseModel):
    pattern: str
    scope_uri: str | None = Field(alias="scopeUri")
    hits: list[SearchHit]


TreeNode.model_rebuild()
