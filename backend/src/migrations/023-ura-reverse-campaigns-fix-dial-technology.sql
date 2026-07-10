-- Em bancos novos, o enum "dialTechnology" nasce só com 'SIP' (valor único
-- declarado no modelo atual) — comparar a coluna com o literal 'PJSIP'
-- falharia direto ("invalid input value for enum"), não seria um no-op.
-- Só roda o UPDATE se 'PJSIP' de fato existir como valor válido do enum
-- (ou seja, só em bancos antigos que ainda têm esse valor legado).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_UraReverseCampaigns_dialTechnology'
      AND e.enumlabel = 'PJSIP'
  ) THEN
    UPDATE "UraReverseCampaigns" SET "dialTechnology" = 'SIP' WHERE "dialTechnology" = 'PJSIP';
  END IF;
END $$;
