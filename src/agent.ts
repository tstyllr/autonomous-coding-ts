/**
 * Agent Session Logic
 *
 * Core agent interaction functions for running autonomous coding sessions.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createQueryOptions } from "./client.js";
import { printSessionHeader, printProgressSummary } from "./progress.js";
import {
  getInitializerPrompt,
  getCodingPrompt,
  copySpecToProject,
} from "./prompts.js";

// Configuration
const AUTO_CONTINUE_DELAY_SECONDS = 3;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a single agent session using Claude Agent SDK.
 *
 * Returns [status, responseText] where status is:
 * - "continue" if agent should continue working
 * - "error" if an error occurred
 */
async function runAgentSession(
  options: ReturnType<typeof createQueryOptions>,
  message: string
): Promise<[string, string]> {
  console.log("Sending prompt to Claude Agent SDK...\n");

  try {
    let responseText = "";

    for await (const msg of query({ prompt: message, options })) {
      if (msg.type === "assistant") {
        // Handle assistant message (text and tool use)
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText += block.text;
            process.stdout.write(block.text);
          } else if (block.type === "tool_use") {
            console.log(`\n[Tool: ${block.name}]`);
            const inputStr = JSON.stringify(block.input);
            if (inputStr.length > 200) {
              console.log(`   Input: ${inputStr.slice(0, 200)}...`);
            } else {
              console.log(`   Input: ${inputStr}`);
            }
          }
        }
      } else if (msg.type === "user") {
        // Handle user message (tool results)
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              typeof block === "object" &&
              "type" in block &&
              block.type === "tool_result"
            ) {
              const resultContent = String(
                "content" in block ? block.content : ""
              );
              const isError =
                "is_error" in block ? block.is_error : false;

              // Check if command was blocked by security hook
              if (resultContent.toLowerCase().includes("blocked")) {
                console.log(`   [BLOCKED] ${resultContent}`);
              } else if (isError) {
                // Show errors (truncated)
                const errorStr = resultContent.slice(0, 500);
                console.log(`   [Error] ${errorStr}`);
              } else {
                // Tool succeeded - just show brief confirmation
                console.log("   [Done]");
              }
            }
          }
        }
      } else if (msg.type === "result") {
        // Final result message
        if (msg.subtype !== "success") {
          const errors =
            "errors" in msg ? (msg.errors as string[]) : [];
          console.log(
            `\nSession ended with: ${msg.subtype}${errors.length ? ` - ${errors.join(", ")}` : ""}`
          );
        }
      }
    }

    console.log("\n" + "-".repeat(70) + "\n");
    return ["continue", responseText];
  } catch (e) {
    console.error(`Error during agent session: ${e}`);
    return ["error", String(e)];
  }
}

/**
 * Run the autonomous agent loop.
 */
export async function runAutonomousAgent(
  projectDir: string,
  model: string,
  maxIterations?: number
): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("  AUTONOMOUS CODING AGENT DEMO");
  console.log("=".repeat(70));
  console.log(`\nProject directory: ${projectDir}`);
  console.log(`Model: ${model}`);
  if (maxIterations) {
    console.log(`Max iterations: ${maxIterations}`);
  } else {
    console.log("Max iterations: Unlimited (will run until completion)");
  }
  console.log();

  // Create project directory
  const { mkdirSync } = await import("node:fs");
  mkdirSync(projectDir, { recursive: true });

  // Check if this is a fresh start or continuation
  const testsFile = resolve(projectDir, "feature_list.json");
  let isFirstRun = !existsSync(testsFile);

  if (isFirstRun) {
    console.log("Fresh start - will use initializer agent");
    console.log();
    console.log("=".repeat(70));
    console.log("  NOTE: First session takes 10-20+ minutes!");
    console.log(
      "  The agent is generating 200 detailed test cases."
    );
    console.log(
      "  This may appear to hang - it's working. Watch for [Tool: ...] output."
    );
    console.log("=".repeat(70));
    console.log();
    // Copy the app spec into the project directory for the agent to read
    copySpecToProject(projectDir);
  } else {
    console.log("Continuing existing project");
    printProgressSummary(projectDir);
  }

  // Main loop
  let iteration = 0;

  while (true) {
    iteration++;

    // Check max iterations
    if (maxIterations && iteration > maxIterations) {
      console.log(`\nReached max iterations (${maxIterations})`);
      console.log(
        "To continue, run the script again without --max-iterations"
      );
      break;
    }

    // Print session header
    printSessionHeader(iteration, isFirstRun);

    // Create query options (fresh context)
    const options = createQueryOptions(projectDir, model);

    // Choose prompt based on session type
    let prompt: string;
    if (isFirstRun) {
      prompt = getInitializerPrompt();
      isFirstRun = false; // Only use initializer once
    } else {
      prompt = getCodingPrompt();
    }

    // Run session
    const [status] = await runAgentSession(options, prompt);

    // Handle status
    if (status === "continue") {
      console.log(
        `\nAgent will auto-continue in ${AUTO_CONTINUE_DELAY_SECONDS}s...`
      );
      printProgressSummary(projectDir);
      await sleep(AUTO_CONTINUE_DELAY_SECONDS * 1000);
    } else if (status === "error") {
      console.log("\nSession encountered an error");
      console.log("Will retry with a fresh session...");
      await sleep(AUTO_CONTINUE_DELAY_SECONDS * 1000);
    }

    // Small delay between sessions
    if (!maxIterations || iteration < maxIterations) {
      console.log("\nPreparing next session...\n");
      await sleep(1000);
    }
  }

  // Final summary
  console.log("\n" + "=".repeat(70));
  console.log("  SESSION COMPLETE");
  console.log("=".repeat(70));
  console.log(`\nProject directory: ${projectDir}`);
  printProgressSummary(projectDir);

  // Print instructions for running the generated application
  console.log("\n" + "-".repeat(70));
  console.log("  TO RUN THE GENERATED APPLICATION:");
  console.log("-".repeat(70));
  console.log(`\n  cd ${resolve(projectDir)}`);
  console.log("  ./init.sh           # Run the setup script");
  console.log("  # Or manually:");
  console.log("  npm install && npm run dev");
  console.log(
    "\n  Then open http://localhost:3000 (or check init.sh for the URL)"
  );
  console.log("-".repeat(70));

  console.log("\nDone!");
}
