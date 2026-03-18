#!/usr/bin/env node
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

import {
  defaultConfigPath,
  getProfile,
  importEnvIntoProfile,
  loadConfigFile,
  redactConfig,
  redactValue,
  resolveProfileName,
  resolveRuntimeConfig,
  saveConfigFile,
  setProfileValue,
  unsetProfileValue,
  type CliGlobalOptions,
  type CtxCliConfigFile,
  type CtxCliProfile,
} from "./config.js";
import { CtxRuntime, HELP_TEXT } from "./runtime.js";

const CLI_HELP = [
  "ctx_cli",
  "",
  "usage:",
  "  ctx_cli <op> [args] [--cloud|--local] [--json]",
  "  ctx_cli config <path|list|get|set|unset|use|import-env|resolve> [args]",
  "  ctx_cli docs <path|list|read> [name]",
  "  ctx_cli doctor [--json] [--show-secret]",
  "",
  "global options:",
  "  --config <path>    Override config file path (default: ~/.ctx/config.json)",
  "  --profile <name>   Use a specific saved profile",
  "",
  "config examples:",
  "  ctx_cli config set baseUrl http://YOUR_HOST:24040",
  "  ctx_cli config set userId YOUR_USER_ID",
  "  printf '%s' 'TOKEN' | ctx_cli config set token --stdin",
  "  ctx_cli config import-env",
  "  ctx_cli config resolve",
  "  ctx_cli config list",
  "  ctx_cli doctor",
  "",
  "runtime notes:",
  "  precedence = command flags > env vars > ~/.ctx/config.json",
  "  env vars   = CONTEXT_HUB_BASE_URL, CONTEXT_HUB_TOKEN, CONTEXT_HUB_USER_ID",
  "  defaults   = search uses defaultWorkspace unless widened explicitly",
  "",
  HELP_TEXT,
].join("\n");

async function main(): Promise<void> {
  const { args, options } = parseGlobalOptions(process.argv.slice(2));
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    console.log(CLI_HELP);
    return;
  }

  if (args[0] === "config") {
    await handleConfig(args.slice(1), options);
    return;
  }

  if (args[0] === "docs") {
    await handleDocs(args.slice(1));
    return;
  }

  if (args[0] === "doctor") {
    await handleDoctor(args.slice(1), options);
    return;
  }

  const config = await loadConfigFile(options.configPath || defaultConfigPath());
  const runtime = new CtxRuntime(resolveRuntimeConfig(config, options), console);
  const commandLine = args.map(shellQuote).join(" ");
  const result = await runtime.run(commandLine);
  console.log(result.text);
}

async function handleConfig(args: string[], options: CliGlobalOptions): Promise<void> {
  const subcommand = args[0] || "list";
  const configPath = options.configPath || defaultConfigPath();
  const config = await loadConfigFile(configPath);
  const profileName = resolveProfileName(config, options.profile);

  switch (subcommand) {
    case "path": {
      console.log(path.resolve(configPath));
      return;
    }
    case "list": {
      console.log(JSON.stringify(redactConfig(config), null, 2));
      return;
    }
    case "get": {
      const key = args[1];
      if (!key) throw new Error("config get requires a key");
      const showSecret = args.includes("--show-secret");
      const profile = getProfile(config, profileName);
      const value = readProfileValue(profile, key);
      if (value === undefined) return;
      console.log(redactValue(normalizeOutputKey(key), value, showSecret));
      return;
    }
    case "set": {
      const key = args[1];
      if (!key) throw new Error("config set requires a key");
      const readFromStdin = args.includes("--stdin");
      const value = readFromStdin ? await readStdin() : args[2];
      if (!value) throw new Error("config set requires a value or --stdin");
      const profile = setProfileValue(getProfile(config, profileName), key, value);
      config.profiles[profileName] = profile;
      config.currentProfile = profileName;
      await saveConfigFile(config, configPath);
      console.log(`saved ${normalizeOutputKey(key)} in profile ${profileName}`);
      return;
    }
    case "unset": {
      const key = args[1];
      if (!key) throw new Error("config unset requires a key");
      const profile = unsetProfileValue(getProfile(config, profileName), key);
      config.profiles[profileName] = profile;
      config.currentProfile = profileName;
      await saveConfigFile(config, configPath);
      console.log(`removed ${normalizeOutputKey(key)} from profile ${profileName}`);
      return;
    }
    case "use": {
      const nextProfile = (args[1] || "").trim();
      if (!nextProfile) throw new Error("config use requires a profile name");
      if (!config.profiles[nextProfile]) {
        config.profiles[nextProfile] = {};
      }
      config.currentProfile = nextProfile;
      await saveConfigFile(config, configPath);
      console.log(`current profile: ${nextProfile}`);
      return;
    }
    case "import-env": {
      const profile = importEnvIntoProfile(getProfile(config, profileName));
      config.profiles[profileName] = profile;
      config.currentProfile = profileName;
      await saveConfigFile(config, configPath);
      console.log(`imported environment into profile ${profileName}`);
      return;
    }
    case "resolve": {
      const showSecret = args.includes("--show-secret");
      const inspection = await inspectRuntimeConfig(config, configPath, options);
      console.log(JSON.stringify(renderResolvedConfig(inspection, showSecret), null, 2));
      return;
    }
    default:
      throw new Error(`unsupported config subcommand: ${subcommand}`);
  }
}

