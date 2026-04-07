import 'dotenv/config';

import { AuthService } from '../security/auth';
import { MemoryRateLimiter } from '../security/rate-limit';
import { loadConfig } from '../config/env';
import { WorkspacePolicy } from '../config/workspaces';
import { CodexStateRepository, openCodexStateDatabase } from '../db/codex-state-repository';
import { openDatabase } from '../db/database';
import { TaskRepository } from '../db/task-repository';
import { createLogger } from '../logging/logger';
import { CodexCliRunner } from '../codex/codex-cli-runner';
import { TaskService } from '../core/task-service';
import { TaskQueue } from '../core/task-queue';
import { TelegramClient } from '../bot/telegram-client';
import { BotController } from '../bot/bot-controller';
import { PollingBot } from '../server/polling-bot';
import { createHttpServer } from '../server/http-server';

export const createApp = async () => {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = await openDatabase(config.databaseUrl, config.databaseSsl);
  const codexStateDatabase = openCodexStateDatabase(config.codexStateDbPath);
  const repository = new TaskRepository(database);
  const codexStateRepository = new CodexStateRepository(codexStateDatabase);
  const workspacePolicy = new WorkspacePolicy(config.workspaceAliases);
  const auth = new AuthService(config.authorizedUserIds);
  const rateLimiter = new MemoryRateLimiter(
    config.telegramRateLimitWindowMs,
    config.telegramRateLimitMax
  );
  const runner = new CodexCliRunner(config);
  const taskService = new TaskService(repository, runner, workspacePolicy, logger, config);
  const taskQueue = new TaskQueue(taskService, logger, config.taskPollIntervalMs);
  const telegramClient = new TelegramClient(config.telegramBotToken, logger);
  const botController = new BotController(
    auth,
    rateLimiter,
    taskService,
    codexStateRepository,
    telegramClient,
    workspacePolicy,
    logger
  );
  const httpServer = await createHttpServer(
    config,
    logger,
    taskService,
    botController,
    telegramClient
  );
  const pollingBot =
    config.botMode === 'polling'
      ? new PollingBot(telegramClient, botController, logger, config.pollingIntervalMs)
      : null;

  return {
    config,
    logger,
    database,
    codexStateDatabase,
    repository,
    codexStateRepository,
    taskService,
    taskQueue,
    httpServer,
    pollingBot
  };
};
