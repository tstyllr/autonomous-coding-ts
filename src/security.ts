/**
 * Security Hooks for Autonomous Coding Agent
 *
 * Pre-tool-use hooks that validate bash commands for security.
 * Uses an allowlist approach - only explicitly permitted commands can run.
 */

import { basename } from "node:path";
import { parse } from "shell-quote";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

// Allowed commands for development tasks
// Minimal set needed for the autonomous coding demo
export const ALLOWED_COMMANDS = new Set<string>([
  // File inspection
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  // File operations (agent uses SDK tools for most file ops, but cp/mkdir needed occasionally)
  "cp",
  "mkdir",
  "chmod", // For making scripts executable; validated separately
  // Directory
  "pwd",
  // Node.js development
  "npm",
  "node",
  // Version control
  "git",
  // Process management
  "ps",
  "lsof",
  "sleep",
  "pkill", // For killing dev servers; validated separately
  // Script execution
  "init.sh", // Init scripts; validated separately
]);

// Commands that need additional validation even when in the allowlist
const COMMANDS_NEEDING_EXTRA_VALIDATION = new Set<string>([
  "pkill",
  "chmod",
  "init.sh",
]);

/**
 * Split a compound command into individual command segments.
 * Handles command chaining (&&, ||, ;) but not pipes (those are single commands).
 */
