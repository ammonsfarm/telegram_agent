# Telegram Codex Agent

Production-oriented TypeScript/Node service that exposes Codex task management through a Telegram bot. It accepts commands from authorized Telegram users, persists task state in Postgres, runs `codex exec --json` behind a `CodexRunner` abstraction, and supports both webhook mode for deployment and polling mode for local development.

## Features

- Authorized-user-only Telegram access
- Secure workspace alias allowlist, never raw paths from chat
- Persistent async task queue with Postgres
- Resume-style workspace chat discovery from the Codex state SQLite database
- Task lifecycle states: `queued`, `running`, `waiting_for_approval`, `completed`, `failed`, `canceled`
- Webhook-first HTTP service with polling mode for local development
- Structured `pino` logging with message redaction
- In-memory Telegram rate limiting plus persistent audit trail
- Diff capture and diff summary after successful runs
- Dockerfile, Compose, tests, ESLint, Prettier, Vitest
- `CodexRunner` interface ready for a future Codex SDK implementation

## Architecture

```text
src/
  app/        composition root
  bot/        Telegram update parsing, command handling, outbound client
  codex/      runner interface + codex CLI implementation
  config/     env parsing + workspace alias policy
  core/       task orchestration + background queue
  db/         Postgres schema and repository layer
  logging/    pino logger factory
  security/   auth, rate limiting, redaction
  server/     Fastify webhook server + polling loop
  types/      domain model types
  utils/      shared helpers
tests/        unit/integration-style tests
```

## Commands

- `/start`
- `/help`
- `/ask <workspace> <prompt>`
- `/chats`
- `/chats <workspace>`
- `/status <task_id>`
- `/tasks`
- `/logs <task_id>`
- `/result <task_id>`
- `/diff <task_id>`
- `/resume <task_id>`
- `/cancel <task_id>`
- `/health`

Example:

```text
/ask repo Summarize the current branch changes and propose next steps
```

## Configuration

Copy `.env.example` to `.env` and set values for your environment.

Important variables:

- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `AUTHORIZED_USER_IDS`: comma-separated Telegram numeric user IDs
- `WORKSPACE_ALIASES`: JSON object mapping alias to absolute workspace path
- `CODEX_STATE_DB_PATH`: path to the Codex state SQLite database used for `/chats`
- `BOT_MODE`: `webhook` in production, `polling` for local development
- `WEBHOOK_URL`: public HTTPS webhook endpoint in webhook mode
- `WEBHOOK_SECRET`: shared secret validated on the webhook route
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Postgres connection settings
- `DATABASE_URL`: optional full Postgres connection string override
- `CODEX_BINARY`: Codex CLI executable
- `CODEX_ARGS`: default `exec --json`

Workspace example:

```env
WORKSPACE_ALIASES={"repo":"/workspaces/repo","infra":"/workspaces/infra"}
```

Only these aliases are accepted from Telegram. Raw paths are never accepted.

`/chats` does not read from the bot Postgres task tables. It reads Codex thread history from `CODEX_STATE_DB_PATH` and filters by the resolved workspace `cwd`, which makes it behave more like `codex resume`.

Postgres example:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=telegram_agent
DB_USER=telegram_agent
DB_PASSWORD=replace_me
DB_SSL=false
```

## Local Development

```bash
npm install
cp .env.example .env
npm run build
npm test
npm run dev
```

Use polling mode locally:

```env
BOT_MODE=polling
```

## Production Deployment

Webhook mode is the default production target. Put the service behind HTTPS and configure Telegram to reach:

```text
POST /telegram/webhook
```

Start with Docker Compose:

```bash
cp .env.example .env
docker compose up --build -d
```

Recommended production setup:

- Run behind an HTTPS reverse proxy
- Mount only the allowed workspaces into the container
- Use a non-shared Telegram bot token per environment
- Put Postgres on persistent storage and back it up normally
- Restrict inbound access to `/health` if exposed publicly

## Security Notes

- Unauthorized Telegram users receive only `Unauthorized.`
- Telegram requests are rate-limited per user/chat pair
- Webhook mode validates `X-Telegram-Bot-Api-Secret-Token`
- Task prompts, logs, and outbound messages pass through redaction
- Audit records are written for task creation, start, completion, resume, and cancellation
- Workspace access is alias-based only
- Codex execution is isolated behind `CodexRunner`, which simplifies future migration and review

## Task Model

Each task stores:

- identifiers and Telegram ownership metadata
- workspace alias and prompt
- lifecycle timestamps
- summary, result, diff, and diff summary
- structured task logs
- audit trail entries

## Testing

```bash
npm run lint
npm run build
npm test
```

The test suite covers:

- auth enforcement
- secret redaction
- task lifecycle transitions
- Telegram update and command handling with a fake client

## Future Improvements

- Replace the CLI-backed runner with a Codex SDK implementation behind the same interface
- Add explicit approval commands if your Codex workflow requires them
- Move from single-node Postgres queueing to a dedicated job system if you need higher throughput
- Add outbound Telegram notifications when task status changes
