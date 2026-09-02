import { getPool } from '../db';
import { RowDataPacket } from 'mysql2/promise';

interface StatData {
  openid?: string;
  game_id: string;
  season: string;
  kills?: number;
  deaths?: number;
  heads?: number;
  wins?: number;
  losses?: number;
  rank_label?: string | null;
}

interface LastMatchData {
  openid?: string;
  game_id: string;
  result: string;
  game_mode?: string | null;
  kills?: number;
  deaths?: number;
  heads?: number;
  match_time?: string | null;
}

/**
 * Compute KD as heads / matches - win+ lose-
 */
export function computeKd(heads: number, matches: number): number {
  if (!matches || matches <= 0) return 0;
  return Math.round((heads / matches) * 100) / 100;
}

/**
 * Upsert current-season stats (KD computed from heads/matches).
 * Resolves openid from game_id if not supplied.
 */
export async function upsertSeasonStats(data: StatData): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    const openid = data.openid ?? (await resolveOpenid(data.game_id));
    const kills = data.kills ?? 0;
    const deaths = data.deaths ?? 0;
    const heads = data.heads ?? 0;
    const wins = data.wins ?? 0;
    const losses = data.losses ?? 0;
    const matches = wins + losses;
    const kd = computeKd(heads, matches);

    await conn.execute(
      `INSERT INTO player_stats
         (openid, game_id, season, kills, deaths, heads, wins, losses, matches, kd, rank_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openid = VALUES(openid),
         kills = VALUES(kills),
         deaths = VALUES(deaths),
         heads = VALUES(heads),
         wins = VALUES(wins),
         losses = VALUES(losses),
         matches = VALUES(matches),
         kd = VALUES(kd),
         rank_label = VALUES(rank_label)`,
      [openid, data.game_id, data.season, kills, deaths, heads, wins, losses, matches, kd, data.rank_label ?? null]
    );
  } finally {
    conn.release();
  }
}

/**
 * Store the most recent match for a player.
 */
export async function upsertLastMatch(data: LastMatchData): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    const openid = data.openid ?? (await resolveOpenid(data.game_id));
    await conn.execute(
      `INSERT INTO player_last_match
         (openid, game_id, result, game_mode, kills, deaths, heads, match_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openid = VALUES(openid),
         result = VALUES(result),
         game_mode = VALUES(game_mode),
         kills = VALUES(kills),
         deaths = VALUES(deaths),
         heads = VALUES(heads),
         match_time = VALUES(match_time)`,
      [openid, data.game_id, data.result, data.game_mode ?? null, data.kills ?? 0, data.deaths ?? 0, data.heads ?? 0, data.match_time ?? null]
    );
  } finally {
    conn.release();
  }
}

/**
 * Log a plugin interaction event for audit/troubleshooting.
 */
export async function logPluginEvent(plugin: string, eventType: string, payload: unknown): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.execute('INSERT INTO plugin_events (plugin, event_type, payload) VALUES (?, ?, ?)', [
      plugin,
      eventType,
      JSON.stringify(payload),
    ]);
  } finally {
    conn.release();
  }
}

async function resolveOpenid(gameId: string): Promise<string> {
  const [rows] = await getPool().execute<RowDataPacket[]>(
    'SELECT openid FROM players WHERE game_id = ?',
    [gameId]
  );
  if (rows.length > 0) return String(rows[0].openid);
  return '';
}