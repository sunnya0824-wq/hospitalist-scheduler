# Hospitalist Scheduler

A production-ready web app for generating fair, constraint-aware **monthly
hospitalist coverage schedules**. It models a hospitalist group's daily
staffing needs (10 rounders, 1 admin, 2 night admitters per calendar day) and
builds a complete month of assignments using a greedy + scoring algorithm that
balances workload, respects eligibility and time-off, and surfaces any coverage
gaps or constraint violations.

## Features

- **Dashboard** — month picker, coverage summary, one-click schedule
  generation, and export shortcuts.
- **Physicians** — full CRUD with workload targets, night/admin eligibility,
  shift preferences, and unavailable/preferred date pickers. Includes
  **Seed demo data** and **Clear all data** buttons.
- **Schedule** — day-by-day and by-physician views with color-coded shift
  chips, manual editing (change physician, clear, lock), a **Regenerate**
  button that preserves locked + manual slots, and a warnings panel.
- **Analytics** — totals per physician, night/weekend/admin distribution,
  fairness score, and a constraint-violation list.
- **Exports** — CSV, XLSX (via the `xlsx` package), a print-friendly page with
  `@media print` styling, and copy-to-clipboard (TSV).

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18
- TypeScript (strict mode)
- Tailwind CSS
- Prisma ORM + PostgreSQL
- `xlsx` for spreadsheet export
- Node.js >= 20

## Daily coverage model

Every calendar day requires **13 assignments**:

| Shift          | Time            | Notes                       |
| -------------- | --------------- | --------------------------- |
| Rounder 1–10   | 07:00 – 17:00   | 10 day rounding shifts      |
| Admin          | 12:00 – 21:00   | 1 admin shift               |
| Night Admit 1  | 17:00 – 05:00   | crosses midnight            |
| Night Admit 2  | 19:00 – 07:00   | crosses midnight            |

Night shifts span two calendar days; each assignment stores both a start date
and an end date.

## Local setup

```bash
# 1. Install dependencies (runs `prisma generate` via postinstall)
npm install

# 2. Configure the database connection
cp .env.example .env
#   then edit .env and set DATABASE_URL to your local Postgres instance

# 3. Create the schema
npx prisma migrate dev --name init

# 4. Load 20 demo physicians
npm run seed

# 5. Start the dev server
npm run dev
```

Open http://localhost:3000, go to **Physicians → Seed demo data** (or run
`npm run seed`), then **Dashboard → Generate Schedule**.

## Database schema overview

| Model                   | Purpose                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `Physician`             | Roster entry with workload targets and eligibility flags.      |
| `ScheduleMonth`         | One row per (year, month); tracks status and generation time.  |
| `ShiftAssignment`       | A single slot: date, end date, shift type, physician, flags.   |
| `PhysicianAvailability` | Unavailable / preferred dates per physician.                   |
| `PhysicianPreference`   | Optional per-month overrides of desired/min/max shifts.        |
| `ScheduleGenerationRun` | Audit log of each generation run with warnings + stats JSON.   |

`ShiftType` enum: `ROUNDER`, `ADMIN`, `NIGHT_ADMIT_1`, `NIGHT_ADMIT_2`.

## How the scheduler works

The engine lives in [`src/lib/scheduler/`](src/lib/scheduler). It uses a
**greedy + scoring** strategy:

1. **Generate slots** — build all `13 × daysInMonth` empty shift slots.
2. **Seed fixed slots** — any locked or manually edited assignments from a prior
   run are reinserted and count toward fairness/limits.
3. **Assign most-constrained first** — fill `NIGHT_ADMIT_1` / `NIGHT_ADMIT_2`,
   then `ADMIN`, then the 10 `ROUNDER` slots, walking chronologically.
4. For each slot, every active physician is checked against the **hard
   constraints**; the eligible physician with the highest **soft score** wins.

**Hard constraints** (a physician failing any of these cannot take the slot):

