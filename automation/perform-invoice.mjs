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
 *   --sale-mode-label   SALE_MODE text, e.g. "Cash" or "HP" (preferred over --sale-mode)
 *   --sale-mode         legacy numeric TVS value, e.g. "5: 4" for Cash
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
const saleModeRaw = args['sale-mode-label'] || args['sale-mode'] || 'Cash';
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

/** Map CRM / legacy numeric SALE_MODE values to TVS option label text. */
function resolveSaleModeLabel(raw) {
  const v = String(raw).trim();
  if (!v) return 'Cash';
  const numericMap = {
    '2: 1': 'HP',
    '5: 4': 'Cash',
    '3: 2': 'Exchange',
    '4: 3': 'HPandExchange',
    '6: 5': 'SelfHP',
    '1: 0': 'All',
  };
  if (numericMap[v]) return numericMap[v];
  const lower = v.toLowerCase();
  if (lower.includes('cash')) return 'Cash';
  if (lower.includes('hp') && lower.includes('exchange')) return 'HPandExchange';
  if (lower.includes('selfhp')) return 'SelfHP';
  if (lower.includes('exchange')) return 'Exchange';
  if (lower === 'hp' || lower.includes('hire')) return 'HP';
  if (lower === 'all') return 'All';
  return v;
}

const saleModeLabel = resolveSaleModeLabel(saleModeRaw);

async function clickMatTab(page, labelText) {
  const tab = page.locator('.mat-tab-label').filter({ hasText: labelText }).first();
  await tab.waitFor({ state: 'visible', timeout: 15000 });
  await tab.click();
  console.log(`[step] opened tab: ${labelText}`);
}

async function fillMobileField(page, mobileValue) {
  const input = page.locator('input[name="MOBILE_NO"]');
  await input.click();
  await input.fill(String(mobileValue));
  await input.blur();
  console.log(`[step] filled MOBILE_NO: ${mobileValue}`);
  await page.waitForTimeout(1500);
}

/**
 * After mobile blur, TVS may flash "Customer exists" and clear the phone field.
 * Returns true when that existing-customer path should run.
 */
async function waitForCustomerExistsSignal(page, expectedMobile, timeoutMs = 10000) {
  const mobileInput = page.locator('input[name="MOBILE_NO"]');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgVisible = await page
      .getByText(/customer\s*exists/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (msgVisible) {
      console.log('[step] detected "Customer exists" message');
      return true;
    }
    const current = (await mobileInput.inputValue().catch(() => '')).trim();
    if (expectedMobile && current === '') {
      console.log('[step] mobile field cleared after lookup — treating as existing customer');
      return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
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

/** Fill TVS #DOB — readonly PrimeNG/Angular input expects DD/MM/YYYY e.g. 22/06/2026. */
async function fillDobField(page, dobRaw) {
  const formatted = formatDobForTvs(dobRaw);
  if (!formatted) {
    console.log('[step] DOB skipped (no value provided)');
    return;
  }
  const dobInput = page.locator('input[name="DOB"]');
  await dobInput.click();
  await dobInput.evaluate((el, val) => {
    // Temporarily drop readonly so the framework accepts the value
    el.removeAttribute('readonly');
    el.focus();

    // Use the native value setter so Angular/PrimeNG value tracking picks up the change
    const proto = Object.getPrototypeOf(el);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }

    // Fire the full keyboard + input lifecycle so PrimeNG's onUserInput/onInput runs
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, formatted);

  // Verify the value actually stuck; warn if the framework rejected it
  const applied = await dobInput.inputValue().catch(() => '');
  if (applied === formatted) {
    console.log(`[step] filled DOB: ${formatted}`);
  } else {
    console.log(`[step] DOB set to "${formatted}" but field shows "${applied}"`);
  }
}

/**
 * Existing customer on TVS: Owner Information Details → Owner is User → User Info Details.
 */
async function handleCustomerExistsFlow(page, expectedMobile) {
  const exists = await waitForCustomerExistsSignal(page, expectedMobile);
  if (!exists) {
    console.log('[step] no existing-customer signal — continuing normally');
    return false;
  }

  console.log('[step] handling existing customer — linking owner to user');

  await clickMatTab(page, 'Owner Information Details');

  const ownerCheckbox = page.locator('#owneruser');
  try {
    await ownerCheckbox.check({ force: true });
  } catch {
    await page.locator('label[for="owneruser"]').click();
  }
  console.log('[step] checked "Owner is User"');

  await page.waitForTimeout(2000);

  await clickMatTab(page, 'User Info Details');

  return true;
}

/** Check a TVS magic-checkbox via JS so Angular registers the change. */
async function checkMagicCheckbox(page, checkboxId, logLabel) {
  const checkbox = page.locator(`#${checkboxId}`);
  await checkbox.waitFor({ state: 'attached', timeout: 10000 });
  await checkbox.evaluate((el) => {
    if (el.checked) return;
    el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  });
  console.log(`[step] checked ${logLabel} (#${checkboxId})`);
}

/** Self Arranged checkboxes + Create confirm (used for full and shortcut paths). */
async function finalizeInvoiceCreation(page, { clickSaveFirst = true } = {}) {
  if (clickSaveFirst) {
    const saveBtn = page.locator('button#save[name="save"]');
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      console.log('[step] clicked Create (save)');
    }
  }

  await clickMatTab(page, 'Registration and Insurance');

  await checkMagicCheckbox(page, 'CUST_MNG_INSR', 'Self Arranged Insurance');
  await checkMagicCheckbox(page, 'CUST_MNGD_REG', 'Self Arranged Registration');

  await page.locator('.createJCBtn#createbtn[type="submit"]').click();
  console.log('[step] clicked Create (confirm)');
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
console.log(`  sale mode    : ${saleModeLabel} (from ${saleModeRaw})`);
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

  const userNameField = page.locator('#USER_NAME');
  const hasUserNameForm = await userNameField
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (hasUserNameForm) {
    console.log('[step] invoice form detected — filling customer details');

    await userNameField.fill(userName);
    console.log(`[step] filled USER_NAME: ${userName}`);

    await page.locator('#ADDRESS_LINE_1').fill(addressLine1);
    console.log(`[step] filled ADDRESS_LINE_1`);

    await selectByOptionLabel(page, '#AREA_ID', areaLabel, 'AREA_ID');

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

    await fillMobileField(page, mobile);
    const customerExistsHandled = await handleCustomerExistsFlow(page, mobile);

    if (customerExistsHandled) {
      await fillMobileField(page, mobile);
    }

    await fillDobField(page, dob);

    await selectByOptionLabel(page, 'select[name="SALE_MODE"]', saleModeLabel, 'SALE_MODE');

    await finalizeInvoiceCreation(page, { clickSaveFirst: true });
  } else {
    console.log('[step] #USER_NAME not found — skipping data entry');
    await finalizeInvoiceCreation(page, { clickSaveFirst: false });
  }

  await page.waitForTimeout(30000);

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
