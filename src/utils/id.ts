import { randomUUID } from 'node:crypto';

export const createTaskId = (): string => randomUUID();

