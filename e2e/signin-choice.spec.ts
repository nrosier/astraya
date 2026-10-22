/**
 * Signing in when single sign-on is configured (#651): the panel opens on a choice between a local account and
 * Authentik, and each choice shows only its own path. The real server runs with OIDC pointed at the repo's fake
 * Authentik, so "Continue to Authentik" really navigates to the issuer's authorization endpoint.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { startFakeAuthentik, type FakeAuthentik } from '../test/fake-authentik.ts';
import { gotoAndSettle } from './support.ts';

let dir: string;
let app: FastifyInstance;
let authentik: FakeAuthentik;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  authentik = await startFakeAuthentik('astraya-e2e');
  process.env.ASTRAYA_OIDC_ISSUER = authentik.baseUrl.replace('127.0.0.1', 'localhost');
  process.env.ASTRAYA_OIDC_CLIENT_ID = 'astraya-e2e';
  process.env.ASTRAYA_PUBLIC_URL = 'http://localhost:3000';
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

test.afterAll(async () => {
  delete process.env.ASTRAYA_OIDC_ISSUER;
  delete process.env.ASTRAYA_OIDC_CLIENT_ID;
  delete process.env.ASTRAYA_PUBLIC_URL;
  await app.close();
  await authentik.close();
  rmSync(dir, { recursive: true, force: true });
});

test('the sign-in dialog shows both options on one screen', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue to Authentik' })).toBeVisible();
  await expect(dialog.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
  await expect(dialog.getByLabel('Username', { exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).include('dialog.signin-card').analyze()).violations).toEqual([]);
});

test('Continue to Authentik goes to the issuer’s authorization endpoint with a PKCE challenge', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const navigation = page.waitForRequest((request) => request.url().includes('/authorize'));
  await page.getByRole('button', { name: 'Continue to Authentik' }).click();
  const url = new URL((await navigation).url());
  expect(url.pathname).toBe('/authorize');
  expect(url.searchParams.get('client_id')).toBe('astraya-e2e');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).not.toBe('');
  expect(url.searchParams.get('scope')).toBe('openid profile');
});

test('the sign-in dialog fits on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1) >= 0).toBe(true);
  expect((box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
});

test('the sign-in dialog is centred in the viewport', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const box = await page.getByRole('dialog').boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('not laid out');
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
});

test('Escape closes the dialog and returns focus to the Sign in pill', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  const pill = page.getByRole('button', { name: 'Sign in', exact: true }).first();
  await pill.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(pill).toBeFocused();
});

test('a backdrop press closes the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Press well outside the card, which is centred, so this lands on the dialog element's backdrop.
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test('the password toggle switches the field between password and text, and its label flips', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  const password = dialog.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  const toggle = dialog.getByRole('button', { name: 'Show password', exact: true });
  await expect(toggle).toHaveAttribute('aria-controls', (await password.getAttribute('id')) ?? '');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(dialog.getByRole('button', { name: 'Hide password', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
});
