import { describe, it, expect } from "vitest";
import { parseQueueShow } from "./queueShow";

const OUTPUT = `suporte has 2 calls (max unlimited) in 'ringall' strategy (5s holdtime, 30s talktime), W:0, C:10, A:1, SL:0.0%, SL2:0.0% within 0s
   Members:
      SIP/2001 (ringinuse disabled) (dynamic) (Not in use) has taken no calls yet
      SIP/2002 (ringinuse disabled) (In use) has taken 3 calls (last was 20 secs ago)
      SIP/2003 (ringinuse disabled) (paused:Almoço was 60 secs ago) (Not in use) has taken no calls yet
      SIP/2004 (ringinuse disabled) (Unavailable) has taken no calls yet
   Callers:
      1. SIP/efix-00000001 (wait: 0:15, prio: 0)
      2. SIP/efix-00000002 (wait: 1:05, prio: 0)

vendas has 0 calls (max unlimited) in 'rrmemory' strategy (0s holdtime, 0s talktime), W:0, C:0, A:0, SL:0.0% within 0s
   No Members
   No Callers
`.split("\n");

describe("parseQueueShow", () => {
  const [suporte, vendas] = parseQueueShow(OUTPUT);

  it("lê espera, tempo de espera e totais da fila", () => {
    expect(suporte).toMatchObject({
      name: "suporte",
      waiting: 2,
      longestWaitSeconds: 65,
      holdtimeSeconds: 5,
      completed: 10,
      abandoned: 1,
    });
  });

  it("classifica o estado de cada atendente", () => {
    expect(suporte.members.map((m) => m.state)).toEqual(["free", "busy", "paused", "offline"]);
    expect(suporte.members[0].name).toBe("SIP/2001");
  });

  it("fila sem membros nem chamadas", () => {
    expect(vendas).toMatchObject({ name: "vendas", waiting: 0, members: [] });
  });
});
