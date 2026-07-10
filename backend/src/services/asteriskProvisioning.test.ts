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
});
