CREATE INDEX IF NOT EXISTS "idx_agent_status_logs_open"
  ON "AgentStatusLogs" ("extensionId", "endedAt") WHERE "endedAt" IS NULL;
