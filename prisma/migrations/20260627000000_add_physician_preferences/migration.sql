-- Per-physician soft preferences: direction toggles, per-weekday avoid map, and soft monthly caps.
-- All columns are added with defaults so existing rows are backfilled (false / {} / null).
ALTER TABLE "Physician" ADD COLUMN "prefersNights" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "avoidsNights" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "prefersWeekends" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "avoidsWeekends" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "prefersDayAdmit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "avoidsDayAdmit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "avoidWeekdays" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Physician" ADD COLUMN "maxNightsPerMonth" INTEGER;
ALTER TABLE "Physician" ADD COLUMN "maxWeekendsPerMonth" INTEGER;
