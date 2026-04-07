import type { Logger } from 'pino';

import type { WorkspacePolicy } from '../config/workspaces';
import type { CodexStateRepository, CodexThreadView } from '../db/codex-state-repository';
import type { TaskService } from '../core/task-service';
import { AuthorizationError, type AuthService } from '../security/auth';
import type { MemoryRateLimiter } from '../security/rate-limit';
import { redactSensitiveText } from '../security/redaction';
import {
  buildActiveOverviewText,
  buildManagerTaskText,
  buildDiffText,
  buildHelpText,
  buildLogsText,
  buildResultText,
  buildStatusText,
  buildThreadDetailText,
  buildTaskListText,
  buildWorkspaceChatsText,
  buildWorkspaceChooserText
} from './message-builder';
import { parseCommand } from './command-parser';
import type { InlineKeyboardButton, TelegramClient } from './telegram-client';
import { telegramUpdateSchema, type TelegramUpdate } from './telegram-types';

const CALLBACK_PREFIX = {
  workspace: 'workspace',
  thread: 'thread',
  action: 'action',
  backWorkspaces: 'back_workspaces',
  backChats: 'back_chats',
  sendHint: 'send_hint',
  resumeThread: 'resume_thread',
  approveThread: 'approve_thread'
} as const;

export class BotController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimiter: MemoryRateLimiter,
    private readonly taskService: TaskService,
    private readonly codexStateRepository: CodexStateRepository,
    private readonly telegramClient: TelegramClient,
    private readonly workspacePolicy: WorkspacePolicy,
    private readonly logger: Logger
  ) {}

  async handleUpdate(payload: unknown): Promise<void> {
    const update = telegramUpdateSchema.parse(payload);
    const context =
      update.message
        ? {
            chatId: update.message.chat.id,
            userId: update.message.from?.id
          }
        : update.callback_query?.message
          ? {
              chatId: update.callback_query.message.chat.id,
              userId: update.callback_query.from.id
            }
          : null;

    if (!context) {
      return;
    }

    try {
      this.auth.assertAuthorized(context.userId);
    } catch (error) {
      this.logger.warn({ userId: context.userId }, 'Unauthorized Telegram access rejected');
      if (context.userId) {
        await this.telegramClient.sendMessage(context.chatId, 'Unauthorized.');
      }
      if (error instanceof AuthorizationError) {
        return;
      }
      throw error;
    }

    const rateKey = `${context.userId}:${context.chatId}`;
    if (!this.rateLimiter.consume(rateKey)) {
      await this.telegramClient.sendMessage(context.chatId, 'Rate limit exceeded. Try again later.');
      return;
    }

    if (update.callback_query?.data) {
      await this.handleCallbackQuery(update);
      return;
    }

    const message = update.message;
    if (!message?.text) {
      return;
    }
    const command = parseCommand(message.text);
    if (!command) {
      await this.telegramClient.sendMessage(context.chatId, 'Commands only. Use /help.');
      return;
    }

    await this.executeCommand(update, command.name, command.args);
  }

  private async executeCommand(update: TelegramUpdate, commandName: string, args: string[]): Promise<void> {
    const chatId = update.message!.chat.id;
    const userId = update.message!.from!.id;

    try {
      switch (commandName) {
        case '/start':
        case '/help':
          await this.telegramClient.sendMessage(chatId, buildHelpText(this.workspacePolicy.list()));
          return;
        case '/ask':
          await this.handleAsk(chatId, userId, args);
          return;
        case '/tasks':
          await this.telegramClient.sendMessage(chatId, buildTaskListText(await this.taskService.listTasks()));
          return;
        case '/chats':
          await this.handleChats(chatId, args);
          return;
        case '/active':
          await this.handleActive(chatId);
          return;
        case '/waiting':
          await this.handleWaiting(chatId);
          return;
        case '/send':
          await this.handleSend(chatId, userId, args);
          return;
        case '/approve':
          await this.handleApprove(chatId, userId, args);
          return;
        case '/status':
          await this.handleStatus(chatId, args);
          return;
        case '/logs':
          await this.handleLogs(chatId, args);
          return;
        case '/result':
          await this.handleResult(chatId, args);
          return;
        case '/diff':
          await this.handleDiff(chatId, args);
          return;
        case '/resume':
          await this.handleResume(chatId, userId, args);
          return;
        case '/cancel':
          await this.handleCancel(chatId, userId, args);
          return;
        case '/health':
          await this.telegramClient.sendMessage(chatId, JSON.stringify(await this.taskService.getHealth(), null, 2));
          return;
        default:
          await this.telegramClient.sendMessage(chatId, 'Unknown command. Use /help.');
      }
    } catch (error) {
      this.logger.error({ err: error, commandName, userId }, 'Telegram command failed');
      await this.telegramClient.sendMessage(chatId, `Command failed: ${this.describeError(error)}`);
    }
  }

  private async handleAsk(chatId: number, userId: number, args: string[]): Promise<void> {
    if (args.length < 2) {
      throw new Error('Usage: /ask <workspace> <prompt>');
    }

    const workspaceAlias = args[0];
    if (!workspaceAlias) {
      throw new Error('Usage: /ask <workspace> <prompt>');
    }

    const promptParts = args.slice(1);
    const task = await this.taskService.createTask(userId, chatId, workspaceAlias, promptParts.join(' '));
    await this.telegramClient.sendMessage(
      chatId,
      `Queued task ${task.id} in workspace ${task.workspaceAlias}.`
    );
  }

  private async handleStatus(chatId: number, args: string[]): Promise<void> {
    const task = await this.requireTask(args[0]);
    await this.telegramClient.sendMessage(chatId, buildStatusText(task));
  }

  private async handleActive(chatId: number): Promise<void> {
    const tasks = await this.taskService.listActiveTasks();
    const threads = await this.codexStateRepository.listRecentThreadsByWorkspaces(
      this.workspacePolicy.list().map((workspace) => this.workspacePolicy.resolve(workspace)),
      10
    );
    await this.telegramClient.sendMessage(
      chatId,
      buildActiveOverviewText(tasks, threads)
    );
  }

  private async handleWaiting(chatId: number): Promise<void> {
    await this.telegramClient.sendMessage(
      chatId,
      buildManagerTaskText('Waiting for approval:', await this.taskService.listWaitingTasks())
    );
  }

  private async handleChats(chatId: number, args: string[]): Promise<void> {
    const workspaceAlias = args[0];
    if (!workspaceAlias) {
      await this.telegramClient.sendMessage(
        chatId,
        buildWorkspaceChooserText(this.workspacePolicy.list()),
        {
          replyMarkup: {
            inline_keyboard: this.workspacePolicy
              .list()
              .map((workspace) => [{ text: workspace, callback_data: this.callbackWorkspace(workspace) }])
          }
        }
      );
      return;
    }

    const chats = await this.listThreadsByWorkspaceAlias(workspaceAlias);
    await this.telegramClient.sendMessage(
      chatId,
      buildWorkspaceChatsText(workspaceAlias, chats),
      {
        replyMarkup: {
          inline_keyboard: this.buildWorkspaceChatButtons(workspaceAlias, chats)
        }
      }
    );
  }

  private async handleCallbackQuery(update: TelegramUpdate): Promise<void> {
    const callbackQuery = update.callback_query;
    if (!callbackQuery?.data || !callbackQuery.message) {
      return;
    }

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    try {
      if (data === CALLBACK_PREFIX.backWorkspaces) {
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          buildWorkspaceChooserText(this.workspacePolicy.list()),
          {
            replyMarkup: {
              inline_keyboard: this.workspacePolicy
                .list()
                .map((workspace) => [{ text: workspace, callback_data: this.callbackWorkspace(workspace) }])
            }
          }
        );
        return;
      }

      if (data.startsWith(`${CALLBACK_PREFIX.workspace}:`)) {
        const workspaceAlias = data.slice(`${CALLBACK_PREFIX.workspace}:`.length);
        const chats = await this.listThreadsByWorkspaceAlias(workspaceAlias);
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          buildWorkspaceChatsText(workspaceAlias, chats),
          {
            replyMarkup: {
              inline_keyboard: this.buildWorkspaceChatButtons(workspaceAlias, chats)
            }
          }
        );
        return;
      }

      if (data.startsWith(`${CALLBACK_PREFIX.thread}:`)) {
        const threadId = data.slice(`${CALLBACK_PREFIX.thread}:`.length);
        const thread = await this.requireThread(threadId);
        const workspaceAlias = this.workspaceAliasForCwd(thread.cwd);
        await this.telegramClient.editMessageText(
          chatId,
          messageId,
          buildThreadDetailText(thread),
          {
            replyMarkup: {
              inline_keyboard: this.buildThreadActionButtons(thread.id, workspaceAlias)
            }
          }
        );
        return;
      }

      if (data.startsWith(`${CALLBACK_PREFIX.action}:`)) {
        await this.handleTaskActionCallback(chatId, messageId, callbackQuery.from.id, data);
      }
    } finally {
      await this.telegramClient.answerCallbackQuery(callbackQuery.id);
    }
  }

  private async handleTaskActionCallback(
    chatId: number,
    messageId: number,
    userId: number,
    data: string
  ): Promise<void> {
    const [, action, taskId, workspaceAlias] = data.split(':');
    if (!action || !taskId) {
      throw new Error('Invalid callback payload');
    }

    if (action === CALLBACK_PREFIX.backChats) {
      const targetWorkspace = this.requireWorkspaceAlias(workspaceAlias);
      const chats = await this.listThreadsByWorkspaceAlias(targetWorkspace);
      await this.telegramClient.editMessageText(
        chatId,
        messageId,
        buildWorkspaceChatsText(targetWorkspace, chats),
        {
          replyMarkup: {
            inline_keyboard: this.buildWorkspaceChatButtons(targetWorkspace, chats)
          }
        }
      );
      return;
    }

    if (action === CALLBACK_PREFIX.sendHint) {
      await this.telegramClient.sendMessage(
        chatId,
        `Send a follow-up with:\n/send ${taskId} <instruction>`
      );
      return;
    }

    if (action === CALLBACK_PREFIX.resumeThread) {
      const thread = await this.requireThread(taskId);
      const targetWorkspace = this.workspaceAliasForCwd(thread.cwd);
      const task = await this.taskService.createResumeTask(
        userId,
        chatId,
        targetWorkspace,
        thread.id,
        thread.promptPreview || thread.title
      );
      await this.telegramClient.sendMessage(
        chatId,
        `Queued resume task ${task.id} for Codex thread ${thread.id} in workspace ${targetWorkspace}.`
      );
      return;
    }

    if (action === CALLBACK_PREFIX.approveThread) {
      const thread = await this.requireThread(taskId);
      const targetWorkspace = this.workspaceAliasForCwd(thread.cwd);
      const task = await this.taskService.createResumeTask(
        userId,
        chatId,
        targetWorkspace,
        thread.id,
        'Approval granted. Continue with the task.'
      );
      await this.telegramClient.sendMessage(
        chatId,
        `Queued approval follow-up task ${task.id} for Codex thread ${thread.id}.`
      );
    }
  }

  private async handleLogs(chatId: number, args: string[]): Promise<void> {
    const task = await this.requireTask(args[0]);
    const chunks = buildLogsText(task, await this.taskService.getTaskLogs(task.id));
    for (const chunk of chunks) {
      await this.telegramClient.sendMessage(chatId, chunk);
    }
  }

  private async handleResult(chatId: number, args: string[]): Promise<void> {
    const task = await this.requireTask(args[0]);
    const chunks = buildResultText(task);
    for (const chunk of chunks) {
      await this.telegramClient.sendMessage(chatId, chunk);
    }
  }

  private async handleDiff(chatId: number, args: string[]): Promise<void> {
    const task = await this.requireTask(args[0]);
    const chunks = buildDiffText(task);
    for (const chunk of chunks) {
      await this.telegramClient.sendMessage(chatId, chunk);
    }
  }

  private async handleResume(chatId: number, userId: number, args: string[]): Promise<void> {
    const id = this.requireTaskId(args[0]);
    const existingTask = await this.taskService.getTask(id);

    if (existingTask) {
      const task = await this.taskService.resumeTask(id, userId);
      await this.telegramClient.sendMessage(chatId, `Task ${task.id} re-queued for resume.`);
      return;
    }

    const thread = await this.requireThread(id);
    const workspaceAlias = this.workspaceAliasForCwd(thread.cwd);
    const task = await this.taskService.createResumeTask(
      userId,
      chatId,
      workspaceAlias,
      thread.id,
      thread.promptPreview || thread.title
    );
    await this.telegramClient.sendMessage(
      chatId,
      `Queued resume task ${task.id} for Codex thread ${thread.id} in workspace ${workspaceAlias}.`
    );
  }

  private async handleSend(chatId: number, userId: number, args: string[]): Promise<void> {
    if (args.length < 2) {
      throw new Error('Usage: /send <task_or_thread_id> <instruction>');
    }

    const targetId = this.requireTaskId(args[0]);
    const instruction = args.slice(1).join(' ').trim();
    if (!instruction) {
      throw new Error('Instruction is required');
    }

    const existingTask = await this.taskService.getTask(targetId);
    if (existingTask?.runnerTaskId) {
      const task = await this.taskService.createResumeTask(
        userId,
        chatId,
        existingTask.workspaceAlias,
        existingTask.runnerTaskId,
        instruction
      );
      await this.telegramClient.sendMessage(
        chatId,
        `Queued follow-up task ${task.id} for Codex thread ${existingTask.runnerTaskId}.`
      );
      return;
    }

    const thread = await this.requireThread(targetId);
    const workspaceAlias = this.workspaceAliasForCwd(thread.cwd);
    const task = await this.taskService.createResumeTask(
      userId,
      chatId,
      workspaceAlias,
      thread.id,
      instruction
    );
    await this.telegramClient.sendMessage(
      chatId,
      `Queued follow-up task ${task.id} for Codex thread ${thread.id} in workspace ${workspaceAlias}.`
    );
  }

  private async handleApprove(chatId: number, userId: number, args: string[]): Promise<void> {
    const targetId = this.requireTaskId(args[0]);
    const existingTask = await this.taskService.getTask(targetId);

    if (existingTask) {
      const task = await this.taskService.approveTask(targetId, userId);
      await this.telegramClient.sendMessage(
        chatId,
        `Queued approval follow-up task ${task.id} for prior task ${targetId}.`
      );
      return;
    }

    const thread = await this.requireThread(targetId);
    const workspaceAlias = this.workspaceAliasForCwd(thread.cwd);
    const task = await this.taskService.createResumeTask(
      userId,
      chatId,
      workspaceAlias,
      thread.id,
      'Approval granted. Continue with the task.'
    );
    await this.telegramClient.sendMessage(
      chatId,
      `Queued approval follow-up task ${task.id} for Codex thread ${thread.id}.`
    );
  }

  private async handleCancel(chatId: number, userId: number, args: string[]): Promise<void> {
    const task = await this.taskService.cancelTask(this.requireTaskId(args[0]), userId);
    await this.telegramClient.sendMessage(chatId, `Task ${task.id} canceled.`);
  }

  private async requireTask(taskId: string | undefined) {
    const task = await this.taskService.getTask(this.requireTaskId(taskId));
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  private async requireThread(threadId: string): Promise<CodexThreadView> {
    const thread = await this.codexStateRepository.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    return thread;
  }

  private requireTaskId(taskId: string | undefined): string {
    if (!taskId) {
      throw new Error('Task id is required');
    }

    return taskId;
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? redactSensitiveText(error.message) : 'Unknown error';
  }

  private buildWorkspaceChatButtons(
    workspaceAlias: string,
    chats: Array<{ id: string; promptPreview: string }>
  ): InlineKeyboardButton[][] {
    const rows = chats.slice(0, 10).map((chat) => [
      {
        text: `${chat.id.slice(0, 8)} ${chat.promptPreview.slice(0, 24)}`.trim(),
        callback_data: this.callbackThread(chat.id)
      }
    ]);
    rows.push([{ text: 'Back', callback_data: CALLBACK_PREFIX.backWorkspaces }]);
    return rows;
  }

  private buildThreadActionButtons(threadId: string, workspaceAlias: string): InlineKeyboardButton[][] {
    return [
      [
        { text: 'Resume', callback_data: this.callbackAction(CALLBACK_PREFIX.resumeThread, threadId, workspaceAlias) },
        { text: 'Approve', callback_data: this.callbackAction(CALLBACK_PREFIX.approveThread, threadId, workspaceAlias) }
      ],
      [{ text: 'Send', callback_data: this.callbackAction(CALLBACK_PREFIX.sendHint, threadId, workspaceAlias) }],
      [{ text: 'Back', callback_data: this.callbackAction(CALLBACK_PREFIX.backChats, threadId, workspaceAlias) }]
    ];
  }

  private callbackWorkspace(workspaceAlias: string): string {
    return `${CALLBACK_PREFIX.workspace}:${workspaceAlias}`;
  }

  private callbackThread(threadId: string): string {
    return `${CALLBACK_PREFIX.thread}:${threadId}`;
  }

  private callbackAction(action: string, taskId: string, workspaceAlias: string): string {
    return `${CALLBACK_PREFIX.action}:${action}:${taskId}:${workspaceAlias}`;
  }

  private async listThreadsByWorkspaceAlias(workspaceAlias: string): Promise<CodexThreadView[]> {
    return this.codexStateRepository.listThreadsByWorkspace(
      this.workspacePolicy.resolve(workspaceAlias)
    );
  }

  private workspaceAliasForCwd(cwd: string): string {
    const alias = this.workspacePolicy
      .list()
      .find((entry) => this.workspacePolicy.resolve(entry) === cwd);

    if (!alias) {
      throw new Error(`No workspace alias configured for cwd: ${cwd}`);
    }

    return alias;
  }

  private requireWorkspaceAlias(workspaceAlias: string | undefined): string {
    if (!workspaceAlias) {
      throw new Error('Workspace alias is required');
    }

    this.workspacePolicy.resolve(workspaceAlias);
    return workspaceAlias;
  }
}
