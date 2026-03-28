import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { BarChart2, Phone, Megaphone, Mic, Activity, FileSpreadsheet, FileText } from 'lucide-react';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 22);

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
    y = doc.lastAutoTable.finalY + 12;
  });

  doc.save(`relatorio_edacall_${dateSuffix()}.pdf`);
}

function dateSuffix() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Dados dos 4 relatórios ─────────────────────────────────────── */
function buildSheets(reportCallsByExtension, reportCallsByCampaign, reportUraLogs, reportRecordings) {
  return [
    {
      name: 'Chamadas por Ramal',
      headers: ['Ramal', 'Telefone', 'Resultado', 'Data'],
      rows: reportCallsByExtension.map((i) => [
        i.Extension?.number || '—',
        i.phoneNumber,
        i.result,
        i.createdAt ? new Date(i.createdAt).toLocaleString('pt-BR') : '—',
      ]),
    },
    {
      name: 'Chamadas por Campanha',
      headers: ['Campanha', 'Telefone', 'Resultado', 'Data'],
      rows: reportCallsByCampaign.map((i) => [
        i.Campaign?.name || '—',
        i.phoneNumber,
        i.result,
        i.createdAt ? new Date(i.createdAt).toLocaleString('pt-BR') : '—',
      ]),
    },
    {
      name: 'URA Logs',
      headers: ['Telefone', 'Opção selecionada', 'Resultado', 'Data'],
      rows: reportUraLogs.map((i) => [
        i.phoneNumber,
        i.selectedOption || '—',
        i.result || '—',
        i.createdAt ? new Date(i.createdAt).toLocaleString('pt-BR') : '—',
      ]),
    },
    {
      name: 'Gravações',
      headers: ['Ramal', 'Arquivo', 'Duração (s)', 'Data'],
      rows: reportRecordings.map((i) => [
        i.Extension?.number || '—',
        i.filePath?.split('/').pop() || i.filePath || '—',
        i.durationSeconds ?? 0,
        i.createdAt ? new Date(i.createdAt).toLocaleString('pt-BR') : '—',
      ]),
    },
  ];
}

