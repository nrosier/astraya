/**
 * User-submitted corrections (#1338, slice 2). A signed-in user posts a key, a language, a text and the licence
 * acceptance; the admins read the queue. There is no public route, no approve, no reject and no delete here.
 */

/**
 * @module corpus-submissions-routes
 * @purpose HTTP routes for submitting a correction to an interpretation entry (any signed-in user) and for listing the submissions (admin only).
 * @conventions The body is exactly `{locale, key, text, licenceAccepted, licenceVersion}`: any other field (a person id, a name, birth data) is refused, so nothing but those is ever stored; the key must be a canonical corpus key, the text passes `lintEntry` and `checkPlainText`; the pending cap (409 `pending-limit`) and the 24-hour cap (429 `daily-limit`) are counted per user and refuse before the insert, on top of a per-user per-minute rate limit; errors carry a stable `code`. The submitter id is only in the admin list.
 * @exports registerCorpusSubmissionRoutes
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './db.ts';
import type { User } from './auth/identity.ts';
import { requireAdmin, requireUser } from './auth/identity.ts';
import { LOCALES, type Locale } from './corpus-overrides.ts';
import {
  DAILY_CAP,
  PENDING_CAP,
  countPendingSubmissions,
  countRecentSubmissions,
  insertCorpusSubmission,
  listCorpusSubmissions,
} from './corpus-submissions.ts';
import { checkPlainText, lintEntry } from '../src/interpretation/lint.ts';
import { validateKey, type CorpusEntry } from '../src/interpretation/schema.ts';
import { SUBMISSION_LICENCE_VERSION } from '../src/interpretation/submission-licence.ts';

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(['locale', 'key', 'text', 'licenceAccepted', 'licenceVersion']);
const DAY_MS = 24 * 60 * 60 * 1000;

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function authenticatedUser(request: FastifyRequest): User {
  if (!request.user) throw new Error('requireUser preHandler did not run before this handler.');
  return request.user;
}

export function registerCorpusSubmissionRoutes(app: FastifyInstance, db: Database): void {
  app.post<{ Body: Record<string, unknown> | null }>(
    '/api/corpus-submissions',
    {
      preHandler: requireUser(db),
      // Per user, not per IP: `request.user` only exists after the preHandler, hence `hook: 'preHandler'`.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const refuse = (status: number, code: string, error: string) => reply.code(status).send({ code, error });
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return refuse(400, 'invalid-body', 'A JSON object is required');
      }
      const extra = Object.keys(body).filter((field) => !ALLOWED_FIELDS.has(field));
      if (extra.length > 0) {
        return refuse(
          400,
          'unknown-field',
          `Only locale, key, text and the licence acceptance may be sent; not: ${extra.join(', ')}`,
        );
      }
      const { locale, key, text, licenceAccepted, licenceVersion } = body;
      if (!isLocale(locale)) return refuse(400, 'invalid-locale', `locale must be one of ${LOCALES.join(', ')}`);
      if (typeof key !== 'string' || key === '' || validateKey(key).length > 0) {
        return refuse(400, 'unknown-key', 'key is not a corpus key');
      }
      if (typeof text !== 'string' || text.trim() === '') return refuse(400, 'invalid-text', 'text is required');
      if (licenceAccepted !== true) {
        return refuse(400, 'licence-not-accepted', 'The licence notice must be accepted before submitting');
      }
      if (licenceVersion !== SUBMISSION_LICENCE_VERSION) {
        return refuse(400, 'licence-version', 'The licence notice has changed; reload and accept the current one');
      }
      const plain = checkPlainText(text);
      if (plain !== undefined) {
        return refuse(400, 'invalid-text', plain === 'markup' ? 'HTML is not allowed' : 'Links are not allowed');
      }
      const candidate: CorpusEntry = {
        key,
        locale,
        text,
        tier: 'nuance',
        tags: [],
        provenance: { source: 'hand-written' },
      };
      const issues = lintEntry(candidate);
      if (issues.length > 0) {
        return refuse(
          400,
          'invalid-text',
          `Content-quality check failed: ${issues.map((issue) => issue.message).join('; ')}`,
        );
      }

      // Counted and inserted in one synchronous stretch (node:sqlite is synchronous), so two requests cannot both pass.
      const userId = authenticatedUser(request).id;
      const now = new Date();
      if (countRecentSubmissions(db, userId, new Date(now.getTime() - DAY_MS).toISOString()) >= DAILY_CAP) {
        return refuse(429, 'daily-limit', `You can send at most ${String(DAILY_CAP)} suggestions a day`);
      }
      if (countPendingSubmissions(db, userId) >= PENDING_CAP) {
        return refuse(409, 'pending-limit', `You already have ${String(PENDING_CAP)} suggestions waiting for review`);
      }
      const id = insertCorpusSubmission(db, {
        key,
        locale,
        text,
        submittedBy: userId,
        licenceVersion: SUBMISSION_LICENCE_VERSION,
        now: now.toISOString(),
      });
      return reply.code(201).send({ id, status: 'pending' });
    },
  );

  app.get(
    '/api/corpus-submissions',
    { preHandler: requireAdmin(db), config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (_request, reply) => reply.send({ submissions: listCorpusSubmissions(db) }),
  );
}
