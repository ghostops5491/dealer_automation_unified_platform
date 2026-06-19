/**
 * Perform Invoice - Playwright Automation for TVS DMS
 *
 * Triggered by the "Generate Invoice" button on Screen 6 (Invoice).
 * job_runner.py invokes this script via Node with CLI args.
 *
 * CLI args:
 *   --booking           <bookingNo>       primary search key on Booking screen
 *   --enquiry           <enquiryNo>       optional fallback search key
 *   --otp               <4-digit OTP>
 *   --dealer-code       <dealer id>
 *   --role-id           <numeric roleId>   default "3"
 *   --branch            <branch name>
 *   --user-id           <TVS user id>
 *   --password          <TVS password>
 *   --user-name         customer / end-user name (#USER_NAME)
 *   --address-line-1    address (#ADDRESS_LINE_1)
 *   --area-id           TVS select value, e.g. "3: 1932007"
 *   --relationship      TVS select value, e.g. "1: SELF"
 *   --language          TVS select value, e.g. "3: 3" (or CRM language label for mapping)
 *   --mobile            mobile number
 *   --dob               date of birth (YYYY-MM-DD)
 *   --gender            male | female
 *   --sale-mode         TVS select value, e.g. "2: 1"
 *   --headless          <true|false>       default true
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TVS_URL,
  parseCliArgs,
  resolveTvsCredentials,
  tvsLogin,
  tvsDismissCancel,
  tvsOpenSalesHome,
  tvsSelectThisMonth,
  tvsSearchAndModify,
  saveErrorScreenshot,
} from './tvs-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseCliArgs();

const bookingNo   = args.booking;
const enquiryNo   = args.enquiry;
const otp         = args.otp;
const dealerCode  = args['dealer-code'];
const roleId      = args['role-id'] || '3';
const branchName  = args.branch;
const userName    = args['user-name'] || '';
const addressLine1 = args['address-line-1'] || '';
const areaId      = args['area-id'] || '3: 1932007';
const relationship = args.relationship || '1: SELF';
const languageRaw = args.language || '3: 3';
const mobile      = args.mobile || '';
const dob         = args.dob || '';
const gender      = String(args.gender || 'male').toLowerCase();
const saleMode    = args['sale-mode'] || '2: 1';
const headless    = args.headless !== 'false';

const { userId: tvsUserId, password: tvsPassword } = resolveTvsCredentials(args);

const searchKey = bookingNo || enquiryNo;

/** Map CRM language labels to TVS Comm_Language select values when not already in "id: label" form. */
function resolveLanguageOption(value) {
  const v = String(value).trim();
  if (/^\d+:\s*/.test(v)) return v;
  const map = {
    english: '1: 1',
    hindi: '3: 3',
    telugu: '2: 2',
    tamil: '4: 4',
    kannada: '5: 5',
  };
  return map[v.toLowerCase()] || '3: 3';
}

const languageOption = resolveLanguageOption(languageRaw);

const missing = [];
if (!searchKey)   missing.push('--booking (or --enquiry)');
if (!otp)         missing.push('--otp');
if (!dealerCode)  missing.push('--dealer-code');
if (!branchName)  missing.push('--branch');
if (!tvsUserId)   missing.push('--user-id (or TVS_USER_ID in .env)');
if (!tvsPassword) missing.push('--password (or TVS_PASSWORD in .env)');
if (!userName)    missing.push('--user-name');
if (!addressLine1) missing.push('--address-line-1');
if (!mobile)      missing.push('--mobile');
if (missing.length) {
  console.error('[ERROR] Missing required values:', missing.join(', '));
  process.exit(1);
}

console.log('='.repeat(60));
console.log('Perform Invoice - Playwright Automation');
console.log(`  booking      : ${bookingNo || '(using enquiry)'}`);
console.log(`  enquiry      : ${enquiryNo || '(n/a)'}`);
console.log(`  search key   : ${searchKey}`);
console.log(`  user name    : ${userName}`);
console.log(`  mobile       : ${mobile}`);
console.log(`  area id      : ${areaId}`);
console.log(`  relationship : ${relationship}`);
console.log(`  language     : ${languageOption}`);
console.log(`  sale mode    : ${saleMode}`);
console.log(`  gender       : ${gender}`);
console.log(`  dealer       : ${dealerCode}`);
console.log(`  branch       : ${branchName}`);
console.log(`  headless     : ${headless}`);
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
    userId: tvsUserId,
    password: tvsPassword,
    otp,
    roleId,
  });

  await tvsDismissCancel(page);
  await tvsOpenSalesHome(page);

  await page.locator('div').filter({ hasText: /^Booking$/ }).click();
  console.log('[step] opened Booking module');

  await tvsSelectThisMonth(page);
  await tvsSearchAndModify(page, searchKey, { submitWithEnter: true });
  console.log(`[step] searched and opened booking: ${searchKey}`);

  await page.getByRole('button', { name: 'Create Invoice' }).click();
  console.log('[step] clicked Create Invoice');

  await page.locator('#USER_NAME').fill(userName);
  console.log(`[step] filled USER_NAME: ${userName}`);

  await page.locator('#ADDRESS_LINE_1').fill(addressLine1);
  console.log(`[step] filled ADDRESS_LINE_1`);

  await page.locator('#AREA_ID').selectOption(areaId);
  console.log(`[step] selected AREA_ID: ${areaId}`);

  await page.locator('#Rel_with_EndUser').selectOption(relationship);
  console.log(`[step] selected Rel_with_EndUser: ${relationship}`);

  await page.getByRole('tab', { name: 'User Info Details' }).click();
  console.log('[step] opened User Info Details tab');

  const genderLabels = page.locator('.flex > label > span');
  if (gender === 'female') {
    await genderLabels.nth(1).click();
    console.log('[step] selected gender: Female');
  } else {
    await genderLabels.first().click();
    console.log('[step] selected gender: Male');
  }

  await page.locator('#Comm_Language').selectOption(languageOption);
  console.log(`[step] selected Comm_Language: ${languageOption}`);

  await page.locator('input[name="MOBILE_NO"]').fill(mobile);
  console.log(`[step] filled MOBILE_NO: ${mobile}`);

  const dobInput = page.locator('input[name="DOB"]');
  await dobInput.click();
  if (dob) {
    await dobInput.fill(dob);
    console.log(`[step] filled DOB: ${dob}`);
  } else {
    console.log('[step] clicked DOB (no value provided)');
  }

  await page.locator('select[name="SALE_MODE"]').selectOption(saleMode);
  console.log(`[step] selected SALE_MODE: ${saleMode}`);

  await page.getByRole('button', { name: 'Cancel' }).click();
  console.log('[step] clicked Cancel (1)');

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  console.log('[step] clicked Cancel (2)');

  console.log('[SUCCESS] Invoice automation completed');
  process.exit(0);
} catch (err) {
  console.error('[ERROR]', err.message || err);
  try {
    await saveErrorScreenshot(page, 'invoice');
  } catch {}
  process.exit(1);
} finally {
  await browser.close();
}
