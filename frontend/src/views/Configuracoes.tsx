import { useEffect, useState } from "react";
import api from "../api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Save, Server, AlertCircle, CheckCircle2, Info } from "lucide-react";

interface ServerSettings {
  serverIp: string;
  apiUrl: string;
}

interface Feedback {
  msg: string;
  type: "ok" | "error";
}

export default function Configuracoes() {
  const [settings, setSettings] = useState<ServerSettings>({ serverIp: "", apiUrl: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const showFeedback = (msg: string, type: "ok" | "error" = "ok") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/settings");
      setSettings(res.data);
    } catch {
      showFeedback("Erro ao carregar configurações.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch("/settings", {
        serverIp: settings.serverIp.trim(),
        apiUrl: settings.apiUrl.trim(),
      });
      setSettings(res.data);
      showFeedback("Configurações salvas. Reinicie o frontend para aplicar a nova URL da API.");
    } catch (e: any) {
      showFeedback(e?.response?.data?.message || "Erro ao salvar configurações.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-zinc-100 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={20} className="text-violet-400" />
          <h1 className="text-2xl font-bold tracking-tight">Configurações do Servidor</h1>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      {feedback && (
        <Alert className={`border ${feedback.type === "error" ? "border-red-500/40 bg-red-500/10" : "border-green-500/40 bg-green-500/10"}`}>
          {feedback.type === "error"
            ? <AlertCircle size={15} className="text-red-400" />
            : <CheckCircle2 size={15} className="text-green-400" />}
          <AlertDescription className={feedback.type === "error" ? "text-red-300" : "text-green-300"}>
            {feedback.msg}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">Rede e SIP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">IP do Servidor</label>
            <input
              value={settings.serverIp}
              onChange={e => setSettings(s => ({ ...s, serverIp: e.target.value }))}
              placeholder="ex: 192.168.1.15"
              className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
            />
            <p className="text-[11px] text-zinc-500">Atualiza o <code>externip</code> do Asterisk e aplica imediatamente (sem reiniciar).</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400">URL da API</label>
            <input
              value={settings.apiUrl}
              onChange={e => setSettings(s => ({ ...s, apiUrl: e.target.value }))}
              placeholder="ex: http://192.168.1.15:5000"
              className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
            />
            <p className="text-[11px] text-zinc-500">Endereço que o navegador usa para acessar a API.</p>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-blue-500/30 bg-blue-500/10">
        <Info size={15} className="text-blue-400" />
        <AlertDescription className="text-blue-300 text-xs">
          Após salvar uma nova URL da API, reinicie o container do frontend para aplicar:
          <code className="block mt-1 text-blue-200 bg-blue-900/30 px-2 py-1 rounded">
            docker compose -f eda-call/docker-compose.prod.yml restart frontend
          </code>
        </AlertDescription>
      </Alert>

      <Button
        onClick={handleSave}
        disabled={saving || loading}
        className="gap-2 bg-violet-700 hover:bg-violet-600 text-white"
      >
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
        Salvar Configurações
      </Button>
    </div>
  );
}
