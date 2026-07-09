import { useState, useEffect, useCallback, useMemo } from "react";
import api from "../api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, Calendar, RefreshCw, FileSpreadsheet, FileText,
  ChevronDown, ChevronUp, User,
} from "lucide-react";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ── Tipos ──────────────────────────────────────────────────────── */
interface DailyRow {
  extensionId: number;
  extensionNumber: string;
  extensionName: string;
  date: string;
  onlineSeconds: number;
  offlineSeconds: number;
  pausedSeconds: number;
  inCallSeconds: number;
  inCampaignSeconds: number;
  trainingSeconds: number;
  totalTrackedSeconds: number;
}

interface PauseRow {
  pauseReason: string;
  extensionName: string;
  totalSeconds: number;
  occurrences: number;
}

interface AgentSummary {
  extensionId: number;
  extensionNumber: string;
  extensionName: string;
  onlineSeconds: number;
  offlineSeconds: number;
  pausedSeconds: number;
  inCallSeconds: number;
  inCampaignSeconds: number;
  trainingSeconds: number;
  totalTrackedSeconds: number;
  days: DailyRow[];
}

/* ── Helpers ────────────────────────────────────────────────────── */
function dateSuffix() { return new Date().toISOString().slice(0, 10); }

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function fmtHMS(secs: number): string {
  if (!secs || secs < 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function aggregateByAgent(rows: DailyRow[]): AgentSummary[] {
  const map = new Map<number, AgentSummary>();
  for (const r of rows) {
    if (!map.has(r.extensionId)) {
      map.set(r.extensionId, {
        extensionId: r.extensionId,
        extensionNumber: r.extensionNumber,
        extensionName: r.extensionName,
        onlineSeconds: 0, offlineSeconds: 0, pausedSeconds: 0,
        inCallSeconds: 0, inCampaignSeconds: 0, trainingSeconds: 0,
        totalTrackedSeconds: 0, days: [],
      });
    }
    const s = map.get(r.extensionId)!;
    s.onlineSeconds     += r.onlineSeconds;
    s.offlineSeconds    += r.offlineSeconds;
    s.pausedSeconds     += r.pausedSeconds;
    s.inCallSeconds     += r.inCallSeconds;
    s.inCampaignSeconds += r.inCampaignSeconds;
    s.trainingSeconds   += r.trainingSeconds;
    s.totalTrackedSeconds += r.totalTrackedSeconds;
    s.days.push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.extensionName.localeCompare(b.extensionName));
}

function downloadXlsxProd(agents: AgentSummary[], pauses: PauseRow[], from: string, to: string) {
  const wb = XLSX.utils.book_new();

  const summaryRows = agents.map((a) => [
    a.extensionNumber, a.extensionName,
    fmtHMS(a.onlineSeconds), fmtHMS(a.inCallSeconds),
    fmtHMS(a.inCampaignSeconds), fmtHMS(a.pausedSeconds),
    fmtHMS(a.trainingSeconds), fmtHMS(a.offlineSeconds),
    fmtHMS(a.totalTrackedSeconds),
  ]);
  const ws1 = XLSX.utils.aoa_to_sheet([
    ["Ramal", "Nome", "Online", "Em Chamada", "Em Campanha", "Pausado", "Treinamento", "Offline", "Total Rastreado"],
    ...summaryRows,
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, "Resumo por Agente");

  const detailRows = agents.flatMap((a) =>
    a.days.map((d) => [
      d.date, d.extensionNumber, d.extensionName,
      fmtHMS(d.onlineSeconds), fmtHMS(d.inCallSeconds),
      fmtHMS(d.inCampaignSeconds), fmtHMS(d.pausedSeconds),
      fmtHMS(d.trainingSeconds), fmtHMS(d.offlineSeconds),
    ])
  );
  const ws2 = XLSX.utils.aoa_to_sheet([
    ["Data", "Ramal", "Nome", "Online", "Em Chamada", "Em Campanha", "Pausado", "Treinamento", "Offline"],
    ...detailRows,
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, "Detalhado por Dia");

  if (pauses.length) {
    const ws3 = XLSX.utils.aoa_to_sheet([
      ["Agente", "Motivo de Pausa", "Ocorrências", "Tempo Total"],
      ...pauses.map((p) => [p.extensionName, p.pauseReason, p.occurrences, fmtHMS(p.totalSeconds)]),
    ]);
    XLSX.utils.book_append_sheet(wb, ws3, "Pausas por Motivo");
  }

  XLSX.writeFile(wb, `produtividade_${from}_${to}.xlsx`);
}

function downloadPdfProd(agents: AgentSummary[], from: string, to: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Relatório de Produtividade dos Agentes", 14, 16);
  doc.setFontSize(9);
  doc.text(`Período: ${from} a ${to}  |  Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [["Ramal", "Nome", "Online", "Em Chamada", "Em Campanha", "Pausado", "Treinamento", "Offline"]],
    body: agents.map((a) => [
      a.extensionNumber, a.extensionName,
      fmtHMS(a.onlineSeconds), fmtHMS(a.inCallSeconds),
      fmtHMS(a.inCampaignSeconds), fmtHMS(a.pausedSeconds),
      fmtHMS(a.trainingSeconds), fmtHMS(a.offlineSeconds),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [108, 92, 231] },
    alternateRowStyles: { fillColor: [245, 245, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`produtividade_${from}_${to}.pdf`);
}

/* ── StatusBar ──────────────────────────────────────────────────── */
function StatusBar({ online, inCall, inCampaign, paused, training, offline, total }: {
  online: number; inCall: number; inCampaign: number; paused: number;
  training: number; offline: number; total: number;
}) {
  if (!total) return <div className="h-2 rounded bg-zinc-800 w-full" />;
  const segs = [
    { secs: inCall + inCampaign, color: "#6c5ce7" },
    { secs: online, color: "#22c55e" },
    { secs: paused, color: "#facc15" },
    { secs: training, color: "#38bdf8" },
    { secs: offline, color: "#3f3f46" },
  ];
  return (
    <div className="flex h-2 rounded overflow-hidden w-full gap-px">
      {segs.map((s, i) =>
        s.secs > 0 ? (
          <div key={i} style={{ width: pct(s.secs, total), backgroundColor: s.color }} />
        ) : null
      )}
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────────── */
export default function RelatoriosProdutividade() {
  const { from: defaultFrom, to: defaultTo } = defaultDates();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [pauses, setPauses] = useState<PauseRow[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const agents = useMemo(() => aggregateByAgent(dailyRows), [dailyRows]);

  const fetchData = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const [reportRes, pauseRes] = await Promise.all([
        api.get(`/agent-reports?from=${from}&to=${to}`),
        api.get(`/agent-reports/pauses?from=${from}&to=${to}`),
      ]);
      setDailyRows(reportRes.data || []);
      setPauses(pauseRes.data || []);
    } catch {
      // silencia erro — tabela fica vazia
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 text-zinc-100 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp size={20} className="text-violet-400" />
        <h1 className="text-2xl font-bold tracking-tight">Produtividade dos Agentes</h1>
      </div>

      {/* Filtro de período */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Calendar size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-400">Período:</span>
            <input
              type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <span className="text-zinc-500 text-xs">até</span>
            <input
              type="date" value={to} min={from} max={dateSuffix()}
              onChange={(e) => setTo(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <Button
              size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="h-7 gap-1.5 text-xs border-zinc-700 text-zinc-300 hover:text-violet-400"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "Carregando..." : "Atualizar"}
            </Button>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm" variant="ghost" disabled={agents.length === 0}
                onClick={() => downloadXlsxProd(agents, pauses, from, to)}
                className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-green-400 px-2"
              >
                <FileSpreadsheet size={13} /> XLS
              </Button>
              <Button
                size="sm" variant="ghost" disabled={agents.length === 0}
                onClick={() => downloadPdfProd(agents, from, to)}
                className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-red-400 px-2"
              >
                <FileText size={13} /> PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        {[
          { color: "#6c5ce7", label: "Em Chamada / Campanha" },
          { color: "#22c55e", label: "Online" },
          { color: "#facc15", label: "Pausado" },
          { color: "#38bdf8", label: "Treinamento" },
          { color: "#3f3f46", label: "Offline" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Tabela principal */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {agents.length} agente{agents.length !== 1 ? "s" : ""} no período
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 w-8" />
                <TableHead className="text-zinc-400">Agente</TableHead>
                <TableHead className="text-zinc-400 text-right">Em Chamada</TableHead>
                <TableHead className="text-zinc-400 text-right">Online</TableHead>
                <TableHead className="text-zinc-400 text-right">Pausado</TableHead>
                <TableHead className="text-zinc-400 text-right">Offline</TableHead>
                <TableHead className="text-zinc-400 min-w-[120px]">Distribuição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.length === 0 && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
                    {loading ? "Carregando..." : "Nenhum dado no período selecionado."}
                  </TableCell>
                </TableRow>
              )}
              {agents.map((a) => (
                <>
                  <TableRow
                    key={`agent-${a.extensionId}`}
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(a.extensionId)}
                  >
                    <TableCell className="text-zinc-500">
                      {expanded.has(a.extensionId)
                        ? <ChevronUp size={14} />
                        : <ChevronDown size={14} />}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-zinc-500" />
                        <div>
                          <div className="text-zinc-200 text-sm font-medium">{a.extensionName}</div>
                          <div className="text-zinc-500 text-xs">{a.extensionNumber}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-violet-400 font-mono text-sm">{fmtHMS(a.inCallSeconds + a.inCampaignSeconds)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-green-400 font-mono text-sm">{fmtHMS(a.onlineSeconds)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-yellow-400 font-mono text-sm">{fmtHMS(a.pausedSeconds)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-zinc-500 font-mono text-sm">{fmtHMS(a.offlineSeconds)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBar
                        online={a.onlineSeconds} inCall={a.inCallSeconds}
                        inCampaign={a.inCampaignSeconds} paused={a.pausedSeconds}
                        training={a.trainingSeconds} offline={a.offlineSeconds}
                        total={a.totalTrackedSeconds}
                      />
                    </TableCell>
                  </TableRow>

                  {/* Detalhe por dia */}
                  {expanded.has(a.extensionId) && a.days.map((d) => (
                    <TableRow key={`day-${a.extensionId}-${d.date}`} className="border-zinc-800 bg-zinc-950/50">
                      <TableCell />
                      <TableCell className="text-zinc-500 text-xs pl-8">
                        {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-right text-violet-400/70 font-mono text-xs">{fmtHMS(d.inCallSeconds + d.inCampaignSeconds)}</TableCell>
                      <TableCell className="text-right text-green-400/70 font-mono text-xs">{fmtHMS(d.onlineSeconds)}</TableCell>
                      <TableCell className="text-right text-yellow-400/70 font-mono text-xs">{fmtHMS(d.pausedSeconds)}</TableCell>
                      <TableCell className="text-right text-zinc-500 font-mono text-xs">{fmtHMS(d.offlineSeconds)}</TableCell>
                      <TableCell>
                        <StatusBar
                          online={d.onlineSeconds} inCall={d.inCallSeconds}
                          inCampaign={d.inCampaignSeconds} paused={d.pausedSeconds}
                          training={d.trainingSeconds} offline={d.offlineSeconds}
                          total={d.totalTrackedSeconds}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pausas por motivo */}
      {pauses.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300">Pausas por motivo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Agente</TableHead>
                  <TableHead className="text-zinc-400">Motivo</TableHead>
                  <TableHead className="text-zinc-400 text-right">Ocorrências</TableHead>
                  <TableHead className="text-zinc-400 text-right">Tempo total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pauses.map((p, i) => (
                  <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                    <TableCell className="text-zinc-300 text-sm">{p.extensionName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                        {p.pauseReason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-zinc-400 font-mono text-sm">{p.occurrences}x</TableCell>
                    <TableCell className="text-right text-yellow-400 font-mono text-sm">{fmtHMS(p.totalSeconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
