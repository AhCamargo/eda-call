CREATE TABLE IF NOT EXISTS "UraReverseContacts" (
  "id" SERIAL,
  "phoneNumber" VARCHAR(255) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "selectedOption" VARCHAR(255),
  "recordingPath" VARCHAR(255),
  "lastResult" VARCHAR(255),
  "lastDialedAt" TIMESTAMP WITH TIME ZONE,
  "lockedAt" TIMESTAMP WITH TIME ZONE,
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "campaignId" INTEGER REFERENCES "UraReverseCampaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);
