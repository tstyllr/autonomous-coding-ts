# Autonomous Coding Agent

A TypeScript-based autonomous agent harness that demonstrates long-running, multi-session AI-powered development using the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). The agent autonomously builds a full-stack claude.ai clone across multiple sessions, with built-in security, regression prevention, and browser-based verification.

## How It Works

The system uses a **two-phase session pattern**:

1. **Initializer Session** (first run) — Reads the app specification (`app_spec.txt`), generates 68+ feature test cases in `feature_list.json`, creates `init.sh` setup script, and initializes the project with git.

2. **Coding Sessions** (subsequent runs) — Each session orients itself via git history and feature list, runs verification tests on passing features to prevent regressions, picks the highest-priority failing feature, implements it, verifies via browser automation (Playwright MCP), and commits progress.

Sessions automatically continue until the context window is exhausted, then a new session picks up where the last one left off. No manual intervention required between sessions.

## Architecture

```
src/
├── index.ts       # CLI entry point (Commander-based)
├── agent.ts       # Session orchestration and streaming
├── client.ts      # Claude Agent SDK query configuration
├── prompts.ts     # Initializer and coding agent prompts
├── progress.ts    # Feature progress tracking
└── security.ts    # Command allowlist and validation
```

### Security

Defense-in-depth with three layers:

- **OS-level sandbox** — Bash execution isolation
- **Filesystem permissions** — Read/write restricted to project directory
- **Command allowlist** — Only whitelisted commands are permitted; sensitive commands (`pkill`, `chmod`, `init.sh`) have extra validation

## Getting Started

### Prerequisites

- Node.js 22+
- Claude Code (already logged in) **or** an Anthropic API key

### Installation

```bash
npm install
```

### Usage

```bash
# If you have Claude Code installed and logged in, no API key is needed.
# Otherwise, set your API key:
export ANTHROPIC_API_KEY=your_key_here

# Run with default settings
npm start -- --project-dir ./my_project

# Limit to 5 sessions
npm start -- --project-dir ./my_project --max-iterations 5

# Use a specific model
npm start -- --project-dir ./my_project --model claude-opus-4-1-20250805
```

### CLI Options

| Option                 | Description                                                | Default                      |
| ---------------------- | ---------------------------------------------------------- | ---------------------------- |
| `--project-dir <path>` | Project directory (relative paths go under `generations/`) | `./autonomous_demo_project`  |
| `--max-iterations <n>` | Maximum number of sessions to run                          | Unlimited                    |
| `--model <model>`      | Claude model to use                                        | `claude-sonnet-4-5-20250929` |

### Development

```bash
# Build TypeScript
npm run build

# Run tests
npm test
```

## Key Features

- **Multi-session continuity** — State persisted via git, `feature_list.json`, and progress notes
- **Feature-driven development** — 68+ auto-generated test cases drive implementation
- **Regression prevention** — Previously passing features are verified each session
- **Browser automation** — Playwright MCP for real UI verification
- **Streaming output** — Real-time visibility into agent reasoning and tool use
- **Graceful interruption** — Ctrl+C to stop; resume with the same command

## Target Application

The demo builds a full-stack claude.ai chat interface clone:

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express + SQLite
- **68+ features** including chat UI, artifact rendering, conversation management, projects, model selection, settings, and more

## License

MIT
