export const schemaSql = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  workspace_alias TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  result TEXT,
  diff TEXT,
  diff_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  runner_task_id TEXT,
  pid INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);

CREATE TABLE IF NOT EXISTS task_logs (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  raw TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_logs_task_sequence ON task_logs(task_id, sequence);

CREATE TABLE IF NOT EXISTS audit_trail (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT,
  user_id BIGINT,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
`;
