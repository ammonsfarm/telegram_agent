import type { Logger } from 'pino';

import type { CodexRunner, RunnerEvent } from '../codex/types';
import type { AppConfig } from '../config/env';
import type { WorkspacePolicy } from '../config/workspaces';
import type { TaskRepository } from '../db/task-repository';
import { redactSensitiveText } from '../security/redaction';
import type { TaskRecord } from '../types/task';
import { createTaskId } from '../utils/id';
import { summarizeDiff } from '../utils/diff';
import { nowIso } from '../utils/time';

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly runner: CodexRunner,
    private readonly workspacePolicy: WorkspacePolicy,
    private readonly logger: Logger,
    private readonly config: AppConfig
  ) {}

  async createTask(userId: number, chatId: number, workspaceAlias: string, prompt: string): Promise<TaskRecord> {
    this.workspacePolicy.resolve(workspaceAlias);

    const task = await this.repository.createTask({
      id: createTaskId(),
      userId,
      chatId,
      workspaceAlias,
      prompt: redactSensitiveText(prompt)
    });

    await this.repository.addAuditRecord(task.id, userId, 'task.created', {
      workspaceAlias
    });

    return task;
  }

  async createResumeTask(
    userId: number,
    chatId: number,
    workspaceAlias: string,
    threadId: string,
    promptPreview: string
  ): Promise<TaskRecord> {
    const task = await this.createTask(userId, chatId, workspaceAlias, promptPreview);
    await this.repository.updateTaskStatus(task.id, 'queued', {
      runnerTaskId: threadId,
      summary: 'Queued resume from existing Codex thread'
    });
    await this.repository.addAuditRecord(task.id, userId, 'task.resume_queued', {
      threadId
    });
    return this.requireTask(task.id);
  }

  async listTasks() {
    return this.repository.listTasks();
  }

  async listActiveTasks() {
    return this.repository.listTasksByStatuses(
      ['queued', 'running', 'waiting_for_approval'],
      20
    );
  }

  async listWaitingTasks() {
    return this.repository.listTasksByStatuses(['waiting_for_approval'], 20);
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    return this.repository.getTask(taskId);
  }

  async getTaskLogs(taskId: string) {
    return this.repository.listLogs(taskId, this.config.codexLogTailLines);
  }

  async cancelTask(taskId: string, userId: number): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
    await this.runner.cancelTask(task);
    await this.repository.updateTaskStatus(taskId, 'canceled', {
      completedAt: nowIso(),
      errorMessage: 'Canceled by user'
    });
    await this.repository.addAuditRecord(taskId, userId, 'task.canceled');
    return this.requireTask(taskId);
  }

  async resumeTask(taskId: string, userId: number): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
    if (task.status !== 'waiting_for_approval' && task.status !== 'failed' && task.status !== 'canceled') {
      throw new Error(`Task ${taskId} cannot be resumed from status ${task.status}`);
    }

    await this.repository.requeueTask(taskId);
    await this.repository.addAuditRecord(taskId, userId, 'task.resumed');
    return this.requireTask(taskId);
  }

  async approveTask(taskId: string, userId: number): Promise<TaskRecord> {
    const task = await this.requireTask(taskId);
    if (task.status !== 'waiting_for_approval') {
      throw new Error(`Task ${taskId} is not waiting for approval`);
    }
    if (!task.runnerTaskId) {
      throw new Error(`Task ${taskId} has no Codex thread id to approve`);
    }

    return this.createResumeTask(
      userId,
      task.chatId,
      task.workspaceAlias,
      task.runnerTaskId,
      'Approval granted. Continue with the task.'
    );
  }

  async getHealth() {
    const active = (await this.repository.listTasks(100)).filter((task) =>
      ['queued', 'running', 'waiting_for_approval'].includes(task.status)
    ).length;

    return {
      status: 'ok',
      queueDepth: active,
      workspaces: this.workspacePolicy.list()
    };
  }

  async runNextQueuedTask(): Promise<TaskRecord | null> {
    const startedAt = nowIso();
    const task = await this.repository.claimNextQueuedTask(startedAt);
    if (!task) {
      return null;
    }

    const workspacePath = this.workspacePolicy.resolve(task.workspaceAlias);
    await this.repository.addAuditRecord(task.id, task.userId, 'task.started');

    const runInput = {
      task,
      workspacePath,
      timeoutMs: this.config.taskTimeoutMs
    };
    const executor = task.runnerTaskId ? this.runner.resumeTask.bind(this.runner) : this.runner.runTask.bind(this.runner);
    const handle = await executor(runInput, (event) => {
      void this.handleRunnerEvent(task.id, event);
    });

    await this.repository.updateTaskStatus(task.id, 'running', {
      runnerTaskId: handle.runnerTaskId,
      pid: handle.pid,
      startedAt
    });

    const completion = await handle.finished;
    const diffSummary = completion.diff ? summarizeDiff(completion.diff) : null;
    const completedAt = completion.status === 'waiting_for_approval' ? null : nowIso();

    await this.repository.updateTaskStatus(task.id, completion.status, {
      summary: completion.summary,
      result: completion.result,
      diff: completion.diff,
      diffSummary,
      errorMessage: completion.errorMessage,
      runnerTaskId: completion.runnerTaskId,
      completedAt
    });

    await this.repository.addAuditRecord(task.id, task.userId, `task.${completion.status}`, {
      diffSummary
    });

    this.logger.info(
      {
        taskId: task.id,
        userId: task.userId,
        status: completion.status
      },
      'Task finished'
    );

    return this.requireTask(task.id);
  }

  private async handleRunnerEvent(taskId: string, event: RunnerEvent): Promise<void> {
    const level =
      event.type === 'error' ? 'error' : event.type === 'approval' ? 'warn' : 'info';
    await this.repository.appendLog(
      taskId,
      level,
      event.message,
      event.payload ? JSON.stringify(event.payload) : null
    );

    if (event.type === 'approval') {
      await this.repository.updateTaskStatus(taskId, 'waiting_for_approval', {
        summary: event.message
      });
    }
  }

  private async requireTask(taskId: string): Promise<TaskRecord> {
    const task = await this.repository.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }
}
