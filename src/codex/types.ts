import type { TaskRecord } from '../types/task';

export interface RunTaskInput {
  task: TaskRecord;
  workspacePath: string;
  timeoutMs: number;
}

export interface RunnerEvent {
  type: 'status' | 'log' | 'result' | 'diff' | 'approval' | 'error';
  message: string;
  payload?: unknown;
}

export interface RunnerCompletion {
  status: 'completed' | 'failed' | 'canceled' | 'waiting_for_approval';
  summary: string | null;
  result: string | null;
  diff: string | null;
  errorMessage: string | null;
  runnerTaskId: string | null;
}

export interface RunningHandle {
  runnerTaskId: string | null;
  pid: number | null;
  finished: Promise<RunnerCompletion>;
}

export interface CodexRunner {
  runTask(input: RunTaskInput, onEvent: (event: RunnerEvent) => void): Promise<RunningHandle>;
  resumeTask(input: RunTaskInput, onEvent: (event: RunnerEvent) => void): Promise<RunningHandle>;
  cancelTask(task: TaskRecord): Promise<void>;
}

