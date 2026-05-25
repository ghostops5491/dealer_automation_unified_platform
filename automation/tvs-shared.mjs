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

/** Resolve TVS login credentials — CLI args from CRM take priority over .env fallback. */
export function resolveTvsCredentials(args = {}) {
  const userId = args['user-id'] || TVS_USER_ID;
  const password = args.password || TVS_PASSWORD;
  return { userId, password };
}

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
  await page.getByRole('textbox', { name: 'User ID' }).fill(userId);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('textbox', { name: 'OTP' }).fill(String(otp));
  await page.locator('select[name="branchName"]').selectOption({ label: branchName });
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
  await page.waitForTimeout(2000);
  const moreIcon = page.locator('.datatable-row-right div.more-icon[title="Click for more options"]').first();
  await moreIcon.evaluate((el) => el.click());
  console.log('[step] clicked row more-options icon');
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

/** Remove existing frame, select chassis from VehStock dropdown, then Add Frame. */
function frameLabelsMatch(a, b) {
  const na = String(a).trim().toLowerCase();
  const nb = String(b).trim().toLowerCase();
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function readVehStockOptions(page) {
  const vehStock = page.locator('select[name="VehStock"]');
  await vehStock.waitFor({ state: 'visible', timeout: 15000 });
  const options = await vehStock.locator('option').evaluateAll((els) =>
    els
      .map((el) => ({ value: el.value, text: (el.textContent || '').trim() }))
      .filter((o) => o.value !== '-1' && o.text && !/^select$/i.test(o.text))
  );
  return { vehStock, options };
}

async function selectFrameInVehStock(vehStock, optionLabels, frameNo) {
  const norm = frameNo.toLowerCase();
  let selected = false;

  try {
    await vehStock.selectOption({ label: frameNo });
    selected = true;
  } catch {
    const matchIndex = optionLabels.findIndex((text) => {
      const t = text.trim().toLowerCase();
      return t === norm || t.includes(norm) || norm.includes(t);
    });
    if (matchIndex >= 0) {
      const opt = vehStock.locator('option').nth(matchIndex);
      const value = await opt.getAttribute('value');
      if (value) {
        await vehStock.selectOption(value);
      } else {
        await vehStock.selectOption({ index: matchIndex });
      }
      selected = true;
    }
  }

  if (!selected) {
    throw new Error(
      `Could not select frame "${frameNo}" in VehStock dropdown. ` +
        `Found ${optionLabels.length} option(s): ${optionLabels.slice(0, 8).join(' | ')}`
    );
  }
}

export async function selectChassisIfPresent(page, chassisNo, { singleFrame = false } = {}) {
  if (!chassisNo) return false;

  const frameNo = String(chassisNo).trim();
  const { vehStock, options } = await readVehStockOptions(page);
  const optionLabels = options.map((o) => o.text);

  if (singleFrame && options.length === 1) {
    const onlyFrame = options[0].text;
    if (frameLabelsMatch(onlyFrame, frameNo)) {
      console.log(
        `[step] single-frame stock — VehStock "${onlyFrame}" matches selected chassis; skipping Remove/Add Frame`
      );
      return true;
    }
    console.warn(
      `[step] single-frame soft-check mismatch: selected "${frameNo}", VehStock has "${onlyFrame}" — running full frame flow`
    );
  }

  await page.locator('button.completeJob').filter({ hasText: 'Remove Frame' }).click();
  console.log('[step] clicked Remove Frame');
  await page.waitForTimeout(500);

  const { vehStock: vehStockAfter, options: optionsAfter } = await readVehStockOptions(page);
  await selectFrameInVehStock(vehStockAfter, optionsAfter.map((o) => o.text), frameNo);
  console.log(`[step] selected frame in VehStock: ${frameNo}`);

  await page.locator('button.createJCBtn[type="submit"]').filter({ hasText: 'Add Frame' }).click();
  console.log('[step] clicked Add Frame');

  await page.waitForTimeout(500);
  await page.locator('button.refereshJCBtn[type="button"]').filter({ hasText: 'Referesh' }).click();
  console.log('[step] clicked Referesh');

  return true;
}

export async function saveErrorScreenshot(page, prefix) {
  const shotPath = path.join(__dirname, `${prefix}-error-${Date.now()}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  console.error('[ERROR] screenshot saved:', shotPath);
}
