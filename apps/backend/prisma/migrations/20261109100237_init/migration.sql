-- CreateTable
CREATE TABLE "MeetingType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingTypeId" INTEGER NOT NULL,
    "startAt" TEXT NOT NULL,
    "endAt" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TEXT NOT NULL,
    CONSTRAINT "Booking_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MeetingType_name_idx" ON "MeetingType"("name");

-- CreateIndex
CREATE INDEX "Booking_startAt_endAt_idx" ON "Booking"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "Booking_meetingTypeId_idx" ON "Booking"("meetingTypeId");

