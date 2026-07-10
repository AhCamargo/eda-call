DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'campaignId'
  ) THEN
    ALTER TABLE "CallLogs" ADD COLUMN "campaignId" INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'extensionId'
  ) THEN
    ALTER TABLE "CallLogs" ADD COLUMN "extensionId" INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'voipLineId'
  ) THEN
    ALTER TABLE "CallLogs" ADD COLUMN "voipLineId" INTEGER;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'CampaignId'
  ) THEN
    UPDATE "CallLogs" SET "campaignId" = "CampaignId" WHERE "campaignId" IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'ExtensionId'
  ) THEN
    UPDATE "CallLogs" SET "extensionId" = "ExtensionId" WHERE "extensionId" IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CallLogs' AND column_name = 'VoipLineId'
  ) THEN
    UPDATE "CallLogs" SET "voipLineId" = "VoipLineId" WHERE "voipLineId" IS NULL;
  END IF;
END $$;
