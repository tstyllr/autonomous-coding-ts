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

// Playwright MCP tools for browser automation
const PLAYWRIGHT_TOOLS = [
  "mcp__playwright__browser_navigate",
  "mcp__playwright__browser_navigate_back",
  "mcp__playwright__browser_snapshot",
  "mcp__playwright__browser_take_screenshot",
  "mcp__playwright__browser_click",
  "mcp__playwright__browser_fill_form",
  "mcp__playwright__browser_select_option",
  "mcp__playwright__browser_hover",
  "mcp__playwright__browser_type",
  "mcp__playwright__browser_press_key",
  "mcp__playwright__browser_evaluate",
  "mcp__playwright__browser_console_messages",
  "mcp__playwright__browser_tabs",
  "mcp__playwright__browser_close",
  "mcp__playwright__browser_wait_for",
  "mcp__playwright__browser_file_upload",
  "mcp__playwright__browser_handle_dialog",
  "mcp__playwright__browser_drag",
  "mcp__playwright__browser_resize",
  "mcp__playwright__browser_network_requests",
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
        ...PLAYWRIGHT_TOOLS,
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
  console.log("   - MCP servers: playwright (browser automation)");
  console.log();

  return {
    model,
    systemPrompt:
      "You are an expert full-stack developer building a production-quality web application.",
    allowedTools: [...BUILTIN_TOOLS, ...PLAYWRIGHT_TOOLS],
    mcpServers: {
      playwright: { command: "npx", args: ["@playwright/mcp@latest"] },
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
