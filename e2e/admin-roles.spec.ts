/**
 * Two administrator levels (#431), as a person sees them: a super admin gets the controls that
 * create, change and remove accounts; an admin sees the same list read-only, and still reaches the
 * other admin screens. The server enforces the same split on every route (`test/server-admin.test.ts`);
 * this checks that the screens show only what the signed-in role may do.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { build } from '../server/index.ts';
import { gotoAndSettle, signIn } from './support.ts';

const BOOTSTRAP_TOKEN = 'e2e-admin-roles-bootstrap-token';
const PASSWORD = 'correct-horse-battery-e2e';
const SESSION_COOKIE = 'astraya_session';

let dir: string;
let app: FastifyInstance;
let baseUrl: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'astraya-e2e-'));
  process.env.LOG_LEVEL = 'silent';
  process.env.ASTRAYA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
  app = await build({ dbPath: join(dir, 'astraya.db') });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind to a port');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;

  // The first account is a super admin; she creates an admin and an ordinary member through the API.
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { token: BOOTSTRAP_TOKEN, username: 'owner', password: PASSWORD },
  });
  const cookie = setup.cookies.find((c) => c.name === SESSION_COOKIE)?.value;
  if (cookie === undefined) throw new Error('setup did not set a session cookie');
  for (const [username, role] of [
    ['helper', 'admin'],
    ['member', 'user'],
  ] as const) {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      cookies: { [SESSION_COOKIE]: cookie },
      payload: { username, role },
    });
    const url = created.json<{ setPasswordUrl: string }>().setPasswordUrl;
    const token = new URLSearchParams(url.split('?')[1] ?? '').get('token');
    await app.inject({ method: 'POST', url: '/api/auth/set-password', payload: { token, password: PASSWORD } });
  }
});

test.afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

async function openUsers(page: Page, username: string): Promise<void> {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, username, PASSWORD);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users', level: 2 })).toBeVisible();
}

test('a super admin can create, change the role of, and remove accounts', async ({ page }) => {
  await openUsers(page, 'owner');

  await expect(page.getByRole('heading', { name: 'Create a user', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create user', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset password' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true }).first()).toBeVisible();

  // A role control per account, but not for the signed-in account itself: nobody changes their own role.
  await expect(page.getByLabel('Role of helper')).toHaveValue('admin');
  await expect(page.getByLabel('Role of member')).toHaveValue('user');
  await expect(page.getByLabel('Role of owner')).toBeDisabled();

  await page.getByLabel('Role of member').selectOption('admin');
  await expect(page.getByLabel('Role of member')).toHaveValue('admin');
  await page.getByLabel('Role of member').selectOption('user');
  await expect(page.getByLabel('Role of member')).toHaveValue('user');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('an admin sees the accounts read-only, and still reaches the other admin screens', async ({ page }) => {
  await openUsers(page, 'helper');

  await expect(page.getByText(/Creating, changing and removing accounts is for super admins/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Super admin', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Admin', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Member', exact: true })).toBeVisible();

  // None of the account controls exist for an admin.
  await expect(page.getByRole('heading', { name: 'Create a user' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create user' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /^Role of/ })).toHaveCount(0);

  // The corpus screens are not account management.
  await page.getByRole('link', { name: 'Corpus overrides', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Corpus corrections' })).toBeVisible();

  await page.getByRole('link', { name: 'Users', exact: true }).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('an ordinary member has no Admin menu', async ({ page }) => {
  await gotoAndSettle(page, `${baseUrl}/#/people`);
  await signIn(page, 'member', PASSWORD);
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
});
