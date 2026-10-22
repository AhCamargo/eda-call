import { useState } from "react";
import type { Campaign, CampaignStats, CallLogEntry } from "../types";
import { useTranslation } from "react-i18next";
import { usePbx } from "../context/PbxContext";
import api from "../api";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Megaphone,
  Phone,
  Users,
  BarChart2,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  PhoneForwarded,
} from "lucide-react";

function Input({ ...props }) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function Label({ children }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

const RESULT_CONFIG = {
  atendida: { label: "Atendida", icon: PhoneCall, color: "#22c55e" },
  nao_atendida: { label: "Não atendida", icon: PhoneMissed, color: "#f87171" },
  numero_nao_existe: {
    label: "Nº inexistente",
    icon: PhoneOff,
    color: "#94a3b8",
  },
  rejeitada: { label: "Rejeitada", icon: PhoneForwarded, color: "#facc15" },
};

function ResultBadge({ result }) {
  const cfg = RESULT_CONFIG[result] || {
    label: result,
    icon: PhoneOff,
    color: "#94a3b8",
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: cfg.color }}
    >
      <cfg.icon size={11} />
      {cfg.label}
    </span>
  );
}

// Status vindos do backend (Campaign.status): pending | in_progress | completed
const CAMPAIGN_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  pending: { label: "Aguardando início", variant: "outline" },
  in_progress: { label: "Ligando", variant: "default" },
  completed: { label: "Concluída", variant: "secondary" },
};

// O que ainda falta para a campanha poder ser iniciada (mesma regra do
// backend em POST /campaigns/:id/start).
const missingFor = (c: Campaign): string[] =>
  [
    !c.contacts?.length && "contatos",
    !c.extensions?.length && "ramais",
    !c.voipLines?.length && "linha",
  ].filter(Boolean) as string[];

const apiError = (err: any, fallback: string) =>
  err?.response?.data?.message || fallback;

