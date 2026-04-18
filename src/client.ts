/**
 * Claude Agent SDK Query Configuration
 *
 * Functions for creating query options with multi-layered security.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type {
  HookCallbackMatcher,
  PermissionMode,
  SandboxSettings,
} from "@anthropic-ai/claude-agent-sdk";
import { bashSecurityHook } from "./security.js";

// Puppeteer MCP tools for browser automation
const PUPPETEER_TOOLS = [
  "mcp__puppeteer__puppeteer_navigate",
  "mcp__puppeteer__puppeteer_screenshot",
  "mcp__puppeteer__puppeteer_click",
  "mcp__puppeteer__puppeteer_fill",
  "mcp__puppeteer__puppeteer_select",
  "mcp__puppeteer__puppeteer_hover",
  "mcp__puppeteer__puppeteer_evaluate",
];

// Built-in tools
const BUILTIN_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];

export interface QueryOptions {
  model: string;
  systemPrompt: string;
  allowedTools: string[];
  mcpServers: Record<string, { command: string; args: string[] }>;
  hooks: {
    PreToolUse: HookCallbackMatcher[];
  };
  maxTurns: number;
  cwd: string;
  permissionMode: PermissionMode;
  sandbox: SandboxSettings;
}

/**
 * Create query options for the Claude Agent SDK with multi-layered security.
 *
 * Security layers (defense in depth):
 * 1. Sandbox - OS-level bash command isolation prevents filesystem escape
 * 2. Permissions - File operations restricted to project_dir only
 * 3. Security hooks - Bash commands validated against an allowlist
 *    (see security.ts for ALLOWED_COMMANDS)
 */
export function createQueryOptions(
  projectDir: string,
  model: string,
): QueryOptions {
  // if (!process.env.ANTHROPIC_API_KEY) {
  //   throw new Error(
  //     "ANTHROPIC_API_KEY environment variable not set.\n" +
  //       "Get your API key from: https://console.anthropic.com/"
  //   );
  // }

  // Create comprehensive security settings
  const securitySettings = {
    sandbox: { enabled: true, autoAllowBashIfSandboxed: true },
    permissions: {
      defaultMode: "acceptEdits",
      allow: [
        "Read(./**)",
        "Write(./**)",
        "Edit(./**)",
        "Glob(./**)",
        "Grep(./**)",
        "Bash(*)",
        ...PUPPETEER_TOOLS,
      ],
    },
  };

  // Ensure project directory exists before creating settings file
  mkdirSync(projectDir, { recursive: true });

  // Write settings to a file in the project directory
  const settingsFile = resolve(projectDir, ".claude_settings.json");
  writeFileSync(settingsFile, JSON.stringify(securitySettings, null, 2));

  console.log(`Created security settings at ${settingsFile}`);
  console.log("   - Sandbox enabled (OS-level bash isolation)");
  console.log(`   - Filesystem restricted to: ${resolve(projectDir)}`);
  console.log("   - Bash commands restricted to allowlist (see security.ts)");
  console.log("   - MCP servers: puppeteer (browser automation)");
  console.log();

  return {
    model,
    systemPrompt:
      "You are an expert full-stack developer building a production-quality web application.",
    allowedTools: [...BUILTIN_TOOLS, ...PUPPETEER_TOOLS],
    mcpServers: {
      puppeteer: { command: "npx", args: ["puppeteer-mcp-server"] },
    },
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [bashSecurityHook] }],
    },
    maxTurns: 1000,
    cwd: resolve(projectDir),
    permissionMode: "acceptEdits",
    sandbox: { enabled: true },
  };
}
