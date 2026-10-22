import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListFilter, Phone, Volume2, AlertTriangle } from "lucide-react";
import type { LiveOverview, QueueMemberState } from "../hooks/useLiveOverview";

const MEMBER_DOT: Record<QueueMemberState, { cls: string; label: string }> = {
  free: { cls: "bg-emerald-500", label: "Livre" },
  busy: { cls: "bg-green-400", label: "Em ligação" },
  ringing: { cls: "bg-blue-400", label: "Tocando" },
  paused: { cls: "bg-amber-500", label: "Pausa" },
  offline: { cls: "bg-zinc-600", label: "Offline" },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="w-full bg-zinc-800 rounded-full h-1.5">
        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-zinc-500">
        {value} de {total} ({pct}%)
      </p>
    </div>
  );
}

function Empty({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <p className="text-xs text-zinc-500 py-3">
      {text}{" "}
      <Link to={to} className="text-zinc-300 hover:underline">
        {action}
      </Link>
    </p>
  );
}

// Bloco "Operação agora" do Painel ao vivo: o que está acontecendo em cada
// fila e quais campanhas (discador e URA reversa) estão ligando.
export default function OperacaoAoVivo({ data }: { data: LiveOverview | null }) {
  if (!data) return null;
  const { queues, dialerCampaigns, uraCampaigns, asteriskOnline } = data;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-400">Operação agora</h2>
      {!asteriskOnline && (
        <p className="flex items-center gap-1.5 text-xs text-amber-400">
          <AlertTriangle size={13} /> A central (Asterisk) não respondeu — a situação das
          filas pode estar desatualizada.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Filas */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <ListFilter size={15} className="text-emerald-400" /> Filas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {queues.length === 0 && (
              <Empty text="Nenhuma fila criada." to="/filas" action="Criar fila" />
            )}
            {queues.map((q) => {
              const busy = q.members.filter((m) => m.state === "busy").length;
              const free = q.members.filter((m) => m.state === "free").length;
              return (
                <div key={q.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{q.name}</span>
                    {q.waiting > 0 ? (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/40" variant="outline">
                        {q.waiting} esperando · {mmss(q.longestWaitSeconds)}
                      </Badge>
                    ) : busy > 0 ? (
                      <Badge className="bg-green-500/15 text-green-300 border-green-500/30" variant="outline">
                        Recebendo ligações
                      </Badge>
                    ) : (
                      <span className="text-xs text-zinc-500">Sem ligações</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <div className="flex gap-1">
                      {q.members.map((m) => (
                        <span
                          key={m.number}
                          title={`${m.number}${m.name ? ` — ${m.name}` : ""}: ${MEMBER_DOT[m.state].label}`}
                          className={`h-2.5 w-2.5 rounded-full ${MEMBER_DOT[m.state].cls}`}
                        />
                      ))}
                    </div>
                    {q.members.length === 0 ? (
                      <span className="text-amber-400">Sem atendentes</span>
                    ) : (
                      <span>
                        {busy} em ligação · {free} livre{free === 1 ? "" : "s"}
                      </span>
                    )}
                    {(q.completed > 0 || q.abandoned > 0) && (
                      <span className="ml-auto">
                        {q.completed} atendidas · {q.abandoned} desistiram
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Discador */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Phone size={15} className="text-red-400" /> Discador
              {dialerCampaigns.length > 0 && (
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Ligando
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dialerCampaigns.length === 0 && (
              <Empty text="Nenhuma campanha ligando agora." to="/campanhas/discador" action="Ver campanhas" />
            )}
            {dialerCampaigns.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-xs text-green-400">{c.answered} atendidas</span>
                </div>
                <Progress value={c.called} total={c.contacts} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* URA Reversa */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Volume2 size={15} className="text-green-400" /> URA Reversa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {uraCampaigns.length === 0 && (
              <Empty text="Nenhuma URA reversa ativa." to="/campanhas/ura-reversa" action="Ver campanhas" />
            )}
            {uraCampaigns.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium truncate">{c.name}</span>
                  {c.status === "running" ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      {c.calling > 0 ? `${c.calling} ligando` : "Rodando"}
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400">Pausada</span>
                  )}
                </div>
                <Progress value={c.total - c.pending} total={c.total} />
                <p className="text-[11px] text-green-400">{c.answered} atenderam</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