async function handleDoctor(args: string[], options: CliGlobalOptions): Promise<void> {
  const configPath = options.configPath || defaultConfigPath();
  const config = await loadConfigFile(configPath);
  const inspection = await inspectRuntimeConfig(config, configPath, options);
  const report = await runDoctorChecks(inspection);
  const asJson = args.includes("--json");
  const showSecret = args.includes("--show-secret");
  if (asJson) {
    console.log(JSON.stringify(renderDoctorReport(inspection, report, showSecret), null, 2));
  } else {
    console.log(renderDoctorText(inspection, report, showSecret));
  }
  if (report.some((check) => check.status === "fail")) {
    process.exitCode = 1;
  }
}

async function handleDocs(args: string[]): Promise<void> {
  const subcommand = args[0] || "list";
  const root = packageRoot();
  const docsDir = path.join(root, "docs");
  const referencesDir = path.join(root, "references");

  switch (subcommand) {
    case "path": {
      const target = args[1] || "root";
      switch (target) {
        case "root":
          console.log(root);
          return;
        case "docs":
          console.log(docsDir);
          return;
        case "references":
          console.log(referencesDir);
          return;
        default:
          throw new Error("docs path supports: root, docs, references");
      }
    }
    case "list": {
      const files = await listDocFiles(root);
      console.log(files.join("\n"));
      return;
    }
    case "read": {
      const requested = args[1] || "docs/agent-setup.md";
      const resolved = resolveDocPath(root, requested);
      const text = await fs.readFile(resolved, "utf8");
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
      return;
    }
    default:
      throw new Error("unsupported docs subcommand: use path, list, or read");
  }
}

type RuntimeValueSource = "env" | "config" | "default" | "unset";

type RuntimeInspection = {
  configPath: string;
  configFileExists: boolean;
  profile: string;
  resolved: {
    baseUrl: string;
    token?: string;
    userId?: string;
    localRoot: string;
    timeoutMs: number;
  };
  sources: {
    baseUrl: RuntimeValueSource;
    token: RuntimeValueSource;
    userId: RuntimeValueSource;
    localRoot: RuntimeValueSource;
    timeoutMs: RuntimeValueSource;
  };
};

type DoctorCheck = {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

function parseGlobalOptions(argv: string[]): { args: string[]; options: CliGlobalOptions } {
  const args: string[] = [];
  const options: CliGlobalOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      const value = argv[i + 1];
      if (!value) throw new Error("--config requires a path");
      options.configPath = value;
      i += 1;
      continue;
    }
    if (token === "--profile") {
      const value = argv[i + 1];
      if (!value) throw new Error("--profile requires a name");
      options.profile = value;
      i += 1;
      continue;
    }
    args.push(token);
  }
  return { args, options };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function readProfileValue(profile: CtxCliProfile, key: string): string | number | undefined {
  switch (key) {
    case "baseUrl":
    case "base-url":
      return profile.baseUrl as string | undefined;
    case "token":
      return profile.token as string | undefined;
    case "userId":
    case "user-id":
    case "defaultUserId":
      return profile.userId as string | undefined;
    case "localRoot":
    case "local-root":
      return profile.localRoot as string | undefined;
    case "timeoutMs":
    case "timeout-ms":
      return profile.timeoutMs as number | undefined;
    default:
      throw new Error(`unsupported config key: ${key}`);
  }
}

