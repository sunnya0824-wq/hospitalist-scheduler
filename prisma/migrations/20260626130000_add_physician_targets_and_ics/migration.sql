-- Per-physician workload targets, consecutive-day cap, and ICS calendar token.
ALTER TABLE "Physician" ADD COLUMN "fteMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1.0;
ALTER TABLE "Physician" ADD COLUMN "monthlyShiftTarget" INTEGER;
ALTER TABLE "Physician" ADD COLUMN "maxConsecutiveDays" INTEGER NOT NULL DEFAULT 7;

-- icsToken: add nullable, backfill existing rows with a unique value, then enforce.
ALTER TABLE "Physician" ADD COLUMN "icsToken" TEXT;
UPDATE "Physician"
  SET "icsToken" = 'ics_' || md5(random()::text || "id" || clock_timestamp()::text)
  WHERE "icsToken" IS NULL;
ALTER TABLE "Physician" ALTER COLUMN "icsToken" SET NOT NULL;
CREATE UNIQUE INDEX "Physician_icsToken_key" ON "Physician"("icsToken");
