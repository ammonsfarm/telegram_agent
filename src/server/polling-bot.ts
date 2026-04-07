import type { Logger } from 'pino';

import type { BotController } from '../bot/bot-controller';
import type { TelegramClient } from '../bot/telegram-client';

export class PollingBot {
  private timer: NodeJS.Timeout | null = null;
  private offset: number | undefined;
  private running = false;

  constructor(
    private readonly telegramClient: TelegramClient,
    private readonly controller: BotController,
    private readonly logger: Logger,
    private readonly intervalMs: number
  ) {}

  async start(): Promise<void> {
    await this.telegramClient.deleteWebhook();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const updates = await this.telegramClient.getUpdates(this.offset);
      for (const update of updates) {
        const updateId = Number(update.update_id);
        this.offset = updateId + 1;
        await this.controller.handleUpdate(update);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Polling tick failed');
    } finally {
      this.running = false;
    }
  }
}

