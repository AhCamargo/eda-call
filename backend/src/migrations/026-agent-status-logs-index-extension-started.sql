CREATE INDEX IF NOT EXISTS "idx_agent_status_logs_extension_started"
  ON "AgentStatusLogs" ("extensionId", "startedAt");
