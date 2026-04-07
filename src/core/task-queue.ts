import type { Logger } from 'pino';

import type { TaskService } from './task-service';

export class TaskQueue {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private draining = false;

  constructor(
    private readonly taskService: TaskService,
    private readonly logger: Logger,
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

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

    this.draining = true;
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async tick(): Promise<void> {
    if (this.running || this.draining) {
      return;
    }

    this.running = true;
    try {
      await this.taskService.runNextQueuedTask();
    } catch (error) {
      this.logger.error({ err: error }, 'Queue tick failed');
    } finally {
      this.running = false;
    }
  }
}
