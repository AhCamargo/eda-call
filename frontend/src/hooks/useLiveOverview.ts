import { useCallback, useEffect, useState } from "react";
import api from "../api";
import { usePbx } from "../context/PbxContext";

export type QueueMemberState = "free" | "busy" | "ringing" | "paused" | "offline";

export interface LiveOverview {
  asteriskOnline: boolean;
  queues: {
    name: string;
    live: boolean;
    waiting: number;
    longestWaitSeconds: number;
    completed: number;
    abandoned: number;
    members: { number: string; name: string | null; state: QueueMemberState }[];
  }[];
  dialerCampaigns: {
    id: number;
    name: string;
    contacts: number;
    called: number;
    answered: number;
  }[];
  uraCampaigns: {
    id: number;
    name: string;
    status: "running" | "paused";
    total: number;
    pending: number;
    calling: number;
    answered: number;
  }[];
}

const POLL_MS = 5000;

// GET /dashboard/live a cada 5s (fila de espera não gera evento próprio) e
// imediatamente a cada evento de ligação/campanha.
export const useLiveOverview = () => {
  const { socket } = usePbx();
  const [data, setData] = useState<LiveOverview | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<LiveOverview>("/dashboard/live");
      setData(res.data);
    } catch {
      /* mantém o último dado — o painel não deve piscar por uma falha */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const events = ["call:update", "dashboard:update", "ura-reverse:campaign-status"];
    events.forEach((e) => socket.on(e, load));
    return () => {
      clearInterval(timer);
      events.forEach((e) => socket.off(e, load));
    };
  }, [load, socket]);

  return data;
};