function normalizeOutputKey(key: string): string {
  switch (key) {
    case "base-url":
      return "baseUrl";
    case "user-id":
    case "defaultUserId":
      return "userId";
    case "local-root":
      return "localRoot";
    case "timeout-ms":
      return "timeoutMs";
    default:
      return key;
  }
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function listDocFiles(root: string): Promise<string[]> {
  const outputs: string[] = [];
  for (const relative of ["SKILL.md", "README.md"]) {
    try {
      await fs.access(path.join(root, relative));
      outputs.push(relative);
    } catch {
      // Ignore missing optional files.
    }
  }
  for (const base of ["docs", "references"]) {
    const directory = path.join(root, base);
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) outputs.push(`${base}/${entry.name}`);
      }
    } catch {
      // Ignore missing directories.
    }
  }
  return outputs.sort();
}

function resolveDocPath(root: string, requested: string): string {
  const trimmed = requested.trim();
  if (!trimmed) throw new Error("docs read requires a file name");
  const normalized = trimmed.replace(/^\.\//, "");
  const candidate = (() => {
    if (["SKILL.md", "README.md"].includes(normalized)) return normalized;
    if (normalized.startsWith("docs/") || normalized.startsWith("references/")) return normalized;
    if (normalized.endsWith(".md")) return `docs/${normalized}`;
    return `docs/${normalized}.md`;
  })();
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(root + path.sep) && resolved !== path.join(root, "SKILL.md") && resolved !== path.join(root, "README.md")) {
    throw new Error("docs path escapes package root");
  }
  return resolved;
}

async function inspectRuntimeConfig(
  config: CtxCliConfigFile,
  configPath: string,
  options: CliGlobalOptions,
): Promise<RuntimeInspection> {
  const profileName = resolveProfileName(config, options.profile);
  const profile = getProfile(config, profileName);
  const resolved = resolveRuntimeConfig(config, options);
  return {
    configPath: path.resolve(configPath),
    configFileExists: await pathExists(configPath),
    profile: profileName,
    resolved: {
      baseUrl: resolved.baseUrl,
      token: resolved.token,
      userId: resolved.defaultUserId,
      localRoot: resolved.localRoot,
      timeoutMs: resolved.timeoutMs,
    },
    sources: {
      baseUrl: sourceForString(process.env.CONTEXT_HUB_BASE_URL, profile.baseUrl, true),
      token: sourceForString(process.env.CONTEXT_HUB_TOKEN, profile.token, false),
      userId: sourceForString(process.env.CONTEXT_HUB_USER_ID, profile.userId, false),
      localRoot: sourceForString(process.env.CTX_CLI_LOCAL_ROOT, profile.localRoot, true),
      timeoutMs: sourceForTimeout((process.env.CTX_CLI_TIMEOUT_MS || "").trim(), profile.timeoutMs),
    },
  };
}

