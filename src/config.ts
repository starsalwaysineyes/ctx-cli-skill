import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { CtxPluginConfig } from "./runtime.js";

export interface CtxCliProfile {
  baseUrl?: string;
  token?: string;
  userId?: string;
  localRoot?: string;
  timeoutMs?: number;
}

export interface CtxCliConfigFile {
  currentProfile: string;
  profiles: Record<string, CtxCliProfile>;
}

export interface CliGlobalOptions {
  configPath?: string;
  profile?: string;
}

const DEFAULT_PROFILE = "default";
const DEFAULT_TIMEOUT_MS = 30_000;

export function defaultConfigPath(): string {
  const configured = (process.env.CTX_CLI_CONFIG || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".ctx", "config.json");
}

export async function loadConfigFile(configPath = defaultConfigPath()): Promise<CtxCliConfigFile> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CtxCliConfigFile>;
    return normalizeConfigFile(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyConfigFile();
    }
    throw error;
  }
}

export async function saveConfigFile(config: CtxCliConfigFile, configPath = defaultConfigPath()): Promise<void> {
  const normalized = normalizeConfigFile(config);
  const targetPath = path.resolve(configPath);
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await fs.chmod(directory, 0o700);
  } catch {
    // Best-effort permission tightening.
  }
  const tempPath = `${targetPath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, targetPath);
  try {
    await fs.chmod(targetPath, 0o600);
  } catch {
    // Best-effort permission tightening.
  }
}

export function resolveProfileName(config: CtxCliConfigFile, explicit?: string): string {
  const fromEnv = (process.env.CTX_CLI_PROFILE || "").trim();
  return (explicit || fromEnv || config.currentProfile || DEFAULT_PROFILE).trim() || DEFAULT_PROFILE;
}

export function getProfile(config: CtxCliConfigFile, name: string): CtxCliProfile {
  return { ...(config.profiles[name] || {}) };
}

export function redactConfig(config: CtxCliConfigFile): CtxCliConfigFile {
  const profiles = Object.fromEntries(
    Object.entries(config.profiles).map(([name, profile]) => [name, redactProfile(profile)]),
  );
  return {
    currentProfile: config.currentProfile,
    profiles,
  };
}

export function redactValue(key: string, value: string | number | undefined, showSecret: boolean): string {
  if (value === undefined) return "";
  if (key !== "token" || showSecret) return String(value);
  const token = String(value);
  if (!token) return "";
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function setProfileValue(profile: CtxCliProfile, key: string, rawValue: string): CtxCliProfile {
  const next = { ...profile };
  switch (normalizeKey(key)) {
    case "baseUrl":
      next.baseUrl = rawValue.trim();
      break;
    case "token":
      next.token = rawValue.trim();
      break;
    case "userId":
      next.userId = rawValue.trim();
      break;
    case "localRoot":
      next.localRoot = rawValue.trim();
      break;
    case "timeoutMs": {
      const timeout = Number(rawValue);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error("timeoutMs must be a positive number");
      }
      next.timeoutMs = Math.floor(timeout);
      break;
    }
    default:
      throw new Error(`unsupported config key: ${key}`);
  }
  return next;
}

export function unsetProfileValue(profile: CtxCliProfile, key: string): CtxCliProfile {
  const normalized = normalizeKey(key);
  const next = { ...profile };
  switch (normalized) {
    case "baseUrl":
      delete next.baseUrl;
      break;
    case "token":
      delete next.token;
      break;
    case "userId":
      delete next.userId;
      break;
    case "localRoot":
      delete next.localRoot;
      break;
    case "timeoutMs":
      delete next.timeoutMs;
      break;
    default:
      throw new Error(`unsupported config key: ${key}`);
  }
  return next;
}

export function resolveRuntimeConfig(config: CtxCliConfigFile, options: CliGlobalOptions): CtxPluginConfig {
  const profile = getProfile(config, resolveProfileName(config, options.profile));
  const home = process.env.HOME || os.homedir() || "/tmp";
  const timeoutFromEnv = Number((process.env.CTX_CLI_TIMEOUT_MS || "").trim());
  const timeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? Math.floor(timeoutFromEnv)
    : Number.isFinite(profile.timeoutMs)
      ? Math.max(1, Math.floor(profile.timeoutMs || DEFAULT_TIMEOUT_MS))
      : DEFAULT_TIMEOUT_MS;
  const baseUrl = (process.env.CONTEXT_HUB_BASE_URL || profile.baseUrl || "http://127.0.0.1:4040").trim();
  const token = (process.env.CONTEXT_HUB_TOKEN || profile.token || "").trim() || undefined;
  const defaultUserId = (process.env.CONTEXT_HUB_USER_ID || profile.userId || "").trim() || undefined;
  const localRootRaw = (process.env.CTX_CLI_LOCAL_ROOT || profile.localRoot || `${home}/.openclaw/workspace`).trim();
  return {
    baseUrl,
    token,
    defaultUserId,
    localRoot: path.resolve(localRootRaw),
    timeoutMs,
  };
}

export function importEnvIntoProfile(profile: CtxCliProfile): CtxCliProfile {
  const next = { ...profile };
  const baseUrl = (process.env.CONTEXT_HUB_BASE_URL || "").trim();
  const token = (process.env.CONTEXT_HUB_TOKEN || "").trim();
  const userId = (process.env.CONTEXT_HUB_USER_ID || "").trim();
  const localRoot = (process.env.CTX_CLI_LOCAL_ROOT || "").trim();
  const timeoutRaw = (process.env.CTX_CLI_TIMEOUT_MS || "").trim();
  if (baseUrl) next.baseUrl = baseUrl;
  if (token) next.token = token;
  if (userId) next.userId = userId;
  if (localRoot) next.localRoot = localRoot;
  if (timeoutRaw) {
    const timeout = Number(timeoutRaw);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error("CTX_CLI_TIMEOUT_MS must be a positive number");
    }
    next.timeoutMs = Math.floor(timeout);
  }
  return next;
}

function emptyConfigFile(): CtxCliConfigFile {
  return {
    currentProfile: DEFAULT_PROFILE,
    profiles: {},
  };
}

function normalizeConfigFile(value: Partial<CtxCliConfigFile> | undefined): CtxCliConfigFile {
  const profiles = Object.fromEntries(
    Object.entries(value?.profiles || {}).map(([name, profile]) => [name, normalizeProfile(profile || {})]),
  );
  return {
    currentProfile: (value?.currentProfile || DEFAULT_PROFILE).trim() || DEFAULT_PROFILE,
    profiles,
  };
}

function normalizeProfile(value: CtxCliProfile): CtxCliProfile {
  const profile: CtxCliProfile = {};
  if (value.baseUrl) profile.baseUrl = String(value.baseUrl).trim();
  if (value.token) profile.token = String(value.token).trim();
  if (value.userId) profile.userId = String(value.userId).trim();
  if (value.localRoot) profile.localRoot = String(value.localRoot).trim();
  if (value.timeoutMs !== undefined && Number.isFinite(Number(value.timeoutMs))) {
    profile.timeoutMs = Math.max(1, Math.floor(Number(value.timeoutMs)));
  }
  return profile;
}

function normalizeKey(key: string): "baseUrl" | "token" | "userId" | "localRoot" | "timeoutMs" {
  const cleaned = key.trim();
  switch (cleaned) {
    case "baseUrl":
    case "base-url":
      return "baseUrl";
    case "token":
      return "token";
    case "userId":
    case "user-id":
    case "defaultUserId":
      return "userId";
    case "localRoot":
    case "local-root":
      return "localRoot";
    case "timeoutMs":
    case "timeout-ms":
      return "timeoutMs";
    default:
      throw new Error(`unsupported config key: ${key}`);
  }
}

function redactProfile(profile: CtxCliProfile): CtxCliProfile {
  return {
    ...profile,
    token: profile.token ? redactValue("token", profile.token, false) : undefined,
  };
}
