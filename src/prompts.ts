/**
 * Prompt Loading Utilities
 *
 * Functions for loading prompt templates from the prompts directory.
 */

import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "..", "prompts");

export function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), "utf-8");
}

export function getInitializerPrompt(): string {
  return loadPrompt("initializer_prompt");
}

export function getCodingPrompt(): string {
  return loadPrompt("coding_prompt");
}

export function copySpecToProject(projectDir: string): void {
  const src = resolve(PROMPTS_DIR, "app_spec.txt");
  const dest = resolve(projectDir, "app_spec.txt");
  if (!existsSync(dest)) {
    copyFileSync(src, dest);
    console.log("Copied app_spec.txt to project directory");
  }
}
