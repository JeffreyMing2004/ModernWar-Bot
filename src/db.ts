import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { config } from './config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL UNIQUE,
        game_id VARCHAR(64) NOT NULL UNIQUE,
        bound_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_openid (openid),
        INDEX idx_game_id (game_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        game_id VARCHAR(64) NOT NULL,
        season VARCHAR(32) NOT NULL,
        kills INT NOT NULL DEFAULT 0,
        deaths INT NOT NULL DEFAULT 0,
        heads INT NOT NULL DEFAULT 0,
        wins INT NOT NULL DEFAULT 0,
        losses INT NOT NULL DEFAULT 0,
        matches INT NOT NULL DEFAULT 0,
        kd DECIMAL(10,2) NOT NULL DEFAULT 0,
        rank_label VARCHAR(32) DEFAULT NULL,
        claimed TINYINT NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_game_season (game_id, season),
        INDEX idx_openid (openid),
        INDEX idx_game_id (game_id),
        INDEX idx_claimed (claimed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Latest (last-match) stats, keyed by game_id only
    await conn.query(`
      CREATE TABLE IF NOT EXISTS player_last_match (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        game_id VARCHAR(64) NOT NULL UNIQUE,
        result VARCHAR(16) NOT NULL DEFAULT '',
        game_mode VARCHAR(32) DEFAULT NULL,
        kills INT NOT NULL DEFAULT 0,
        deaths INT NOT NULL DEFAULT 0,
        heads INT NOT NULL DEFAULT 0,
        match_time DATETIME DEFAULT NULL,
        claimed TINYINT NOT NULL DEFAULT 1,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_openid (openid),
        INDEX idx_game_id (game_id),
        INDEX idx_claimed (claimed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Plugin interaction log
    await conn.query(`
      CREATE TABLE IF NOT EXISTS plugin_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plugin VARCHAR(64) NOT NULL DEFAULT '',
        event_type VARCHAR(64) NOT NULL,
        payload JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Migration: add `claimed` column to existing tables if missing
    for (const table of ['player_stats', 'player_last_match']) {
      const [cols] = await conn.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'claimed'`,
        [table]
      );
      if (cols.length === 0) {
        const afterCol = table === 'player_stats' ? 'rank_label' : 'match_time';
        await conn.query(
          `ALTER TABLE ${table} ADD COLUMN claimed TINYINT NOT NULL DEFAULT 1 AFTER ${afterCol}`
        );
        console.log(`[DB] Added claimed column to ${table}`);
      }
    }
  } finally {
    conn.release();
  }
}

export interface PlayerRow extends RowDataPacket {
  id: number;
  openid: string;
  game_id: string;
  bound_at: Date;
}