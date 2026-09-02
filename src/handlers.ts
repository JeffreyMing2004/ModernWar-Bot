import { sendGroupMessage, sendUserMessage } from './api';

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
  const content = data.content || '';
  const groupOpenid = data.group_openid;
  const msgId = data.id;
  const author = data.author?.member_openid || 'unknown';

  console.log(`[Group@] ${author}: ${content}`);

  // Example: reply to the @ message
  if (groupOpenid) {
    sendGroupMessage(groupOpenid, '收到！我是 ModernWar 机器人', msgId)
      .then(() => console.log('[Reply] Group message sent'))
      .catch((err) => console.error('[Reply] Failed:', err.message));
  }
}

function onGroupMessage(data: any): void {
  const author = data.author?.member_openid || 'unknown';
  console.log(`[Group] ${author}: ${data.content || ''}`);
}

function onC2CMessage(data: any): void {
  const content = data.content || '';
  const userOpenid = data.author?.user_openid;
  const msgId = data.id;

  console.log(`[C2C] ${userOpenid}: ${content}`);

  if (userOpenid) {
    sendUserMessage(userOpenid, '收到！我是 ModernWar 机器人', msgId)
      .then(() => console.log('[Reply] C2C message sent'))
      .catch((err) => console.error('[Reply] Failed:', err.message));
  }
}
