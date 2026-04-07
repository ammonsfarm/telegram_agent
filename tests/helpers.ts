import pino from 'pino';
import { newDb } from 'pg-mem';

import type { CodexRunner, RunTaskInput, RunnerCompletion, RunnerEvent, RunningHandle } from '../src/codex/types';
import { WorkspacePolicy } from '../src/config/workspaces';
import type { CodexThreadView } from '../src/db/codex-state-repository';
import { schemaSql } from '../src/db/schema';
import { TaskRepository } from '../src/db/task-repository';
import { TaskService } from '../src/core/task-service';

export class FakeRunner implements CodexRunner {
  public readonly cancellations: string[] = [];
  public readonly resumeCalls: string[] = [];
  public mode: 'completed' | 'approval' | 'failed' = 'completed';

  async runTask(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void
  ): Promise<RunningHandle> {
    return this.execute(input, onEvent, false);
  }

  async resumeTask(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void
  ): Promise<RunningHandle> {
    this.resumeCalls.push(input.task.runnerTaskId ?? input.task.id);
    return this.execute(input, onEvent, true);
  }

  async cancelTask(task: { id: string }): Promise<void> {
    this.cancellations.push(task.id);
  }

  private async execute(
    input: RunTaskInput,
    onEvent: (event: RunnerEvent) => void,
    resumed: boolean
  ): Promise<RunningHandle> {
    onEvent({
      type: 'log',
      message: resumed ? 'resumed execution' : 'started execution'
    });

    let completion: RunnerCompletion;
    if (this.mode === 'approval') {
      onEvent({ type: 'approval', message: 'approval required' });
      completion = {
        status: 'waiting_for_approval',
        summary: 'approval required',
        result: null,
        diff: null,
        errorMessage: null,
        runnerTaskId: `runner-${input.task.id}`
      };
    } else if (this.mode === 'failed') {
      onEvent({ type: 'error', message: 'runner failed' });
      completion = {
        status: 'failed',
        summary: 'failed',
        result: null,
        diff: null,
        errorMessage: 'runner failed',
        runnerTaskId: `runner-${input.task.id}`
      };
    } else {
      onEvent({ type: 'diff', message: 'diff available', payload: 'diff --git a/a b/a\n+line' });
      onEvent({ type: 'result', message: 'done' });
      completion = {
        status: 'completed',
        summary: 'completed',
        result: 'done',
        diff: 'diff --git a/a b/a\n+line',
        errorMessage: null,
        runnerTaskId: `runner-${input.task.id}`
      };
    }

    return {
      runnerTaskId: `runner-${input.task.id}`,
      pid: 42,
      finished: Promise.resolve(completion)
    };
  }
}

export class FakeTelegramClient {
  public readonly messages: Array<{ chatId: number; text: string }> = [];
  public readonly edits: Array<{ chatId: number; messageId: number; text: string }> = [];
  public readonly callbacks: string[] = [];

  async sendMessage(chatId: number, text: string): Promise<void> {
    this.messages.push({ chatId, text });
  }

  async editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    this.edits.push({ chatId, messageId, text });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.callbacks.push(callbackQueryId);
  }
}

export class FakeCodexStateRepository {
  constructor(private readonly threads: CodexThreadView[] = []) {}

  async listThreadsByWorkspace(cwd: string): Promise<CodexThreadView[]> {
    return this.threads.filter((thread) => thread.cwd === cwd);
  }

  async listRecentThreadsByWorkspaces(cwds: string[]): Promise<CodexThreadView[]> {
    return this.threads
      .filter((thread) => cwds.includes(thread.cwd))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getThread(threadId: string): Promise<CodexThreadView | null> {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
  }
}

export const createTaskServiceFixture = async () => {
  const memoryDb = newDb();
  memoryDb.public.none(schemaSql);
  const { Pool } = memoryDb.adapters.createPg();
  const db = new Pool();
  await db.query('SELECT 1');
  const repository = new TaskRepository(db);
  const runner = new FakeRunner();
  const logger = pino({ enabled: false });
  const taskService = new TaskService(
    repository,
    runner,
    new WorkspacePolicy({ repo: '/tmp/repo' }),
    logger,
    {
      nodeEnv: 'test',
      logLevel: 'silent',
      telegramBotToken: 'test',
      authorizedUserIds: [1],
      workspaceAliases: { repo: '/tmp/repo' },
      databaseUrl: 'postgresql://test:test@localhost:5432/test',
      databaseHost: 'localhost',
      databasePort: 5432,
      databaseName: 'test',
      databaseUser: 'test',
      databaseSsl: false,
      botMode: 'polling',
      webhookUrl: null,
      webhookSecret: null,
      port: 3000,
      host: '127.0.0.1',
      pollingIntervalMs: 100,
      taskPollIntervalMs: 100,
      taskTimeoutMs: 1000,
      telegramRateLimitWindowMs: 60000,
      telegramRateLimitMax: 10,
      codexBinary: 'codex',
      codexArgs: ['exec', '--json'],
      codexMaxOutputChars: 12000,
      codexLogTailLines: 50
    }
  );

  return { db, repository, runner, taskService, logger };
};
