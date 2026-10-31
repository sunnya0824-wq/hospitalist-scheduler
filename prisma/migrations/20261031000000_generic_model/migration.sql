-- Generic model: configurable locations, shift templates, rules and holidays.
-- Converts the fixed MAIN/CARSON/EATON/CLINTON + ROUNDER/ADMIN/NIGHT setup
-- into rows, preserving every existing assignment, eligibility flag and
-- per-month coverage count.
--
-- Runs as one transaction: it either fully applies or changes nothing.

BEGIN;

-- 1. New types and tables ---------------------------------------------------

CREATE TYPE "ShiftCategory" AS ENUM ('DAY', 'ADMIT', 'NIGHT');

CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "organizationName" TEXT NOT NULL DEFAULT 'Hospitalist Group',
    "restDaysAfterNights" INTEGER NOT NULL DEFAULT 2,
    "preferredNightBlock" INTEGER NOT NULL DEFAULT 3,
    "weekendDays" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],
    "observeUSFederalHolidays" BOOLEAN NOT NULL DEFAULT true,
    "includeObservedHolidays" BOOLEAN NOT NULL DEFAULT true,
    "disabledHolidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openToAll" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "ShiftCategory" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "dailyCounts" INTEGER[] DEFAULT ARRAY[1, 1, 1, 1, 1, 1, 1]::INTEGER[],
    "holidayCount" INTEGER,
    "color" TEXT NOT NULL DEFAULT 'cyan',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShiftTemplate_locationId_idx" ON "ShiftTemplate"("locationId");
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PhysicianLocation" (
    "physicianId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "PhysicianLocation_pkey" PRIMARY KEY ("physicianId","locationId")
);
CREATE INDEX "PhysicianLocation_locationId_idx" ON "PhysicianLocation"("locationId");
ALTER TABLE "PhysicianLocation" ADD CONSTRAINT "PhysicianLocation_physicianId_fkey" FOREIGN KEY ("physicianId") REFERENCES "Physician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhysicianLocation" ADD CONSTRAINT "PhysicianLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

ALTER TABLE "Physician" ADD COLUMN "maxConsecutiveNights" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Physician" ADD COLUMN "preferredNightBlock" INTEGER;

-- 2. Seed settings and the starter configuration ----------------------------

INSERT INTO "Settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);

-- Main location always exists (it was implicit before). The three community
-- sites are only carried over when something actually uses them, so a fresh
-- install starts clean.
INSERT INTO "Location" ("id", "name", "code", "sortOrder", "openToAll", "updatedAt")
VALUES ('loc_main', 'Main Hospital', 'MAIN', 0, true, CURRENT_TIMESTAMP);

INSERT INTO "Location" ("id", "name", "code", "sortOrder", "openToAll", "updatedAt")
SELECT v.id, v.name, v.code, v.sort, false, CURRENT_TIMESTAMP
FROM (VALUES
    ('loc_carson',  'Sparrow Carson',  'CA', 1, 'CARSON'),
    ('loc_eaton',   'Sparrow Eaton',   'EA', 2, 'EATON'),
    ('loc_clinton', 'Sparrow Clinton', 'CL', 3, 'CLINTON')
) AS v(id, name, code, sort, hosp)
WHERE
    (v.hosp = 'CARSON'  AND (EXISTS (SELECT 1 FROM "Physician" WHERE "canWorkCarson")  OR EXISTS (SELECT 1 FROM "ScheduleMonth" WHERE "carsonRounderCount"  > 0)))
 OR (v.hosp = 'EATON'   AND (EXISTS (SELECT 1 FROM "Physician" WHERE "canWorkEaton")   OR EXISTS (SELECT 1 FROM "ScheduleMonth" WHERE "eatonRounderCount"   > 0)))
 OR (v.hosp = 'CLINTON' AND (EXISTS (SELECT 1 FROM "Physician" WHERE "canWorkClinton") OR EXISTS (SELECT 1 FROM "ScheduleMonth" WHERE "clintonRounderCount" > 0)))
 OR EXISTS (SELECT 1 FROM "ShiftAssignment" sa WHERE sa."hospital"::text = v.hosp);

