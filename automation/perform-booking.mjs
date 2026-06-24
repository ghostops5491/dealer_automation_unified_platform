/**
 * Perform Booking - Playwright Automation for TVS DMS
 *
 * Triggered by the "Perform Booking" button on Screen 3 (Vehicle Details).
 * job_runner.py invokes this script via Node with CLI args.
 *
 * CLI args:
 *   --enquiry      <enquiryNo>
 *   --amount       <bookingAmount>
 *   --otp          <4-digit OTP>
 *   --submodel     <submodel label>
 *   --vehicle      <variant name>
 *   --dealer-code  <dealer id>
 *   --role-id      <numeric roleId>   default "3"
 *   --branch       <branch name>
 *   --payment-mode <numeric value>    default "1"
 *   --user-id      <TVS user id>      from CRM branch config (fallback: .env TVS_USER_ID)
 *   --password     <TVS password>     from CRM branch config (fallback: .env TVS_PASSWORD)
 *   --headless     <true|false>       default true
 *
 * .env fallback: TVS_USER_ID, TVS_PASSWORD, optional TVS_URL, CRM_BACKEND_URL, AUTOMATION_SYNC_KEY
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  TVS_URL,
  parseCliArgs,
  resolveTvsCredentials,
  tvsPaymentModeOption,
  tvsLogin,
  tvsDismissCancel,
  tvsOpenSalesHome,
  tvsSelectThisMonth,
  tvsSearchAndModify,
  selectInlineBodyDropdown,
  saveErrorScreenshot,
} from './tvs-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseCliArgs();

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

const { userId: tvsUserId, password: tvsPassword } = resolveTvsCredentials(args);

const missing = [];
if (!enquiryNo)    missing.push('--enquiry');
if (!amount)       missing.push('--amount');
if (!otp)          missing.push('--otp');
if (!vehicle)      missing.push('--vehicle');
if (!submodel)     missing.push('--submodel');
if (!dealerCode)   missing.push('--dealer-code');
if (!branchName)   missing.push('--branch');
if (!tvsUserId)    missing.push('--user-id (or TVS_USER_ID in .env)');
if (!tvsPassword)  missing.push('--password (or TVS_PASSWORD in .env)');
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

  await tvsLogin(page, {
    dealerCode,
    branchName,
    userId: tvsUserId,
    password: tvsPassword,
    otp,
    roleId,
  });

  await tvsDismissCancel(page);
  await tvsOpenSalesHome(page);

  await page.locator('div').filter({ hasText: /^Enquiry$/ }).click();
  console.log('[step] opened Enquiry module');

  await tvsSelectThisMonth(page);
  await tvsSearchAndModify(page, enquiryNo);

  await page.locator('button.completeJob').filter({ hasText: 'Create Booking' }).click();
  console.log('[step] clicked Create Booking');

  const rowCheckbox = page.locator('#ROW_SELECT0');
  await rowCheckbox.evaluate((el) => el.click());
  console.log('[step] selected Vehicle row checkbox (ROW_SELECT0)');

  await selectInlineBodyDropdown(page, 0, submodel, 'submodel');
  await page.waitForTimeout(500);
  await selectInlineBodyDropdown(page, 1, vehicle, 'variant');

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(2000);
  const bookingAmtInput = page.locator('input[name="BOOKING_AMT"]');
  await bookingAmtInput.waitFor({ state: 'visible', timeout: 30000 });
  await bookingAmtInput.fill(String(amount));
  console.log(`[step] booking amount (BOOKING_AMT): ${amount}`);
  await rowCheckbox.evaluate((el) => el.click());
  console.log('[step] selected Vehicle row checkbox (ROW_SELECT0)');
  await page.waitForTimeout(2000);
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
  console.log('[step] booking saved');

  console.log('[SUCCESS] Booking automation completed');
  process.exit(0);
} catch (err) {
  console.error('[ERROR]', err.message || err);
  try {
    await saveErrorScreenshot(page, 'booking');
  } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
