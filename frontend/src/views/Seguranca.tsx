import { useEffect, useState } from "react";
import api from "../api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  ShieldAlert,
  RefreshCw,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Ban,
  AlertTriangle,
} from "lucide-react";

interface BanStats {
  currentBanned: number;
  totalBanned: number;
  currentFailed: number;
  totalFailed: number;
}

interface Feedback {
  msg: string;
  type: "ok" | "error";
}

export default function Seguranca() {
  const [ips, setIps] = useState<string[]>([]);
  const [stats, setStats] = useState<BanStats | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState(false);

  const showFeedback = (msg: string, type: "ok" | "error" = "ok") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/security/banned-ips");
      setIps(res.data.ips || []);
      setStats(res.data.stats || null);
      setUnavailable(!!res.data.unavailable);
    } catch {
      showFeedback("Erro ao carregar dados do fail2ban.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUnban = async () => {
    if (!unbanTarget) return;
    setUnbanning(true);
    try {
      await api.delete(`/security/banned-ips/${unbanTarget}`);
      setUnbanTarget(null);
      showFeedback(`IP ${unbanTarget} desbanido com sucesso.`);
      load();
    } catch (e: any) {
      showFeedback(
        e?.response?.data?.message || "Erro ao desbanir IP.",
        "error",
      );
    } finally {
      setUnbanning(false);
    }
  };

  return (
    <div className="space-y-4 text-zinc-100 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-red-400" />
          <h1 className="text-2xl font-bold tracking-tight">Segurança SIP</h1>
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

      {/* Feedback */}
      {feedback && (
        <Alert
          className={`border ${feedback.type === "error" ? "border-red-500/40 bg-red-500/10" : "border-green-500/40 bg-green-500/10"}`}
        >
          {feedback.type === "error" ? (
            <AlertCircle size={15} className="text-red-400" />
          ) : (
            <CheckCircle2 size={15} className="text-green-400" />
          )}
          <AlertDescription
            className={
              feedback.type === "error" ? "text-red-300" : "text-green-300"
            }
          >
            {feedback.msg}
          </AlertDescription>
        </Alert>
      )}

      {/* fail2ban indisponível */}
      {unavailable && (
        <Alert className="border-yellow-500/40 bg-yellow-500/10">
          <AlertTriangle size={15} className="text-yellow-400" />
          <AlertDescription className="text-yellow-300">
            fail2ban não está disponível neste ambiente. Em produção, certifique-se
            de que o socket <code className="text-xs">/var/run/fail2ban/fail2ban.sock</code> está montado no container.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Banidos agora"
            value={stats.currentBanned}
            color="#ef4444"
          />
          <StatCard
            label="Total banidos"
            value={stats.totalBanned}
            color="#f97316"
          />
          <StatCard
            label="Falhas agora"
            value={stats.currentFailed}
            color="#facc15"
          />
          <StatCard
            label="Total de falhas"
            value={stats.totalFailed}
            color="#94a3b8"
          />
        </div>
      )}

      {/* Tabela de IPs banidos */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Ban size={14} className="text-red-400" />
            {loading
              ? "Carregando..."
              : `${ips.length} IP${ips.length !== 1 ? "s" : ""} banido${ips.length !== 1 ? "s" : ""} atualmente`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Endereço IP</TableHead>
                <TableHead className="text-zinc-400">Motivo</TableHead>
                <TableHead className="text-zinc-400 text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow className="border-zinc-800">
                  <TableCell
                    colSpan={3}
                    className="text-center text-zinc-500 py-10"
                  >
                    <RefreshCw size={16} className="animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && ips.length === 0 && (
                <TableRow className="border-zinc-800">
                  <TableCell
                    colSpan={3}
                    className="text-center text-zinc-500 py-10"
                  >
                    {unavailable
                      ? "fail2ban indisponível neste ambiente."
                      : "Nenhum IP banido no momento."}
                  </TableCell>
                </TableRow>
              )}
              {ips.map((ip) => (
                <TableRow
                  key={ip}
                  className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                >
                  <TableCell>
                    <code className="text-sm font-mono text-red-300">{ip}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-red-500/30 text-red-400"
                    >
                      Ataque SIP
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs text-zinc-400 hover:text-green-400 hover:bg-green-500/10"
                      onClick={() => setUnbanTarget(ip)}
                    >
                      <Unlock size={12} />
                      Desbanir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de unban */}
      <Dialog
        open={!!unbanTarget}
        onOpenChange={(o) => !o && setUnbanTarget(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <Unlock size={18} /> Desbanir IP
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              O IP voltará a conseguir se conectar ao servidor SIP.
            </DialogDescription>
          </DialogHeader>
          {unbanTarget && (
            <div className="bg-zinc-800 rounded-lg p-3 my-1">
              <code className="text-sm font-mono text-red-300">
                {unbanTarget}
              </code>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-400"
              onClick={() => setUnbanTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUnban}
              disabled={unbanning}
              className="gap-2 bg-green-700 hover:bg-green-600 text-white"
            >
              {unbanning && <RefreshCw size={13} className="animate-spin" />}
              Confirmar Desbano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="px-4 py-3">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className="text-2xl font-bold" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