-- Template default counts come from the most recently scheduled month, so
-- next month's schedule looks like the last one. Falls back to 10/1/1/1/0.
CREATE TEMP TABLE "_latest" AS
SELECT
    COALESCE((SELECT "rounderCount"        FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 10) AS r,
    COALESCE((SELECT "dayAdmitCount"       FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 1)  AS a,
    COALESCE((SELECT "nightAdmit1Count"    FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 1)  AS n1,
    COALESCE((SELECT "nightAdmit2Count"    FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 1)  AS n2,
    COALESCE((SELECT "carsonRounderCount"  FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 0)  AS ca,
    COALESCE((SELECT "eatonRounderCount"   FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 0)  AS ea,
    COALESCE((SELECT "clintonRounderCount" FROM "ScheduleMonth" ORDER BY "year" DESC, "month" DESC LIMIT 1), 0)  AS cl;

INSERT INTO "ShiftTemplate" ("id", "locationId", "name", "code", "category", "startTime", "endTime", "dailyCounts", "color", "sortOrder", "updatedAt")
SELECT 'tpl_main_rounder', 'loc_main', 'Rounder', 'R', 'DAY'::"ShiftCategory", '07:00', '17:00', array_fill(r, ARRAY[7]), 'cyan', 0, CURRENT_TIMESTAMP FROM "_latest"
UNION ALL
SELECT 'tpl_main_admit', 'loc_main', 'Day Admitting', 'DA', 'ADMIT'::"ShiftCategory", '12:00', '21:00', array_fill(a, ARRAY[7]), 'amber', 1, CURRENT_TIMESTAMP FROM "_latest"
UNION ALL
SELECT 'tpl_main_night1', 'loc_main', 'Night Admit 1', 'N1', 'NIGHT'::"ShiftCategory", '17:00', '05:00', array_fill(n1, ARRAY[7]), 'teal', 2, CURRENT_TIMESTAMP FROM "_latest"
UNION ALL
SELECT 'tpl_main_night2', 'loc_main', 'Night Admit 2', 'N2', 'NIGHT'::"ShiftCategory", '19:00', '07:00', array_fill(n2, ARRAY[7]), 'fuchsia', 3, CURRENT_TIMESTAMP FROM "_latest";

INSERT INTO "ShiftTemplate" ("id", "locationId", "name", "code", "category", "startTime", "endTime", "dailyCounts", "color", "sortOrder", "updatedAt")
SELECT 'tpl_' || substr(l."id", 5) || '_rounder', l."id", 'Rounder', 'R', 'DAY'::"ShiftCategory", '07:00', '17:00',
       array_fill(CASE l."id" WHEN 'loc_carson' THEN t.ca WHEN 'loc_eaton' THEN t.ea ELSE t.cl END, ARRAY[7]),
       'cyan', 0, CURRENT_TIMESTAMP
FROM "Location" l CROSS JOIN "_latest" t
WHERE l."id" IN ('loc_carson', 'loc_eaton', 'loc_clinton');

-- 3. Physician eligibility --------------------------------------------------

INSERT INTO "PhysicianLocation" ("physicianId", "locationId")
SELECT "id", 'loc_carson' FROM "Physician" WHERE "canWorkCarson"
UNION ALL
SELECT "id", 'loc_eaton' FROM "Physician" WHERE "canWorkEaton"
UNION ALL
SELECT "id", 'loc_clinton' FROM "Physician" WHERE "canWorkClinton";

-- 4. Per-month coverage becomes explicit overrides ---------------------------

ALTER TABLE "ScheduleMonth" ADD COLUMN "coverageOverrides" JSONB NOT NULL DEFAULT '{}';

UPDATE "ScheduleMonth" m SET "coverageOverrides" = (
    jsonb_build_object(
        'tpl_main_rounder', m."rounderCount",
        'tpl_main_admit',   m."dayAdmitCount",
        'tpl_main_night1',  m."nightAdmit1Count",
        'tpl_main_night2',  m."nightAdmit2Count"
    )
    || CASE WHEN EXISTS (SELECT 1 FROM "Location" WHERE "id" = 'loc_carson')
            THEN jsonb_build_object('tpl_carson_rounder', m."carsonRounderCount") ELSE '{}'::jsonb END
    || CASE WHEN EXISTS (SELECT 1 FROM "Location" WHERE "id" = 'loc_eaton')
            THEN jsonb_build_object('tpl_eaton_rounder', m."eatonRounderCount") ELSE '{}'::jsonb END
    || CASE WHEN EXISTS (SELECT 1 FROM "Location" WHERE "id" = 'loc_clinton')
            THEN jsonb_build_object('tpl_clinton_rounder', m."clintonRounderCount") ELSE '{}'::jsonb END
);

-- 5. Assignments: map enum columns onto templates + snapshot fields ----------

ALTER TABLE "ShiftAssignment"
    ADD COLUMN "shiftTemplateId" TEXT,
    ADD COLUMN "locationId" TEXT,
    ADD COLUMN "shiftName" TEXT,
    ADD COLUMN "shiftCode" TEXT,
    ADD COLUMN "category" "ShiftCategory",
    ADD COLUMN "locationName" TEXT,
    ADD COLUMN "locationCode" TEXT,
    ADD COLUMN "color" TEXT NOT NULL DEFAULT 'cyan',
    ADD COLUMN "slotIndex" INTEGER NOT NULL DEFAULT 1;

UPDATE "ShiftAssignment" sa SET
    "shiftTemplateId" = CASE
        WHEN sa."hospital" = 'MAIN' THEN CASE sa."shiftType"
            WHEN 'ROUNDER' THEN 'tpl_main_rounder'
            WHEN 'ADMIN' THEN 'tpl_main_admit'
            WHEN 'NIGHT_ADMIT_1' THEN 'tpl_main_night1'
            ELSE 'tpl_main_night2' END
        ELSE 'tpl_' || lower(sa."hospital"::text) || '_rounder' END,
    "locationId" = 'loc_' || lower(sa."hospital"::text),
    "slotIndex" = COALESCE(sa."rounderIndex", 1);

UPDATE "ShiftAssignment" sa SET
    "shiftName" = t."name",
    "shiftCode" = t."code",
    "category" = t."category",
    "color" = t."color",
    "locationName" = l."name",
    "locationCode" = l."code"
FROM "ShiftTemplate" t JOIN "Location" l ON l."id" = t."locationId"
WHERE t."id" = sa."shiftTemplateId";

ALTER TABLE "ShiftAssignment"
    ALTER COLUMN "shiftName" SET NOT NULL,
    ALTER COLUMN "shiftCode" SET NOT NULL,
    ALTER COLUMN "category" SET NOT NULL,
    ALTER COLUMN "locationName" SET NOT NULL,
    ALTER COLUMN "locationCode" SET NOT NULL;

ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ShiftAssignment_physicianId_date_idx" ON "ShiftAssignment"("physicianId", "date");

-- 6. Drop the old fixed columns and enums -----------------------------------

ALTER TABLE "ShiftAssignment" DROP COLUMN "shiftType", DROP COLUMN "hospital", DROP COLUMN "rounderIndex";
ALTER TABLE "ScheduleMonth"
    DROP COLUMN "rounderCount", DROP COLUMN "dayAdmitCount",
    DROP COLUMN "nightAdmit1Count", DROP COLUMN "nightAdmit2Count",
    DROP COLUMN "carsonRounderCount", DROP COLUMN "eatonRounderCount", DROP COLUMN "clintonRounderCount";
ALTER TABLE "Physician" DROP COLUMN "canWorkCarson", DROP COLUMN "canWorkEaton", DROP COLUMN "canWorkClinton";

DROP TYPE "ShiftType";
DROP TYPE "Hospital";
DROP TABLE "_latest";

COMMIT;
