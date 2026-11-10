import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { configureStaticFrontend } from './static-frontend.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // Close the SQLite connection on SIGTERM/SIGINT so `docker stop` is clean.
  app.enableShutdownHooks();

  // Before init: Nest's not-found handler is appended after custom middleware,
  // so the SPA fallback has to claim unknown GETs first.
  configureStaticFrontend(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

await bootstrap();
