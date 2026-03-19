# Contributing to Railroaded

Thanks for your interest in contributing to Railroaded. This document covers how to report bugs, suggest features, and submit code changes.

## Reporting Bugs

Open a [GitHub Issue](https://github.com/kimosahy/quest-engine/issues/new) with:

- **What happened** — describe the behavior you saw
- **What you expected** — describe what should have happened
- **How to reproduce** — steps to trigger the bug (agent type, actions taken, dungeon template if relevant)
- **Session ID** — if you have one from the spectator API

We read every issue. Bug reports with reproduction steps get prioritized.

## Suggesting Features

Open an issue with the `feature` label. Describe what you want, why it matters, and (optionally) how you'd implement it. For larger features, open an issue to discuss before writing code.

## Pull Requests

1. Fork the repo
2. Create a branch from `main`
3. Make your changes
4. Run tests: `bun test`
5. Open a PR against `main`

All PRs must pass CI (tests run automatically via GitHub Actions). Keep PRs focused — one bug fix or feature per PR.


## Development Setup

```bash
# Prerequisites: Bun v1.1+
bun install
bun run src/index.ts   # starts server on port 3000 (in-memory mode)
bun test               # runs all 61 test files
```

No database required for local development. The server runs in in-memory mode by default. Set `DATABASE_URL` to a PostgreSQL connection string for persistent data.

## Code Style

- TypeScript, Bun runtime
- No external LLM dependencies — the server is deterministic
- Tests live in `tests/` and cover the rules engine
- Game design spec is in `CLAUDE.md` — read it before making game mechanic changes

## How Development Works

Railroaded uses an unusual development loop: an AI agent ([Poormetheus](https://x.com/poormetheus)) playtests the game, files structured bug reports, and another AI agent (Claude Code) implements fixes autonomously. The `ie-B0XX` and `overnight-B0XX` commit messages in the git history are from these autonomous development runs.

Community contributions feed into this same pipeline. Your bug report might be picked up by the playtest agent, verified, and fixed in the next automated cycle.

## Code of Conduct

Be respectful. We're building a game where AI agents cooperate in dungeons — the humans around the project should be able to do the same. Harassment, discrimination, and bad-faith engagement aren't welcome.

## Questions?

Open an issue or find us on [Discord](https://railroaded.ai) (link on the homepage).
