// Matriz papel × endpoint: garante que requireAdmin/requireSupervisor
// continuam aplicados nos routers sensíveis blindados na rodada 1 da
// auditoria de segurança (achado R5 — antes desta suíte, uma regressão
// como remover `router.use(requireSupervisor)` só seria descoberta
// manualmente ou por um cliente explorando a falha).
//
// `verifyToken` é mockado como passthrough: sua própria lógica (JWT +
// tokenVersion) já é coberta por auth.test.ts. Aqui o interesse é só o
// gate de papel, então cada request injeta `req.user` diretamente,
// simulando o que verifyToken já teria feito antes do router ser montado
// (como acontece de fato em routes.ts).
import "express-async-errors"; // sem isso, um throw dentro de um handler async vira unhandled rejection e a request nunca responde (timeout no supertest)
import { vi, describe, it, expect } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import type { Server } from "socket.io";

type Role = "admin" | "supervisor" | "agent";

// agentReports.router.ts importa "../logger", que tenta criar um diretório
// de log rotativo no filesystem ao ser importado — indesejável (e às vezes
// impossível, ex.: filesystem read-only) num ambiente de teste.
vi.mock("../logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middleware/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth")>();
  return { ...actual, verifyToken: (_req: Request, _res: Response, next: NextFunction) => next() };
});

// Qualquer model/valor lido de "../db" (Model.findAll, sequelize.query, etc.)
// vira uma função que resolve com um valor "vazio" plausível — suficiente
// para os handlers GET/list não explodirem antes de chegar ao teste, sem
// precisar listar os ~20 models usados pelos routers cobertos aqui.
// Vem dentro de vi.hoisted() porque a fábrica de vi.mock() é hoisted para o
// topo do arquivo — declarações `const` normais ainda não existiriam nesse
// ponto.
const { alwaysPresentProxy, emptyResultFor } = vi.hoisted(() => {
  // Instância "fake" de model: cobre o padrão comum `instance.toJSON()` /
  // `instance.save()` usado pelos handlers, sem precisar imitar o Sequelize
  // de verdade.
  const fakeInstance = (): any => {
    const self: any = {};
    self.toJSON = () => self;
    self.save = async () => self;
    self.destroy = async () => undefined;
    self.update = async () => self;
    return self;
  };
  const emptyResultFor = (method: string) => {
    if (["findByPk", "findOne", "create"].includes(method)) return async () => fakeInstance();
    if (method === "findAndCountAll") return async () => ({ rows: [], count: 0 });
    if (method === "count") return async () => 0;
    if (["bulkCreate", "update", "destroy", "save"].includes(method)) return async () => [];
    return async () => [];
  };
  // Proxy "sempre presente": qualquer named export lido de "../db" (um
  // model Sequelize) vira, por sua vez, um proxy cujos métodos (findAll,
  // findByPk, etc.) resolvem com um valor vazio plausível. `has`/`ownKeys`
  // são necessários para o interop de ESM do Vitest reconhecer as
  // propriedades como "exportadas" — sem eles, `import { X } from "../db"`
  // falha mesmo com o `get` implementado.
  const alwaysPresentProxy = (getValue: (prop: string) => unknown) =>
    new Proxy(
      {},
      {
        get: (_t, prop: string) => getValue(prop),
        has: () => true,
        ownKeys: () => ["default"],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      },
    );
  return { alwaysPresentProxy, emptyResultFor };
});

vi.mock("../db", () => {
  const modelProxy = alwaysPresentProxy(emptyResultFor);
  return alwaysPresentProxy(() => modelProxy);
});

import { createExtensionsRouter } from "../routers/extensions.router";
import { createVoipLinesRouter } from "../routers/voipLines.router";
import { createAuthRouter } from "../routers/auth.router";
import { createSoundsRouter } from "../routers/sounds.router";
import { createCampaignsRouter } from "../routers/campaigns.router";
import { createQueuesRouter } from "../routers/queues.router";
import { createAgentReportsRouter } from "../routers/agentReports.router";
import { createReportsRouter } from "../routers/reports.router";
import { createRecordingsRouter } from "../routers/recordings.router";
import { createInboundIvrRouter } from "../routers/inboundIvr.router";
import { createInboundRoutesRouter } from "../routers/inboundRoutes.router";
import { createUraReverseRouter } from "../routers/uraReverse.router";

