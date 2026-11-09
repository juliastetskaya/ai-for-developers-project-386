import type { INestApplication } from '@nestjs/common';

/** Shared application configuration for `main.ts` and the e2e tests. */
export function configureApp(app: INestApplication): void {
  app.enableCors();
}