export default function Campanhas() {
  const { t } = useTranslation();
  const {
    campaigns,
    extensions,
    voipLines,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    assignExtensions,
    assignVoipLines,
    uploadPhones,
    startCampaign,
  } = usePbx();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({
    name: "",
    intervalSeconds: 5,
  });
  const [assignTab, setAssignTab] = useState("phones");
  const [assignFeedback, setAssignFeedback] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: string;
    message: string;
  } | null>(null);

  // Report state
  const [reportDialog, setReportDialog] = useState<{
    campaign: Campaign;
    stats: CampaignStats | null;
    calls: CallLogEntry[];
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const openReport = async (campaign: Campaign) => {
    setReportLoading(true);
    setReportDialog({ campaign, stats: null, calls: [] });
    try {
      const res = await api.get(`/campaigns/${campaign.id}/report`);
      setReportDialog({ campaign, ...res.data });
    } catch {
      showFeedback("error", "Erro ao carregar relatório.");
      setReportDialog(null);
    } finally {
      setReportLoading(false);
    }
  };

  // Assignment state
  const [assignDialog, setAssignDialog] = useState<{
    campaign: Campaign;
  } | null>(null);
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [selectedVoipLines, setSelectedVoipLines] = useState<string[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const showFeedback = (type: string, message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setForm({ name: "", intervalSeconds: 5 });
    setDialogOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setForm({
      name: campaign.name,
      intervalSeconds: campaign.intervalSeconds,
    });
    setDialogOpen(true);
  };

  const openAssign = (campaign: Campaign) => {
    setAssignDialog({ campaign });
    setSelectedExtensions((campaign.extensions || []).map((e) => String(e.id)));
    setSelectedVoipLines((campaign.voipLines || []).map((l) => String(l.id)));
    setCsvFile(null);
    setAssignFeedback(null);
    // Abre na primeira etapa que ainda falta.
    const missing = missingFor(campaign);
    setAssignTab(
      missing.includes("contatos") || !missing.length
        ? "phones"
        : missing.includes("ramais")
          ? "extensions"
          : "voiplines",
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, {
          name: form.name,
          intervalSeconds: form.intervalSeconds,
        });
        showFeedback("success", "Campanha atualizada.");
      } else {
        const created = await createCampaign({
          name: form.name,
          intervalSeconds: form.intervalSeconds,
        });
        setDialogOpen(false);
        // Próximo passo natural: configurar contatos, ramais e linha.
        openAssign({ ...created, contacts: [], extensions: [], voipLines: [] });
        setAssignFeedback({
          type: "success",
          message: "Campanha criada. Agora adicione os contatos, os ramais e a linha.",
        });
        return;
      }
      setDialogOpen(false);
    } catch (err) {
      showFeedback("error", apiError(err, "Erro ao salvar."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setLoading(true);
    try {
      await deleteCampaign(deleteDialog.id);
      setDeleteDialog(null);
      showFeedback("success", "Campanha removida.");
    } catch (err) {
      showFeedback("error", apiError(err, "Erro ao remover."));
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (id: string) => {
    setLoading(true);
    try {
      await startCampaign(id);
      showFeedback("success", "Campanha iniciada — acompanhe no relatório.");
    } catch (err) {
      showFeedback("error", apiError(err, "Erro ao iniciar."));
    } finally {
      setLoading(false);
    }
  };

  const handleAssignExtensions = async () => {
    if (!assignDialog?.campaign) return;
    setLoading(true);
    try {
      await assignExtensions(assignDialog.campaign.id, selectedExtensions);
      setAssignFeedback({ type: "success", message: "Ramais salvos." });
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao salvar ramais.") });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVoipLines = async () => {
    if (!assignDialog?.campaign) return;
    setLoading(true);
    try {
      await assignVoipLines(assignDialog.campaign.id, selectedVoipLines);
      setAssignFeedback({ type: "success", message: "Linhas salvas." });
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao salvar linhas.") });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhones = async () => {
    if (!assignDialog?.campaign || !csvFile) return;
    setLoading(true);
    try {
      const { total, totalInvalid } = await uploadPhones(assignDialog.campaign.id, csvFile);
      setCsvFile(null);
      setAssignFeedback({
        type: "success",
        message:
          `${total} contato${total === 1 ? "" : "s"} importado${total === 1 ? "" : "s"}` +
          (totalInvalid ? ` — ${totalInvalid} linha${totalInvalid === 1 ? "" : "s"} ignorada${totalInvalid === 1 ? "" : "s"} (número inválido).` : "."),
      });
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao enviar lista.") });
    } finally {
      setLoading(false);
    }
  };

  const toggleExtension = (id: string) => {
    setSelectedExtensions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleVoipLine = (id: string) => {
    setSelectedVoipLines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("campaigns.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            O sistema liga sozinho para uma lista de contatos e, quando a
            pessoa atende, passa a ligação para um atendente livre.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("campaigns.createCampaign")}
        </Button>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" />
            Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Ramais</TableHead>
                <TableHead>Linha</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhuma campanha ainda. Crie uma e depois adicione a lista
                    de contatos, os ramais que vão atender e a linha.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => {
                  const missing = missingFor(campaign);
                  const status =
                    CAMPAIGN_STATUS[campaign.status ?? "pending"] ??
                    CAMPAIGN_STATUS.pending;
                  const countCell = (n: number, key: string) =>
                    n > 0 ? (
                      n
                    ) : (
                      <button
                        onClick={() => openAssign(campaign)}
                        className="text-xs text-amber-400 hover:underline"
                        title="Clique para configurar"
                      >
                        {key === "linha" ? "Falta" : "Nenhum"}
                      </button>
                    );
                  return (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      {campaign.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {countCell(campaign.contacts?.length || 0, "contatos")}
                    </TableCell>
                    <TableCell>
                      {countCell(campaign.extensions?.length || 0, "ramais")}
                    </TableCell>
                    <TableCell>
                      {(campaign.voipLines || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(campaign.voipLines || []).map((l) => (
                            <Badge
                              key={l.id}
                              variant="outline"
                              className="text-xs"
                            >
                              {l.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        countCell(0, "linha")
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openAssign(campaign)}
                        >
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Configurar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleStart(campaign.id)}
                          disabled={loading || missing.length > 0}
                          title={
                            missing.length
                              ? `Falta: ${missing.join(", ")}`
                              : t("campaigns.start")
                          }
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Iniciar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Ver resultado"
                          onClick={() => openReport(campaign)}
                        >
                          <BarChart2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Renomear"
                          onClick={() => openEdit(campaign)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Excluir"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteDialog(campaign)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign
                ? t("campaigns.saveCampaign")
                : t("campaigns.createCampaign")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Ex: Black Friday 2025"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCampaign
                  ? t("campaigns.saveCampaign")
                  : t("campaigns.createCampaign")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configurar campanha: {assignDialog?.campaign?.name}
            </DialogTitle>
            <DialogDescription>
              Para iniciar, a campanha precisa dos três itens abaixo.
            </DialogDescription>
          </DialogHeader>
          {assignFeedback && (
            <Alert variant={assignFeedback.type === "error" ? "destructive" : "default"}>
              {assignFeedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{assignFeedback.message}</AlertDescription>
            </Alert>
          )}
          <Tabs value={assignTab} onValueChange={setAssignTab}>
            <TabsList className="w-full gap-4 mb-4">
              <TabsTrigger value="phones" className="flex-1">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                1. Contatos
              </TabsTrigger>
              <TabsTrigger value="extensions" className="flex-1">
                <Phone className="mr-1.5 h-3.5 w-3.5" />
                2. Ramais
              </TabsTrigger>
              <TabsTrigger value="voiplines" className="flex-1">
                <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                3. Linha
              </TabsTrigger>
            </TabsList>

            <TabsContent value="extensions" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Quem vai atender as ligações quando o cliente atender:
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2">
                {extensions.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">
                    Nenhum ramal cadastrado — crie em Ramais.
                  </p>
                )}
                {extensions.map((ext) => (
                  <label
                    key={ext.id}
                    className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedExtensions.includes(String(ext.id))}
                      onChange={() => toggleExtension(String(ext.id))}
                    />
                    {ext.number} — {ext.name}
                  </label>
                ))}
              </div>
              <Button
                onClick={handleAssignExtensions}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar ramais
              </Button>
            </TabsContent>

            <TabsContent value="voiplines" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Por qual linha telefônica o sistema vai ligar:
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2">
                {voipLines.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">
                    Nenhuma linha cadastrada — cadastre em Linhas telefônicas.
                  </p>
                )}
                {voipLines.map((line) => (
                  <label
                    key={line.id}
                    className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVoipLines.includes(String(line.id))}
                      onChange={() => toggleVoipLine(String(line.id))}
                    />
                    {line.name} — {line.host}
                  </label>
                ))}
              </div>
              <Button
                onClick={handleAssignVoipLines}
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar linha
              </Button>
            </TabsContent>

            <TabsContent value="phones" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Envie uma planilha salva como <strong>CSV</strong> (no Excel:
                Arquivo → Salvar como → CSV) com uma coluna{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  telefone
                </code>
                , um número por linha, com DDD. Ex.: 11999990000.
              </p>
              <p className="text-xs text-muted-foreground">
                Contatos já na campanha:{" "}
                {campaigns.find((c) => c.id === assignDialog?.campaign?.id)
                  ?.contacts?.length ?? 0}
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground cursor-pointer"
              />
              {csvFile && (
                <p className="text-xs text-muted-foreground">
                  Arquivo selecionado: {csvFile.name}
                </p>
              )}
              <Button
                onClick={handleUploadPhones}
                disabled={loading || !csvFile}
                className="w-full"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Upload className="mr-2 h-4 w-4" />
                Enviar lista
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog
        open={!!reportDialog}
        onOpenChange={(o) => !o && setReportDialog(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-400">
              <BarChart2 size={18} />
              Relatório — {reportDialog?.campaign?.name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Resultado das chamadas realizadas nesta campanha.
            </DialogDescription>
          </DialogHeader>

          {reportLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-violet-400" />
            </div>
          )}

          {!reportLoading && reportDialog?.stats && (
            <div className="flex flex-col gap-4 overflow-hidden">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: "Total contatos",
                    value: reportDialog.stats.totalContacts,
                    icon: Users,
                    color: "#8eaeff",
                  },
                  {
                    label: "Atendidas",
                    value: reportDialog.stats.atendida,
                    icon: PhoneCall,
                    color: "#22c55e",
                  },
                  {
                    label: "Não atendidas",
                    value: reportDialog.stats.nao_atendida,
                    icon: PhoneMissed,
                    color: "#f87171",
                  },
                  {
                    label: "Nº inexistente",
                    value: reportDialog.stats.numero_nao_existe,
                    icon: PhoneOff,
                    color: "#94a3b8",
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-zinc-800 rounded-lg p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <k.icon size={12} style={{ color: k.color }} />
                      {k.label}
                    </div>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: k.color }}
                    >
                      {k.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Progresso */}
              {reportDialog.stats.totalContacts > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>
                      Progresso ({reportDialog.stats.totalCalls} de{" "}
                      {reportDialog.stats.totalContacts} chamadas)
                    </span>
                    <span>
                      {Math.round(
                        (reportDialog.stats.totalCalls /
                          reportDialog.stats.totalContacts) *
                          100,
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((reportDialog.stats.totalCalls / reportDialog.stats.totalContacts) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Tabela de chamadas */}
              <div className="overflow-y-auto flex-1 rounded-md border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400">Telefone</TableHead>
                      <TableHead className="text-zinc-400">Resultado</TableHead>
                      <TableHead className="text-zinc-400">Ramal</TableHead>
                      <TableHead className="text-zinc-400">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportDialog.calls.length === 0 ? (
                      <TableRow className="border-zinc-800">
                        <TableCell
                          colSpan={4}
                          className="text-center text-zinc-500 py-8"
                        >
                          Nenhuma chamada registrada ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportDialog.calls.map((call) => (
                        <TableRow
                          key={call.id}
                          className="border-zinc-800 hover:bg-zinc-800/30"
                        >
                          <TableCell className="font-mono text-sm text-zinc-300">
                            {call.phoneNumber}
                          </TableCell>
                          <TableCell>
                            <ResultBadge result={call.result} />
                          </TableCell>
                          <TableCell className="text-xs text-zinc-400">
                            {call.Extension
                              ? `${call.Extension.number} — ${call.Extension.name}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500">
                            {new Date(call.createdAt ?? 0).toLocaleString(
                              "pt-BR",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-400"
              onClick={() => setReportDialog(null)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover campanha</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover{" "}
              <strong>{deleteDialog?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
