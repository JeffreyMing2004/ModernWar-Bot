import dotenv from 'dotenv';
dotenv.config();

export const config = {
  appId: process.env.QQ_BOT_APP_ID || '',
  appSecret: process.env.QQ_BOT_APP_SECRET || '',
  intents: (process.env.INTENTS || 'GROUP_AT_MESSAGE_CREATE').split(','),
  apiBase: 'https://api.bot.qq.com',
  server: {
    port: Number(process.env.HTTP_PORT || 3000),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'modernwar',
  },
};
