/**
 * Perform Allotment - Playwright Automation for TVS DMS
 *
 * Triggered by the "Perform Allotment" button on Screen 3 (Vehicle Details).
 * job_runner.py invokes this script via Node with CLI args.
 *
 * CLI args:
 *   --enquiry      <enquiryNo>
 *   --booking      <bookingNo>       from Screen 3 booking_no (primary search on Booking screen)
 *   --chassis      <chassisNo>       selected chassis on Screen 3
 *   --submodel     <submodel label>  FormatVehicleModel DESCRIPTION
 *   --vehicle      <variant name>    variant label on Screen 3
 *   --otp          <4-digit OTP>
 *   --dealer-code  <dealer id>
 *   --role-id      <numeric roleId>   default "3"
 *   --branch       <branch name>
 *   --headless     <true|false>       default true
 *
 * .env: TVS_USER_ID, TVS_PASSWORD, optional TVS_URL
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TVS_URL,
  TVS_USER_ID,
  TVS_PASSWORD,
  parseCliArgs,
  tvsLogin,
  tvsDismissCancel,
  tvsOpenSalesHome,
  tvsSelectThisMonth,
  tvsSearchAndModify,
  selectInlineBodyDropdown,
  selectChassisIfPresent,
  saveErrorScreenshot,
} from './tvs-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseCliArgs();

const enquiryNo  = args.enquiry;
const bookingNo  = args.booking;
const chassisNo  = args.chassis;
const submodel   = args.submodel;
const vehicle    = args.vehicle;
const otp        = args.otp;
const dealerCode = args['dealer-code'];
const roleId     = args['role-id'] || '3';
const branchName = args.branch;
const headless   = args.headless !== 'false';

const searchKey = bookingNo || enquiryNo;

const missing = [];
if (!enquiryNo)    missing.push('--enquiry');
if (!searchKey)    missing.push('--booking (or --enquiry for search)');
if (!chassisNo)    missing.push('--chassis');
if (!submodel)     missing.push('--submodel');
if (!vehicle)      missing.push('--vehicle');
if (!otp)          missing.push('--otp');
if (!dealerCode)   missing.push('--dealer-code');
if (!branchName)   missing.push('--branch');
if (!TVS_USER_ID)  missing.push('TVS_USER_ID (.env)');
if (!TVS_PASSWORD) missing.push('TVS_PASSWORD (.env)');
if (missing.length) {
  console.error('[ERROR] Missing required values:', missing.join(', '));
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Perform Allotment - Playwright Automation');
console.log(`  enquiry   : ${enquiryNo}`);
console.log(`  booking   : ${bookingNo || '(using enquiry for search)'}`);
console.log(`  chassis   : ${chassisNo}`);
console.log(`  submodel  : ${submodel}`);
console.log(`  vehicle   : ${vehicle}`);
console.log(`  dealer    : ${dealerCode}`);
console.log(`  branch    : ${branchName}`);
console.log(`  role id   : ${roleId}`);
console.log(`  headless  : ${headless}`);
console.log('='.repeat(60));

const browser = await chromium.launch({ headless });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  await page.goto(TVS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('[step] TVS sign-in page opened');

  await tvsLogin(page, {
    dealerCode,
    branchName,
    userId: TVS_USER_ID,
    password: TVS_PASSWORD,
    otp,
    roleId,
  });

  await tvsDismissCancel(page);
  await tvsOpenSalesHome(page);

  await page.locator('div').filter({ hasText: /^Booking$/ }).click();
  console.log('[step] opened Booking module');

  await tvsSelectThisMonth(page);
  await tvsSearchAndModify(page, searchKey, { submitWithEnter: true });

  const rowCheckbox = page.locator('#ROW_SELECT0');
  if (await rowCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
    await rowCheckbox.evaluate((el) => el.click());
    console.log('[step] selected row checkbox (ROW_SELECT0)');
  } else {
    await page.locator('label').filter({ hasText: 'Select' }).first().click();
    console.log('[step] clicked Select label');
  }

  await selectInlineBodyDropdown(page, 0, submodel, 'submodel');
  await page.waitForTimeout(500);
  await selectInlineBodyDropdown(page, 1, vehicle, 'variant');
  await page.waitForTimeout(500);
  await selectChassisIfPresent(page, chassisNo);

  page.once('dialog', (dialog) => {
    console.log(`[dialog] ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });

  const saveBtn = page.getByRole('button', { name: 'Save' });
  if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await saveBtn.click();
    console.log('[step] clicked Save');
  }

  const allotBtn = page.getByRole('button', { name: /Allot/i });
  if (await allotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await allotBtn.click();
    console.log('[step] clicked Allot');
  }

  console.log('[SUCCESS] Allotment automation completed');
  process.exit(0);
} catch (err) {
  console.error('[ERROR]', err.message || err);
  try {
    await saveErrorScreenshot(page, 'allotment');
  } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
