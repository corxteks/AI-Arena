import { config, assertConfig } from './config.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

assertConfig();
await migrate();
const server = createApp().listen(config.port, () => {
  console.log(`AI ARENA server berjalan di http://localhost:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
