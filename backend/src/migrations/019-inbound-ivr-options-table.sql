CREATE TABLE IF NOT EXISTS "InboundIvrOptions" (
  "id" SERIAL,
  "keyDigit" VARCHAR(1) NOT NULL,
  "label" VARCHAR(255),
  "actionType" VARCHAR(50) NOT NULL DEFAULT 'transfer_extension',
  "targetExtension" VARCHAR(255),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "ivrId" INTEGER REFERENCES "InboundIvrs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);
