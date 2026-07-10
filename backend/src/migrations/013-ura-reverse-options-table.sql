CREATE TABLE IF NOT EXISTS "UraReverseOptions" (
  "id" SERIAL,
  "keyDigit" VARCHAR(1) NOT NULL,
  "actionType" VARCHAR(50) NOT NULL DEFAULT 'hangup',
  "targetExtension" VARCHAR(255),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "campaignId" INTEGER REFERENCES "UraReverseCampaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);
