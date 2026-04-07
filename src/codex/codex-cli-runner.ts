import { spawn } from 'node:child_process';

import type { AppConfig } from '../config/env';
import { redactSensitiveText } from '../security/redaction';
import type { TaskRecord } from '../types/task';
import type {
  CodexRunner,
  RunTaskInput,
  RunnerCompletion,
  RunnerEvent,
  RunningHandle
} from './types';

interface ParsedJsonEvent {
  type?: string;
  message?: string;
  text?: string;
  summary?: string;
  diff?: string;
  task_id?: string;
  status?: string;
}

const parseJsonLine = (line: string): ParsedJsonEvent | null => {
  try {
    return JSON.parse(line) as ParsedJsonEvent;
  } catch {
    return null;
  }
};

const inferEvent = (line: string): RunnerEvent => {
  const parsed = parseJsonLine(line);
  if (parsed) {
    const message = redactSensitiveText(
      parsed.message ?? parsed.text ?? parsed.summary ?? JSON.stringify(parsed)
    );

    if (parsed.type === 'diff' || parsed.diff) {
      return { type: 'diff', message, payload: parsed.diff ?? parsed };
    }

    if (parsed.type === 'approval_request' || parsed.status === 'waiting_for_approval') {
      return { type: 'approval', message, payload: parsed };
    }

    if (parsed.type === 'result') {
      return { type: 'result', message, payload: parsed };
    }

    if (parsed.type === 'error') {
      return { type: 'error', message, payload: parsed };
    }

    return { type: 'log', message, payload: parsed };
  }

  if (/approval/i.test(line)) {
    return { type: 'approval', message: redactSensitiveText(line) };
  }

  return { type: 'log', message: redactSensitiveText(line) };
};

const buildArgs = (config: AppConfig, task: TaskRecord, workspacePath: string): string[] => {
  return [...config.codexArgs, '--cwd', workspacePath, task.prompt];
};

export class CodexCliRunner implements CodexRunner {
  private readonly activeProcesses = new Map<string, ReturnType<typeof spawn>>();

  constructor(private readonly config: AppConfig) {}

  async runTask(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void
  ): Promise<RunningHandle> {
    return this.spawnTask(input, onEvent, false);
  }

  async resumeTask(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void
  ): Promise<RunningHandle> {
    return this.spawnTask(input, onEvent, true);
  }

  async cancelTask(task: TaskRecord): Promise<void> {
    const child = this.activeProcesses.get(task.id);
    if (!child) {
      return;
    }

    child.kill('SIGTERM');
  }

  private async spawnTask(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void,
    isResume: boolean
  ): Promise<RunningHandle> {
    const args = buildArgs(this.config, input.task, input.workspacePath);
    if (isResume) {
      args.push('--resume', input.task.id);
    }

    const child = spawn(this.config.codexBinary, args, {
      cwd: input.workspacePath,
      env: {
        ...process.env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.activeProcesses.set(input.task.id, child);

    let summary: string | null = null;
    let result: string | null = null;
    let diff: string | null = null;
    let errorMessage: string | null = null;
    let runnerTaskId: string | null = null;
    let waitingForApproval = false;
    const outputLines: string[] = [];

    const timeout = setTimeout(() => {
      onEvent({ type: 'error', message: 'Task timed out' });
      child.kill('SIGTERM');
    }, input.timeoutMs);

    const consumeChunk = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      const text = chunk.toString('utf8');
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        const event = inferEvent(line);
        outputLines.push(event.message);
        onEvent(event);

        const parsed = parseJsonLine(line);
        if (parsed?.summary) {
          summary = redactSensitiveText(parsed.summary);
        }
        if (parsed?.task_id) {
          runnerTaskId = parsed.task_id;
        }
        if (parsed?.diff) {
          diff = redactSensitiveText(parsed.diff);
        }
        if (event.type === 'result') {
          result = event.message;
        }
        if (event.type === 'approval') {
          waitingForApproval = true;
        }
        if (event.type === 'error' || stream === 'stderr') {
          errorMessage = event.message;
        }
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => consumeChunk(chunk, 'stdout'));
    child.stderr?.on('data', (chunk: Buffer) => consumeChunk(chunk, 'stderr'));

    const finished = new Promise<RunnerCompletion>((resolve) => {
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(input.task.id);

        const output = outputLines.join('\n').slice(-this.config.codexMaxOutputChars);
        if (!summary) {
          summary = output ? output.split('\n').slice(-5).join('\n') : null;
        }
        if (!result) {
          result = code === 0 ? output : null;
        }

        if (waitingForApproval) {
          resolve({
            status: 'waiting_for_approval',
            summary,
            result,
            diff,
            errorMessage,
            runnerTaskId
          });
          return;
        }

        if (signal === 'SIGTERM') {
          resolve({
            status: 'canceled',
            summary,
            result,
            diff,
            errorMessage: errorMessage ?? 'Process terminated',
            runnerTaskId
          });
          return;
        }

        resolve({
          status: code === 0 ? 'completed' : 'failed',
          summary,
          result,
          diff,
          errorMessage,
          runnerTaskId
        });
      });
    });

    return {
      runnerTaskId,
      pid: child.pid ?? null,
      finished
    };
  }
}
