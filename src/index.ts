import { createApp } from './app/create-app';

const main = async () => {
  const app = await createApp();
  app.taskQueue.start();
  await app.httpServer.listen({
    host: app.config.host,
    port: app.config.port
  });

  if (app.pollingBot) {
    await app.pollingBot.start();
  }

  const shutdown = async (signal: string) => {
    app.logger.info({ signal }, 'Shutting down');
    if (app.pollingBot) {
      await app.pollingBot.stop();
    }
    await app.taskQueue.stop();
    await app.httpServer.close();
    await app.database.end();
    app.codexStateDatabase.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

void main();
