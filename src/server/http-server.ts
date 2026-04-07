import fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Logger } from 'pino';

import type { BotController } from '../bot/bot-controller';
import type { TelegramClient } from '../bot/telegram-client';
import type { AppConfig } from '../config/env';
import type { TaskService } from '../core/task-service';

export const createHttpServer = async (
  config: AppConfig,
  logger: Logger,
  taskService: TaskService,
  botController: BotController,
  telegramClient: TelegramClient
) => {
  const app = fastify({
    logger: false,
    loggerInstance: logger
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  app.get('/health', async () => taskService.getHealth());

  app.post('/telegram/webhook', async (request, reply) => {
    const secret = request.headers['x-telegram-bot-api-secret-token'];
    if (config.botMode === 'webhook' && secret !== config.webhookSecret) {
      reply.code(401);
      return { ok: false };
    }

    await botController.handleUpdate(request.body);
    return { ok: true };
  });

  app.addHook('onReady', async () => {
    if (config.botMode === 'webhook' && config.webhookUrl && config.webhookSecret) {
      await telegramClient.setWebhook(config.webhookUrl, config.webhookSecret);
    }
  });

  return app;
};
