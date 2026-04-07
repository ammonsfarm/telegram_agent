import Database from 'better-sqlite3';

export interface CodexThreadView {
  id: string;
  cwd: string;
  updatedAt: string;
  title: string;
  promptPreview: string;
}

type ThreadRow = {
  id: string;
  cwd: string;
  updated_at: number;
  title: string;
  first_user_message: string;
};

const toIso = (value: number): string => new Date(value * 1000).toISOString();

const toPreview = (row: ThreadRow): string => {
  const source = row.first_user_message.trim() || row.title.trim();
  return source.replace(/\s+/g, ' ').slice(0, 100);
};

const mapThread = (row: ThreadRow): CodexThreadView => ({
  id: row.id,
  cwd: row.cwd,
  updatedAt: toIso(row.updated_at),
  title: row.title,
  promptPreview: toPreview(row)
});

export const openCodexStateDatabase = (filename: string): Database.Database => {
  return new Database(filename, { readonly: true, fileMustExist: true });
};

export class CodexStateRepository {
  constructor(private readonly db: Database.Database) {}

  async listThreadsByWorkspace(cwd: string, limit = 20): Promise<CodexThreadView[]> {
    const rows = this.db
      .prepare(
        `SELECT id, cwd, updated_at, title, first_user_message
         FROM threads
         WHERE cwd = ? AND archived = 0
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(cwd, limit) as ThreadRow[];

    return rows.map(mapThread);
  }

  async getThread(threadId: string): Promise<CodexThreadView | null> {
    const row = this.db
      .prepare(
        `SELECT id, cwd, updated_at, title, first_user_message
         FROM threads
         WHERE id = ?`
      )
      .get(threadId) as ThreadRow | undefined;

    return row ? mapThread(row) : null;
  }

  async listRecentThreadsByWorkspaces(cwds: string[], limit = 20): Promise<CodexThreadView[]> {
    if (cwds.length === 0) {
      return [];
    }

    const placeholders = cwds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT id, cwd, updated_at, title, first_user_message
         FROM threads
         WHERE cwd IN (${placeholders}) AND archived = 0
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(...cwds, limit) as ThreadRow[];

    return rows.map(mapThread);
  }
}
