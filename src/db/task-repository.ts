import type { Pool, QueryResultRow } from 'pg';

import type {
  AuditRecord,
  TaskCreateInput,
  TaskLogRecord,
  TaskRecord,
  TaskStatus,
  TaskSummaryView
} from '../types/task';
import { nowIso } from '../utils/time';

type TaskRow = QueryResultRow & {
  id: string;
  user_id: string | number;
  chat_id: string | number;
  workspace_alias: string;
  prompt: string;
  status: TaskStatus;
  summary: string | null;
  result: string | null;
  diff: string | null;
  diff_summary: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  runner_task_id: string | null;
  pid: number | null;
};

type TaskLogRow = QueryResultRow & {
  id: string | number;
  task_id: string;
  sequence: number;
  level: TaskLogRecord['level'];
  message: string;
  raw: string | null;
  created_at: string;
};

type AuditRow = QueryResultRow & {
  id: string | number;
  task_id: string | null;
  user_id: string | number | null;
  action: string;
  metadata: string | null;
  created_at: string;
};

const mapTask = (row: TaskRow): TaskRecord => ({
  id: row.id,
  userId: Number(row.user_id),
  chatId: Number(row.chat_id),
  workspaceAlias: row.workspace_alias,
  prompt: row.prompt,
  status: row.status,
  summary: row.summary,
  result: row.result,
  diff: row.diff,
  diffSummary: row.diff_summary,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at,
  runnerTaskId: row.runner_task_id,
  pid: row.pid
});

const mapTaskLog = (row: TaskLogRow): TaskLogRecord => ({
  id: Number(row.id),
  taskId: row.task_id,
  sequence: row.sequence,
  level: row.level,
  message: row.message,
  raw: row.raw,
  createdAt: row.created_at
});

const mapAudit = (row: AuditRow): AuditRecord => ({
  id: Number(row.id),
  taskId: row.task_id,
  userId: row.user_id === null ? null : Number(row.user_id),
  action: row.action,
  metadata: row.metadata,
  createdAt: row.created_at
});

export class TaskRepository {
  constructor(private readonly db: Pool) {}

  async createTask(input: TaskCreateInput): Promise<TaskRecord> {
    const timestamp = nowIso();
    const result = await this.db.query<TaskRow>(
      `INSERT INTO tasks (
         id, user_id, chat_id, workspace_alias, prompt, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7)
       RETURNING *`,
      [
        input.id,
        input.userId,
        input.chatId,
        input.workspaceAlias,
        input.prompt,
        timestamp,
        timestamp
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Task not found after insert: ${input.id}`);
    }

    return mapTask(row);
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    const result = await this.db.query<TaskRow>('SELECT * FROM tasks WHERE id = $1', [taskId]);
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async listTasks(limit = 20): Promise<TaskSummaryView[]> {
    const result = await this.db.query<
      QueryResultRow & {
        id: string;
        workspace_alias: string;
        status: TaskStatus;
        created_at: string;
        updated_at: string;
        summary: string | null;
      }
    >(
      `SELECT id, workspace_alias, status, created_at, updated_at, summary
       FROM tasks
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      workspaceAlias: row.workspace_alias,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      summary: row.summary
    }));
  }

  async claimNextQueuedTask(startedAt: string): Promise<TaskRecord | null> {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const nextTask = await client.query<{ id: string }>(
        `SELECT id
         FROM tasks
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT 1`
      );

      const taskId = nextTask.rows[0]?.id;
      if (!taskId) {
        await client.query('COMMIT');
        return null;
      }

      const claimed = await client.query<TaskRow>(
        `UPDATE tasks
         SET status = 'running',
             started_at = $2,
             updated_at = $2
         WHERE id = $1 AND status = 'queued'
         RETURNING *`,
        [taskId, startedAt]
      );

      await client.query('COMMIT');
      return claimed.rows[0] ? mapTask(claimed.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    fields: Partial<
      Pick<
        TaskRecord,
        | 'summary'
        | 'result'
        | 'diff'
        | 'diffSummary'
        | 'errorMessage'
        | 'runnerTaskId'
        | 'pid'
        | 'startedAt'
        | 'completedAt'
      >
    > = {}
  ): Promise<void> {
    const timestamp = nowIso();
    await this.db.query(
      `UPDATE tasks
       SET status = $2,
           summary = COALESCE($3, summary),
           result = COALESCE($4, result),
           diff = COALESCE($5, diff),
           diff_summary = COALESCE($6, diff_summary),
           error_message = COALESCE($7, error_message),
           runner_task_id = COALESCE($8, runner_task_id),
           pid = COALESCE($9, pid),
           started_at = COALESCE($10, started_at),
           completed_at = COALESCE($11, completed_at),
           updated_at = $12
       WHERE id = $1`,
      [
        taskId,
        status,
        fields.summary ?? null,
        fields.result ?? null,
        fields.diff ?? null,
        fields.diffSummary ?? null,
        fields.errorMessage ?? null,
        fields.runnerTaskId ?? null,
        fields.pid ?? null,
        fields.startedAt ?? null,
        fields.completedAt ?? null,
        timestamp
      ]
    );
  }

  async appendLog(
    taskId: string,
    level: TaskLogRecord['level'],
    message: string,
    raw: string | null = null
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO task_logs (task_id, sequence, level, message, raw, created_at)
       SELECT $1,
              COALESCE(MAX(sequence), 0) + 1,
              $2,
              $3,
              $4,
              $5
       FROM task_logs
       WHERE task_id = $1`,
      [taskId, level, message, raw, nowIso()]
    );
  }

  async listLogs(taskId: string, limit = 100): Promise<TaskLogRecord[]> {
    const result = await this.db.query<TaskLogRow>(
      `SELECT * FROM task_logs WHERE task_id = $1 ORDER BY sequence DESC LIMIT $2`,
      [taskId, limit]
    );

    return result.rows.reverse().map(mapTaskLog);
  }

  async addAuditRecord(
    taskId: string | null,
    userId: number | null,
    action: string,
    metadata?: unknown
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_trail (task_id, user_id, action, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [taskId, userId, action, metadata === undefined ? null : JSON.stringify(metadata), nowIso()]
    );
  }

  async listAuditRecords(taskId: string, limit = 50): Promise<AuditRecord[]> {
    const result = await this.db.query<AuditRow>(
      `SELECT * FROM audit_trail WHERE task_id = $1 ORDER BY id DESC LIMIT $2`,
      [taskId, limit]
    );

    return result.rows.reverse().map(mapAudit);
  }

  async requeueTask(taskId: string): Promise<void> {
    await this.db.query(
      `UPDATE tasks
       SET status = 'queued',
           error_message = NULL,
           completed_at = NULL,
           updated_at = $2
       WHERE id = $1`,
      [taskId, nowIso()]
    );
  }
}
