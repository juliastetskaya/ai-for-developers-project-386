import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('StaticFrontend');

/**
 * Default location of the built SPA: `<repo>/apps/frontend/dist`, resolved from
 * `apps/backend/dist/static-frontend.js` so the production layout works without
 * extra configuration. Override with FRONTEND_DIST when the build lives elsewhere.
 */
export const DEFAULT_FRONTEND_DIST = fileURLToPath(
  new URL('../../frontend/dist/', import.meta.url),
);

/** API roots owned by controllers: they must never fall back to the SPA shell. */
const API_PREFIXES = ['/health', '/meeting-types', '/availability', '/bookings'];

function isApiPath(path: string): boolean {
  return API_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Serves the built SPA from the same origin as the API (single-container
 * production setup). Must be registered before `app.init()`: Nest appends its
 * own not-found handler during init, and that handler answers unknown routes
 * with a JSON 404 before any middleware registered later. API roots are
 * excluded explicitly, so controller routes keep winning.
 *
 * Returns `false` when no build is present, which keeps the API usable on its
 * own (unit/e2e tests, API-only deployments).
 */
export function configureStaticFrontend(
  app: NestExpressApplication,
  frontendDist = process.env.FRONTEND_DIST ?? DEFAULT_FRONTEND_DIST,
): boolean {
  const indexHtml = join(frontendDist, 'index.html');

  if (!existsSync(indexHtml)) {
    logger.warn(`No SPA build at ${frontendDist}, serving the API only`);
    return false;
  }

  app.useStaticAssets(frontendDist, { index: false, redirect: false });

  app.use((request: Request, response: Response, next: NextFunction) => {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const isAsset = request.path.startsWith('/assets/');

    if (!isRead || isAsset || isApiPath(request.path)) {
      next();
      return;
    }

    response.sendFile(indexHtml);
  });

  logger.log(`Serving the SPA from ${frontendDist}`);
  return true;
}
