CREATE TABLE IF NOT EXISTS "InboundRoutes" (
  "id" SERIAL,
  "did" VARCHAR(255) NOT NULL UNIQUE,
  "description" VARCHAR(255) DEFAULT NULL,
  "destinationType" VARCHAR(50) NOT NULL DEFAULT 'extension',
  "destinationTarget" VARCHAR(255) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY ("id")
);
