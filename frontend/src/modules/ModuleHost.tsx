import { useEffect, useRef, useState, FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { API_BASE } from "../api";
import { usePbx } from "../context/PbxContext";
import { useModules } from "./useModules";
import type { EdaCallModuleContext, EdaCallModuleEntry } from "./contract";

const loadedStyles = new Set<string>();

const ensureStyle = (href: string) => {
  if (loadedStyles.has(href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
  loadedStyles.add(href);
};

// Desenha a tela de um módulo dentro do painel. O código vem do próprio
// container do módulo, servido pelo núcleo em /modules/<id>/ui/.
const ModuleHost: FC = () => {
  const { moduleId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = usePbx();
  const { modules, loaded } = useModules();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const [ready, setReady] = useState<boolean>(false);

  const mod = modules.find((m) => m.id === moduleId);

  useEffect(() => {
    if (!mod || !ref.current || !user) return;
    let cleanup: void | (() => void);
    let cancelled = false;
    const el = ref.current;
    setError("");
    setReady(false);

    const base = `${API_BASE}/modules/${encodeURIComponent(mod.id)}`;
    const version = encodeURIComponent(mod.version);
    if (mod.ui.style) ensureStyle(`${base}/ui/${mod.ui.style}?v=${version}`);

    const ctx: EdaCallModuleContext = {
      apiBase: `${base}/api`,
      token: localStorage.getItem("token") || "",
      user: { id: user.id, username: user.username, role: user.role },
      basePath: `/m/${mod.id}`,
      navigate: (path: string) => navigate(path),
    };

    import(/* @vite-ignore */ `${base}/ui/${mod.ui.entry}?v=${version}`)
      .then((entry: EdaCallModuleEntry) => {
        if (cancelled) return;
        if (typeof entry?.mount !== "function") throw new Error("o módulo não exporta mount()");
        cleanup = entry.mount(el, ctx);
        setReady(true);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "falha ao carregar");
      });

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
      el.innerHTML = "";
    };
  }, [mod?.id, mod?.version, user?.id]);

  if (loaded && !mod) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#a0a7b3]">
        <AlertCircle className="h-4 w-4 text-[#f5b941]" />
        Este módulo não está ativo nesta instalação ou você não tem acesso a ele.
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-[#5a2420] bg-[#2b1311] px-3 py-2 text-sm text-[#ff7a72]">
          <AlertCircle className="h-4 w-4" />
          Não foi possível abrir o módulo {mod?.name}: {error}
        </div>
      )}
      {!ready && !error && (
        <div className="flex items-center gap-2 text-sm text-[#a0a7b3]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando módulo…
        </div>
      )}
      <div ref={ref} />
    </div>
  );
};

export default ModuleHost;
