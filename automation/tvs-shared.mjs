/**
 * Shared TVS DMS Playwright helpers for perform-booking.mjs and perform-allotment.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

export const TVS_URL = process.env.TVS_URL || 'https://www.advantagetvs.in/LiteApp/session/signin';
export const TVS_USER_ID = process.env.TVS_USER_ID;
export const TVS_PASSWORD = process.env.TVS_PASSWORD;

/** Parse `--key value` pairs from process.argv. */
export function parseCliArgs(argv = process.argv) {
  return Object.fromEntries(
    argv.slice(2).reduce((acc, val, i, arr) => {
      if (val.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) {
        acc.push([val.slice(2), arr[i + 1]]);
      }
      return acc;
    }, [])
  );
}

/** TVS paymentMode <select> uses "id: label" option values; CRM PAYMENT_MODE_ID is numeric only. */
export function tvsPaymentModeOption(mode) {
  const id = String(mode).trim();
  if (id === '1') return '1: 1'; // Cash
  return id;
}

export async function tvsLogin(page, { dealerCode, branchName, userId, password, otp, roleId = '3' }) {
  await page.getByRole('textbox', { name: 'Dealer ID' }).fill(String(dealerCode));
  await page.locator('select[name="branchName"]').selectOption({ label: branchName });
  await page.getByRole('textbox', { name: 'User ID' }).fill(userId);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('textbox', { name: 'OTP' }).fill(String(otp));
  await page.locator('select[name="roleId"]').selectOption(String(roleId));
  await page.getByRole('button', { name: 'login' }).evaluate((el) => el.click());
  console.log('[step] login submitted');

  try {
    await page.waitForURL(
      (url) => !url.pathname.includes('/session/signin'),
      { timeout: 60000, waitUntil: 'domcontentloaded' }
    );
  } catch {
    throw new Error(
      'Login did not complete within 60s — still on sign-in page. Check OTP, branch/role, and credentials.'
    );
  }
  console.log('[step] login successful:', page.url());
}

export async function tvsDismissCancel(page) {
  await page.evaluate(() => {
    document.querySelector('button.cancelBtn')?.click();
  });
  console.log('[step] attempted optional Cancel click');
}

export async function tvsOpenSalesHome(page) {
  await page.locator('.hpx-45 > a > img').click();
  await page.locator('a').filter({ hasText: 'Sales' }).click();
  console.log('[step] opened Sales module');
}

export async function tvsSelectThisMonth(page) {
  await page.locator('.date-btn > button').click();
  await page.getByRole('menuitem', { name: 'This Month' }).click();
  console.log('[step] selected date range: This Month');
}

export async function tvsSearchAndModify(page, searchText, { submitWithEnter = false } = {}) {
  await page.locator('input[name="searchText"]').fill(String(searchText));
  if (submitWithEnter) {
    await page.locator('input[name="searchText"]').press('Enter');
  } else {
    await page.getByRole('button', { name: 'Search' }).click();
  }
  await page.waitForTimeout(3000);
  await page.locator('.datatable-row-right > .datatable-body-cell').click();
  await page.getByRole('menuitem', { name: 'Modify' }).click();
  console.log(`[step] opened Modify for: ${searchText}`);
}

/** Select an option in div.inlineBody select by index (0 = SubModel, 1 = Variant, etc.). */
export async function selectInlineBodyDropdown(page, selectIndex, labelText, fieldName) {
  const select = page.locator('div.inlineBody select').nth(selectIndex);
  await select.waitFor({ state: 'visible', timeout: 30000 });

  const optionLabels = await select.locator('option').allTextContents();
  const norm = String(labelText).trim().toLowerCase();
  let selected = false;

  try {
    await select.selectOption({ label: labelText });
    selected = true;
  } catch {
    const matchIndex = optionLabels.findIndex((text) => {
      const t = text.trim().toLowerCase();
      return t === norm || t.includes(norm) || norm.includes(t);
    });
    if (matchIndex >= 0) {
      const opt = select.locator('option').nth(matchIndex);
      const value = await opt.getAttribute('value');
      if (value) {
        await select.selectOption(value);
      } else {
        await select.selectOption({ index: matchIndex });
      }
      selected = true;
    }
  }

  if (!selected) {
    throw new Error(
      `Could not select ${fieldName} "${labelText}" in dropdown (select index ${selectIndex}). ` +
        `Found ${optionLabels.length} option(s): ${optionLabels.slice(0, 8).join(' | ')}`
    );
  }
  console.log(`[step] selected ${fieldName}: ${labelText}`);
}

/** Try to pick chassis/frame in any inlineBody select or named input. */
export async function selectChassisIfPresent(page, chassisNo) {
  if (!chassisNo) return false;

  const norm = String(chassisNo).trim().toLowerCase();
  const selects = page.locator('div.inlineBody select');
  const count = await selects.count();

  for (let i = 0; i < count; i++) {
    const optionLabels = await selects.nth(i).locator('option').allTextContents();
    const matchIndex = optionLabels.findIndex((text) => text.trim().toLowerCase().includes(norm));
    if (matchIndex >= 0) {
      await selectInlineBodyDropdown(page, i, optionLabels[matchIndex].trim(), 'chassis');
      return true;
    }
  }

  const frameInput = page.locator('input[name*="frame" i], input[name*="chassis" i]').first();
  if (await frameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await frameInput.fill(String(chassisNo));
    console.log(`[step] filled chassis input: ${chassisNo}`);
    return true;
  }

  console.log(`[step] chassis "${chassisNo}" not found in visible selects/inputs — continue manually if needed`);
  return false;
}

export async function saveErrorScreenshot(page, prefix) {
  const shotPath = path.join(__dirname, `${prefix}-error-${Date.now()}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  console.error('[ERROR] screenshot saved:', shotPath);
}
