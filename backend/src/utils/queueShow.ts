// Interpreta a saída do comando "queue show" do Asterisk (chan_sip).
// Exemplo:
//   suporte has 1 calls (max unlimited) in 'ringall' strategy (5s holdtime, 30s talktime), W:0, C:10, A:1, SL:0.0% within 0s
//      Members:
//         SIP/2001 (ringinuse disabled) (dynamic) (Not in use) has taken no calls yet
//         SIP/2002 (ringinuse disabled) (In use) has taken 3 calls (last was 20 secs ago)
//      Callers:
//         1. SIP/efix-00000001 (wait: 0:15, prio: 0)

export type QueueMemberState = "free" | "busy" | "ringing" | "paused" | "offline";

export interface LiveQueue {
  name: string;
  waiting: number;
  longestWaitSeconds: number;
  holdtimeSeconds: number;
  completed: number;
  abandoned: number;
  members: { name: string; state: QueueMemberState }[];
}

const HEADER = /^(\S+) has (\d+) calls?\b/;

const memberState = (line: string): QueueMemberState => {
  // "paused" vem como "(paused)" ou "(paused:Motivo was 10 secs ago)"
  if (/\(paused/i.test(line)) return "paused";
  if (/\((Unavailable|Invalid)\)/i.test(line)) return "offline";
  if (/\(Ring(ing|\+Inuse)?\)/i.test(line)) return "ringing";
  if (/\((In use|Busy|On Hold)\)/i.test(line)) return "busy";
  return "free";
};

export const parseQueueShow = (lines: string[]): LiveQueue[] => {
  const queues: LiveQueue[] = [];
  let current: LiveQueue | null = null;
  let section: "members" | "callers" | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const header = line.match(HEADER);
    if (header) {
      current = {
        name: header[1],
        waiting: Number(header[2]),
        longestWaitSeconds: 0,
        holdtimeSeconds: Number(line.match(/\((\d+)s holdtime/)?.[1] ?? 0),
        completed: Number(line.match(/\bC:(\d+)/)?.[1] ?? 0),
        abandoned: Number(line.match(/\bA:(\d+)/)?.[1] ?? 0),
        members: [],
      };
      queues.push(current);
      section = null;
      continue;
    }
    if (!current) continue;

    const trimmed = line.trim();
    if (/^Members:/i.test(trimmed)) {
      section = "members";
      continue;
    }
    if (/^Callers:/i.test(trimmed)) {
      section = "callers";
      continue;
    }
    if (/^No (Members|Callers)/i.test(trimmed)) {
      section = null;
      continue;
    }

    if (section === "members" && trimmed) {
      const name = trimmed.split(/\s+/)[0];
      current.members.push({ name, state: memberState(trimmed) });
    } else if (section === "callers") {
      const wait = trimmed.match(/wait:\s*(\d+):(\d+)/);
      if (wait) {
        const seconds = Number(wait[1]) * 60 + Number(wait[2]);
        current.longestWaitSeconds = Math.max(current.longestWaitSeconds, seconds);
      }
    }
  }
  return queues;
};
