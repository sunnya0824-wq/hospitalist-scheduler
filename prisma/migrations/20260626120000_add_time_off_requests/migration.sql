-- CreateTable: per-physician time-off requests (date-only, midnight UTC)
CREATE TABLE "TimeOffRequest" (
    "id" TEXT NOT NULL,
    "physicianId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOffRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeOffRequest_physicianId_idx" ON "TimeOffRequest"("physicianId");

-- CreateIndex
CREATE INDEX "TimeOffRequest_date_idx" ON "TimeOffRequest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "TimeOffRequest_physicianId_date_key" ON "TimeOffRequest"("physicianId", "date");

-- AddForeignKey
ALTER TABLE "TimeOffRequest" ADD CONSTRAINT "TimeOffRequest_physicianId_fkey" FOREIGN KEY ("physicianId") REFERENCES "Physician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