export function splitCommandSegments(commandString: string): string[] {
  // Split on && and || while preserving the ability to handle each segment
  const segments = commandString.split(/\s*(?:&&|\|\|)\s*/);

  // Further split on semicolons
  const result: string[] = [];
  for (const segment of segments) {
    const subSegments = segment.split(/(?<!["'])\s*;\s*(?!["'])/);
    for (const sub of subSegments) {
      const trimmed = sub.trim();
      if (trimmed) {
        result.push(trimmed);
      }
    }
  }

  return result;
}

/**
 * Extract command names from a shell command string.
 * Handles pipes, command chaining (&&, ||, ;), and subshells.
 * Returns the base command names (without paths).
 */
export function extractCommands(commandString: string): string[] {
  const commands: string[] = [];

  // Split on semicolons that aren't inside quotes (simple heuristic)
  const segments = commandString.split(/(?<!["'])\s*;\s*(?!["'])/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    let tokens: ReturnType<typeof parse>;
    try {
      tokens = parse(trimmed);
    } catch {
      // Malformed command - return empty to trigger block (fail-safe)
      return [];
    }

    if (!tokens.length) continue;

    // Track when we expect a command vs arguments
    let expectCommand = true;

    for (const token of tokens) {
      // shell-quote returns operators as objects with { op: string }
      if (typeof token === "object" && "op" in token) {
        const op = token.op;
        if (op === "|" || op === "||" || op === "&&" || op === "&") {
          expectCommand = true;
        }
        continue;
      }

      // At this point token is a string
      const tokenStr = String(token);

      // Skip shell keywords that precede commands
      if (
        [
          "if",
          "then",
          "else",
          "elif",
          "fi",
          "for",
          "while",
          "until",
          "do",
          "done",
          "case",
          "esac",
          "in",
          "!",
          "{",
          "}",
        ].includes(tokenStr)
      ) {
        continue;
      }

      // Skip flags/options
      if (tokenStr.startsWith("-")) {
        continue;
      }

      // Skip variable assignments (VAR=value)
      if (tokenStr.includes("=") && !tokenStr.startsWith("=")) {
        continue;
      }

      if (expectCommand) {
        // Extract the base command name (handle paths like /usr/bin/python)
        const cmd = basename(tokenStr);
        commands.push(cmd);
        expectCommand = false;
      }
    }
  }

  return commands;
}

/**
 * Validate pkill commands - only allow killing dev-related processes.
 * Returns [isAllowed, reasonIfBlocked].
 */
export function validatePkillCommand(
  commandString: string
): [boolean, string] {
  const allowedProcessNames = new Set([
    "node",
    "npm",
    "npx",
    "vite",
    "next",
  ]);

  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(commandString);
  } catch {
    return [false, "Could not parse pkill command"];
  }

  if (!tokens.length) return [false, "Empty pkill command"];

  // Separate flags from arguments
  const args: string[] = [];
  for (const token of tokens.slice(1)) {
    const tokenStr = String(token);
    if (typeof token === "string" && !tokenStr.startsWith("-")) {
      args.push(tokenStr);
    }
  }

  if (!args.length) return [false, "pkill requires a process name"];

  // The target is typically the last non-flag argument
  let target = args[args.length - 1];

  // For -f flag (full command line match), extract the first word as process name
  if (target.includes(" ")) {
    target = target.split(/\s+/)[0];
  }

  if (allowedProcessNames.has(target)) {
    return [true, ""];
  }
  return [
    false,
    `pkill only allowed for dev processes: ${JSON.stringify([...allowedProcessNames])}`,
  ];
}

/**
 * Validate chmod commands - only allow making files executable with +x.
 * Returns [isAllowed, reasonIfBlocked].
 */
export function validateChmodCommand(
  commandString: string
): [boolean, string] {
  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(commandString);
  } catch {
    return [false, "Could not parse chmod command"];
  }

  const stringTokens = tokens.filter(
    (t): t is string => typeof t === "string"
  );

  if (!stringTokens.length || stringTokens[0] !== "chmod") {
    return [false, "Not a chmod command"];
  }

  // Look for the mode argument
  let mode: string | null = null;
  const files: string[] = [];

  for (const token of stringTokens.slice(1)) {
    if (token.startsWith("-")) {
      // Skip flags like -R (we don't allow recursive chmod anyway)
      return [false, "chmod flags are not allowed"];
    } else if (mode === null) {
      mode = token;
    } else {
      files.push(token);
    }
  }

  if (mode === null) return [false, "chmod requires a mode"];
  if (!files.length) return [false, "chmod requires at least one file"];

  // Only allow +x variants (making files executable)
  if (!/^[ugoa]*\+x$/.test(mode)) {
    return [false, `chmod only allowed with +x mode, got: ${mode}`];
  }

  return [true, ""];
}

/**
 * Validate init.sh script execution - only allow ./init.sh.
 * Returns [isAllowed, reasonIfBlocked].
 */
export function validateInitScript(
  commandString: string
): [boolean, string] {
  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(commandString);
  } catch {
    return [false, "Could not parse init script command"];
  }

  const stringTokens = tokens.filter(
    (t): t is string => typeof t === "string"
  );

  if (!stringTokens.length) return [false, "Empty command"];

  // The command should be exactly ./init.sh (possibly with arguments)
  const script = stringTokens[0];

  // Allow ./init.sh or paths ending in /init.sh
  if (script === "./init.sh" || script.endsWith("/init.sh")) {
    return [true, ""];
  }

  return [false, `Only ./init.sh is allowed, got: ${script}`];
}

/**
 * Find the specific command segment that contains the given command.
 */
function getCommandForValidation(
  cmd: string,
  segments: string[]
): string {
  for (const segment of segments) {
    const segmentCommands = extractCommands(segment);
    if (segmentCommands.includes(cmd)) {
      return segment;
    }
  }
  return "";
}

function blockResult(reason: string) {
  return {
    decision: "block" as const,
    reason,
  };
}

/**
 * Pre-tool-use hook that validates bash commands using an allowlist.
 * Only commands in ALLOWED_COMMANDS are permitted.
 */
export const bashSecurityHook: HookCallback = async (
  input,
  _toolUseID,
  _context
) => {
  const hookInput = input as { tool_name: string; tool_input: Record<string, unknown> };

  if (hookInput.tool_name !== "Bash") return {};

  const command = hookInput.tool_input?.command as string;
  if (!command) return {};

  // Extract all commands from the command string
  const commands = extractCommands(command);

  if (!commands.length) {
    return blockResult(
      `Could not parse command for security validation: ${command}`
    );
  }

  // Split into segments for per-command validation
  const segments = splitCommandSegments(command);

  // Check each command against the allowlist
  for (const cmd of commands) {
    if (!ALLOWED_COMMANDS.has(cmd)) {
      return blockResult(
        `Command '${cmd}' is not in the allowed commands list`
      );
    }

    // Additional validation for sensitive commands
    if (COMMANDS_NEEDING_EXTRA_VALIDATION.has(cmd)) {
      // Find the specific segment containing this command
      let cmdSegment = getCommandForValidation(cmd, segments);
      if (!cmdSegment) cmdSegment = command; // Fallback to full command

      if (cmd === "pkill") {
        const [allowed, reason] = validatePkillCommand(cmdSegment);
        if (!allowed) return blockResult(reason);
      } else if (cmd === "chmod") {
        const [allowed, reason] = validateChmodCommand(cmdSegment);
        if (!allowed) return blockResult(reason);
      } else if (cmd === "init.sh") {
        const [allowed, reason] = validateInitScript(cmdSegment);
        if (!allowed) return blockResult(reason);
      }
    }
  }

  return {};
};