/* ── Componente ─────────────────────────────────────────────────── */
export default function Relatorios() {
  const { t } = useTranslation();
  const {
    reports,
    reportCallsByExtension,
    reportCallsByCampaign,
    reportUraLogs,
    reportRecordings,
  } = usePbx();

  const sheets = buildSheets(reportCallsByExtension, reportCallsByCampaign, reportUraLogs, reportRecordings);
  const totalRows = sheets.reduce((acc, s) => acc + s.rows.length, 0);

  const handleXlsx = () => downloadXlsx(sheets);
  const handlePdf = () => downloadPdf('Relatório EDA Call', sheets);

  return (
    <div className="space-y-4 text-zinc-100">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-violet-400" />
          <h1 className="text-2xl font-semibold">{t('reports.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleXlsx}
            disabled={totalRows === 0}
            className="gap-2 border-zinc-700 text-zinc-300 hover:text-green-400 hover:border-green-500/50"
          >
            <FileSpreadsheet size={15} />
            Exportar XLS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePdf}
            disabled={totalRows === 0}
            className="gap-2 border-zinc-700 text-zinc-300 hover:text-red-400 hover:border-red-500/50"
          >
            <FileText size={15} />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-green-400">{reports.quemAtendeu}</p>
            <p className="text-sm text-zinc-500 mt-1">{t('reports.whoAnswered')}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <p className="text-3xl font-bold text-red-400">{reports.numeroNaoExiste}</p>
            <p className="text-sm text-zinc-500 mt-1">{t('reports.numberNotExists')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Calls by extension */}
      <SectionCard
        icon={<Phone className="h-4 w-4" />}
        title={t('reports.callLogsByExtension')}
        sheet={sheets[0]}
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
            {reportCallsByExtension.length === 0 && <EmptyRow cols={4} />}
            {reportCallsByExtension.slice(0, 50).map((item) => (
              <TableRow key={`ext-${item.id}`} className="border-zinc-800 hover:bg-zinc-800/30">
                <TableCell className="text-zinc-300">{item.Extension?.number || '—'}</TableCell>
                <TableCell className="font-mono text-sm">{item.phoneNumber}</TableCell>
                <TableCell><ResultBadge result={item.result} /></TableCell>
                <TableCell className="text-xs text-zinc-500">{fmtDate(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Calls by campaign */}
      <SectionCard
        icon={<Megaphone className="h-4 w-4" />}
        title={t('reports.callLogsByCampaign')}
        sheet={sheets[1]}
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
            {reportCallsByCampaign.length === 0 && <EmptyRow cols={4} />}
            {reportCallsByCampaign.slice(0, 50).map((item) => (
              <TableRow key={`camp-${item.id}`} className="border-zinc-800 hover:bg-zinc-800/30">
                <TableCell className="text-zinc-300">{item.Campaign?.name || '—'}</TableCell>
                <TableCell className="font-mono text-sm">{item.phoneNumber}</TableCell>
                <TableCell><ResultBadge result={item.result} /></TableCell>
                <TableCell className="text-xs text-zinc-500">{fmtDate(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* URA logs */}
      <SectionCard
        icon={<Activity className="h-4 w-4" />}
        title={t('reports.uraLogs')}
        sheet={sheets[2]}
      >
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Telefone</TableHead>
              <TableHead className="text-zinc-400">Opção selecionada</TableHead>
              <TableHead className="text-zinc-400">Resultado</TableHead>
              <TableHead className="text-zinc-400">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportUraLogs.length === 0 && <EmptyRow cols={4} />}
            {reportUraLogs.slice(0, 50).map((item) => (
              <TableRow key={`ura-${item.id}`} className="border-zinc-800 hover:bg-zinc-800/30">
                <TableCell className="font-mono text-sm">{item.phoneNumber}</TableCell>
                <TableCell>{item.selectedOption || '—'}</TableCell>
                <TableCell className="text-xs text-zinc-400">{item.result || '—'}</TableCell>
                <TableCell className="text-xs text-zinc-500">{fmtDate(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Recordings */}
      <SectionCard
        icon={<Mic className="h-4 w-4" />}
        title={t('reports.recordings')}
        sheet={sheets[3]}
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
            {reportRecordings.length === 0 && <EmptyRow cols={4} />}
            {reportRecordings.slice(0, 50).map((item) => (
              <TableRow key={`rec-${item.id}`} className="border-zinc-800 hover:bg-zinc-800/30">
                <TableCell className="text-zinc-300">{item.Extension?.number || '—'}</TableCell>
                <TableCell className="text-xs font-mono text-zinc-400 truncate max-w-xs">
                  {item.filePath?.split('/').pop() || item.filePath || '—'}
                </TableCell>
                <TableCell className="text-zinc-400">{item.durationSeconds}s</TableCell>
                <TableCell className="text-xs text-zinc-500">{fmtDate(item.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ── Sub-componentes ────────────────────────────────────────────── */
function SectionCard({ icon, title, sheet, children }) {
  const handleXlsx = () => downloadXlsx([sheet]);
  const handlePdf  = () => downloadPdf(title, [sheet]);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-200">
            {icon}
            {title}
            <Badge variant="outline" className="ml-1 text-[10px] border-zinc-700 text-zinc-500">
              {sheet.rows.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleXlsx}
              disabled={sheet.rows.length === 0}
              className="h-7 gap-1.5 text-xs text-zinc-500 hover:text-green-400 px-2"
            >
              <FileSpreadsheet size={13} /> XLS
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePdf}
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

function EmptyRow({ cols }) {
  return (
    <TableRow className="border-zinc-800">
      <TableCell colSpan={cols} className="text-center text-zinc-500 py-8">
        Sem dados.
      </TableCell>
    </TableRow>
  );
}

const RESULT_COLORS = {
  atendida: '#22c55e',
  nao_atendida: '#f87171',
  numero_nao_existe: '#94a3b8',
  rejeitada: '#facc15',
};

function ResultBadge({ result }) {
  return (
    <Badge variant="outline" className="text-xs border-zinc-700" style={{ color: RESULT_COLORS[result] || '#94a3b8' }}>
      {result}
    </Badge>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
