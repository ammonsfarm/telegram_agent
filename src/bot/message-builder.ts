import type {
  TaskLogRecord,
  TaskRecord,
  TaskSummaryView
} from '../types/task';
import type { CodexThreadView } from '../db/codex-state-repository';
import { chunkText } from '../utils/chunk';

const describeTask = (task: TaskSummaryView | TaskRecord): string => {
  return `${task.id}\nworkspace=${task.workspaceAlias}\nstatus=${task.status}\nupdated=${task.updatedAt}`;
};

export const buildHelpText = (workspaces: string[]): string => {
  return [
    'Available commands:',
    '/start',
    '/help',
    '/ask <workspace> <prompt>',
    '/chats',
    '/chats <workspace>',
    '/active',
    '/waiting',
    '/send <task_or_thread_id> <instruction>',
    '/approve <task_or_thread_id>',
    '/status <task_id>',
    '/tasks',
    '/logs <task_id>',
    '/result <task_id>',
    '/diff <task_id>',
    '/resume <task_id>',
    '/cancel <task_id>',
    '/health',
    '',
    `Allowed workspaces: ${workspaces.join(', ')}`
  ].join('\n');
};

export const buildTaskListText = (tasks: TaskSummaryView[]): string => {
  if (tasks.length === 0) {
    return 'No tasks found.';
  }

  return tasks.map(describeTask).join('\n\n');
};

export const buildManagerTaskText = (title: string, tasks: TaskSummaryView[]): string => {
  if (tasks.length === 0) {
    return `${title}\nNone.`;
  }

  return [
    title,
    ...tasks.map(
      (task) =>
        `${task.id}\nworkspace=${task.workspaceAlias}\nstatus=${task.status}\nupdated=${task.updatedAt}\nsummary=${task.summary ?? 'n/a'}`
    )
  ].join('\n\n');
};

export const buildActiveOverviewText = (
  tasks: TaskSummaryView[],
  threads: CodexThreadView[]
): string => {
  const managed = tasks.length === 0
    ? 'Managed active tasks:\nNone.'
    : [
        'Managed active tasks:',
        ...tasks.map(
          (task) =>
            `${task.id}\nworkspace=${task.workspaceAlias}\nstatus=${task.status}\nupdated=${task.updatedAt}\nsummary=${task.summary ?? 'n/a'}`
        )
      ].join('\n\n');

  const native = threads.length === 0
    ? 'Recent Codex threads:\nNone.'
    : [
        'Recent Codex threads:',
        ...threads.map(
          (thread) =>
            `${thread.id}\ncwd=${thread.cwd}\nupdated=${thread.updatedAt}\nprompt=${thread.promptPreview}`
        )
      ].join('\n\n');

  return `${managed}\n\n${native}`;
};

export const buildWorkspaceChooserText = (workspaces: string[]): string => {
  return [
    'Choose a workspace:',
    ...workspaces
  ].join('\n');
};

export const buildWorkspaceChatsText = (
  workspaceAlias: string,
  chats: CodexThreadView[]
): string => {
  if (chats.length === 0) {
    return `No chats found for workspace ${workspaceAlias}.`;
  }

  return [
    `Recent chats for ${workspaceAlias}:`,
    ...chats.map(
      (chat) =>
        `${chat.id}\nupdated=${chat.updatedAt}\nprompt=${chat.promptPreview}`
    )
  ].join('\n\n');
};

export const buildThreadDetailText = (thread: CodexThreadView): string => {
  return [
    `Chat ${thread.id}`,
    `cwd=${thread.cwd}`,
    `updated=${thread.updatedAt}`,
    `title=${thread.title}`,
    `prompt=${thread.promptPreview}`
  ].join('\n');
};

export const buildStatusText = (task: TaskRecord): string => {
  return [
    describeTask(task),
    `created=${task.createdAt}`,
    `started=${task.startedAt ?? 'n/a'}`,
    `completed=${task.completedAt ?? 'n/a'}`,
    `summary=${task.summary ?? 'n/a'}`,
    `diff_summary=${task.diffSummary ?? 'n/a'}`
  ].join('\n');
};

export const buildLogsText = (task: TaskRecord, logs: TaskLogRecord[]): string[] => {
  const body = logs.length
    ? logs.map((entry) => `[${entry.level}] ${entry.message}`).join('\n')
    : 'No logs captured yet.';
  return chunkText(`Logs for ${task.id}\n${body}`);
};

export const buildResultText = (task: TaskRecord): string[] => {
  return chunkText(task.result ? `Result for ${task.id}\n${task.result}` : 'No result available.');
};

export const buildDiffText = (task: TaskRecord): string[] => {
  if (!task.diff) {
    return ['No diff available.'];
  }

  return chunkText(`Diff summary: ${task.diffSummary ?? 'n/a'}\n\n${task.diff}`);
};
