CREATE TABLE IF NOT EXISTS "AgentStatusLogs" (
  "id" SERIAL,
  "extensionNumber" VARCHAR(255) NOT NULL,
  "extensionName"   VARCHAR(255) NOT NULL,
  "status"          VARCHAR(50)  NOT NULL,
  "pauseReason"     VARCHAR(255) DEFAULT NULL,
  "startedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
  "endedAt"         TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  "durationSeconds" INTEGER DEFAULT NULL,
  "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
  "extensionId"     INTEGER REFERENCES "Extensions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);
