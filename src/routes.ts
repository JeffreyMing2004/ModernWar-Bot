import express, { Request, Response } from 'express';
import { bindPlayer, getSeasonStats, getLastMatch, getGameIdByOpenid, listByKD } from './services/playerService';
import { upsertSeasonStats, upsertLastMatch, logPluginEvent, computeKd, listUnclaimed } from './services/pluginService';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  const startedAt = Date.now();

  const currentSeason = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const month = d.getMonth() + 1;
    const season = Math.floor((month - 1) / 4) + 1; // seasons of ~4 months
    return `${y}_S${season}`;
  };

  // ============================================================
  // Heartbeat (for plugin health check)
  // ============================================================

  /**
   * GET /api/heat
   * Plugin can poll this to check the bot is alive.
   */
  app.get('/api/heat', (_req: Request, res: Response) => {
    const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
    const uptimeMin = Math.floor(uptimeSec / 60);
    res.json({
      ok: true,
      status: 'alive',
      uptime_sec: uptimeSec,
      uptime_min: uptimeMin,
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================
  // Player binding
  // ============================================================

  /**
   * POST /api/player/bind
   * Body: { openid: string, game_id: string }
   * Each player can bind only once.
   */
  app.post('/api/player/bind', async (req: Request, res: Response) => {
    const { openid, game_id } = req.body ?? {};
    if (!openid || !game_id) {
      return res.status(400).json({ ok: false, message: '缺少参数 openid/game_id' });
    }
    try {
      const result = await bindPlayer(openid, game_id);
      return res.status(result.ok ? 200 : 409).json(result);
    } catch (err: any) {
      console.error('[Bind] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  // ============================================================
  // Plugin data interaction
  // ============================================================

  /**
   * POST /api/plugin/stats
   * Push current-season stats. KD computed as heads / matches (win+, lose-).
   * Body: { game_id, season?, kills?, deaths?, heads?, wins?, losses?, rank_label? }
   */
  app.post('/api/plugin/stats', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.game_id) {
      return res.status(400).json({ ok: false, message: '缺少 game_id' });
    }
    const data = {
      ...body,
      season: body.season ?? currentSeason(),
    };
    try {
      await upsertSeasonStats(data);
      await logPluginEvent('plugin', 'stats', data);
      return res.json({ ok: true, message: 'stats updated' });
    } catch (err: any) {
      console.error('[Plugin stats] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * POST /api/plugin/match
   * Push the latest match result.
   * Body: { game_id, result, game_mode?, kills?, deaths?, heads?, match_time?, season? }
   */
  app.post('/api/plugin/match', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.game_id || !body.result) {
      return res.status(400).json({ ok: false, message: '缺少 game_id/result' });
    }
    try {
      await upsertLastMatch(body);
      await logPluginEvent('plugin', 'match', body);
      return res.json({ ok: true, message: 'match recorded' });
    } catch (err: any) {
      console.error('[Plugin match] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  // ============================================================
  // 服务端上传战绩（预留）
  // 由游戏服务端上报对局结果，暂未启用
  // ============================================================

  /**
   * POST /api/report/match
   * 服务端上报单局战绩。
   * 若 game_id 已绑定 -> 记录到该玩家名下；
   * 若未绑定 -> 进入「未认领」区域(claimed=0)，待玩家绑定后自动认领。
   * Body: { game_id, result, game_mode?, kills?, deaths?, heads?, match_time? }
   */
  app.post('/api/report/match', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.game_id || !body.result) {
      return res.status(400).json({ ok: false, message: '缺少 game_id/result' });
    }
    try {
      await upsertLastMatch(body);
      const { getBindState } = await import('./services/playerService');
      const bound = await getBindState(body.game_id);
      await logPluginEvent('server', 'report_match', body);
      return res.json({
        ok: true,
        message: bound ? '战绩已记录' : '战绩已记录（未绑定，待认领）',
        claimed: bound,
      });
    } catch (err: any) {
      console.error('[Report match] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * GET /api/report/unclaimed
   * 查看当前「未认领」的战绩数据（待玩家绑定后自动认领）。
   */
  app.get('/api/report/unclaimed', async (_req: Request, res: Response) => {
    try {
      const rows = await listUnclaimed();
      return res.json({ ok: true, count: rows.length, data: rows });
    } catch (err: any) {
      console.error('[Unclaimed] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  // ============================================================
  // Player query / select endpoints
  // ============================================================

  /**
   * GET /api/player/select/kd?game_id=xxx&season=xxx
   * Return current-season KD. KD = heads / matches.
   */
  app.get('/api/player/select/kd', async (req: Request, res: Response) => {
    const gameId = String(req.query.game_id || '');
    const season = String(req.query.season || currentSeason());
    if (!gameId) return res.status(400).json({ ok: false, message: '缺少 game_id' });
    try {
      const stat = await getSeasonStats(gameId, season);
      if (!stat) return res.json({ ok: true, data: null, message: '无该赛季数据' });
      return res.json({
        ok: true,
        data: {
          game_id: stat.game_id,
          season: stat.season,
          heads: stat.heads,
          matches: stat.matches,
          wins: stat.wins,
          losses: stat.losses,
          kd: computeKd(stat.heads, stat.matches),
        },
      });
    } catch (err: any) {
      console.error('[Select kd] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * GET /api/player/select/zj  (战绩 - last match)
   * ?game_id=xxx
   */
  app.get('/api/player/select/zj', async (req: Request, res: Response) => {
    const gameId = String(req.query.game_id || '');
    if (!gameId) return res.status(400).json({ ok: false, message: '缺少 game_id' });
    try {
      const last = await getLastMatch(gameId);
      if (!last) return res.json({ ok: true, data: null, message: '无最近对局记录' });
      return res.json({
        ok: true,
        data: {
          game_id: last.game_id,
          result: last.result,
          game_mode: last.game_mode,
          kills: last.kills,
          deaths: last.deaths,
          heads: last.heads,
          match_time: last.match_time,
        },
      });
    } catch (err: any) {
      console.error('[Select zj] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * GET /api/player/select/dw  (段位 - rank)
   * ?game_id=xxx&season=xxx
   */
  app.get('/api/player/select/dw', async (req: Request, res: Response) => {
    const gameId = String(req.query.game_id || '');
    const season = String(req.query.season || currentSeason());
    if (!gameId) return res.status(400).json({ ok: false, message: '缺少 game_id' });
    try {
      const stat = await getSeasonStats(gameId, season);
      if (!stat || !stat.rank_label) return res.json({ ok: true, data: null, message: '无段位数据' });
      return res.json({
        ok: true,
        data: { game_id: stat.game_id, season: stat.season, rank_label: stat.rank_label },
      });
    } catch (err: any) {
      console.error('[Select dw] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * GET /api/player/select/rank  (排行榜 by KD)
   * ?season=xxx&limit=50
   */
  app.get('/api/player/select/rank', async (req: Request, res: Response) => {
    const season = String(req.query.season || currentSeason());
    const limit = Math.min(Number(req.query.limit || 50), 100);
    try {
      const rows = await listByKD(season, limit);
      return res.json({ ok: true, data: rows });
    } catch (err: any) {
      console.error('[Select rank] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  /**
   * GET /api/player/openid/:openid  (resolve game_id by openid)
   */
  app.get('/api/player/openid/:openid', async (req: Request, res: Response) => {
    const openid = String(req.params.openid);
    try {
      const gameId = await getGameIdByOpenid(openid);
      if (!gameId) return res.status(404).json({ ok: false, message: '未绑定游戏ID' });
      return res.json({ ok: true, data: { openid, game_id: gameId } });
    } catch (err: any) {
      console.error('[Openid resolve] error:', err.message);
      return res.status(500).json({ ok: false, message: '服务器内部错误' });
    }
  });

  return app;
}