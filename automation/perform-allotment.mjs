/**
 * Perform Allotment - Dummy Playwright Automation
 *
 * Triggered by the "Perform Allotment" button on Screen 3 (Vehicle Details)
 * in the CRM frontend. The job runner invokes this script via Node.
 *
 * Args (passed by job_runner.py):
 *   --enquiry  <enquiryNo>
 *   --chassis  <chassisNo>
 *   --booking  <bookingNo>
 *   --headless <true|false>
 *
 * TODO: Replace the dummy body with real TVS allotment UI automation steps.
 */
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) {
      acc.push([val.slice(2), arr[i + 1]]);
    }
    return acc;
  }, [])
);

const TVS_URL = 'https://www.advantagetvs.in/LiteApp/session/signin';
const headless = args.headless !== 'false';

console.log('='.repeat(60));
console.log('Perform Allotment - Playwright Automation');
console.log(`  enquiry  : ${args.enquiry || '(not set)'}`);
console.log(`  chassis  : ${args.chassis || '(not set)'}`);
console.log(`  booking  : ${args.booking || '(not set)'}`);
console.log(`  headless : ${headless}`);
console.log('='.repeat(60));

const browser = await chromium.launch({ headless });
try {
  const page = await browser.newPage();
  await page.goto(TVS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('[Perform Allotment] TVS login page opened');

  // TODO: implement allotment automation steps here
  //   - login (dealer code, role, branch, user, password, OTP)
  //   - navigate to Booking / Allotment section
  //   - search by --booking or --enquiry
  //   - set chassis/frame number to --chassis
  //   - confirm allotment

  console.log('[SUCCESS] Allotment dummy script completed');
  process.exit(0);
} catch (err) {
  console.error('[ERROR]', err.message || err);
  process.exit(1);
} finally {
  await browser.close();
}
