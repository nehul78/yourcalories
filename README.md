# YourCalories

A calm, Apple-style calorie tracker for you and your friends — with a **coach layer**: trainers assign goals, get one daily digest at a time they choose, and receive a monthly PDF health report.

Installable PWA (iPhone: Safari → Share → *Add to Home Screen*). No build step.

## Run it

```bash
npm install
npm start            # http://localhost:3000   (Node >= 22.13)
npm test
```

Env: `PORT`, `DATA_DIR` (SQLite db, photos, PDFs, VAPID keys; default `./data`), `CYCLE_DAYS` (default 30), `VAPID_SUBJECT`.
Web push and the camera/share APIs need HTTPS in production (localhost is exempt).

## What it does

| Request | How |
|---|---|
| Nationality → cuisines | Pick a country; cuisines are suggested in order and tagged *usually* / *sometimes*. Food search ranks those cuisines first. |
| Goal from current parameters | Sex, age, height, weight, activity → Mifflin-St Jeor calories + macros, adjustable. |
| Monthly photo | Prompted after 30 days. Progress toward the goal → 🎉 celebration card; otherwise an uplifting card (no negative numbers). Share via the system share sheet, or save. |
| Daily logging | Search (built-in dishes + Open Food Facts), scan barcode (BarcodeDetector), or type. |
| Today + yesterday only | Enforced on the server. Yesterday earns half points. |
| Points | Meals +5, workouts +10, calorie target hit +25, streak bonus, check-in +15, photo +50; levels every 250. |
| Trainer vs member | Separate roles, tabs and colour-coded badges. Members join with the coach's 6-letter code. |
| Coach assigns goals | Calories, macros, target, workouts/week, plus which parameters are **mandatory**. Members can't edit a coach-set plan. |
| Daily digest | One notification per day at the coach's chosen time (in-app inbox + web push). Morning times summarise yesterday; afternoon/evening, today. |
| Monthly PDF | Generated automatically once every mandatory parameter is in for the cycle; delivered to the coach's inbox. |

## Layout

`server/` Express + `node:sqlite` API, scheduler (digests, report sweep), pdfkit report · `public/` vanilla-JS PWA · `test/` API tests.

## Notes / limits

- Auth is email + password with server sessions; add rate limiting and HTTPS before exposing it publicly.
- Calorie values for built-in dishes are estimates; barcode/packaged results need internet.
- iOS web push requires the app to be added to the Home Screen (iOS 16.4+).
