#!/usr/bin/env node
/**
 * Autonomous Coding Agent Demo
 *
 * A minimal harness demonstrating long-running autonomous coding with Claude.
 * This script implements the two-agent pattern (initializer + coding agent) and
 * incorporates all the strategies from the long-running agents guide.
 *
 * Example Usage:
 *   npx tsx src/index.ts --project-dir ./claude_clone_demo
 *   npx tsx src/index.ts --project-dir ./claude_clone_demo --max-iterations 5
 */

import { Command } from "commander";
import { resolve, isAbsolute } from "node:path";
import { runAutonomousAgent } from "./agent.js";

// Configuration
const DEFAULT_MODEL = "claude-sonnet-4-6";

const program = new Command()
  .name("autonomous-coding")
  .description("Autonomous Coding Agent Demo - Long-running agent harness")
  .option(
    "--project-dir <path>",
    "Directory for the project (relative paths placed in generations/)",
    "./autonomous_demo_project",
  )
  .option(
    "--max-iterations <n>",
    "Maximum number of agent iterations (default: unlimited)",
    (val: string) => parseInt(val, 10),
  )
  .option(
    "--model <model>",
    `Claude model to use (default: ${DEFAULT_MODEL})`,
    DEFAULT_MODEL,
  )
  .parse();

const opts = program.opts<{
  projectDir: string;
  maxIterations?: number;
  model: string;
}>();

// Check for API key
// if (!process.env.ANTHROPIC_API_KEY) {
//   console.error("Error: ANTHROPIC_API_KEY environment variable not set");
//   console.error("\nGet your API key from: https://console.anthropic.com/");
//   console.error("\nThen set it:");
//   console.error("  export ANTHROPIC_API_KEY='your-api-key-here'");
//   process.exit(1);
// }

// Automatically place projects in generations/ directory unless already specified
let projectDir = opts.projectDir;
if (!projectDir.startsWith("generations/")) {
  if (isAbsolute(projectDir)) {
    // If absolute path, use as-is
  } else {
    // Prepend generations/ to relative paths
    projectDir = `generations/${projectDir}`;
  }
}
projectDir = resolve(projectDir);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nInterrupted by user");
  console.log("To resume, run the same command again");
  process.exit(0);
});

// Run the agent
try {
  await runAutonomousAgent(projectDir, opts.model, opts.maxIterations);
} catch (e) {
  console.error(`\nFatal error: ${e}`);
  throw e;
}
