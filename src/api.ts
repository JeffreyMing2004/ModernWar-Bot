import { getAccessToken } from './token';
import { config } from './config';

export interface SendMessageOptions {
  msg_type: number;       // 0=text, 2=markdown, 7=rich media
  content?: string;       // text content (msg_type=0)
  markdown?: object;      // markdown content (msg_type=2)
  msg_id?: string;        // reply to this message
  msg_seq?: number;       // sequence number for dedup
}

/**
 * Send a text message to a group
 */
export async function sendGroupMessage(
  groupOpenid: string,
  content: string,
  msgId?: string
): Promise<any> {
  const token = await getAccessToken();
  const body: SendMessageOptions = {
    msg_type: 0,
    content,
  };
  if (msgId) body.msg_id = msgId;

  const res = await fetch(
    `${config.apiBase}/v2/groups/${groupOpenid}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `QQBot ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error(`[API] Send group message failed:`, data);
  }
  return data;
}

export interface GroupMemberInfo {
  user_id?: string;
  user_openid?: string;
  member_openid?: string;
  joined_at?: string;
}

/**
 * Resolve real QQ number from a group member openid.
 * Requires the bot to be in the group.
 */
export async function getGroupMember(
  groupOpenid: string,
  memberOpenid: string
): Promise<GroupMemberInfo | null> {
  const token = await getAccessToken();
  const res = await fetch(
    `${config.apiBase}/v2/groups/${groupOpenid}/members/${memberOpenid}`,
    {
      method: 'GET',
      headers: {
        Authorization: `QQBot ${token}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) {
    console.warn(`[API] Get group member failed:`, data);
    return null;
  }
  return data as GroupMemberInfo;
}

/**
 * Send a text message to a user (single chat)
 */
export async function sendUserMessage(
  userOpenid: string,
  content: string,
  msgId?: string
): Promise<any> {
  const token = await getAccessToken();
  const body: SendMessageOptions = {
    msg_type: 0,
    content,
  };
  if (msgId) body.msg_id = msgId;

  const res = await fetch(
    `${config.apiBase}/v2/users/${userOpenid}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `QQBot ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error(`[API] Send user message failed:`, data);
  }
  return data;
}
