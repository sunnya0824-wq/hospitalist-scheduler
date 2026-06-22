-- AlterTable: per-month adjustable daily coverage slots
ALTER TABLE "ScheduleMonth" ADD COLUMN "rounderCount" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "ScheduleMonth" ADD COLUMN "dayAdmitCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ScheduleMonth" ADD COLUMN "nightAdmit1Count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ScheduleMonth" ADD COLUMN "nightAdmit2Count" INTEGER NOT NULL DEFAULT 1;
