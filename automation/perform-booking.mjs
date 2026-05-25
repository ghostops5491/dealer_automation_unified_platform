/**
 * Perform Booking - Playwright Automation for TVS DMS
 *
 * Triggered by the "Perform Booking" button on Screen 3 (Vehicle Details).
 * job_runner.py invokes this script via Node with CLI args.
 *
 * CLI args:
 *   --enquiry      <enquiryNo>        passed by the system
 *   --amount       <bookingAmount>    user-entered in CRM
 *   --otp          <4-digit OTP>      user-entered in CRM (TVS OTP textbox)
 *   --submodel     <submodel label>   selected SubModel on Screen 3 (FormatVehicleModel DESCRIPTION)
 *   --vehicle      <variant name>     selected variant on Screen 3 cascading dropdown
 *   --dealer-code  <dealer id>        from DB (Branch.dealerId)
 *   --role-id      <numeric roleId>   TVS login dropdown value (default "3" = Admin)
 *   --branch       <branch name>      from DB (Branch.name)
 *   --payment-mode <numeric value>    from BranchField PAYMENT_MODE_ID (default "1")
 *   --headless     <true|false>       default true
 *
 * .env (this folder):
 *   TVS_URL        default https://www.advantagetvs.in/LiteApp/session/signin
 *   TVS_USER_ID
 *   TVS_PASSWORD
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) {
      acc.push([val.slice(2), arr[i + 1]]);
    }
    return acc;
  }, [])
);

const TVS_URL = process.env.TVS_URL || 'https://www.advantagetvs.in/LiteApp/session/signin';
const TVS_USER_ID = process.env.TVS_USER_ID;
const TVS_PASSWORD = process.env.TVS_PASSWORD;

const enquiryNo   = args.enquiry;
const amount      = args.amount;
const otp         = args.otp;
const vehicle     = args.vehicle;
const submodel    = args.submodel;
const dealerCode  = args['dealer-code'];
const roleId      = args['role-id'] || '3';
const branchName  = args.branch;
const paymentMode = args['payment-mode'] || '1';
const headless    = args.headless !== 'false';

/** TVS paymentMode <select> uses "id: label" option values; CRM PAYMENT_MODE_ID is numeric only. */
function tvsPaymentModeOption(mode) {
  const id = String(mode).trim();
  if (id === '1') return '1: 1'; // Cash
  return id;
}

/** Select an option in div.inlineBody select by index (0 = SubModel, 1 = Variant). */
async function selectInlineBodyDropdown(page, selectIndex, labelText, fieldName) {
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
      `Could not select ${fieldName} "${labelText}" in booking dropdown (select index ${selectIndex}). ` +
        `Found ${optionLabels.length} option(s): ${optionLabels.slice(0, 8).join(' | ')}`
    );
  }
  console.log(`[step] selected ${fieldName}: ${labelText}`);
}

