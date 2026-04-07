import { afterEach, describe, expect, it } from 'vitest';

import { BotController } from '../src/bot/bot-controller';
import { AuthService } from '../src/security/auth';
import { MemoryRateLimiter } from '../src/security/rate-limit';
import { WorkspacePolicy } from '../src/config/workspaces';
import { createTaskServiceFixture, FakeCodexStateRepository, FakeTelegramClient } from './helpers';

describe('BotController', () => {
  const fixtures: Array<ReturnType<typeof createTaskServiceFixture>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      void fixture.db.end();
    }
  });

  it('rejects unauthorized users', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const controller = new BotController(
      new AuthService([999]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      new FakeCodexStateRepository(),
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/tasks',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toBe('Unauthorized.');
  });

  it('queues tasks through /ask and returns status through /status', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      new FakeCodexStateRepository(),
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/ask repo inspect code',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    const queuedMessage = telegram.messages[0]?.text ?? '';
    expect(queuedMessage).toContain('Queued task');
    const taskId = queuedMessage.split(' ')[2];

    await controller.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        text: `/status ${taskId}`,
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[1]?.text).toContain('status=queued');
  });

  it('lists workspaces and workspace chats through /chats', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-1',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Review the deploy setup',
        promptPreview: 'Review the deploy setup'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/chats',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    await controller.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        text: '/chats repo',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toContain('Choose a workspace');
    expect(telegram.messages[0]?.text).toContain('repo');
    expect(telegram.messages[1]?.text).toContain('Recent chats for repo');
    expect(telegram.messages[1]?.text).toContain('Review the deploy setup');
  });

  it('supports inline chats navigation', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-2',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Review webhook deploy behavior',
        promptPreview: 'Review webhook deploy behavior'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        text: '/chats',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    await controller.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cb1',
        data: 'workspace:repo',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 },
          text: '/chats'
        }
      }
    });

    await controller.handleUpdate({
      update_id: 3,
      callback_query: {
        id: 'cb2',
        data: 'thread:thread-2',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 }
        }
      }
    });

    expect(telegram.edits[0]?.text).toContain('Recent chats for repo');
    expect(telegram.edits[1]?.text).toContain('Chat thread-2');
    expect(telegram.callbacks).toEqual(['cb1', 'cb2']);
  });

  it('supports inline resume, approve, and send hint actions for a thread', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-inline',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Inline thread',
        promptPreview: 'Inline thread'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'cb-thread',
        data: 'thread:thread-inline',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 }
        }
      }
    });

    await controller.handleUpdate({
      update_id: 2,
      callback_query: {
        id: 'cb-send',
        data: 'action:send_hint:thread-inline:repo',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 }
        }
      }
    });

    await controller.handleUpdate({
      update_id: 3,
      callback_query: {
        id: 'cb-resume',
        data: 'action:resume_thread:thread-inline:repo',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 }
        }
      }
    });

    await controller.handleUpdate({
      update_id: 4,
      callback_query: {
        id: 'cb-approve',
        data: 'action:approve_thread:thread-inline:repo',
        from: { id: 1 },
        message: {
          message_id: 10,
          chat: { id: 55 }
        }
      }
    });

    expect(telegram.edits[0]?.text).toContain('Chat thread-inline');
    expect(telegram.messages[0]?.text).toContain('/send thread-inline <instruction>');
    expect(telegram.messages[1]?.text).toContain('Queued resume task');
    expect(telegram.messages[2]?.text).toContain('Queued approval follow-up task');
  });

  it('queues a resume when given a Codex thread id', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-3',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Native codex thread',
        promptPreview: 'Native codex thread'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/resume thread-3',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toContain('Queued resume task');
    expect(telegram.messages[0]?.text).toContain('thread-3');
  });

  it('queues follow-up instructions with /send for a Codex thread id', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-4',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Calendar endpoint thread',
        promptPreview: 'Calendar endpoint thread'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/send thread-4 create a new endpoint for the web to read calendar entries',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toContain('Queued follow-up task');
    expect(telegram.messages[0]?.text).toContain('thread-4');
  });

  it('queues approval follow-up tasks with /approve', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    fixture.runner.mode = 'approval';
    const telegram = new FakeTelegramClient();
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      new FakeCodexStateRepository(),
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    const task = await fixture.taskService.createTask(1, 55, 'repo', 'Need approval');
    await fixture.taskService.runNextQueuedTask();

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: `/approve ${task.id}`,
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toContain('Queued approval follow-up task');
  });

  it('shows active and waiting tasks', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    fixture.runner.mode = 'approval';
    const telegram = new FakeTelegramClient();
    const codexStateRepository = new FakeCodexStateRepository([
      {
        id: 'thread-active',
        cwd: '/tmp/repo',
        updatedAt: '2026-04-07T12:00:00.000Z',
        title: 'Recent thread',
        promptPreview: 'Recent thread'
      }
    ]);
    const controller = new BotController(
      new AuthService([1]),
      new MemoryRateLimiter(60000, 10),
      fixture.taskService,
      codexStateRepository as never,
      telegram as never,
      new WorkspacePolicy({ repo: '/tmp/repo' }),
      fixture.logger
    );

    await fixture.taskService.createTask(1, 55, 'repo', 'Need approval');
    await fixture.taskService.runNextQueuedTask();

    await controller.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        text: '/active',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    await controller.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        text: '/waiting',
        chat: { id: 55 },
        from: { id: 1 }
      }
    });

    expect(telegram.messages[0]?.text).toContain('Managed active tasks:');
    expect(telegram.messages[0]?.text).toContain('Recent Codex threads:');
    expect(telegram.messages[1]?.text).toContain('Waiting for approval:');
  });
});