- No double-booking on the same calendar day.
- No day shift on the rest day immediately after a night shift.
- No overnight whose end date collides with existing work.
- Respect explicit unavailable dates.
- Respect night/admin eligibility.
- Respect `maxShifts` (unless the run sets the override flag).
- Never overwrite locked assignments.

**Soft scoring** (higher = better fit) blends:

- Distance from each physician's desired shift count.
- A large boost while below the contractual minimum; penalty above max.
- Per-category min/max targeting (nights, admin, rounding).
- Night and weekend **fairness** (penalize physicians already above the group
  average).
- Preferred-date boosts and `MORE`/`FEWER` preference tilt.
- A rest-after-night bonus and a penalty for runs longer than 5 consecutive
  days.

The result includes the assignments, a list of **warnings** (coverage gaps and
constraint violations), **per-physician stats**, and an overall **fairness
score** (0–100, derived from the coefficient of variation of total shifts and
nights).

Slots with no eligible physician are left unfilled and recorded as coverage
gaps rather than forcing an invalid assignment.

## API routes

| Method | Route                          | Purpose                          |
| ------ | ------------------------------ | -------------------------------- |
| GET    | `/api/physicians`              | List physicians.                 |
| POST   | `/api/physicians`              | Create a physician.              |
| PUT    | `/api/physicians/[id]`         | Update a physician.              |
| DELETE | `/api/physicians/[id]`         | Delete a physician.              |
| POST   | `/api/schedule/generate`       | Generate/regenerate a month.     |
| GET    | `/api/schedule/[year]/[month]` | Read a month's schedule.         |
| PATCH  | `/api/assignments/[id]`        | Edit / lock / clear a slot.      |
| POST   | `/api/seed`                    | Seed 20 demo physicians.         |
| POST   | `/api/clear-all`               | Wipe all data.                   |
| GET    | `/api/export/csv`              | Download CSV.                    |
| GET    | `/api/export/xlsx`             | Download XLSX.                   |

## Railway deployment

This app deploys cleanly on [Railway](https://railway.app) with the PostgreSQL
plugin (Nixpacks auto-detects Next.js + Prisma).

1. Create a new Railway project and add the **PostgreSQL** plugin.
2. Create a service from this GitHub repo.
3. Railway injects `DATABASE_URL` automatically when the Postgres plugin is
   attached to the service. (If not, copy it from the plugin's Connect tab into
   the service variables.)
4. Build command: `npm run build` (`prisma generate && next build`).
5. Start command: `npm start` — this runs `prisma migrate deploy` to apply
   migrations, then `next start -p $PORT`.
6. After the first deploy, optionally seed demo data by hitting **Physicians →
   Seed demo data** in the UI, or run `npm run seed` against the production
   `DATABASE_URL`.

The build does **not** require a live database — `prisma generate` runs at build
time and `prisma migrate deploy` runs at startup.

## Environment variables

| Variable       | Required | Description                              |
| -------------- | -------- | ---------------------------------------- |
| `DATABASE_URL` | yes      | PostgreSQL connection string.            |
| `PORT`         | no       | Port for `next start` (defaults 3000).   |

See [`.env.example`](.env.example).

## Scripts

| Script            | Description                                  |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Start the dev server.                        |
| `npm run build`   | `prisma generate && next build`.             |
| `npm start`       | `prisma migrate deploy && next start`.       |
| `npm run seed`    | Seed 20 demo physicians.                     |
| `npm run lint`    | Run ESLint.                                  |

## Future improvements

- Optimization-based scheduling (OR-Tools / linear programming) for provably
  optimal fairness instead of greedy heuristics.
- Authentication and role-based access (scheduler vs. physician views).
- Multi-site / multi-team support.
- Structured vacation and PTO request workflows.
- Google Calendar / Outlook sync and per-physician calendar feeds.
- Email distribution of published schedules.
- Physician self-service portal for swaps and availability.