const missing = [];
if (!enquiryNo)    missing.push('--enquiry');
if (!amount)       missing.push('--amount');
if (!otp)          missing.push('--otp');
if (!vehicle)      missing.push('--vehicle');
if (!submodel)     missing.push('--submodel');
if (!dealerCode)   missing.push('--dealer-code');
if (!branchName)   missing.push('--branch');
if (!TVS_USER_ID)  missing.push('TVS_USER_ID (.env)');
if (!TVS_PASSWORD) missing.push('TVS_PASSWORD (.env)');
if (missing.length) {
  console.error('[ERROR] Missing required values:', missing.join(', '));
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Perform Booking - Playwright Automation');
console.log(`  enquiry      : ${enquiryNo}`);
console.log(`  submodel     : ${submodel}`);
console.log(`  vehicle      : ${vehicle}`);
console.log(`  amount       : ${amount}`);
console.log(`  payment mode : ${paymentMode}`);
console.log(`  dealer code  : ${dealerCode}`);
console.log(`  role id      : ${roleId}`);
console.log(`  branch       : ${branchName}`);
console.log(`  headless     : ${headless}`);
console.log('='.repeat(60));

const CAPTURE_DIR = path.join(__dirname, 'captured');
const CAPTURE_FILE = path.join(CAPTURE_DIR, 'format-vehicle-model-latest.json');
const CRM_BACKEND_URL = process.env.CRM_BACKEND_URL || 'http://localhost:3001';
const AUTOMATION_SYNC_KEY = process.env.AUTOMATION_SYNC_KEY || 'crm-automation-sync';

/** Intercept TVS FormatVehicleModel POST and overwrite the latest template payload. */
function setupFormatVehicleCapture(page, enquiry) {
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('FormatVehicleModel')) return;

    let payload;
    try {
      payload = request.postDataJSON();
    } catch {
      try {
        payload = JSON.parse(request.postData() || '{}');
      } catch {
        return;
      }
    }

    const record = {
      capturedAt: new Date().toISOString(),
      enquiryNo: enquiry,
      url: request.url(),
      payload,
    };

    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    fs.writeFileSync(CAPTURE_FILE, JSON.stringify(record, null, 2));
    console.log('[capture] FormatVehicleModel payload saved locally');

    fetch(`${CRM_BACKEND_URL}/api/external/format-vehicle-template/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Automation-Sync-Key': AUTOMATION_SYNC_KEY,
      },
      body: JSON.stringify(record),
    })
      .then((r) => r.json())
      .then((j) => console.log('[capture] backend sync:', j.success ? 'ok' : j.error || 'failed'))
      .catch((e) => console.warn('[capture] backend sync failed:', e.message));
  });
}

const browser = await chromium.launch({ headless });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);
setupFormatVehicleCapture(page, enquiryNo);

try {
  await page.goto(TVS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('[step] TVS sign-in page opened');

  await page.getByRole('textbox', { name: 'Dealer ID' }).fill(String(dealerCode));  
  await page.locator('select[name="branchName"]').click();
  await page.locator('select[name="branchName"]').selectOption({ label: branchName });
  await page.getByRole('textbox', { name: 'User ID' }).fill(TVS_USER_ID);
  await page.getByRole('textbox', { name: 'Password' }).fill(TVS_PASSWORD);
  await page.getByRole('textbox', { name: 'OTP' }).fill(String(otp));

  await page.locator('select[name="roleId"]').selectOption('3');
  await page.getByRole('button', { name: 'login' }).evaluate((el) => el.click());
  console.log('[step] login submitted');

  // Wait until TVS redirects away from the sign-in page (session established)
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

  await page.evaluate(() => {
    document.querySelector('button.cancelBtn')?.click();
  });
  console.log('[step] attempted optional Cancel click');

 await page.locator('.hpx-45 > a > img').click();
  await page.locator('a').filter({ hasText: 'Sales' }).click();
  await page.locator('div').filter({ hasText: /^Enquiry$/ }).click();

  await page.locator('.date-btn > button').click();
  await page.getByRole('menuitem', { name: 'This Month' }).click();

  await page.locator('input[name="searchText"]').fill(String(enquiryNo));
  await page.getByRole('button', { name: 'Search' }).click();
  
  await page.waitForTimeout(3000);
  
  await page.locator('.datatable-row-right > .datatable-body-cell').click();
  await page.getByRole('menuitem', { name: 'Modify' }).click();
  console.log('[step] opened Modify menu on enquiry row');
  // await page.locator('.magic-radio').first().waitFor({ state: 'visible', timeout: 30000 });
  console.log(`[step] navigated directly to enquiry modify: enquiryId=${enquiryNo}`);

  await page.locator('button.completeJob').filter({ hasText: 'Create Booking' }).click();
  console.log('[step] clicked Create Booking');

  const rowCheckbox = page.locator('#ROW_SELECT0');
  await rowCheckbox.evaluate((el) => el.click());
  console.log('[step] selected Vehicle row checkbox (ROW_SELECT0)');

  // First div.inlineBody select = SubModel; second = Variant (Screen 3 selections)
  await selectInlineBodyDropdown(page, 0, submodel, 'submodel');
  await page.waitForTimeout(500);
  await selectInlineBodyDropdown(page, 1, vehicle, 'variant');

  // await page.getByRole('button', { name: 'Create Booking' }).click();
  // await page.locator('label').filter({ hasText: 'Select' }).click();

  // uncomment this later // await page.getByRole('spinbutton').fill(String(amount));
  // uncomment this later // console.log(`[step] booking amount: ${amount}`);

  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  
  const paymentModeOption = tvsPaymentModeOption(paymentMode);
  await page.locator('select[name="paymentMode"]').selectOption(paymentModeOption);
  console.log(`[step] payment mode: ${paymentMode} → ${paymentModeOption}`);

  await page.getByRole('button', { name: 'Save' }).click();

  page.once('dialog', (dialog) => {
    console.log(`[dialog] ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });
  // await page.getByRole('button', { name: 'Save' }).click();
  // await page.locator('label').filter({ hasText: 'Select' }).click();
  console.log('[step] booking saved');

  console.log('[SUCCESS] Booking automation completed');
  process.exit(0);
} catch (err) {
  console.error('[ERROR]', err.message || err);
  try {
    const shotPath = path.join(__dirname, `booking-error-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.error('[ERROR] screenshot saved:', shotPath);
  } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
