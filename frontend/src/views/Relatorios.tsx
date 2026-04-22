import { useMemo, useState } from "react";
import { usePbx } from "../context/PbxContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart2,
  Phone,
  Megaphone,
  Mic,
  Activity,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
} from "lucide-react";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ── Helpers de export ──────────────────────────────────────────── */
function downloadXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, headers, rows }) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, `relatorio_edacall_${dateSuffix()}.xlsx`);
}

function downloadPdf(title, sections) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);

  let y = 28;
  sections.forEach(({ name, headers, rows }) => {
    doc.setFontSize(11);
    doc.text(name, 14, y);
    autoTable(doc, {
      startY: y + 2,
      head: [headers],
      body: rows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [108, 92, 231] },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  });

  doc.save(`relatorio_edacall_${dateSuffix()}.pdf`);
}

function dateSuffix() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Helpers de data / duração ──────────────────────────────────── */
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const fmtDuration = (secs) => {
  if (!secs) return "—";
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

/* ── ResultBadge ────────────────────────────────────────────────── */
const RESULT_COLORS: Record<string, string> = {
  atendida: "border-green-500/40 text-green-400 bg-green-500/10",
  nao_atendida: "border-red-500/40 text-red-400 bg-red-500/10",
  numero_nao_existe: "border-zinc-600 text-zinc-500 bg-zinc-800",
  rejeitada: "border-orange-500/40 text-orange-400 bg-orange-500/10",
  ocupado: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
};

function ResultBadge({ result }: { result?: string }) {
  const r = result?.toLowerCase() || "";
  const cls = RESULT_COLORS[r] || "border-zinc-700 text-zinc-400";
  return (
    <Badge variant="outline" className={`text-xs capitalize ${cls}`}>
      {result || "—"}
    </Badge>
  );
}

/* ── buildSheet helpers ─────────────────────────────────────────── */
function sheetByExtension(rows) {
  return {
    name: "Chamadas por Ramal",
    headers: ["Ramal", "Telefone", "Resultado", "Data"],
    rows: rows.map((i) => [
      i.Extension?.number || "—",
      i.phoneNumber,
      i.result,
      i.createdAt ? new Date(i.createdAt).toLocaleString("pt-BR") : "—",
    ]),
  };
}
function sheetByCampaign(rows) {
  return {
    name: "Chamadas por Campanha",
    headers: ["Campanha", "Telefone", "Resultado", "Data"],
    rows: rows.map((i) => [
      i.Campaign?.name || "—",
      i.phoneNumber,
      i.result,
      i.createdAt ? new Date(i.createdAt).toLocaleString("pt-BR") : "—",
    ]),
  };
}
function sheetUraLogs(rows) {
  return {
    name: "URA Logs",
    headers: ["Telefone", "Opção selecionada", "Resultado", "Data"],
    rows: rows.map((i) => [
      i.phoneNumber,
      i.selectedOption || "—",
      i.result || "—",
      i.createdAt ? new Date(i.createdAt).toLocaleString("pt-BR") : "—",
    ]),
  };
}
function sheetRecordings(rows) {
  return {
    name: "Gravações",
    headers: ["Ramal", "Arquivo", "Duração (s)", "Data"],
    rows: rows.map((i) => [
      i.Extension?.number || "—",
      i.filePath?.split("/").pop() || i.filePath || "—",
      i.durationSeconds ?? 0,
      i.createdAt ? new Date(i.createdAt).toLocaleString("pt-BR") : "—",
    ]),
  };
}

/* ── Componente ─────────────────────────────────────────────────── */
export default function Relatorios() {
  const {
    extensions,
    campaigns,
    reportCallsByExtension,
    reportCallsByCampaign,
    reportUraLogs,
    reportRecordings,
  } = usePbx();

  /* filtros — por ramal */
  const [extSearch, setExtSearch] = useState("");
  const [extFilter, setExtFilter] = useState("all");

  /* filtros — por campanha */
  const [campSearch, setCampSearch] = useState("");
  const [campFilter, setCampFilter] = useState("all");

  /* filtros — ura logs */
  const [uraSearch, setUraSearch] = useState("");

  /* filtros — gravações */
  const [recSearch, setRecSearch] = useState("");
  const [recFilter, setRecFilter] = useState("all");

  /* dados filtrados */
  const filteredExt = useMemo(() => {
    let list = [...reportCallsByExtension];
    if (extFilter !== "all")
      list = list.filter((r) => String(r.extensionId) === extFilter);
    if (extSearch.trim()) {
      const q = extSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.phoneNumber?.toLowerCase().includes(q) ||
          r.Extension?.number?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [reportCallsByExtension, extFilter, extSearch]);

  const filteredCamp = useMemo(() => {
    let list = [...reportCallsByCampaign];
    if (campFilter !== "all")
      list = list.filter((r) => String(r.Campaign?.id) === campFilter);
    if (campSearch.trim()) {
      const q = campSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.phoneNumber?.toLowerCase().includes(q) ||
          r.Campaign?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [reportCallsByCampaign, campFilter, campSearch]);

  const filteredUra = useMemo(() => {
    if (!uraSearch.trim()) return reportUraLogs;
    const q = uraSearch.toLowerCase();
    return reportUraLogs.filter(
      (r) =>
        r.phoneNumber?.toLowerCase().includes(q) ||
        r.selectedOption?.toLowerCase().includes(q),
    );
  }, [reportUraLogs, uraSearch]);

  const filteredRec = useMemo(() => {
    let list = [...reportRecordings];
    if (recFilter !== "all")
      list = list.filter((r) => String(r.extensionId) === recFilter);
    if (recSearch.trim()) {
      const q = recSearch.toLowerCase();
      list = list.filter((r) => r.filePath?.toLowerCase().includes(q));
    }
    return list;
  }, [reportRecordings, recFilter, recSearch]);

  /* export helpers por aba */
  const exportTab = (sheet) => ({
    xlsx: () => downloadXlsx([sheet]),
    pdf: () => downloadPdf(sheet.name, [sheet]),
  });

  return (
    <div className="space-y-4 text-zinc-100 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2 size={20} className="text-violet-400" />
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ramal">
        <TabsList className=" gap-3.5 bg-zinc-800 border border-zinc-700 h-auto p-1">
          <TabsTrigger
            value="ramal"
            className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            <Phone size={13} /> Por Ramal
            <Badge
              variant="outline"
              className="ml-1 text-[10px] border-zinc-600 text-zinc-500"
            >
              {reportCallsByExtension.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="campanha"
            className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            <Megaphone size={13} /> Por Campanha
            <Badge
              variant="outline"
              className="ml-1 text-[10px] border-zinc-600 text-zinc-500"
            >
              {reportCallsByCampaign.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="ura"
            className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            <Activity size={13} /> URA Logs
            <Badge
              variant="outline"
              className="ml-1 text-[10px] border-zinc-600 text-zinc-500"
            >
              {reportUraLogs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="gravacoes"
            className="gap-1.5 text-xs data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
          >
            <Mic size={13} /> Gravações
            <Badge
              variant="outline"
              className="ml-1 text-[10px] border-zinc-600 text-zinc-500"
            >
              {reportRecordings.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Por Ramal ── */}
        <TabsContent value="ramal" className="space-y-3 mt-3">
          <FilterBar
            search={extSearch}
            onSearch={setExtSearch}
            searchPlaceholder="Buscar por número..."
            selectValue={extFilter}
            onSelect={setExtFilter}
            selectPlaceholder="Todos os ramais"
            selectOptions={extensions.map((e) => ({
              value: String(e.id),
              label: `${e.number} — ${e.name}`,
            }))}
            onClear={() => {
              setExtSearch("");
              setExtFilter("all");
            }}
            showClear={extFilter !== "all" || !!extSearch.trim()}
          />
          <ReportCard
            title="Chamadas por Ramal"
            count={filteredExt.length}
            total={reportCallsByExtension.length}
            sheet={sheetByExtension(filteredExt)}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Ramal</TableHead>
                  <TableHead className="text-zinc-400">Número</TableHead>
                  <TableHead className="text-zinc-400">Resultado</TableHead>
                  <TableHead className="text-zinc-400">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExt.length === 0 && (
                  <EmptyRow cols={4} total={reportCallsByExtension.length} />
                )}
                {filteredExt.slice(0, 100).map((item) => (
                  <TableRow
                    key={`ext-${item.id}`}
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  >
                    <TableCell>
                      {item.Extension ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-zinc-700 text-zinc-400"
                        >
                          {item.Extension.number}
                        </Badge>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-zinc-300">
                      {item.phoneNumber}
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={item.result} />
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* ── Por Campanha ── */}
        <TabsContent value="campanha" className="space-y-3 mt-3">
          <FilterBar
            search={campSearch}
            onSearch={setCampSearch}
            searchPlaceholder="Buscar por número..."
            selectValue={campFilter}
            onSelect={setCampFilter}
            selectPlaceholder="Todas as campanhas"
            selectOptions={(campaigns || []).map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
            onClear={() => {
              setCampSearch("");
              setCampFilter("all");
            }}
            showClear={campFilter !== "all" || !!campSearch.trim()}
          />
          <ReportCard
            title="Chamadas por Campanha"
            count={filteredCamp.length}
            total={reportCallsByCampaign.length}
            sheet={sheetByCampaign(filteredCamp)}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Campanha</TableHead>
                  <TableHead className="text-zinc-400">Número</TableHead>
                  <TableHead className="text-zinc-400">Resultado</TableHead>
                  <TableHead className="text-zinc-400">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCamp.length === 0 && (
                  <EmptyRow cols={4} total={reportCallsByCampaign.length} />
                )}
                {filteredCamp.slice(0, 100).map((item) => (
                  <TableRow
                    key={`camp-${item.id}`}
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  >
                    <TableCell className="text-zinc-300">
                      {item.Campaign?.name || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-zinc-300">
                      {item.phoneNumber}
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={item.result} />
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* ── URA Logs ── */}
        <TabsContent value="ura" className="space-y-3 mt-3">
          <FilterBar
            search={uraSearch}
            onSearch={setUraSearch}
            searchPlaceholder="Buscar por número ou opção..."
            onClear={() => setUraSearch("")}
            showClear={!!uraSearch.trim()}
          />
          <ReportCard
            title="URA Logs"
            count={filteredUra.length}
            total={reportUraLogs.length}
            sheet={sheetUraLogs(filteredUra)}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Telefone</TableHead>
                  <TableHead className="text-zinc-400">
                    Opção selecionada
                  </TableHead>
                  <TableHead className="text-zinc-400">Resultado</TableHead>
                  <TableHead className="text-zinc-400">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUra.length === 0 && (
                  <EmptyRow cols={4} total={reportUraLogs.length} />
                )}
                {filteredUra.slice(0, 100).map((item) => (
                  <TableRow
                    key={`ura-${item.id}`}
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  >
                    <TableCell className="font-mono text-sm text-zinc-300">
                      {item.phoneNumber}
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {item.selectedOption || "—"}
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={item.result} />
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* ── Gravações ── */}
        <TabsContent value="gravacoes" className="space-y-3 mt-3">
          <FilterBar
            search={recSearch}
            onSearch={setRecSearch}
            searchPlaceholder="Buscar por nome de arquivo..."
            selectValue={recFilter}
            onSelect={setRecFilter}
            selectPlaceholder="Todos os ramais"
            selectOptions={extensions.map((e) => ({
              value: String(e.id),
              label: `${e.number} — ${e.name}`,
            }))}
            onClear={() => {
              setRecSearch("");
              setRecFilter("all");
            }}
            showClear={recFilter !== "all" || !!recSearch.trim()}
          />
          <ReportCard
            title="Gravações"
            count={filteredRec.length}
            total={reportRecordings.length}
            sheet={sheetRecordings(filteredRec)}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Ramal</TableHead>
                  <TableHead className="text-zinc-400">Arquivo</TableHead>
                  <TableHead className="text-zinc-400">Duração</TableHead>
                  <TableHead className="text-zinc-400">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRec.length === 0 && (
                  <EmptyRow cols={4} total={reportRecordings.length} />
                )}
                {filteredRec.slice(0, 100).map((item) => (
                  <TableRow
                    key={`rec-${item.id}`}
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                  >
                    <TableCell>
                      {item.Extension ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-zinc-700 text-zinc-400"
                        >
                          {item.Extension.number}
                        </Badge>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-xs font-mono text-zinc-400 truncate max-w-xs"
                      title={item.filePath}
                    >
                      {item.filePath?.split("/").pop() || item.filePath || "—"}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">
                      {fmtDuration(item.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Sub-componentes ────────────────────────────────────────────── */

function FilterBar({
  search,
  onSearch,
  searchPlaceholder = "Buscar...",
  selectValue,
  onSelect,
  selectPlaceholder,
  selectOptions,
  onClear,
  showClear,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  selectValue?: string;
  onSelect?: (v: string) => void;
  selectPlaceholder?: string;
  selectOptions?: { value: string; label: string }[];
  onClear: () => void;
  showClear: boolean;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
            />
          </div>
          {selectOptions && onSelect && (
            <div className="flex items-center gap-2 sm:w-64">
              <Filter size={14} className="text-zinc-500 flex-shrink-0" />
              <Select value={selectValue} onValueChange={onSelect}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder={selectPlaceholder} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem
                    value="all"
                    className="text-zinc-400 focus:bg-zinc-700"
                  >
                    {selectPlaceholder}
                  </SelectItem>
                  {selectOptions.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-zinc-100 focus:bg-zinc-700"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showClear && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400"
              onClick={onClear}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCard({
  title,
  count,
  total,
  sheet,
  children,
}: {
  title: string;
  count: number;
  total: number;
  sheet: { name: string; headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {count} registro{count !== 1 ? "s" : ""}
            {count !== total && (
              <span className="text-zinc-500 font-normal">
                {" "}
                (filtrado de {total})
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadXlsx([sheet])}
              disabled={sheet.rows.length === 0}
              className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-green-400 px-2"
            >
              <FileSpreadsheet size={13} /> XLS
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadPdf(title, [sheet])}
              disabled={sheet.rows.length === 0}
              className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-red-400 px-2"
            >
              <FileText size={13} /> PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ cols, total }: { cols: number; total: number }) {
  return (
    <TableRow className="border-zinc-800">
      <TableCell colSpan={cols} className="text-center text-zinc-500 py-12">
        {total === 0
          ? "Nenhum registro encontrado."
          : "Nenhum registro com os filtros aplicados."}
      </TableCell>
    </TableRow>
  );
}
