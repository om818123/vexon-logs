
import Database from 'better-sqlite3';
import path from 'node:path';

const databasePath =
  process.env.DATABASE_PATH || './vexon.sqlite';

const db = new Database(databasePath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    log_channel_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`);

export interface GuildSettings {
  guildId: string;
  logChannelId: string | null;
  enabled: boolean;
}

export function getSettings(
  guildId: string
): GuildSettings {
  const row = db
    .prepare(`
      SELECT guild_id, log_channel_id, enabled
      FROM guild_settings
      WHERE guild_id = ?
    `)
    .get(guildId) as
    | {
        guild_id: string;
        log_channel_id: string | null;
        enabled: number;
      }
    | undefined;

  if (!row) {
    db.prepare(`
      INSERT OR IGNORE INTO guild_settings
        (guild_id, log_channel_id, enabled)
      VALUES (?, NULL, 1)
    `).run(guildId);

    return {
      guildId,
      logChannelId: null,
      enabled: true,
    };
  }

  return {
    guildId: row.guild_id,
    logChannelId: row.log_channel_id,
    enabled: row.enabled === 1,
  };
}

export function setLogChannel(
  guildId: string,
  channelId: string
): void {
  db.prepare(`
    INSERT INTO guild_settings
      (guild_id, log_channel_id, enabled)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id)
    DO UPDATE SET log_channel_id = excluded.log_channel_id
  `).run(guildId, channelId);
}

export function setEnabled(
  guildId: string,
  enabled: boolean
): void {
  db.prepare(`
    INSERT INTO guild_settings
      (guild_id, log_channel_id, enabled)
    VALUES (?, NULL, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET enabled = excluded.enabled
  `).run(guildId, enabled ? 1 : 0);
}
