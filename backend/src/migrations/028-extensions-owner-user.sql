-- Vínculo opcional ramal -> usuário dono. Ramais sem dono continuam livres
-- para hot-desking (qualquer usuário autenticado pode usá-los); ramais com
-- dono só liberam credenciais WebRTC para o próprio dono ou para
-- admin/supervisor. Ver achado F1 da auditoria de segurança.
ALTER TABLE "Extensions"
  ADD COLUMN IF NOT EXISTS "ownerUserId" INTEGER
    REFERENCES "Users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_extensions_owner_user"
  ON "Extensions" ("ownerUserId");
