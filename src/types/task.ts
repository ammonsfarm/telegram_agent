export const TASK_STATUSES = [
  'queued',
  'running',
  'waiting_for_approval',
  'completed',
  'failed',
  'canceled'
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskRecord {
  id: string;
  userId: number;
  chatId: number;
  workspaceAlias: string;
  prompt: string;
  status: TaskStatus;
  summary: string | null;
  result: string | null;
  diff: string | null;
  diffSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  runnerTaskId: string | null;
  pid: number | null;
}

export interface TaskLogRecord {
  id: number;
  taskId: string;
  sequence: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  raw: string | null;
  createdAt: string;
}

export interface AuditRecord {
  id: number;
  taskId: string | null;
  userId: number | null;
  action: string;
  metadata: string | null;
  createdAt: string;
}

export interface TaskCreateInput {
  id: string;
  userId: number;
  chatId: number;
  workspaceAlias: string;
  prompt: string;
}

export interface TaskSummaryView {
  id: string;
  workspaceAlias: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
}
