/**
 * The licence notice a reader accepts before submitting a correction to the admins (#1338, D7). One constant shared by
 * the client (which shows the notice and sends the version) and the server (which refuses any other version), so the
 * two cannot drift. No imports: the server loads this file as plain TypeScript.
 */
/**
 * @module interpretation/submission-licence
 * @purpose Names the current version of the licence notice a submitter accepts when sending corrected interpretation text to the admins.
 * @conventions Bump the version string whenever the notice wording or the licence changes; the server stores the version it was sent with each submission. No imports, so server and client can both load it.
 * @exports SUBMISSION_LICENCE_VERSION
 */
export const SUBMISSION_LICENCE_VERSION = 'agpl-3.0-2026-11';