async function runDoctorChecks(inspection: RuntimeInspection): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  checks.push({
    name: "config-file",
    status: inspection.configFileExists ? "ok" : "warn",
    detail: inspection.configFileExists ? `found ${inspection.configPath}` : `missing ${inspection.configPath}`,
  });
  checks.push({
    name: "base-url",
    status: inspection.resolved.baseUrl ? "ok" : "fail",
    detail: inspection.resolved.baseUrl || "baseUrl is empty",
  });
  checks.push({
    name: "user-id",
    status: inspection.resolved.userId ? "ok" : "warn",
    detail: inspection.resolved.userId || "userId is not configured",
  });
  checks.push({
    name: "token",
    status: inspection.resolved.token ? "ok" : "warn",
    detail: inspection.resolved.token ? "token is configured" : "token is not configured",
  });

  const healthUrl = `${inspection.resolved.baseUrl.replace(/\/$/, "")}/health`;
  try {
    const response = await fetch(healthUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(inspection.resolved.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      checks.push({
        name: "health",
        status: "fail",
        detail: `GET /health -> ${response.status} ${response.statusText}${text ? ` :: ${text}` : ""}`,
      });
    } else {
      checks.push({
        name: "health",
        status: "ok",
        detail: `GET /health -> ${response.status}`,
      });
    }
  } catch (error) {
    checks.push({
      name: "health",
      status: "fail",
      detail: `GET /health failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!inspection.resolved.userId || !inspection.resolved.token) {
    checks.push({
      name: "cloud-access",
      status: "warn",
      detail: "skipped authenticated cloud check because userId or token is missing",
    });
    return checks;
  }

  try {
    const baseUrl = inspection.resolved.baseUrl.replace(/\/$/, "");
    const url = new URL(`${baseUrl}/v1/fs/ls`);
    url.searchParams.set("uri", `ctx://${inspection.resolved.userId}`);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${inspection.resolved.token}`,
      },
      signal: AbortSignal.timeout(inspection.resolved.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      checks.push({
        name: "cloud-access",
        status: "fail",
        detail: `GET /v1/fs/ls ctx://${inspection.resolved.userId} -> ${response.status} ${response.statusText}${text ? ` :: ${text}` : ""}`,
      });
    } else {
      checks.push({
        name: "cloud-access",
        status: "ok",
        detail: `GET /v1/fs/ls ctx://${inspection.resolved.userId} -> ${response.status}`,
      });
    }
  } catch (error) {
    checks.push({
      name: "cloud-access",
      status: "fail",
      detail: `authenticated cloud check failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return checks;
}

function renderResolvedConfig(inspection: RuntimeInspection, showSecret: boolean): Record<string, unknown> {
  return {
    configPath: inspection.configPath,
    configFileExists: inspection.configFileExists,
    profile: inspection.profile,
    resolved: {
      baseUrl: inspection.resolved.baseUrl,
      userId: inspection.resolved.userId ?? null,
      token: inspection.resolved.token ? redactValue("token", inspection.resolved.token, showSecret) : null,
      localRoot: inspection.resolved.localRoot,
      timeoutMs: inspection.resolved.timeoutMs,
    },
    sources: inspection.sources,
  };
}

function renderDoctorReport(inspection: RuntimeInspection, checks: DoctorCheck[], showSecret: boolean): Record<string, unknown> {
  return {
    ...renderResolvedConfig(inspection, showSecret),
    checks,
  };
}

function renderDoctorText(inspection: RuntimeInspection, checks: DoctorCheck[], showSecret: boolean): string {
  const lines = [
    "ctx_cli doctor",
    "",
    `config path: ${inspection.configPath}`,
    `config file: ${inspection.configFileExists ? "present" : "missing"}`,
    `profile: ${inspection.profile}`,
    "",
    "resolved config:",
    `- baseUrl: ${inspection.resolved.baseUrl} [${inspection.sources.baseUrl}]`,
    `- userId: ${inspection.resolved.userId ?? "<unset>"} [${inspection.sources.userId}]`,
    `- token: ${inspection.resolved.token ? redactValue("token", inspection.resolved.token, showSecret) : "<unset>"} [${inspection.sources.token}]`,
    `- localRoot: ${inspection.resolved.localRoot} [${inspection.sources.localRoot}]`,
    `- timeoutMs: ${inspection.resolved.timeoutMs} [${inspection.sources.timeoutMs}]`,
    "",
    "checks:",
    ...checks.map((check) => `- ${check.name}: ${check.status.toUpperCase()} - ${check.detail}`),
  ];
  return lines.join("\n");
}

function sourceForString(envValue: string | undefined, configValue: string | undefined, hasDefault: boolean): RuntimeValueSource {
  if ((envValue || "").trim()) return "env";
  if ((configValue || "").trim()) return "config";
  return hasDefault ? "default" : "unset";
}

function sourceForTimeout(envValue: string, configValue: number | undefined): RuntimeValueSource {
  const envTimeout = Number(envValue);
  if (envValue && Number.isFinite(envTimeout) && envTimeout > 0) return "env";
  if (configValue !== undefined && Number.isFinite(Number(configValue)) && Number(configValue) > 0) return "config";
  return "default";
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
