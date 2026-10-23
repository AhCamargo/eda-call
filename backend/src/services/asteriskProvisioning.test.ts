import { vi, describe, it, expect, beforeEach } from "vitest";

const { fileStore } = vi.hoisted(() => ({
  fileStore: {} as Record<string, string>,
}));

vi.mock("fs/promises", () => {
  const access = vi.fn(async (path: string) => {
    if (!(path in fileStore)) throw new Error("ENOENT");
  });
  const readFile = vi.fn(async (path: string) => fileStore[path] ?? "");
  const writeFile = vi.fn(async (path: string, content: string) => {
    fileStore[path] = content;
  });
  return { default: { access, readFile, writeFile }, access, readFile, writeFile };
});

const { runCommand } = vi.hoisted(() => ({
  runCommand: vi.fn().mockResolvedValue({}),
}));
vi.mock("../ami", () => ({ runCommand }));

import {
  upsertSipExtension,
  removeExtensionProvision,
  upsertQueue,
  removeQueue,
  upsertInboundIvrDialplan,
  upsertInboundDidRoute,
} from "./asteriskProvisioning";
import config from "../config";

describe("asteriskProvisioning", () => {
  beforeEach(() => {
    for (const key of Object.keys(fileStore)) delete fileStore[key];
    runCommand.mockClear();
  });

  it("writes a new SIP extension block and reloads sip", async () => {
    await upsertSipExtension({ number: "1001", secret: "abc123", context: "default" });

    const written = fileStore[config.asteriskSipCustomFile];
    expect(written).toContain("[1001]");
    expect(written).toContain("secret=abc123");
    expect(written).toContain("context=default");
    expect(written).toContain("; BEGIN EDACALL sip-extension:1001");
    expect(written).toContain("; END EDACALL sip-extension:1001");
    expect(runCommand).toHaveBeenCalledWith("sip reload");
  });

  it("replaces an existing extension block without touching unrelated content", async () => {
    fileStore[config.asteriskSipCustomFile] =
      "; BEGIN EDACALL sip-extension:2002\n[2002]\nsecret=other\n; END EDACALL sip-extension:2002\n";

    await upsertSipExtension({ number: "1001", secret: "first", context: "default" });
    await upsertSipExtension({ number: "1001", secret: "second", context: "default" });

    const written = fileStore[config.asteriskSipCustomFile];
    expect(written.match(/\[1001\]/g)).toHaveLength(1);
    expect(written).toContain("secret=second");
    expect(written).not.toContain("secret=first");
    expect(written).toContain("[2002]");
    expect(written).toContain("secret=other");
  });

  it("removes an extension block and leaves surrounding content intact", async () => {
    await upsertSipExtension({ number: "1001", secret: "abc123", context: "default" });
    await upsertSipExtension({ number: "2002", secret: "def456", context: "default" });

    await removeExtensionProvision({ number: "1001" });

    const written = fileStore[config.asteriskSipCustomFile];
    expect(written).not.toContain("[1001]");
    expect(written).toContain("[2002]");
    expect(written).toContain("secret=def456");
  });

  it("writes a queue block with members and a shared [general] header", async () => {
    await upsertQueue({
      name: "suporte",
      strategy: "rrmemory",
      members: [
        { extensionNumber: "1001", penalty: 0 },
        { extensionNumber: "1002", penalty: 1 },
      ],
    });

    const written = fileStore[config.asteriskQueuesCustomFile];
    expect(written).toContain("[general]");
    expect(written).toContain("[suporte]");
    expect(written).toContain("strategy=rrmemory");
    expect(written).toContain("member => SIP/1001,0");
    expect(written).toContain("member => SIP/1002,1");
    expect(runCommand).toHaveBeenCalledWith("queue reload all");
  });

  it("removes a queue block", async () => {
    await upsertQueue({ name: "suporte", members: [] });
    await upsertQueue({ name: "vendas", members: [] });

    await removeQueue({ name: "suporte" });

    const written = fileStore[config.asteriskQueuesCustomFile];
    expect(written).not.toContain("[suporte]");
    expect(written).toContain("[vendas]");
  });

  describe("ligações recebidas são gravadas", () => {
    const baseIvr = {
      contextName: "central-principal",
      name: "Central principal",
      digitTimeoutSeconds: 5,
      maxInvalidAttempts: 3,
      fallbackExtension: "2001",
      fallbackLabel: "Recepção",
      dialTechnology: "SIP",
      options: [
        { keyDigit: "1", label: "Vendas", actionType: "transfer_extension", targetExtension: "2002" },
        { keyDigit: "2", label: "Suporte", actionType: "transfer_queue", targetExtension: "suporte" },
        { keyDigit: "9", label: "Sair", actionType: "hangup", targetExtension: null },
      ],
    };

    it("grava antes de transferir para ramal, fila e destino padrão", async () => {
      await upsertInboundIvrDialplan(baseIvr);
      const plan = fileStore[config.asteriskExtensionsCustomFile];

      const branch = (exten: string) =>
        plan.slice(plan.indexOf(`exten => ${exten},1`)).split("\n\n")[0];

      for (const [exten, dest, dial] of [
        ["1", "2002", "Dial(SIP/2002"],
        ["2", "suporte", "Queue(suporte"],
        ["transbordo", "2001", "Dial(SIP/2001"],
      ]) {
        const b = branch(exten);
        expect(b).toContain(`-\${CALLERID(num)}-${dest}.wav)`);
        expect(b.indexOf("MixMonitor(${RECFILE},b)")).toBeGreaterThan(-1);
        expect(b.indexOf("MixMonitor")).toBeLessThan(b.indexOf(dial));
      }
      expect(branch("9")).not.toContain("MixMonitor");
    });

    it("roteamento de entrada para ramal grava; para a central não duplica", async () => {
      await upsertInboundDidRoute({ did: "4431425388", destinationType: "extension", destinationTarget: "2002" });
      await upsertInboundDidRoute({ did: "4430000000", destinationType: "ivr", destinationTarget: "central-principal" });
      const routes = fileStore[config.asteriskInboundRoutesFile];
      const block = (did: string) => routes.slice(routes.indexOf(`exten => ${did},1`)).split("; END")[0];
      expect(block("4431425388")).toContain("MixMonitor(${RECFILE},b)");
      expect(block("4430000000")).not.toContain("MixMonitor");
    });

    it("recusa horário de atendimento que tentaria injetar dialplan", async () => {
      await expect(
        upsertInboundIvrDialplan({
          ...baseIvr,
          scheduleEnabled: true,
          scheduleJson: JSON.stringify([
            { days: "mon-fri,*,*?x)\nexten => s,1,System(rm -rf /)", open: "08:00", close: "18:00" },
          ]),
        }),
      ).rejects.toThrow(/Horário de atendimento inválido/);
    });

    it("aceita horário válido", async () => {
      await upsertInboundIvrDialplan({
        ...baseIvr,
        scheduleEnabled: true,
        scheduleJson: JSON.stringify([{ days: "mon-fri", open: "08:00", close: "18:00" }]),
      });
      expect(fileStore[config.asteriskExtensionsCustomFile]).toContain(
        "GotoIfTime(08:00-18:00,mon-fri,*,*?horario_aberto)",
      );
    });
  });
});
