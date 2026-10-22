-- Permite revogar JWTs já emitidos sem esperar a expiração natural (8h).
-- Incrementado ao trocar senha, mudar papel ou (implicitamente, pela
-- ausência da linha) deletar um usuário. verifyToken compara a versão do
-- token com a atual no banco. Ver achado R3 da auditoria de segurança.
ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
