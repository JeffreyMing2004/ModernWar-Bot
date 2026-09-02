import { getGameIdByOpenid, getLastMatch, getSeasonStats } from './services/playerService';
import { computeKd } from './services/pluginService';

export interface CommandContext {
  content: string;
  openid: string;
  groupOpenid?: string;
  reply: (text: string) => Promise<void>;
}

const SEASON = (): string => {
  const d = new Date();
  const month = d.getMonth() + 1;
  const season = Math.floor((month - 1) / 4) + 1;
  return `${d.getFullYear()}_S${season}`;
};

/**
 * Parse commands:
 *  查询排位 {游戏ID}
 *  查询战绩 {游戏ID}
 *  查询KD {游戏ID}
 * If no game_id is given, use the openid's own binding.
 */
export async function commandHandler(ctx: CommandContext): Promise<void> {
  const { content, openid, reply } = ctx;

  // 功能列表 / 帮助
  const helpMatch = content.match(/^(功能列表|帮助|菜单|help)\s*$/i);
  if (helpMatch) {
    const HELP =
      '【ModernWar 机器人】功能列表\n' +
      '— 玩家绑定 —\n' +
      '绑定玩家ID {你的游戏ID}\n' +
      '— 战绩查询 —\n' +
      '查询KD {玩家ID}\n' +
      '查询战绩 {玩家ID}\n' +
      '查询排位 {玩家ID}\n' +
      '— 说明 —\n' +
      '绑定的玩家ID可在查询时省略，默认查自己';
    await reply(HELP);
    return;
  }

  // Binding command must run before queries
  const bindMatch = content.match(/^绑定(?:游戏|玩家)?(?:ID)?\s*[:：]?\s*(\S+)/i);
  if (bindMatch) {
    const gameId = bindMatch[1];
    await handleBind(openid, gameId, reply, ctx.groupOpenid);
    return;
  }

  const kdMatch = content.match(/^查询\s*(?:KD|kd|击杀比)[\s:：]*([\S]*)/);
  if (kdMatch) {
    const gameId = kdMatch[1] || await getGameIdByOpenid(openid);
    if (!gameId) return reply('请先发送 "绑定游戏ID {游戏ID}" 进行绑定');
    await handleKD(gameId, reply);
    return;
  }

  const zjMatch = content.match(/^查询\s*(?:战绩|最近对局)[\s:：]*([\S]*)/);
  if (zjMatch) {
    const gameId = zjMatch[1] || await getGameIdByOpenid(openid);
    if (!gameId) return reply('请先发送 "绑定游戏ID {游戏ID}" 进行绑定');
    await handleLastMatch(gameId, reply);
    return;
  }

  const dwMatch = content.match(/^查询\s*(?:排位|段位|段位分)[\s:：]*([\S]*)/);
  if (dwMatch) {
    const gameId = dwMatch[1] || await getGameIdByOpenid(openid);
    if (!gameId) return reply('请先发送 "绑定游戏ID {游戏ID}" 进行绑定');
    await handleRank(gameId, reply);
    return;
  }

  // No command matched
  await reply('未识别该命令，发送 "功能列表" 查看可用功能');
}

async function handleBind(
  openid: string,
  gameId: string,
  reply: CommandContext['reply'],
  groupOpenid?: string
): Promise<void> {
  console.log(`[Bind] openid=${openid} groupOpenid=${groupOpenid} parsedGameId="${gameId}"`);
  const { bindPlayer } = await import('./services/playerService');
  const result = await bindPlayer(openid, gameId);

  if (result.ok) {
    // Resolve the real QQ number from the member openid (group context only)
    if (groupOpenid) {
      try {
        const { getGroupMember } = await import('./api');
        const member = await getGroupMember(groupOpenid, openid);
        if (member && member.user_id) {
          await reply(`已绑定 ${gameId} 绑定QQ号：${member.user_id}`);
          return;
        }
      } catch (err: any) {
        console.warn('[Bind] Failed to resolve QQ number:', err.message);
      }
    }
    // Fallback: no QQ number available
    await reply(`已绑定 ${gameId}`);
  } else {
    await reply(result.message);
  }
}

async function handleKD(gameId: string, reply: CommandContext['reply']): Promise<void> {
  const stat = await getSeasonStats(gameId, SEASON());
  if (!stat) return reply(`玩家 ${gameId} 当前赛季暂无KD数据`);
  const kd = computeKd(stat.heads, stat.matches);
  await reply(
    `【${gameId}】当前赛季KD ${kd}\n` +
      `对局数：${stat.matches}（胜 ${stat.wins} 负 ${stat.losses}）\n` +
      `人头数：${stat.heads}`
  );
}

async function handleLastMatch(gameId: string, reply: CommandContext['reply']): Promise<void> {
  const last = await getLastMatch(gameId);
  if (!last) return reply(`玩家 ${gameId} 暂无最近对局记录`);
  const time = last.match_time ? new Date(last.match_time).toLocaleString('zh-CN') : '未知';
  const winText = last.result === 'win' ? '胜利' : last.result === 'lose' ? '失败' : last.result || '未知';
  await reply(
    `【${gameId}】最近一局战绩\n` +
      `结果：${winText}\n` +
      `模式：${last.game_mode || '未知'}\n` +
      `人头：${last.kills} / 死亡 ${last.deaths} / 爆头 ${last.heads}\n` +
      `时间：${time}`
  );
}

async function handleRank(gameId: string, reply: CommandContext['reply']): Promise<void> {
  const stat = await getSeasonStats(gameId, SEASON());
  const rank = stat?.rank_label;
  if (!rank) return reply(`玩家 ${gameId} 当前赛季暂无段位`);
  await reply(`【${gameId}】当前赛季段位：${rank}`);
}