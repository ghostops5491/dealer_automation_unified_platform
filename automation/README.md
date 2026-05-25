# CRM UI Automation Scripts

Playwright scripts that automate the TVS portal
(<https://www.advantagetvs.in/LiteApp/session/signin>) when buttons are
clicked on **Screen 3 (Vehicle Details)** in the CRM frontend.

## Files

| Script | Triggered by | CLI args |
|---|---|---|
| `perform-booking.mjs`   | "Perform Booking" button   | `--enquiry`, `--amount`, `--headless` |
| `perform-allotment.mjs` | "Perform Allotment" button | `--enquiry`, `--chassis`, `--booking`, `--headless` |

Both files are dummies right now - they launch headless Chromium, open the
TVS sign-in page, and exit. Replace the `TODO` blocks with real UI steps.

## One-time setup

```powershell
cd C:\Users\yashc\Desktop\Auto_Unified_Platform\crm_automation\automation
npm install
npx playwright install chromium
```

## How it gets triggered

```
Screen 3 button click
  -> jobApi.runBooking / runAllotment           (frontend)
  -> POST /api/jobs/run-booking | run-allotment (backend)
  -> job_runner.py on port 3002                 (Windows host)
  -> node perform-booking.mjs | perform-allotment.mjs
  -> Chromium opens advantagetvs.in
```

The job runner reads `PLAYWRIGHT_DIR` to find these scripts; it must be
pointed at this folder. See `job_runner/job_runner.py`.

## Manual test

```powershell
node perform-booking.mjs --enquiry 25568 --amount 5000 --headless false
node perform-allotment.mjs --enquiry 25568 --chassis FRAME123 --booking 99 --headless false
```

Use `--headless false` to watch the browser while debugging.

## FormatVehicleModel payload capture

`perform-booking.mjs` intercepts TVS `POST .../MultiVehicle/FormatVehicleModel`
during automation and:

1. Overwrites `captured/format-vehicle-model-latest.json` locally
2. Syncs to backend `POST /api/external/format-vehicle-template/sync`

Optional `.env` entries (shared only — not branch secrets):

```
TVS_URL=https://www.advantagetvs.in/LiteApp/session/signin
CRM_BACKEND_URL=http://localhost:3001
AUTOMATION_SYNC_KEY=crm-automation-sync
```

Branch-specific **TVS User ID / Password** are configured in **Admin → Branches → TVS Automation Login** (stored in CRM DB).

Branch-specific **OTP** is set on the user Dashboard (stored per Dealer ID in `otp-by-dealer.json` on the job runner host).

Legacy `.env` `TVS_USER_ID`, `TVS_PASSWORD`, `TVS_OTP` still work as Playwright fallbacks for manual CLI testing.

The CRM **SubModel** dropdown uses this template via `POST /api/external/format-vehicle-model`.
Run booking automation at least once before SubModel options appear.
