# Architecture Notes

## Flow

1. Telegram sends an update through polling or webhook.
2. `BotController` validates the update, checks authorization, enforces rate limits, and dispatches the command.
3. `/ask` creates a persisted task in Postgres and records an audit event.
4. `TaskQueue` picks queued tasks and hands them to `TaskService`.
5. `TaskService` resolves the workspace alias and invokes `CodexRunner`.
6. `CodexCliRunner` streams structured events from `codex exec --json`.
7. Task logs, summaries, results, diffs, and final status are persisted.

## Reliability Decisions

- Queue execution is single-worker and durable by default.
- Postgres persistence uses `FOR UPDATE SKIP LOCKED` when claiming queued tasks.
- Shutdown waits for polling and queue loops to drain.
- Webhook and polling share the same command pipeline.

## Security Decisions

- No arbitrary filesystem paths from Telegram.
- No unauthenticated Telegram control plane.
- No raw blind log dumps beyond bounded chunks.
- Secret-like output is redacted before persistence and delivery.
