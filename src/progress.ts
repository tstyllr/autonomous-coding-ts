/**
 * Progress Tracking Utilities
 *
 * Functions for tracking and displaying progress of the autonomous coding agent.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface FeatureTest {
  passes?: boolean;
}

export function countPassingTests(
  projectDir: string
): [number, number] {
  const testsFile = resolve(projectDir, "feature_list.json");

  if (!existsSync(testsFile)) return [0, 0];

  try {
    const tests: FeatureTest[] = JSON.parse(
      readFileSync(testsFile, "utf-8")
    );
    const total = tests.length;
    const passing = tests.filter((t) => t.passes).length;
    return [passing, total];
  } catch {
    return [0, 0];
  }
}

export function printSessionHeader(
  sessionNum: number,
  isInitializer: boolean
): void {
  const sessionType = isInitializer ? "INITIALIZER" : "CODING AGENT";

  console.log("\n" + "=".repeat(70));
  console.log(`  SESSION ${sessionNum}: ${sessionType}`);
  console.log("=".repeat(70));
  console.log();
}

export function printProgressSummary(projectDir: string): void {
  const [passing, total] = countPassingTests(projectDir);

  if (total > 0) {
    const percentage = ((passing / total) * 100).toFixed(1);
    console.log(`\nProgress: ${passing}/${total} tests passing (${percentage}%)`);
  } else {
    console.log("\nProgress: feature_list.json not yet created");
  }
}
