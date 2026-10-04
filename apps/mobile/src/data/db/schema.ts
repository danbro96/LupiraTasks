export const MIGRATIONS: string[] = [
  `
    DROP TABLE IF EXISTS lists;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS outbox;
    DROP TABLE IF EXISTS sync_state;
    DROP TABLE IF EXISTS meta;
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY NOT NULL,
      doc_json TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      sort_order TEXT NOT NULL DEFAULT '',
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_items_list ON items (list_id);
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT NOT NULL UNIQUE,
      op_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, seq);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `,
  '',
  `
    ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT;
    ALTER TABLE outbox ADD COLUMN list_id TEXT;
    UPDATE outbox SET list_id = json_extract(op_json, '$.listId');
    CREATE INDEX idx_outbox_list ON outbox (list_id, seq);
  `,
];
