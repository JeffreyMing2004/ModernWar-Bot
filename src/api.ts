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
