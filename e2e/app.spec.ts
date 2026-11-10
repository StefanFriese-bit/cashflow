import { expect, test, type Page } from '@playwright/test';
import { fixture } from '../tests/fixture';

async function open(page: Page, when: string, hash = '#/today', extra: Record<string, string> = {}) {
  await page.clock.setFixedTime(new Date(when));
  const data = JSON.stringify(fixture());
  await page.addInitScript(
    ([d, x]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('cashflow-state-v1', d);
        localStorage.setItem('cashflow-me', 'a');
        for (const [k, v] of Object.entries(JSON.parse(x))) localStorage.setItem(k, v as string);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [data, JSON.stringify(extra)] as const,
  );
  await page.goto(hash);
  if (hash !== '#/today') {
    // the due-soon pop-up shows on any page when the app opens; close it like a person would
    await page.locator('main h1').first().waitFor();
    await page.waitForTimeout(300);
    const pop = page.getByRole('alertdialog', { name: 'Payments due soon' });
    if (await pop.isVisible().catch(() => false)) await pop.getByRole('button', { name: 'OK' }).click();
  }
}

async function noSideScroll(page: Page) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(w + 1);
}

test('today: balances, the due-soon pop-up, ticking a payment off', async ({ page }) => {
  await open(page, '2026-11-30T09:00:00Z');
  await expect(page.getByRole('heading', { name: /Good morning, Alex/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bank One: £/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bank Two: £/ })).toBeVisible();
  const pop = page.getByRole('alertdialog', { name: 'Payments due soon' });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Rent');
  await pop.getByRole('button', { name: 'Paid' }).first().click();
  await expect(page.getByRole('button', { name: /Rent: paid/ }).first()).toBeVisible();
  // nothing left due: the pop-up goes away by itself
  await expect(pop).toBeHidden();
  // the pop-up does not come back the same day for the same payments
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await noSideScroll(page);
});

test('payments: check a guessed day, then change a payment’s date for every month', async ({ page }) => {
  await open(page, '2026-11-10T09:00:00Z', '#/payments');
  await page.getByRole('tab', { name: /Day not confirmed/ }).click();
  const rentRow = page.locator('[data-item="rent"]');
  await expect(rentRow).toContainText('1st of every month');
  await rentRow.getByRole('button', { name: 'Rent', exact: false }).first().click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Day not confirmed');
  await dlg.getByRole('group', { name: 'Days of the month' }).getByRole('button', { name: '1', exact: true }).click();
  await dlg.getByRole('group', { name: 'Days of the month' }).getByRole('button', { name: '3', exact: true }).click();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(page.locator('[data-item="rent"]')).toContainText('3rd of every month');
  await expect(page.locator('[data-item="rent"]')).toContainText('Next: Thu 3 Dec');
  await expect(page.locator('[data-item="rent"]')).not.toContainText('Day not confirmed');
  await noSideScroll(page);
});

test('one payment: move it and skip it, the week shows it', async ({ page }) => {
  await open(page, '2026-11-10T09:00:00Z', '#/weeks');
  if (await page.getByRole('tab', { name: 'List' }).getAttribute('aria-selected') !== 'true') await page.getByRole('tab', { name: 'List' }).click();
  await page.locator('[data-occ="ctax|2026-12-01"]').getByRole('button').first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Move this one to another date' }).click();
  await dlg.locator('input[type=date]').fill('2026-12-04');
  await dlg.getByRole('button', { name: 'Move' }).click();
  await expect(dlg).toContainText('planned 1 Dec');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-occ="ctax|2026-12-01"]')).toContainText('moved');
  await noSideScroll(page);
});

test('the sheet view lists payments by week with the end-of-week balance', async ({ page, isMobile }) => {
  await open(page, '2026-11-10T09:00:00Z', '#/weeks');
  await page.getByRole('tab', { name: 'Sheet' }).click();
  const grid = page.locator('table.grid');
  await expect(grid).toContainText('Bank One — end of week');
  await expect(grid).toContainText('Rent');
  await expect(grid.locator('thead th').nth(1)).toHaveText('9–15 Nov');
  if (!isMobile) await noSideScroll(page);
});

test('us, loans and settings open without problems', async ({ page }) => {
  await open(page, '2026-11-10T09:00:00Z', '#/us');
  await expect(page.getByRole('heading', { name: 'Alex & Sam' })).toBeVisible();
  await noSideScroll(page);
  await page.goto('#/loans');
  await expect(page.getByRole('region', { name: 'Loan Family' })).toContainText('R4,000 left');
  await expect(page.getByRole('region', { name: 'Loan Family' })).toContainText('planned to be clear on');
  await noSideScroll(page);
  await page.goto('#/settings');
  await expect(page.getByText('Not connected — only on this device')).toBeVisible();
  await noSideScroll(page);
});

test('sync: connecting loads the shared plan, a change is saved back', async ({ page }) => {
  const files = new Map<string, { text: string; sha: string }>();
  const shared = fixture(9);
  shared.items.rent.amount = 1999; // as saved by the other phone
  files.set('data.json', { text: JSON.stringify(shared), sha: 's1' });
  let puts = 0;
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/?(contents\/)?/, '');
    if (req.method() === 'GET') {
      if (path === '') return route.fulfill({ json: { private: true } });
      const f = files.get(path);
      return f ? route.fulfill({ json: { content: Buffer.from(f.text).toString('base64'), sha: f.sha } }) : route.fulfill({ status: 404, json: {} });
    }
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      if (body.sha !== files.get(path)?.sha) return route.fulfill({ status: 409, json: {} });
      puts++;
      files.set(path, { text: Buffer.from(body.content, 'base64').toString(), sha: `s${puts + 1}` });
      return route.fulfill({ json: { content: { sha: `s${puts + 1}` } } });
    }
    return route.fulfill({ status: 405, json: {} });
  });
  await open(page, '2026-11-10T09:00:00Z', '#/settings');
  await page.getByLabel('Access key').fill('github_pat_test');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Saved — in step with every device')).toBeVisible();
  await page.goto('#/payments');
  await expect(page.locator('[data-item="rent"]')).toContainText('£1,999');
  await page.locator('[data-item="rent"]').getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  // a change on this device reaches the store
  await page.goto('#/weeks');
  if (await page.getByRole('tab', { name: 'List' }).getAttribute('aria-selected') !== 'true') await page.getByRole('tab', { name: 'List' }).click();
  await page.getByRole('button', { name: 'Mark Card in rand as paid' }).first().click();
  await expect.poll(() => puts, { timeout: 8000 }).toBeGreaterThan(0);
  const saved = JSON.parse(files.get('data.json')!.text);
  expect(saved.overrides['sa|2026-11-11'].paid.by).toBe('a');
  expect(saved.repayments['rep-sa|2026-11-11'].amount).toBe(2000);
});
