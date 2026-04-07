import pino from 'pino';

import type { AppConfig } from '../config/env';
import { redactSensitiveText } from '../security/redaction';

export const createLogger = (config: AppConfig) => {
  return pino({
    level: config.logLevel,
    base: null,
    redact: {
      paths: ['telegramBotToken', 'headers.authorization'],
      censor: '[REDACTED]'
    },
    formatters: {
      level: (label) => ({ level: label })
    },
    serializers: {
      err: (error) => ({
        message: redactSensitiveText(error.message),
        stack: error.stack ? redactSensitiveText(error.stack) : undefined
      })
    }
  });
};
