# Hospitalist Scheduler

A web app that builds fair, rule-aware monthly coverage schedules for any
hospitalist group: any number of hospitals or sites, any shift types, your own
rules and holidays.

## Features

- **Settings** — set up your organization once:
  - **Locations**: hospitals, campuses or service lines. Each is open to every
    physician or limited to the ones you tick.
  - **Shift types** per location: name, short label, hours (overnight shifts
    are detected automatically), slots needed for each weekday, an optional
    holiday count, color, and a category (Day, Admitting or Night).
  - **Rules**: rest days after a block of nights, preferred night-block length,
    which days count as the weekend.
  - **Holidays**: US federal holidays are calculated for any year. Turn any of
    them off, and add your own (one-off or every year).
- **Physicians** — workload targets (desired/min/max, FTE, monthly target),
  per-category limits, night/admitting eligibility, which restricted locations
  they can work, max days and nights in a row, preferred night-block length,
  soft preferences (nights, weekends, admitting, weekdays to avoid, monthly
  caps), unavailable/preferred dates and time-off requests, and a personal
  calendar (ICS) feed.
- **Dashboard** — pick a month, adjust this month's coverage (override any
  shift type's slots per day), generate, see gaps and the fairness score.
- **Schedule** — by day or by physician; change, clear, lock or swap slots.
  Regenerating keeps locked and manually edited slots. Manual changes are
  checked against the same rules as the generator.
- **Analytics** — totals per physician, nights, weekends, holidays, longest
  night block, fairness breakdown and rule warnings.
- **Exports** — CSV, XLSX, print view, per-physician PDF, copy to clipboard.

## How the scheduler works

Code: [`src/lib/scheduler/`](src/lib/scheduler). Greedy assignment with scoring:

1. **Build slots** from your shift types for each day of the month (weekday
   counts, holiday counts, or this month's override).
2. **Seed fixed work**: locked/manual slots, plus shifts worked in the last
   three weeks of the previous month (so rest and night blocks carry over).
3. **Fill hardest first**: nights (chronologically, so blocks form), then
   admitting, then day shifts.
4. For each slot, every physician is checked against the **hard rules**; the
   one with the best **score** gets it. If nobody qualifies, the slot stays
   empty and is reported as a coverage gap.

**Hard rules** (never broken by the generator):

- One shift starting per physician per day; an overnight shift blocks the
  next morning.
- Time off and unavailable dates; night and admitting eligibility; location
  eligibility.
- **Night blocks**: nights may run back to back up to the physician's
  *max nights in a row*. After the **last** night of a block, the physician
  gets the configured number of rest days.
- Max days in a row; max shifts per month (unless "allow over max" is on).

**Scoring** (soft) balances: distance from each physician's desired and target
shifts, per-category min/max, night/weekend/holiday fairness, preferences and
soft caps, and a strong pull to continue a night block until it reaches the
preferred length (per physician, or the group default).

**Fairness score** (0–100) is the average of three parts:
workload (shifts relative to each person's own target), nights (spread among
night-eligible physicians who have *not* asked for nights, relative to target)
and weekends (weekend share of each person's shifts).

## Tech stack

Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS,
Prisma ORM + PostgreSQL, `xlsx`. Node.js 20 or newer.

## Local setup

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # set DATABASE_URL to your Postgres
npx prisma migrate deploy   # create the tables
npm run seed                # optional: 20 demo physicians + demo sites
npm run dev                 # http://localhost:3000
```

A fresh install starts with one location ("Main Hospital") and four shift
types. Change them under **Settings**.

## Upgrading from the June 2026 version

The `20261031000000_generic_model` migration converts the old fixed setup
without losing data:

- "Main Hospital" plus any of Sparrow Carson / Eaton / Clinton that were in
  use become locations (rename them in Settings).
- Rounder / Day Admitting / Night Admit 1 / Night Admit 2 become shift types,
  with slot counts taken from the most recently scheduled month.
- Each month's saved coverage counts become that month's overrides.
- Every existing assignment, lock and eligibility flag is kept.

It runs inside one transaction: it either fully applies or changes nothing.
On Railway it runs automatically at start-up (`npm start`).

## Tests

```bash
npm test                    # engine, rules, holidays, every month 2026–2076
npm run test:integration    # service layer against a real database*
./scripts/test-legacy-upgrade.sh   # upgrade a pre-generic database*
```

\* Needs `DATABASE_URL` pointing at an empty, disposable database (the
integration tests delete everything in it). CI runs all three plus typecheck,
lint and build on every push.

The tests include an independent rule checker that re-verifies every hard
rule on generated schedules, so a scheduler change that breaks a rule fails.

## Deployment (Railway)

1. Create a Railway project with the **PostgreSQL** plugin.
2. Create a service from this repo; Railway injects `DATABASE_URL`.
3. Build: `npm run build`. Start: `npm start` (applies migrations, then starts).

| Variable       | Required | Description                            |
| -------------- | -------- | -------------------------------------- |
| `DATABASE_URL` | yes      | PostgreSQL connection string.          |
| `PORT`         | no       | Port for `next start` (default 3000).  |

## Long-term maintenance

- Nothing in the app is tied to a particular year: dates are computed, and
  the tests generate every month from 2026 through 2076.
- No web app runs for decades untouched. Plan to update Node.js, Next.js,
  Prisma and Postgres to supported versions every year or two; the test suite
  is there to confirm nothing broke.
- Past schedules store a snapshot of shift and location names, so editing or
  deleting shift types later never rewrites history.

## API

| Method            | Route                                  | Purpose                                    |
| ----------------- | -------------------------------------- | ------------------------------------------ |
| GET               | `/api/config`                          | Settings, locations, shift types, holidays |
| PUT               | `/api/settings`                        | Update rules and holiday options           |
| POST              | `/api/locations`                       | Add a location                             |
| PUT, DELETE       | `/api/locations/[id]`                  | Edit / delete a location                   |
| POST              | `/api/shift-templates`                 | Add a shift type                           |
| PUT, DELETE       | `/api/shift-templates/[id]`            | Edit / delete a shift type                 |
| GET, POST         | `/api/holidays`                        | Holidays for a year / add a custom one     |
| DELETE            | `/api/holidays/[id]`                   | Remove a custom holiday                    |
| GET, POST         | `/api/physicians`                      | List / create physicians                   |
| PUT, DELETE       | `/api/physicians/[id]`                 | Update / delete a physician                |
| GET, POST, DELETE | `/api/physicians/[id]/time-off`        | Time-off requests                          |
| POST              | `/api/physicians/[id]/reset-ics`       | New calendar feed URL                      |
| GET               | `/api/ics/[token]`                     | Personal calendar feed                     |
| POST              | `/api/schedule/generate`               | Generate a month (optional overrides)      |
| GET               | `/api/schedule/[year]/[month]`         | Read a month                               |
| PATCH             | `/api/assignments/[id]`                | Change / lock / clear a slot               |
| POST              | `/api/schedule/swap`                   | Swap two slots (rule-checked)              |
| POST              | `/api/schedule/unlock-all`             | Unlock a month                             |
| GET               | `/api/export/csv`, `/api/export/xlsx`  | Download a month                           |
| POST              | `/api/seed`, `/api/clear-all`          | Demo data / wipe physicians and schedules  |
