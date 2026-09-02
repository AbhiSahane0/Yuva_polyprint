import { Router, type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi.js';

/**
 * The API, browsable and testable, at `/docs`.
 *
 * Served by this app rather than a documentation service, for three reasons: it
 * costs nothing on top of the deploy that already exists, it cannot fall out of
 * step with the code because it is generated from it, and **Try it out** talks
 * to the real server without anybody configuring a base URL.
 *
 * Reading is open. Running a request is not — every endpoint but login answers
 * 401 without a session, which is what makes a public URL safe here: a stranger
 * can learn the whole shape of the API and change nothing.
 *
 * The spec is served alongside at `/docs/openapi.json`, so a developer can
 * generate a client from it rather than transcribing it by hand.
 */
const router = Router();

/**
 * The server the page sends requests to.
 *
 * Taken from the request rather than configured, so the page works unchanged on
 * localhost, on a preview deploy and in production. A configured base URL is one
 * more thing to be wrong on exactly the day somebody needs the docs — and behind
 * Render's proxy the scheme only survives in the forwarded header, so http would
 * be guessed where https is served.
 */
function originOf(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const protocol = (header ?? req.protocol).split(',')[0]?.trim() || 'http';
  return `${protocol}://${req.get('host') ?? 'localhost'}`;
}

/** The raw document, for generating a client or importing into Postman. */
router.get('/openapi.json', (req, res) => {
  res.json(buildOpenApiDocument(originOf(req)));
});

const UI_OPTIONS: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'Yuva Polyprint API',
  swaggerOptions: {
    // Sorted, because a reader looks things up rather than reading in order.
    operationsSorter: 'alpha',
    tagsSorter: 'alpha',
    // Collapsed to the tag list: thirty-seven endpoints expanded is a wall.
    docExpansion: 'list',
    // Survives a reload, so a developer authorises once per session and not
    // once per question they have.
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
};

/*
 * Built per request rather than once at boot, because the server URL comes from
 * the request. `serve` is static asset middleware and is shared; only `setup`
 * needs the document.
 */
router.use('/', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
  swaggerUi.setup(buildOpenApiDocument(originOf(req)), UI_OPTIONS)(req, res, next);
});

export default router;
