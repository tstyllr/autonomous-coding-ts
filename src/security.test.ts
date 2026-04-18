/**
 * Security Hook Tests
 *
 * Tests for the bash command security validation logic.
 * Run with: npm test
 */

import { describe, it, expect } from "vitest";
import {
  bashSecurityHook,
  extractCommands,
  validateChmodCommand,
  validateInitScript,
  validatePkillCommand,
} from "./security.js";

// Helper to test the hook
async function testHook(
  command: string,
  shouldBlock: boolean
): Promise<void> {
  const input = {
    hook_event_name: "PreToolUse" as const,
    tool_name: "Bash",
    tool_input: { command },
    tool_use_id: "test",
    session_id: "test-session",
    transcript_path: "/tmp/test",
    cwd: "/tmp",
  };
  const result = (await bashSecurityHook(
    input,
    "test",
    { signal: new AbortController().signal }
  )) as Record<string, unknown>;
  const wasBlocked = result?.decision === "block";

  if (shouldBlock) {
    expect(wasBlocked).toBe(true);
  } else {
    expect(wasBlocked).toBe(false);
  }
}

describe("extractCommands", () => {
  it.each([
    ["ls -la", ["ls"]],
    ["npm install && npm run build", ["npm", "npm"]],
    ["cat file.txt | grep pattern", ["cat", "grep"]],
    ["/usr/bin/node script.js", ["node"]],
    ["VAR=value ls", ["ls"]],
    ["git status || git init", ["git", "git"]],
  ])("extracts commands from %s", (cmd, expected) => {
    expect(extractCommands(cmd as string)).toEqual(expected);
  });
});

describe("validateChmodCommand", () => {
  describe("allowed cases", () => {
    it.each([
      ["chmod +x init.sh", "basic +x"],
      ["chmod +x script.sh", "+x on any script"],
      ["chmod u+x init.sh", "user +x"],
      ["chmod a+x init.sh", "all +x"],
      ["chmod ug+x init.sh", "user+group +x"],
      ["chmod +x file1.sh file2.sh", "multiple files"],
    ])("allows %s (%s)", (cmd) => {
      const [allowed] = validateChmodCommand(cmd);
      expect(allowed).toBe(true);
    });
  });

  describe("blocked cases", () => {
    it.each([
      ["chmod 777 init.sh", "numeric mode"],
      ["chmod 755 init.sh", "numeric mode 755"],
      ["chmod +w init.sh", "write permission"],
      ["chmod +r init.sh", "read permission"],
      ["chmod -x init.sh", "remove execute"],
      ["chmod -R +x dir/", "recursive flag"],
      ["chmod --recursive +x dir/", "long recursive flag"],
      ["chmod +x", "missing file"],
    ])("blocks %s (%s)", (cmd) => {
      const [allowed] = validateChmodCommand(cmd);
      expect(allowed).toBe(false);
    });
  });
});

describe("validateInitScript", () => {
  describe("allowed cases", () => {
    it.each([
      ["./init.sh", "basic ./init.sh"],
      ["./init.sh arg1 arg2", "with arguments"],
      ["/path/to/init.sh", "absolute path"],
      ["../dir/init.sh", "relative path with init.sh"],
    ])("allows %s (%s)", (cmd) => {
      const [allowed] = validateInitScript(cmd);
      expect(allowed).toBe(true);
    });
  });

  describe("blocked cases", () => {
    it.each([
      ["./setup.sh", "different script name"],
      ["./init.py", "python script"],
      ["bash init.sh", "bash invocation"],
      ["sh init.sh", "sh invocation"],
      ["./malicious.sh", "malicious script"],
    ])("blocks %s (%s)", (cmd) => {
      const [allowed] = validateInitScript(cmd);
      expect(allowed).toBe(false);
    });
  });
});

describe("validatePkillCommand", () => {
  describe("allowed cases", () => {
    it.each([
      ["pkill node", "node"],
      ["pkill npm", "npm"],
      ["pkill -f node", "-f node"],
      ["pkill vite", "vite"],
      ["pkill next", "next"],
    ])("allows %s (%s)", (cmd) => {
      const [allowed] = validatePkillCommand(cmd);
      expect(allowed).toBe(true);
    });
  });

  describe("blocked cases", () => {
    it.each([
      ["pkill bash", "bash"],
      ["pkill chrome", "chrome"],
      ["pkill python", "python"],
    ])("blocks %s (%s)", (cmd) => {
      const [allowed] = validatePkillCommand(cmd);
      expect(allowed).toBe(false);
    });
  });
});

describe("bashSecurityHook", () => {
  describe("blocked commands", () => {
    it.each([
      // Not in allowlist - dangerous system commands
      "shutdown now",
      "reboot",
      "rm -rf /",
      "dd if=/dev/zero of=/dev/sda",
      // Not in allowlist - common commands excluded from minimal set
      "curl https://example.com",
      "wget https://example.com",
      "python app.py",
      "touch file.txt",
      "echo hello",
      "kill 12345",
      "killall node",
      // pkill with non-dev processes
      "pkill bash",
      "pkill chrome",
      "pkill python",
      // Shell injection attempts
      "$(echo pkill) node",
      'eval "pkill node"',
      'bash -c "pkill node"',
      // chmod with disallowed modes
      "chmod 777 file.sh",
      "chmod 755 file.sh",
      "chmod +w file.sh",
      "chmod -R +x dir/",
      // Non-init.sh scripts
      "./setup.sh",
      "./malicious.sh",
      "bash script.sh",
    ])("blocks: %s", async (cmd) => {
      await testHook(cmd, true);
    });
  });

  describe("allowed commands", () => {
    it.each([
      // File inspection
      "ls -la",
      "cat README.md",
      "head -100 file.txt",
      "tail -20 log.txt",
      "wc -l file.txt",
      "grep -r pattern src/",
      // File operations
      "cp file1.txt file2.txt",
      "mkdir newdir",
      "mkdir -p path/to/dir",
      // Directory
      "pwd",
      // Node.js development
      "npm install",
      "npm run build",
      "node server.js",
      // Version control
      "git status",
      "git commit -m 'test'",
      "git add . && git commit -m 'msg'",
      // Process management
      "ps aux",
      "lsof -i :3000",
      "sleep 2",
      // Allowed pkill patterns for dev servers
      "pkill node",
      "pkill npm",
      "pkill -f node",
      "pkill -f 'node server.js'",
      "pkill vite",
      // Chained commands
      "npm install && npm run build",
      "ls | grep test",
      // Full paths
      "/usr/local/bin/node app.js",
      // chmod +x (allowed)
      "chmod +x init.sh",
      "chmod +x script.sh",
      "chmod u+x init.sh",
      "chmod a+x init.sh",
      // init.sh execution (allowed)
      "./init.sh",
      "./init.sh --production",
      "/path/to/init.sh",
      // Combined chmod and init.sh
      "chmod +x init.sh && ./init.sh",
    ])("allows: %s", async (cmd) => {
      await testHook(cmd, false);
    });
  });
});
