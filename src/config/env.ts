import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  AUTHORIZED_USER_IDS: z.string().min(1),
  WORKSPACE_ALIASES: z.string().min(2),
  CODEX_STATE_DB_PATH: z.string().default('/home/openclaw/.codex/state_5.sqlite'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  BOT_MODE: z.enum(['webhook', 'polling']).default('polling'),
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(8).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  TASK_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  TASK_TIMEOUT_MS: z.coerce.number().int().positive().default(3600000),
  TELEGRAM_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  TELEGRAM_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  CODEX_BINARY: z.string().default('codex'),
  CODEX_ARGS: z.string().default('exec --json'),
  CODEX_MAX_OUTPUT_CHARS: z.coerce.number().int().positive().default(12000),
  CODEX_LOG_TAIL_LINES: z.coerce.number().int().positive().default(50)
});

const parseAliases = (raw: string): Record<string, string> => {
  const parsed = z.record(z.string().min(1), z.string().min(1)).parse(JSON.parse(raw));

  return Object.fromEntries(
    Object.entries(parsed).map(([alias, target]) => [alias, path.resolve(target)])
  );
};

export type AppConfig = ReturnType<typeof loadConfig>;

export const loadConfig = (source: NodeJS.ProcessEnv = process.env) => {
  const env = envSchema.parse(source);
  const authorizedUserIds = env.AUTHORIZED_USER_IDS.split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));

  if (authorizedUserIds.length === 0) {
    throw new Error('AUTHORIZED_USER_IDS must contain at least one numeric user id');
  }

  const workspaceAliases = parseAliases(env.WORKSPACE_ALIASES);

  if (env.BOT_MODE === 'webhook' && (!env.WEBHOOK_URL || !env.WEBHOOK_SECRET)) {
    throw new Error('WEBHOOK_URL and WEBHOOK_SECRET are required in webhook mode');
  }

  const databaseUrl =
    env.DATABASE_URL ??
    `postgresql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    authorizedUserIds,
    workspaceAliases,
    codexStateDbPath: path.resolve(env.CODEX_STATE_DB_PATH),
    databaseUrl,
    databaseHost: env.DB_HOST,
    databasePort: env.DB_PORT,
    databaseName: env.DB_NAME,
    databaseUser: env.DB_USER,
    databaseSsl: env.DB_SSL === 'true',
    botMode: env.BOT_MODE,
    webhookUrl: env.WEBHOOK_URL ?? null,
    webhookSecret: env.WEBHOOK_SECRET ?? null,
    port: env.PORT,
    host: env.HOST,
    pollingIntervalMs: env.POLLING_INTERVAL_MS,
    taskPollIntervalMs: env.TASK_POLL_INTERVAL_MS,
    taskTimeoutMs: env.TASK_TIMEOUT_MS,
    telegramRateLimitWindowMs: env.TELEGRAM_RATE_LIMIT_WINDOW_MS,
    telegramRateLimitMax: env.TELEGRAM_RATE_LIMIT_MAX,
    codexBinary: env.CODEX_BINARY,
    codexArgs: env.CODEX_ARGS.split(' ').filter(Boolean),
    codexMaxOutputChars: env.CODEX_MAX_OUTPUT_CHARS,
    codexLogTailLines: env.CODEX_LOG_TAIL_LINES
  };
};
