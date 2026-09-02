import dotenv from 'dotenv';
dotenv.config();

export const config = {
  appId: process.env.QQ_BOT_APP_ID || '',
  appSecret: process.env.QQ_BOT_APP_SECRET || '',
  intents: (process.env.INTENTS || 'GROUP_AT_MESSAGE_CREATE').split(','),
  apiBase: 'https://api.bot.qq.com',
};
