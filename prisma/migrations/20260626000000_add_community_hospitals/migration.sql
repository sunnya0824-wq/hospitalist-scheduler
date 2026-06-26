-- CreateEnum
CREATE TYPE "Hospital" AS ENUM ('MAIN', 'CARSON', 'EATON', 'CLINTON');

-- AlterTable: per-physician community-hospital eligibility flags
ALTER TABLE "Physician" ADD COLUMN "canWorkCarson" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "canWorkEaton" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Physician" ADD COLUMN "canWorkClinton" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: per-month community-hospital rounder counts
ALTER TABLE "ScheduleMonth" ADD COLUMN "carsonRounderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScheduleMonth" ADD COLUMN "eatonRounderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScheduleMonth" ADD COLUMN "clintonRounderCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: tag each assignment with its hospital (existing rows -> MAIN)
ALTER TABLE "ShiftAssignment" ADD COLUMN "hospital" "Hospital" NOT NULL DEFAULT 'MAIN';
