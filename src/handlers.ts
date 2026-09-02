import { sendGroupMessage, sendUserMessage } from './api';
import { commandHandler } from './commands';

export function handleDispatch(payload: any): void {
  const { t: type, d: data } = payload;

  if (type === 'READY') {
    console.log('[Event] READY:', data.user?.username);
    return;
  }
  if (type === 'RESUMED') {
    console.log('[Event] RESUMED');
    return;
  }

  switch (type) {
    case 'GROUP_AT_MESSAGE_CREATE':
      onGroupAtMessage(data);
      break;
    case 'GROUP_MESSAGE_CREATE':
      onGroupMessage(data);
      break;
    case 'C2C_MESSAGE_CREATE':
      onC2CMessage(data);
      break;
    default:
      break;
  }
}

function onGroupAtMessage(data: any): void {
  const content = (data.content || '').trim();
  const groupOpenid = data.group_openid;
  const msgId = data.id;
  const author = data.author?.member_openid || 'unknown';

  console.log(`[Group@] ${author}: ${JSON.stringify(content)}`);
  console.log(`[Group@] raw data: ${JSON.stringify(data)}`);

  if (!groupOpenid) return;

  const reply = async (text: string): Promise<void> => {
    try {
      await sendGroupMessage(groupOpenid, text, msgId);
    } catch (err: any) {
      console.error('[Reply] Failed:', err.message);
    }
  };

  commandHandler({ content, openid: author, groupOpenid, reply });
}

function onGroupMessage(data: any): void {
  const content = (data.content || '').trim();
  const groupOpenid = data.group_openid;
  const msgId = data.id;
  const author = data.author?.member_openid || 'unknown';

  console.log(`[Group] ${author}: ${content}`);
  if (!groupOpenid) return;

  // May optionally handle non-@ group commands here too.
}

function onC2CMessage(data: any): void {
  const content = (data.content || '').trim();
  const userOpenid = data.author?.user_openid;
  const msgId = data.id;

  console.log(`[C2C] ${userOpenid}: ${content}`);

  if (!userOpenid) return;
  const reply = async (text: string): Promise<void> => {
    try {
      await sendUserMessage(userOpenid, text, msgId);
    } catch (err: any) {
      console.error('[Reply] Failed:', err.message);
    }
  };

  commandHandler({ content, openid: userOpenid, reply });
}