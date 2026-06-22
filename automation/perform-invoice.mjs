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
 *   --area-label        Mandal / area text for #AREA_ID, e.g. "GACHIBOWLI"
 *   --relationship      TVS select value, e.g. "1: SELF"
 *   --language-label    Screen 1 language text for #Comm_Language, e.g. "Hindi"
 *   --mobile            mobile number
 *   --dob               date of birth (CRM YYYY-MM-DD → TVS DD/MM/YYYY)
 *   --marital-status-label  Screen 1 marital status for MARRIED radio, e.g. "Single"
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
// Collapse newlines / repeated whitespace so the address fits a single-line TVS field
const addressLine1 = String(args['address-line-1'] || '').replace(/\s+/g, ' ').trim();
const areaLabel   = args['area-label'] || '';
const relationship = args.relationship || '1: SELF';
const languageLabel = args['language-label'] || '';
const mobile      = args.mobile || '';
const dob         = args.dob || '';
const gender      = String(args.gender || 'male').toLowerCase();
const maritalStatusLabel = args['marital-status-label'] || 'Single';
const saleMode    = args['sale-mode'] || '2: 1';
const headless    = args.headless !== 'false';

const { userId: tvsUserId, password: tvsPassword } = resolveTvsCredentials(args);

const searchKey = bookingNo || enquiryNo;

/** Normalize select option text for comparison (TVS uses "HINDI ", "BAHASA_INDONESIA ", etc.). */
function normalizeSelectLabel(text) {
  return String(text).trim().toUpperCase().replace(/\s+/g, '_');
}

/** Select a TVS dropdown by visible label — numeric values change; option text is stable. */
async function selectByOptionLabel(page, selector, label, fieldName) {
  const trimmed = String(label).trim();
  const select = page.locator(selector);
  const normalized = normalizeSelectLabel(trimmed);
  try {
    await select.selectOption({ label: trimmed });
    console.log(`[step] selected ${fieldName} by label: ${trimmed}`);
    return;
  } catch {
    // TVS options often have leading/trailing spaces in the label text
  }
  const options = await select.locator('option').allTextContents();
  const match = options.find((text) => normalizeSelectLabel(text) === normalized);
  if (match) {
    await select.selectOption({ label: match });
    console.log(`[step] selected ${fieldName} by matched label: ${match.trim()}`);
    return;
  }
  throw new Error(`${fieldName} option not found for label: ${trimmed}`);
}

/** TVS MARRIED radio only supports Single | Married — map other CRM values to Single. */
function resolveTvsMaritalStatus(label) {
  return String(label).trim().toLowerCase() === 'married' ? 'Married' : 'Single';
}

/** Click MARRIED radio by visible label text (Single / Married). */
async function selectMaritalStatusRadio(page, statusLabel) {
  const target = resolveTvsMaritalStatus(statusLabel);
  const radioLabel = page
    .locator('label.magic-radio')
    .filter({ has: page.locator('input[name="MARRIED"]') })
    .filter({ hasText: target });
  await radioLabel.click();
  console.log(`[step] selected marital status: ${target}`);
}

/** Convert CRM DOB (YYYY-MM-DD) to TVS format DD/MM/YYYY. */
function formatDobForTvs(value) {
  const v = String(value).trim();
  if (!v) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  return v;
}

/** Fill TVS #DOB — readonly PrimeNG input expects DD/MM/YYYY e.g. 22/06/2026. */
async function fillDobField(page, dobRaw) {
  const formatted = formatDobForTvs(dobRaw);
  if (!formatted) {
    console.log('[step] DOB skipped (no value provided)');
    return;
  }
  const dobInput = page.locator('input[name="DOB"]');
  await dobInput.click();
  await dobInput.evaluate((el, val) => {
    el.removeAttribute('readonly');
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, formatted);
  console.log(`[step] filled DOB: ${formatted}`);
}

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
if (!areaLabel)   missing.push('--area-label');
if (!languageLabel) missing.push('--language-label');
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
console.log(`  area label   : ${areaLabel}`);
console.log(`  relationship : ${relationship}`);
console.log(`  language     : ${languageLabel}`);
console.log(`  sale mode    : ${saleMode}`);
console.log(`  gender       : ${gender}`);
console.log(`  dob          : ${formatDobForTvs(dob) || '(n/a)'}`);
console.log(`  marital      : ${resolveTvsMaritalStatus(maritalStatusLabel)} (from ${maritalStatusLabel})`);
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

  await selectByOptionLabel(page, '#AREA_ID', areaLabel, 'AREA_ID');

  // await page.locator('#Rel_with_EndUser').selectOption(relationship);
  // console.log(`[step] selected Rel_with_EndUser: ${relationship}`);

await page.waitForTimeout(1000);

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

  await selectMaritalStatusRadio(page, maritalStatusLabel);

  await selectByOptionLabel(page, '#Comm_Language', languageLabel, 'Comm_Language');

  await page.locator('input[name="MOBILE_NO"]').fill(mobile);
  console.log(`[step] filled MOBILE_NO: ${mobile}`);

  await fillDobField(page, dob);

  await page.locator('select[name="SALE_MODE"]').selectOption(saleMode);
  console.log(`[step] selected SALE_MODE: ${saleMode}`);


  await page.waitForTimeout(20000);
  
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
