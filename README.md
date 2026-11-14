# 💊 MediReminder — Medicine Reminder Web App

Schedule medicines, get reminders on time (in-app pop-up + sound + e-mail), snooze or dismiss,
track adherence, and let a caregiver follow along.

**Stack:** HTML · CSS · JavaScript (frontend) · Node.js + Express (backend) · MongoDB (database)

## Run it (3 steps)

Requirements: Node.js 20+ and MongoDB running locally (or use Docker, below).

```powershell
npm install
Copy-Item .env.example .env
npm start                   # http://localhost:3000
```

Set `MONGODB_URI` and `MONGODB_DB` in `.env` if your local MongoDB uses a non-default address or database. The app creates its collections and indexes automatically.

Demo data for the video: `npm run seed` → patient `asha@demo.com`, caregiver `ravi@demo.com`, password `demo123`.

**Docker alternative:** copy `.env.example` to `.env`, set distinct random values of at least 32 characters for `JWT_SECRET` and `CRON_SECRET`, then run `docker compose up --build` (starts MongoDB + app). The container runs as a non-root user and the Docker build excludes local environment files. Put a TLS reverse proxy in front of port 3000 before exposing it publicly.
Tests for the scheduling logic: `npm test`.

## Deploy to Vercel

This app can use a MongoDB database on your own computer through a secure TCP tunnel, but Vercel cannot connect to `localhost` directly. The computer and tunnel must remain online for the deployed app to work. A tunnel also makes your health-data database reachable from the internet, so a managed database is safer and more reliable for production.

1. Keep MongoDB bound to localhost and require authentication. Create a dedicated MongoDB user limited to the `medireminder` database; do not expose MongoDB's port directly to the internet or disable authentication.
2. Set up a tunnel that securely forwards TCP traffic to your local MongoDB port, with TLS and access restrictions. Use its MongoDB-compatible connection URI as `MONGODB_URI`; do not use a `localhost` or `127.0.0.1` URI in Vercel. Keep the computer, MongoDB, and tunnel running.
3. Import this repository into Vercel and use the repository root (the folder containing `package.json`) as the project root.
4. Add these Production environment variables in Vercel:
   - `MONGODB_URI`: the authenticated, TLS-protected tunnel URI
   - `MONGODB_DB`: `medireminder`
   - `JWT_SECRET`: a random secret of at least 32 characters
   - `CRON_SECRET`: a different random secret of at least 32 characters
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` if e-mail delivery is needed
5. Deploy. Vercel serves `public/` assets from its CDN and runs the Express app as a Function.

Generate each secret independently with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not use development or example secrets in production. Production startup fails if the database URI or secure secrets are missing.

`vercel.json` configures a daily `/api/cron` call so the project can deploy on Vercel Hobby. The app needs reminder processing every minute for timely notifications. Hobby accounts only allow daily cron schedules; configure an external scheduler to call `GET /api/cron` once per minute with `Authorization: Bearer <CRON_SECRET>`. On Pro or Enterprise, change the `crons` schedule in `vercel.json` to `* * * * *` for built-in minute-by-minute processing. Cron jobs run only for Production deployments. The endpoint rejects requests without the configured secret.

## Features
**Patient:** register/login · add/edit/pause/delete medicines (name, dosage, multiple times/day, start/end date,
repeat: daily / alternate days / every N days / chosen weekdays) · today's timeline · mark Taken, Snooze (5–60 min),
Dismiss, Skip · due-dose pop-up with sound & browser notification · e-mail notifications (mock or SMTP) ·
adherence %, streak, on-time rate, 30/90-day charts, calendar heat-map, per-medicine and per-hour stats ·
filterable dose log + CSV export · stock tracking with refill alerts · emergency contact + SOS button ·
dark mode · responsive/mobile layout.

**Caregiver:** link with an invite code or by e-mail · see linked patients' today status, adherence and medicines (read-only) ·
alerts when a dose is missed or SOS is pressed.

## How reminders work
Locally, `server/services/scheduler.js` runs every 30 s. On Vercel, a scheduled request to `/api/cron` generates reminders,
wakes expired snoozes, sends due notifications, and marks unanswered doses as **Missed**.
Times are entered in the user's timezone and stored in UTC (ISO-8601 in the API); DST handled.

## API
| Purpose | Method | Route |
|---|---|---|
| Register / Login | POST | `/api/auth/register`, `/api/auth/login` |
| Profile / password | GET PUT | `/api/auth/me`, `/api/auth/profile`, `/api/auth/password` |
| Add / list medicine | POST GET | `/api/medicines` |
| Update / delete | PUT DELETE | `/api/medicines/:id` |
| Today's reminders | GET | `/api/reminders/today` (+ `/upcoming`) |
| Mark Taken/Missed/Dismissed | PUT | `/api/reminders/:id/mark` `{status}` |
| Snooze | PUT | `/api/reminders/:id/snooze` `{minutes}` |
| Adherence history | GET | `/api/history?from=&to=&status=&medicineId=` (+ `/analytics`, `/export.csv`) |
| Invite / link caregiver | POST | `/api/caregivers/invite`, `/api/caregivers/link` |
| Linked patients | GET | `/api/caregivers/patients`, `/api/caregivers/patients/:id` |
| Notifications / SOS | GET PUT POST | `/api/notifications`, `/api/notifications/emergency` |

## Database (MongoDB)
The app uses the `users`, `medicines`, `reminders`, `caregivers`, and `notifications` collections. Required indexes and ID counters are initialized automatically.

## E-mail
Without SMTP settings, e-mails are printed in the server console (demo mode). For real test e-mails create a free
account at ethereal.email and fill the `SMTP_*` values in `.env`.

> This app is a reminder aid, not medical advice.
#