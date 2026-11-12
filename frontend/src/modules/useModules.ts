import { useEffect, useState } from "react";
import api from "../api";
import type { ModuleInfo } from "./contract";

// Lista de módulos ativos que o usuário pode ver. Guardada fora do React para
// o menu e a tela do módulo não buscarem duas vezes; renovada a cada minuto
// porque um módulo pode ser ligado/desligado com o painel aberto.
let cache: ModuleInfo[] | null = null;
let inflight: Promise<ModuleInfo[]> | null = null;
let fetchedAt = 0;
const listeners = new Set<(m: ModuleInfo[]) => void>();
const TTL_MS = 60_000;

const load = (force = false): Promise<ModuleInfo[]> => {
  if (!force && cache && Date.now() - fetchedAt < TTL_MS) return Promise.resolve(cache);
  if (inflight) return inflight;
  // O token vai explícito: o menu monta antes do PbxProvider configurar o axios.
  const token = localStorage.getItem("token");
  let ok = true;
  inflight = api
    .get<{ modules: ModuleInfo[] }>("/modules", token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    .then((res) => res.data.modules || [])
    // Núcleo sem a rota (versão antiga) ou erro de rede: painel segue sem módulos
    // e tenta de novo na próxima renovação.
    .catch(() => {
      ok = false;
      return cache ?? [];
    })
    .then((modules) => {
      cache = modules;
      if (ok) fetchedAt = Date.now();
      listeners.forEach((fn) => fn(modules));
      return modules;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export const useModules = (): { modules: ModuleInfo[]; loaded: boolean } => {
  const [modules, setModules] = useState<ModuleInfo[]>(cache ?? []);
  const [loaded, setLoaded] = useState<boolean>(cache !== null);

  useEffect(() => {
    const onChange = (m: ModuleInfo[]) => {
      setModules(m);
      setLoaded(true);
    };
    listeners.add(onChange);
    load().then(onChange);
    const timer = setInterval(() => load(true), TTL_MS);
    return () => {
      listeners.delete(onChange);
      clearInterval(timer);
    };
  }, []);

  return { modules, loaded };
};
