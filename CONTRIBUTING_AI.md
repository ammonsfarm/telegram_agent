🤖 AI Contribution Guidelines — telegram_agent
This repository is designed to be developed collaboratively by humans and AI agents (e.g., Codex). This document defines how AI should operate when making changes to ensure the system remains secure, maintainable, and production-ready.
🧠 Project Context
Repository: https://github.com/ammonsfarm/telegram_agent
Purpose:
A production-ready Telegram bot + backend system for managing Codex tasks remotely (submit, monitor, resume, inspect results).
Core Principles:
Security-first
Async + non-blocking operations
Clear separation of concerns
Observable + debuggable
Safe execution of Codex tasks
🏗️ Architecture Overview
AI contributors should follow this high-level structure:
src/
  bot/           # Telegram command handlers + formatting
  server/        # Webhook server + health endpoints
  core/          # Task orchestration + domain logic
  codex/         # CodexRunner interface + implementations
  db/            # Persistence layer (SQLite initially)
  security/      # Auth, redaction, rate limiting
  config/        # Env parsing + workspace config
  utils/         # Shared helpers
  tests/         # Unit + integration tests
⚙️ Technology Stack
Node.js 20+
TypeScript
SQLite (initially)
Zod (validation)
pino (logging)
Telegram Bot API (via maintained library)
Vitest or Jest (tests)
Docker + Docker Compose
🔐 Security Requirements (MANDATORY)
AI must not introduce insecure patterns.
Access Control
Only allow approved Telegram user IDs
Reject all others without revealing system details
Secrets
NEVER hardcode:
API keys
tokens
SSH credentials
Use environment variables exclusively
File System Safety
NEVER allow arbitrary filesystem paths from user input
Only operate inside configured workspace allowlist
Output Safety
Redact:
tokens
secrets
credentials
Do NOT send raw logs blindly to Telegram
Execution Modes
Default: safe/restricted execution
Elevated execution:
must require explicit approval flow
must be auditable
🧩 Codex Integration Rules
AI must implement Codex behind an abstraction:
Interface
interface CodexRunner {
  runTask(input: RunInput): Promise<TaskHandle>;
  resumeTask(taskId: string): Promise<TaskHandle>;
  cancelTask(taskId: string): Promise<void>;
}
Requirements
Primary implementation: codex exec --json
Must support:
streaming logs
structured event parsing
cancellation
Must NOT block the main thread
Future support:
Codex SDK implementation (do not tightly couple to CLI)
📦 Task System Requirements
Each task must include:
id
status
workspace
prompt
timestamps (created, started, completed)
logs (structured)
summary
result
diff (if applicable)
Valid States
queued
running
waiting_for_approval
completed
failed
canceled
💬 Telegram UX Rules
AI must ensure:
Messages are:
concise
readable
chunked if large
Never exceed Telegram limits
Prefer summaries over raw dumps
Required Commands
/start
/help
/ask
/status
/tasks
/logs
/result
/diff
/resume
/cancel
/health
Optional
/approve
📁 Workspace Safety Model
AI must enforce:
Named workspace aliases only
Example:
{
  "api": "/srv/repos/api",
  "bot": "/srv/repos/bot"
}
NEVER:
accept raw paths from Telegram
allow path traversal (../)
🔄 Async + Job Handling
AI must:
Use background job execution
Never block Telegram responses
Store task state persistently
Support:
retries
timeouts
graceful shutdown
🧪 Testing Requirements
AI must include:
Unit Tests
command parsing
auth logic
task lifecycle
redaction logic
Integration Tests
Telegram update handling
mocked Codex runner
Optional
end-to-end with fake runner
🐳 Deployment Requirements
AI must provide:
Dockerfile
docker-compose.yml
.env.example
System must support:
webhook mode (production)
polling mode (local dev)
🧾 Logging + Observability
Use structured logging (pino)
Include:
task_id
user_id
action
Avoid logging sensitive data
🧠 Coding Standards
AI should:
Use TypeScript strictly
Prefer small, composable modules
Avoid over-engineering
Add comments where logic is non-obvious
Use consistent naming
🚫 Disallowed Behaviors
AI must NOT:
Expose secrets
Execute arbitrary shell commands from user input
Trust Telegram input blindly
Skip validation
Introduce global mutable state without reason
Block event loop with long-running tasks
Dump full logs/results without summarization
✅ Contribution Workflow (AI)
When making changes, AI should:
Propose file structure (if large change)
Implement feature fully (not partial scaffolding)
Add/update tests
Ensure build passes
Update README if needed
🚀 Future Extensions (Guidance for AI)
AI can propose improvements such as:
Codex SDK migration
Web dashboard
Multi-user RBAC
Task scheduling
Notifications (push updates)
GitHub integration
Persistent queues (Redis/Postgres)
🧭 Guiding Philosophy
This is not a toy bot.
AI should always optimize for:
reliability
safety
clarity
production readiness
If a decision is ambiguous:
👉 Choose the safer and more maintainable option, not the fastest.
