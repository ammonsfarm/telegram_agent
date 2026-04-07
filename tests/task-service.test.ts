import { afterEach, describe, expect, it } from 'vitest';

import { createTaskServiceFixture } from './helpers';

describe('TaskService', () => {
  const fixtures: Array<ReturnType<typeof createTaskServiceFixture>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      void fixture.db.end();
    }
  });

  it('creates and completes a task with diff summary', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);

    const task = await fixture.taskService.createTask(1, 10, 'repo', 'Run something');
    const result = await fixture.taskService.runNextQueuedTask();

    expect(result?.id).toBe(task.id);
    expect(result?.status).toBe('completed');
    expect(result?.diffSummary).toContain('Changed 1 file');
    expect(await fixture.taskService.getTaskLogs(task.id)).toHaveLength(3);
  });

  it('moves tasks into waiting_for_approval and allows requeue', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);
    fixture.runner.mode = 'approval';

    const task = await fixture.taskService.createTask(1, 10, 'repo', 'Needs approval');
    const pending = await fixture.taskService.runNextQueuedTask();
    expect(pending?.status).toBe('waiting_for_approval');

    const resumed = await fixture.taskService.resumeTask(task.id, 1);
    expect(resumed.status).toBe('queued');
  });

  it('cancels an existing task', async () => {
    const fixture = await createTaskServiceFixture();
    fixtures.push(fixture);

    const task = await fixture.taskService.createTask(1, 10, 'repo', 'Cancel me');
    const canceled = await fixture.taskService.cancelTask(task.id, 1);

    expect(canceled.status).toBe('canceled');
    expect(fixture.runner.cancellations).toContain(task.id);
  });
});
