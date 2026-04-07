import { Pool } from 'pg';

import { schemaSql } from './schema';

export const openDatabase = async (connectionString: string, ssl = false): Promise<Pool> => {
  const pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined
  });

  await pool.query(schemaSql);
  return pool;
};
