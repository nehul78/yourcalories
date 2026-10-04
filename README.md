# YourCalories

A calm, Apple-style calorie tracker for you and your friends — with a **coach layer**: trainers assign goals, get one daily digest at a time they choose, and receive a monthly PDF health report.

Installable PWA (iPhone: Safari → Share → *Add to Home Screen*). No build step.

## Run it

```bash
npm install
npm start            # http://localhost:3000   (Node >= 22.13)
npm test
```

Env: `PORT`, `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (online database; everything incl. photos, PDFs and push keys is stored there), `DATA_DIR` (local SQLite file used when no Turso URL is set; default `./data`), `CYCLE_DAYS` (default 30), `VAPID_SUBJECT`.

Optional food features (each is simply off until its variable is set; add them under *Environment* on your host at any time):

| Variable | Turns on |
|---|---|
| `ANTHROPIC_API_KEY` | **Describe your meal**: Claude turns “2 rotis, dal and a small bowl of rice” into editable, itemised estimates. `ANTHROPIC_MODEL` picks the model (default `claude-opus-5-5`; a smaller model such as `claude-haiku-4-5` costs less per lookup). `DESCRIBE_DAILY_LIMIT` caps lookups per member per day (default 25). |
| `USDA_API_KEY` | Generic ingredients from USDA FoodData Central (free key: https://fdc.nal.usda.gov/api-key-signup). |

Deploy: `render.yaml` runs on Render's free plan with a free Turso database, so data survives restarts.
Web push and the camera/share APIs need HTTPS in production (localhost is exempt).

## What it does

| Request | How |
|---|---|
| Nationality → cuisines | Pick a country; cuisines are suggested in order and tagged *usually* / *sometimes*. Food search ranks those cuisines first. |
| Goal from current parameters | Sex, age, height, weight, activity → Mifflin-St Jeor calories + macros, adjustable. |
| Monthly photo | Prompted after 30 days. Progress toward the goal → 🎉 celebration card; otherwise an uplifting card (no negative numbers). Share via the system share sheet, or save. |
| Daily logging | Search, **describe in your own words**, scan a barcode, or type. Search covers ~600 built-in dishes across 16 cuisines (with alternate and regional names, e.g. *phulka* finds *roti*), your saved foods, your coach's library, foods friends chose to share, USDA ingredients and Open Food Facts packaged products. An empty search box shows recent, frequent and saved foods first. |
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
