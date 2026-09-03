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
 * Upsert current-season stats, using a KD value supplied by the plugin.
 * Resolves openid from game_id if not supplied.
 * If game_id is unbound, record is stored as unclaimed (claimed=0).
 */
export async function upsertSeasonStatsWithKd(data: StatData & { kd: number }): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    const openid = data.openid ?? (await resolveOpenid(data.game_id));
    const claimed = openid ? 1 : 0;
    const kills = data.kills ?? 0;
    const deaths = data.deaths ?? 0;
    const heads = data.heads ?? 0;
    const wins = data.wins ?? 0;
    const losses = data.losses ?? 0;
    const matches = wins + losses;
    const kd = data.kd;

    await conn.execute(
      `INSERT INTO player_stats
         (openid, game_id, season, kills, deaths, heads, wins, losses, matches, kd, rank_label, claimed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openid = VALUES(openid),
         kills = VALUES(kills),
         deaths = VALUES(deaths),
         heads = VALUES(heads),
         wins = VALUES(wins),
         losses = VALUES(losses),
         matches = VALUES(matches),
         kd = VALUES(kd),
         rank_label = VALUES(rank_label),
         claimed = VALUES(claimed)`,
      [openid, data.game_id, data.season, kills, deaths, heads, wins, losses, matches, kd, data.rank_label ?? null, claimed]
    );
  } finally {
    conn.release();
  }
}

/**
 * Upsert current-season stats (KD computed from heads/matches).
 * Resolves openid from game_id if not supplied.
 * If game_id is unbound, record is stored as unclaimed (claimed=0).
 */
export async function upsertSeasonStats(data: StatData): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    const openid = data.openid ?? (await resolveOpenid(data.game_id));
    const claimed = openid ? 1 : 0;
    const kills = data.kills ?? 0;
    const deaths = data.deaths ?? 0;
    const heads = data.heads ?? 0;
    const wins = data.wins ?? 0;
    const losses = data.losses ?? 0;
    const matches = wins + losses;
    const kd = computeKd(heads, matches);

    await conn.execute(
      `INSERT INTO player_stats
         (openid, game_id, season, kills, deaths, heads, wins, losses, matches, kd, rank_label, claimed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openid = VALUES(openid),
         kills = VALUES(kills),
         deaths = VALUES(deaths),
         heads = VALUES(heads),
         wins = VALUES(wins),
         losses = VALUES(losses),
         matches = VALUES(matches),
         kd = VALUES(kd),
         rank_label = VALUES(rank_label),
         claimed = VALUES(claimed)`,
      [openid, data.game_id, data.season, kills, deaths, heads, wins, losses, matches, kd, data.rank_label ?? null, claimed]
    );
  } finally {
    conn.release();
  }
}

/**
 * Store the most recent match for a player.
 * If game_id is unbound, record is stored as unclaimed (claimed=0).
 */
export async function upsertLastMatch(data: LastMatchData): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    const openid = data.openid ?? (await resolveOpenid(data.game_id));
    const claimed = openid ? 1 : 0;
    await conn.execute(
      `INSERT INTO player_last_match
         (openid, game_id, result, game_mode, kills, deaths, heads, match_time, claimed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openid = VALUES(openid),
         result = VALUES(result),
         game_mode = VALUES(game_mode),
         kills = VALUES(kills),
         deaths = VALUES(deaths),
         heads = VALUES(heads),
         match_time = VALUES(match_time),
         claimed = VALUES(claimed)`,
      [openid, data.game_id, data.result, data.game_mode ?? null, data.kills ?? 0, data.deaths ?? 0, data.heads ?? 0, data.match_time ?? null, claimed]
    );
  } finally {
    conn.release();
  }
}

/**
 * Claim unclaimed records for a game_id once the player binds.
 * Moves/marks previously unclaimed (claimed=0) records into the player's record
 * by stamping openid and setting claimed=1.
 * Returns the number of records claimed.
 */
export async function claimUnclaimed(gameId: string, openid: string): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [lastRes] = await conn.execute(
      `UPDATE player_last_match
       SET openid = ?, claimed = 1
       WHERE game_id = ? AND claimed = 0`,
      [openid, gameId]
    );
    const [statsRes] = await conn.execute(
      `UPDATE player_stats
       SET openid = ?, claimed = 1
       WHERE game_id = ? AND claimed = 0`,
      [openid, gameId]
    );
    await conn.commit();
    const lastAffected = (lastRes as any)?.affectedRows ?? 0;
    const statsAffected = (statsRes as any)?.affectedRows ?? 0;
    if (lastAffected + statsAffected > 0) {
      console.log(`[Claim] ${gameId} -> ${openid}: claimed ${lastAffected} last-match, ${statsAffected} stat record(s)`);
    }
  } catch (err) {
    await conn.rollback();
    throw err;
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

interface UnclaimedRow extends RowDataPacket {
  game_id: string;
  season: string;
  heads: number;
  matches: number;
  wins: number;
  losses: number;
  kd: number;
}

/**
 * List unclaimed (not yet bound) data.
 * Combines unclaimed last-match records and unclaimed season stats.
 */
export async function listUnclaimed(): Promise<any[]> {
  const [matches] = await getPool().execute<RowDataPacket[]>(
    `SELECT game_id, NULL AS season, heads, 1 AS matches, 0 AS wins, 0 AS losses,
            NULL AS kd, result, game_mode
     FROM player_last_match WHERE claimed = 0
     ORDER BY updated_at DESC LIMIT 200`
  );
  const [stats] = await getPool().execute<UnclaimedRow[]>(
    `SELECT game_id, season, heads, matches, wins, losses, kd
     FROM player_stats WHERE claimed = 0
     ORDER BY updated_at DESC LIMIT 200`
  );
  return [...matches, ...stats];
}