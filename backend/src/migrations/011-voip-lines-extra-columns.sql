DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='inboundContext') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "inboundContext" VARCHAR(255) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='transport') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "transport" VARCHAR(255) NOT NULL DEFAULT 'transport-udp';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='type') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "type" VARCHAR(50) NOT NULL DEFAULT 'peer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='dtmfmode') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "dtmfmode" VARCHAR(255) NOT NULL DEFAULT 'rfc2833';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='fromdomain') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "fromdomain" VARCHAR(255) DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='codecs') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "codecs" VARCHAR(255) NOT NULL DEFAULT 'ulaw,alaw';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='callLimit') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "callLimit" INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='insecure') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "insecure" VARCHAR(255) DEFAULT 'invite,port';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='VoipLines' AND column_name='register') THEN
    ALTER TABLE "VoipLines" ADD COLUMN "register" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
