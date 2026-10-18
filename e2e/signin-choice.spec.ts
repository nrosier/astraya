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

test('the panel opens on a choice, and each path shows only its own controls', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const dialog = page.getByRole('dialog');
  const choices = dialog.getByRole('radiogroup', { name: 'How do you want to sign in?' });
  await expect(choices).toBeVisible();
  await expect(choices.getByRole('radio', { name: /Local account/ })).toBeVisible();
  await expect(choices.getByRole('radio', { name: /Authentik/ })).toBeVisible();
  // Before choosing there are no credentials to type and no redirect to start.
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Continue to Authentik' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('.accountpanel-popover').analyze()).violations).toEqual([]);

  await choices.getByRole('radio', { name: /Local account/ }).click();
  await expect(dialog.getByLabel('Username', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue to Authentik' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('.accountpanel-popover').analyze()).violations).toEqual([]);

  await dialog.getByRole('button', { name: /Choose another way/ }).click();
  await expect(choices).toBeVisible();
  await choices.getByRole('radio', { name: /Authentik/ }).click();
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/never sees your Authentik password/)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.accountpanel-popover').analyze()).violations).toEqual([]);
});

test('Continue to Authentik goes to the issuer’s authorization endpoint with a PKCE challenge', async ({ page }) => {
  test.setTimeout(60_000);
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('radio', { name: /Authentik/ }).click();
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

test('the panel fits on a phone with the choice showing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const box = await page.locator('.accountpanel-popover').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1) >= 0).toBe(true);
  expect((box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
});
