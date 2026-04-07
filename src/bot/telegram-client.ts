import type { Logger } from 'pino';

import { redactSensitiveText } from '../security/redaction';

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface SendMessageOptions {
  replyMarkup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

export class TelegramClient {
  private readonly baseUrl: string;

  constructor(
    private readonly token: string,
    private readonly logger: Logger
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: number, text: string, options: SendMessageOptions = {}): Promise<void> {
    await this.request('sendMessage', {
      chat_id: chatId,
      text: redactSensitiveText(text),
      reply_markup: options.replyMarkup
    });
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<void> {
    await this.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: redactSensitiveText(text),
      reply_markup: options.replyMarkup
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text ? redactSensitiveText(text) : undefined
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.request('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query']
    });
  }

  async deleteWebhook(): Promise<void> {
    await this.request('deleteWebhook', {
      drop_pending_updates: false
    });
  }

  async getUpdates(offset?: number, timeout = 30): Promise<Array<Record<string, unknown>>> {
    const response = await this.request<Array<Record<string, unknown>>>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query']
    });

    return response;
  }

  private async request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const parsed = (await response.json()) as TelegramResponse<T>;
    if (!response.ok || !parsed.ok || parsed.result === undefined) {
      this.logger.error(
        {
          method,
          status: response.status,
          description: parsed.description
        },
        'Telegram API request failed'
      );
      throw new Error(`Telegram API request failed for ${method}`);
    }

    return parsed.result;
  }
}