const fakeIo = { emit: vi.fn() } as unknown as Server;

const withRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
  req.user = { id: 1, role, username: `test-${role}` };
  next();
};

const buildApp = (router: express.Router, role: Role) => {
  const app = express();
  app.use(express.json());
  app.use(withRole(role));
  app.use(router);
  app.use((_req: Request, res: Response) => res.status(404).json({ message: "not found" }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err?.status || 500).json({ message: err?.message || "error" });
  });
  return app;
};

describe("matriz de autorização por papel (achados F1/F2/F3/F5/F6 da rodada 1)", () => {
  const cases: {
    name: string;
    method: "get" | "post" | "delete";
    path: string;
    adminOnly: boolean;
    buildRouter: () => express.Router;
  }[] = [
    {
      name: "POST /extensions (requireAdmin)",
      method: "post",
      path: "/extensions",
      adminOnly: true,
      buildRouter: () => createExtensionsRouter(fakeIo),
    },
    {
      name: "POST /voip-lines (requireAdmin)",
      method: "post",
      path: "/voip-lines",
      adminOnly: true,
      buildRouter: () => createVoipLinesRouter(),
    },
    {
      name: "POST /users (requireAdmin)",
      method: "post",
      path: "/users",
      adminOnly: true,
      buildRouter: () => createAuthRouter(),
    },
    {
      name: "GET /sounds (requireAdmin)",
      method: "get",
      path: "/sounds",
      adminOnly: true,
      buildRouter: () => createSoundsRouter(),
    },
    {
      name: "GET /campaigns (requireSupervisor)",
      method: "get",
      path: "/campaigns",
      adminOnly: false,
      buildRouter: () => createCampaignsRouter(fakeIo),
    },
    {
      name: "DELETE /campaigns/:id/contacts (requireSupervisor)",
      method: "delete",
      path: "/campaigns/1/contacts",
      adminOnly: false,
      buildRouter: () => createCampaignsRouter(fakeIo),
    },
    {
      name: "GET /queues (requireSupervisor)",
      method: "get",
      path: "/queues",
      adminOnly: false,
      buildRouter: () => createQueuesRouter(),
    },
    {
      name: "GET /agent-reports (requireSupervisor)",
      method: "get",
      path: "/agent-reports",
      adminOnly: false,
      buildRouter: () => createAgentReportsRouter(),
    },
    {
      name: "GET /reports/recordings (requireSupervisor)",
      method: "get",
      path: "/reports/recordings",
      adminOnly: false,
      buildRouter: () => createReportsRouter(),
    },
    {
      name: "GET /recordings/:filename (requireSupervisor no router)",
      method: "get",
      path: "/recordings/test.wav",
      adminOnly: false,
      buildRouter: () => createRecordingsRouter(),
    },
    {
      name: "GET /inbound-ivr (requireSupervisor)",
      method: "get",
      path: "/inbound-ivr",
      adminOnly: false,
      buildRouter: () => createInboundIvrRouter(),
    },
    {
      name: "GET /inbound-routes (requireSupervisor)",
      method: "get",
      path: "/inbound-routes",
      adminOnly: false,
      buildRouter: () => createInboundRoutesRouter(),
    },
    {
      name: "GET /ura-reverse/campaigns (requireSupervisor)",
      method: "get",
      path: "/ura-reverse/campaigns",
      adminOnly: false,
      buildRouter: () => createUraReverseRouter(fakeIo),
    },
  ];

  for (const { name, method, path, adminOnly, buildRouter } of cases) {
    it(`${name}: agente recebe 403`, async () => {
      const app = buildApp(buildRouter(), "agent");
      const res = await request(app)[method](path);
      expect(res.status).toBe(403);
    });

    if (adminOnly) {
      it(`${name}: supervisor recebe 403 (é admin-only)`, async () => {
        const app = buildApp(buildRouter(), "supervisor");
        const res = await request(app)[method](path);
        expect(res.status).toBe(403);
      });
    } else {
      it(`${name}: supervisor não recebe 403`, async () => {
        const app = buildApp(buildRouter(), "supervisor");
        const res = await request(app)[method](path);
        expect(res.status).not.toBe(403);
      });
    }

    it(`${name}: admin não recebe 403`, async () => {
      const app = buildApp(buildRouter(), "admin");
      const res = await request(app)[method](path);
      expect(res.status).not.toBe(403);
    });
  }
});
