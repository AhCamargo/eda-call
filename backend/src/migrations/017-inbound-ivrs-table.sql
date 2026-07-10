CREATE TABLE IF NOT EXISTS "InboundIvrs" (
  "id" SERIAL,
  "name" VARCHAR(255) NOT NULL,
  "contextName" VARCHAR(255) NOT NULL UNIQUE,
  "voipLineId" INTEGER REFERENCES "VoipLines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "audioFile" VARCHAR(255),
  "digitTimeoutSeconds" INTEGER NOT NULL DEFAULT 5,
  "maxInvalidAttempts" INTEGER NOT NULL DEFAULT 3,
  "fallbackExtension" VARCHAR(255),
  "fallbackLabel" VARCHAR(255) DEFAULT 'Transbordo',
  "dialTechnology" VARCHAR(10) NOT NULL DEFAULT 'SIP',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY ("id")
);
