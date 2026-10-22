import { Fragment, useCallback, useEffect, useState } from "react";
import type { Campaign, CampaignStats, CallLogEntry } from "../types";
import { useTranslation } from "react-i18next";
import { usePbx } from "../context/PbxContext";
import api from "../api";
import RefreshButton from "../components/RefreshButton";

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
  ChevronDown,
  ChevronUp,
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// 11999990000 -> (11) 99999-0000; 5511999990000 -> +55 (11) 99999-0000
const formatPhone = (raw: string) => {
  const d = String(raw).replace(/\D/g, "");
  const local = (n: string) =>
    n.length === 11
      ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
      : n.length === 10
        ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
        : n;
  if (d.length >= 12 && d.startsWith("55")) return `+55 ${local(d.slice(2))}`;
  return local(d);
};

function CampaignContactsPanel({
  contacts,
  calls,
  loading,
  onManage,
}: {
  contacts: { id: string; phoneNumber: string }[];
  calls: CallLogEntry[];
  loading: boolean;
  onManage: () => void;
}) {
  // Última ligação de cada número (calls vêm sem ordem garantida).
  const lastCall = new Map<string, CallLogEntry>();
  [...calls]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .forEach((c) => c.phoneNumber && lastCall.set(c.phoneNumber, c));

  const called = contacts.filter((c) => lastCall.has(c.phoneNumber)).length;
  const answered = contacts.filter(
    (c) => lastCall.get(c.phoneNumber)?.result === "atendida",
  ).length;
  const pct = contacts.length ? Math.round((called / contacts.length) * 100) : 0;
  const rows = [...contacts].sort((a, b) => Number(b.id) - Number(a.id));

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>{plural(contacts.length, "contato", "contatos")}</span>
          {contacts.length > 0 && (
            <>
              <span>{called} já receberam ligação</span>
              <span className="text-green-400">{plural(answered, "atendeu", "atenderam")}</span>
              <span>{pct}% concluído</span>
            </>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onManage}>
          <Upload className="mr-1 h-3 w-3" />
          Importar / editar lista
        </Button>
      </div>

      {contacts.length > 0 && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum contato. Clique em "Importar / editar lista" para enviar a planilha.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefone</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Ramal</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 200).map((c) => {
                const call = lastCall.get(c.phoneNumber);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{formatPhone(c.phoneNumber)}</TableCell>
                    <TableCell>
                      {call ? (
                        <ResultBadge result={call.result} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {loading ? "…" : "Aguardando"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {call?.Extension
                        ? `${call.Extension.number}${call.Extension.name ? ` — ${call.Extension.name}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {call?.createdAt ? new Date(call.createdAt).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length > 200 && (
            <p className="text-xs text-muted-foreground p-2 text-center">
              Mostrando os 200 mais recentes de {rows.length}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

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
    fetchAll,
    socket,
  } = usePbx();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({
    name: "",
    intervalSeconds: 5,
  });
  const [assignTab, setAssignTab] = useState("phones");

  // Painel de contatos aberto embaixo da campanha (igual à URA Reversa)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCalls, setDetailCalls] = useState<CallLogEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = useCallback(async (campaignId: string) => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/report`);
      setDetailCalls(res.data?.calls ?? []);
    } catch {
      setDetailCalls([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    setDetailLoading(true);
    setDetailCalls([]);
    loadDetail(expandedId);
    // Atualiza a cada ligação concluída desta campanha.
    const onCall = (evt: { campaignId?: string | number }) => {
      if (String(evt?.campaignId) === String(expandedId)) loadDetail(expandedId);
    };
    socket.on("call:update", onCall);
    return () => {
      socket.off("call:update", onCall);
    };
  }, [expandedId, loadDetail, socket]);
  // Contatos que entraram na última importação, para destacar na lista.
  const [importBaseline, setImportBaseline] = useState<Set<string> | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
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
    setImportBaseline(null);
    setContactSearch("");
    setConfirmClear(false);
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
    const before = new Set(
      (campaigns.find((c) => c.id === assignDialog.campaign.id)?.contacts ?? []).map((c) =>
        String(c.id),
      ),
    );
    try {
      const { total, totalInvalid, totalDuplicates } = await uploadPhones(
        assignDialog.campaign.id,
        csvFile,
      );
      setCsvFile(null);
      setImportBaseline(before);
      const extras = [
        totalDuplicates && `${plural(totalDuplicates, "já estava", "já estavam")} na lista`,
        totalInvalid && `${plural(totalInvalid, "linha ignorada", "linhas ignoradas")} (número inválido)`,
      ].filter(Boolean);
      setAssignFeedback({
        type: "success",
        message:
          `${plural(total, "contato importado", "contatos importados")}` +
          (extras.length ? ` — ${extras.join("; ")}.` : "."),
      });
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao enviar lista.") });
    } finally {
      setLoading(false);
    }
  };

  const removeContact = async (contactId: string) => {
    if (!assignDialog?.campaign) return;
    try {
      await api.delete(`/campaigns/${assignDialog.campaign.id}/contacts/${contactId}`);
      await fetchAll();
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao remover contato.") });
    }
  };

  const clearContacts = async () => {
    if (!assignDialog?.campaign) return;
    setLoading(true);
    try {
      await api.delete(`/campaigns/${assignDialog.campaign.id}/contacts`);
      await fetchAll();
      setImportBaseline(null);
      setAssignFeedback({ type: "success", message: "Lista de contatos apagada." });
    } catch (err) {
      setAssignFeedback({ type: "error", message: apiError(err, "Erro ao apagar a lista.") });
    } finally {
      setConfirmClear(false);
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
        <div className="flex gap-2 shrink-0">
          <RefreshButton
            onRefresh={() =>
              Promise.all([fetchAll(), expandedId ? loadDetail(expandedId) : null])
            }
          />
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("campaigns.createCampaign")}
          </Button>
        </div>
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
                  const isOpen = expandedId === campaign.id;
                  return (
                  <Fragment key={campaign.id}>
                  <TableRow className={isOpen ? "border-b-0" : ""}>
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
                          variant={isOpen ? "secondary" : "outline"}
                          title="Ver contatos e resultado de cada ligação"
                          onClick={() => setExpandedId(isOpen ? null : campaign.id)}
                        >
                          {isOpen ? (
                            <ChevronUp className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="mr-1 h-3.5 w-3.5" />
                          )}
                          Contatos
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
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="pt-0">
                        <CampaignContactsPanel
                          contacts={campaign.contacts ?? []}
                          calls={detailCalls}
                          loading={detailLoading}
                          onManage={() => {
                            openAssign(campaign);
                            setAssignTab("phones");
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
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

              {(() => {
                const all = [
                  ...(campaigns.find((c) => c.id === assignDialog?.campaign?.id)?.contacts ?? []),
                ].sort((a, b) => Number(b.id) - Number(a.id)); // mais recentes primeiro
                // `importBaseline` guarda os ids de ANTES da última importação:
                // quem não estava lá é novo. null = nenhuma importação ainda.
                const isNew = (id: string) => !!importBaseline && !importBaseline.has(String(id));
                const q = contactSearch.replace(/\D/g, "");
                const shown = q ? all.filter((c) => c.phoneNumber.includes(q)) : all;
                const newCount = all.filter((c) => isNew(c.id)).length;
                return (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {plural(all.length, "contato", "contatos")} na campanha
                        {newCount > 0 && (
                          <span className="ml-1.5 text-xs font-normal text-emerald-400">
                            ({plural(newCount, "novo", "novos")})
                          </span>
                        )}
                      </p>
                      {all.length > 0 &&
                        (confirmClear ? (
                          <span className="flex items-center gap-1 text-xs">
                            Apagar todos?
                            <Button size="sm" variant="destructive" className="h-6 px-2 text-xs"
                              onClick={clearContacts} disabled={loading}>
                              Sim
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                              onClick={() => setConfirmClear(false)}>
                              Não
                            </Button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmClear(true)}
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Apagar lista
                          </button>
                        ))}
                    </div>
                    {all.length > 10 && (
                      <Input
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Buscar número..."
                      />
                    )}
                    {all.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        Nenhum contato ainda — envie a planilha acima.
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                        {shown.slice(0, 300).map((c) => (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between px-3 py-1.5 text-sm ${
                              isNew(c.id) ? "bg-emerald-500/10" : ""
                            }`}
                          >
                            <span className="font-mono">
                              {formatPhone(c.phoneNumber)}
                              {isNew(c.id) && (
                                <Badge variant="outline" className="ml-2 text-[10px] text-emerald-400 border-emerald-500/40">
                                  novo
                                </Badge>
                              )}
                            </span>
                            <button
                              onClick={() => removeContact(c.id)}
                              title="Remover este número"
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {shown.length === 0 && (
                          <p className="text-xs text-muted-foreground p-3 text-center">
                            Nenhum número encontrado.
                          </p>
                        )}
                        {shown.length > 300 && (
                          <p className="text-xs text-muted-foreground p-2 text-center">
                            Mostrando 300 de {shown.length} — use a busca para encontrar um número.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
