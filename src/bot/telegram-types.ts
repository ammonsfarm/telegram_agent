import { z } from 'zod';

const telegramUserSchema = z.object({
  id: z.number(),
  username: z.string().optional()
});

const telegramChatSchema = z.object({
  id: z.number()
});

const telegramMessageSchema = z.object({
  message_id: z.number(),
  text: z.string().optional(),
  chat: telegramChatSchema,
  from: telegramUserSchema.optional()
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageSchema.optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: telegramUserSchema,
      message: telegramMessageSchema.optional()
    })
    .optional()
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
