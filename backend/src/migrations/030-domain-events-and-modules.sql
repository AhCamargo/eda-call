-- Fundação dos módulos "Lego": o núcleo publica fatos (uma ligação terminou,
-- uma ligação recebida não foi atendida…) numa fila só de acréscimo, e cada
-- módulo lê a partir do último id que já processou. Nenhum módulo mexe nas
-- tabelas do núcleo: ele só lê esta fila pela API interna.
CREATE TABLE IF NOT EXISTS "DomainEvents" (
  "id"        BIGSERIAL,
  "type"      VARCHAR(100) NOT NULL,
  "payload"   JSONB        NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "domain_events_type_id" ON "DomainEvents" ("type", "id");
CREATE INDEX IF NOT EXISTS "domain_events_created_at" ON "DomainEvents" ("createdAt");

-- Módulos que se apresentaram ao núcleo. Cada módulo se registra ao subir e
-- renova o registro a cada minuto; o painel só mostra os que estão vivos.
CREATE TABLE IF NOT EXISTS "Modules" (
  "id"          VARCHAR(64)  NOT NULL,
  "name"        VARCHAR(255) NOT NULL,
  "version"     VARCHAR(50)  NOT NULL DEFAULT '0.0.0',
  "internalUrl" VARCHAR(255) NOT NULL,
  "manifest"    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "lastSeenAt"  TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY ("id")
);
