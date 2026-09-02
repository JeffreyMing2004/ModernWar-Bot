import { getPool, PlayerRow } from '../db';
import { RowDataPacket } from 'mysql2/promise';

export interface BindResult {
  ok: boolean;
  message: string;
  data?: { openid: string; game_id: string };
}

interface NameRow extends RowDataPacket {
  game_id: string;
  openid: string;
}

interface StatRow extends RowDataPacket {
  game_id: string;
  openid: string;
  season: string;
  heads: number;
  matches: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  kd: number;
  rank_label: string | null;
}

interface LastMatchRow extends RowDataPacket {
  game_id: string;
  openid: string;
  result: string;
  game_mode: string | null;
  kills: number;
  deaths: number;
  heads: number;
  match_time: Date | null;
}

/**
 * Bind a game ID to an openid. Each player (game_id) can only bind once.
 */
export async function bindPlayer(openid: string, gameId: string): Promise<BindResult> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    // Check if this game_id is already bound to another openid
    const [existing] = await conn.execute<NameRow[]>(
      'SELECT openid FROM players WHERE game_id = ?',
      [gameId]
    );
    if (existing.length > 0) {
      await conn.rollback();
      if (existing[0].openid === openid) {
        return { ok: false, message: '该游戏ID已绑定到当前账号' };
      }
      return { ok: false, message: '该游戏ID已被其他玩家绑定，每个玩家仅能绑定一次' };
    }

    // Check openid already has a binding
    const [bound] = await conn.execute<NameRow[]>(
      'SELECT game_id FROM players WHERE openid = ?',
      [openid]
    );
    if (bound.length > 0) {
      await conn.rollback();
      return { ok: false, message: `当前账号已绑定游戏ID：${bound[0].game_id}，不可重复绑定` };
    }

    await conn.execute('INSERT INTO players (openid, game_id) VALUES (?, ?)', [openid, gameId]);
    await conn.commit();

    // 绑定成功后，认领此前未绑定时上传的战绩
    try {
      const { claimUnclaimed } = await import('./pluginService');
      await claimUnclaimed(gameId, openid);
    } catch (err: any) {
      console.warn(`[Bind] claim unclaimed data failed for ${gameId}:`, err.message);
    }

    return { ok: true, message: '绑定成功', data: { openid, game_id: gameId } };
  } catch (err: any) {
    await conn.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      return { ok: false, message: '该游戏ID已绑定，每个玩家仅能绑定一次' };
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Resolve openid -> game_id (used for queries)
 */
export async function getGameIdByOpenid(openid: string): Promise<string | null> {
  const [rows] = await getPool().execute<NameRow[]>(
    'SELECT game_id FROM players WHERE openid = ?',
    [openid]
  );
  return rows.length > 0 ? rows[0].game_id : null;
}

/**
 * Whether a game_id is currently bound to any player.
 */
export async function getBindState(gameId: string): Promise<boolean> {
  const [rows] = await getPool().execute<NameRow[]>(
    'SELECT openid FROM players WHERE game_id = ?',
    [gameId]
  );
  return rows.length > 0;
}

/**
 * Get current season stats (rank + KD) for a game_id
 */
export async function getSeasonStats(gameId: string, season: string): Promise<StatRow | null> {
  const [rows] = await getPool().execute<StatRow[]>(
    `SELECT game_id, openid, season, heads, matches, kills, deaths, wins, losses, kd, rank_label
     FROM player_stats WHERE game_id = ? AND season = ?`,
    [gameId, season]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get the most recent match for a game_id
 */
export async function getLastMatch(gameId: string): Promise<LastMatchRow | null> {
  const [rows] = await getPool().execute<LastMatchRow[]>(
    `SELECT game_id, openid, result, game_mode, kills, deaths, heads, match_time
     FROM player_last_match WHERE game_id = ?`,
    [gameId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * League-table style listing for a season, sorted by KD desc
 */
export async function listByKD(season: string, limit = 50): Promise<StatRow[]> {
  const [rows] = await getPool().execute<StatRow[]>(
    `SELECT game_id, openid, season, heads, matches, kills, deaths, wins, losses, kd, rank_label
     FROM player_stats WHERE season = ? ORDER BY kd DESC LIMIT ?`,
    [season, limit]
  );
  return rows;
}