import { getAccessToken } from './token';
import { startGateway } from './gateway';
import { config } from './config';
import { initDb } from './db';
import { createApp } from './routes';

async function main(): Promise<void> {
  console.log('=================================');
  console.log('  ModernWar QQ Bot');
  console.log('=================================');

  if (!config.appId || !config.appSecret) {
    console.error(
      '\n[ERROR] Missing credentials. Please configure .env file:\n' +
        '  cp .env.example .env\n' +
        '  Then fill in QQ_BOT_APP_ID and QQ_BOT_APP_SECRET\n'
    );
    process.exit(1);
  }

  console.log(`[Config] AppID: ${config.appId}`);
  console.log(`[Config] Intents: ${config.intents.join(', ')}`);

  try {
    // Initialize database schema
    await initDb();
    console.log('[DB] Connected and schema ready');

    // Start HTTP server (plugin APIs)
    const app = createApp();
    app.listen(config.server.port, () => {
      console.log(`[HTTP] Plugin API listening on port ${config.server.port}`);
    });

    // Start QQ WebSocket gateway
    await getAccessToken();
    startGateway();
    console.log('[Bot] Started. Listening for events...');
  } catch (err: any) {
    console.error('[ERROR] Failed to start bot:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n[Bot] Shutting down...');
  process.exit(0);
});

main();