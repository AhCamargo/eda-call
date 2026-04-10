import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import api from "../api";
import { usePbx } from "../context/PbxContext";

/* ── Types ─────────────────────────────────────────────────────────── */

interface IvrOption {
  id?: number;
  keyDigit: string;
  label: string;
  actionType: "transfer_extension" | "hangup";
  targetExtension: string;
}

interface InboundIvr {
  id: number;
  name: string;
  contextName: string;
  voipLineId: number | null;
  audioFile: string | null;
  digitTimeoutSeconds: number;
  maxInvalidAttempts: number;
  fallbackExtension: string | null;
  fallbackLabel: string | null;
  dialTechnology: "SIP" | "PJSIP";
  options: IvrOption[];
}

interface VoipLine {
  id: number;
  name: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function toContextName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

const KEY_COLORS: Record<string, string> = {
  "0": "#f59e0b",
  "5": "#f87171",
};
const defaultKeyColor = "#38bdf8";

/* ── IVR Form Dialog ─────────────────────────────────────────────── */

const emptyForm = (): Omit<InboundIvr, "id"> => ({
  name: "",
  contextName: "",
  voipLineId: null,
  audioFile: null,
  digitTimeoutSeconds: 5,
  maxInvalidAttempts: 3,
  fallbackExtension: null,
  fallbackLabel: "Transbordo",
  dialTechnology: "SIP",
  options: [],
});

interface IvrDialogProps {
  open: boolean;
  ivr: InboundIvr | null;
  voipLines: VoipLine[];
  onClose: () => void;
  onSave: (form: Omit<InboundIvr, "id">, id?: number) => Promise<void>;
}

function IvrDialog({ open, ivr, voipLines, onClose, onSave }: IvrDialogProps) {
  const [form, setForm] = useState<Omit<InboundIvr, "id">>(ivr ?? emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(ivr ? { ...ivr } : emptyForm());
  }, [ivr, open]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleNameChange = (name: string) => {
    setForm((p) => ({
      ...p,
      name,
      contextName:
        p.contextName && p.contextName !== toContextName(p.name ?? "")
          ? p.contextName
          : toContextName(name),
    }));
  };

  const addOption = () =>
    setForm((p) => ({
      ...p,
      options: [
        ...p.options,
        {
          keyDigit: "",
          label: "",
          actionType: "transfer_extension",
          targetExtension: "",
        },
      ],
    }));

  const setOption = (i: number, field: keyof IvrOption, val: string) =>
    setForm((p) => {
      const options = [...p.options];
      options[i] = { ...options[i], [field]: val };
      return { ...p, options };
    });

  const removeOption = (i: number) =>
    setForm((p) => ({
      ...p,
      options: p.options.filter((_, idx) => idx !== i),
    }));

  const usedKeys = form.options.map((o) => o.keyDigit);
  const availableKeys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(form, ivr?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const valid = form.name.trim() && form.contextName.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ivr ? "Editar Central" : "Nova Central Telefônica"}
          </DialogTitle>
          <DialogDescription>
            Configure a URA receptiva e suas opções de menu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Número da central">
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Central Principal"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow
              label="Nome do contexto (Asterisk)"
              hint="Único, sem espaços"
            >
              <input
                value={form.contextName}
                onChange={(e) => setField("contextName", e.target.value)}
                placeholder="central-principal"
                className={inputCls()}
              />
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Linha VoIP (entrada)">
              <select
                value={form.voipLineId ?? ""}
                onChange={(e) =>
                  setField(
                    "voipLineId",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className={inputCls()}
              >
                <option value="">Nenhuma</option>
                {voipLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Tecnologia de discagem">
              <select
                value={form.dialTechnology}
                onChange={(e) =>
                  setField("dialTechnology", e.target.value as "SIP" | "PJSIP")
                }
                className={inputCls()}
              >
                <option value="SIP">SIP (chan_sip)</option>
                <option value="PJSIP">PJSIP (WebRTC)</option>
              </select>
            </FieldRow>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FieldRow label="Timeout (segundos)" hint="Sem tecla → transbordo">
              <input
                type="number"
                min={1}
                max={30}
                value={form.digitTimeoutSeconds}
                onChange={(e) =>
                  setField("digitTimeoutSeconds", Number(e.target.value))
                }
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Tentativas inválidas">
              <input
                type="number"
                min={1}
                max={10}
                value={form.maxInvalidAttempts}
                onChange={(e) =>
                  setField("maxInvalidAttempts", Number(e.target.value))
                }
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow
              label="Áudio do menu"
              hint="Caminho relativo ou silence/1"
            >
              <input
                value={form.audioFile ?? ""}
                onChange={(e) => setField("audioFile", e.target.value || null)}
                placeholder="custom/menu-ptbr"
                className={inputCls()}
              />
            </FieldRow>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow
              label="Ramal de transbordo"
              hint="Destino quando não há opção"
            >
              <input
                value={form.fallbackExtension ?? ""}
                onChange={(e) =>
                  setField("fallbackExtension", e.target.value || null)
                }
                placeholder="900"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow label="Label do transbordo">
              <input
                value={form.fallbackLabel ?? ""}
                onChange={(e) =>
                  setField("fallbackLabel", e.target.value || null)
                }
                placeholder="Recepção"
                className={inputCls()}
              />
            </FieldRow>
          </div>

          <Separator />

          {/* Options */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Opções de menu
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={addOption}
              type="button"
            >
              <Plus className="h-3 w-3 mr-1" /> Adicionar opção
            </Button>
          </div>

          {form.options.length === 0 && (
            <p className="text-xs text-muted-foreground/60 text-center py-2">
              Nenhuma opção adicionada.
            </p>
          )}

          {form.options.map((opt, i) => (
            <div
              key={i}
              className="grid grid-cols-[56px_1fr_130px_130px_36px] gap-2 items-end"
            >
              <FieldRow label="Tecla">
                <select
                  value={opt.keyDigit}
                  onChange={(e) => setOption(i, "keyDigit", e.target.value)}
                  className={inputCls()}
                >
                  <option value="">–</option>
                  {availableKeys
                    .filter((k) => !usedKeys.includes(k) || k === opt.keyDigit)
                    .map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                </select>
              </FieldRow>
              <FieldRow label="Setor / Descrição">
                <input
                  value={opt.label}
                  onChange={(e) => setOption(i, "label", e.target.value)}
                  placeholder="Suporte Técnico"
                  className={inputCls()}
                />
              </FieldRow>
              <FieldRow label="Ação">
                <select
                  value={opt.actionType}
                  onChange={(e) => setOption(i, "actionType", e.target.value)}
                  className={inputCls()}
                >
                  <option value="transfer_extension">Transferir</option>
                  <option value="hangup">Desligar</option>
                </select>
              </FieldRow>
              <FieldRow label="Ramal / Fila">
                <input
                  value={opt.targetExtension}
                  onChange={(e) =>
                    setOption(i, "targetExtension", e.target.value)
                  }
                  placeholder="600"
                  className={inputCls()}
                  disabled={opt.actionType === "hangup"}
                />
              </FieldRow>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive mb-0.5"
                onClick={() => removeOption(i)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={!valid || saving} onClick={handleSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {ivr ? "Salvar alterações" : "Criar central"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main view ──────────────────────────────────────────────────── */

export default function CentralTelefonica() {
  const { user } = usePbx();
  const [ivrs, setIvrs] = useState<InboundIvr[]>([]);
  const [voipLines, setVoipLines] = useState<VoipLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dialogIvr, setDialogIvr] = useState<InboundIvr | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<InboundIvr | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = user?.role === "admin" || user?.role === "supervisor";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ivrRes, linesRes] = await Promise.all([
        api.get("/inbound-ivr"),
        api.get("/voip-lines"),
      ]);
      setIvrs(ivrRes.data);
      setVoipLines(linesRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (form: Omit<InboundIvr, "id">, id?: number) => {
    if (id) {
      const res = await api.put(`/inbound-ivr/${id}`, form);
      setIvrs((prev) => prev.map((i) => (i.id === id ? res.data : i)));
    } else {
      const res = await api.post("/inbound-ivr", form);
      setIvrs((prev) => [...prev, res.data]);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/inbound-ivr/${deleteTarget.id}`);
      setIvrs((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const voipLineName = (id: number | null) =>
    voipLines.find((l) => l.id === id)?.name ?? "–";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Central Telefônica
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            URAs receptivas — configuradas no Asterisk automaticamente
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={load}
            disabled={loading}
            title="Recarregar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {canEdit && (
            <Button onClick={() => setDialogIvr("new")} className="gap-2">
              <Plus className="h-4 w-4" /> Nova central
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && ivrs.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma central configurada.
            {canEdit && (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogIvr("new")}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeira central
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ivrs.map((ivr) => (
        <Card key={ivr.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  {ivr.name}
                </CardTitle>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    ctx: {ivr.contextName}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {ivr.dialTechnology}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    timeout: {ivr.digitTimeoutSeconds}s
                  </Badge>
                  {ivr.voipLineId && (
                    <Badge variant="secondary" className="text-[10px]">
                      linha: {voipLineName(ivr.voipLineId)}
                    </Badge>
                  )}
                  {ivr.fallbackExtension && (
                    <Badge variant="secondary" className="text-[10px]">
                      transbordo: {ivr.fallbackExtension}
                    </Badge>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setDialogIvr(ivr)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(ivr)}
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          {ivr.options.length > 0 && (
            <CardContent className="pt-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Tecla</TableHead>
                    <TableHead>Setor / Descrição</TableHead>
                    <TableHead className="w-28">Ação</TableHead>
                    <TableHead className="w-28">Ramal/Fila</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ivr.options
                    .slice()
                    .sort((a, b) => a.keyDigit.localeCompare(b.keyDigit))
                    .map((opt) => (
                      <TableRow
                        key={opt.keyDigit}
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandedId(expandedId === ivr.id ? null : ivr.id)
                        }
                      >
                        <TableCell>
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: "rgba(56,189,248,0.12)",
                              color:
                                KEY_COLORS[opt.keyDigit] ?? defaultKeyColor,
                              border: `1px solid ${KEY_COLORS[opt.keyDigit] ?? defaultKeyColor}44`,
                            }}
                          >
                            {opt.keyDigit}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {opt.label || "–"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              opt.actionType === "hangup"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {opt.actionType === "hangup"
                              ? "Desligar"
                              : "Transferir"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {opt.targetExtension ? (
                            <Badge variant="outline">
                              {opt.targetExtension}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              –
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          )}

          {ivr.options.length === 0 && (
            <CardContent className="pb-4">
              <p className="text-xs text-muted-foreground/60 text-center py-2">
                Nenhuma opção de menu configurada.
              </p>
            </CardContent>
          )}

          <div className="px-6 pb-3 pt-1 flex justify-end">
            <button
              className="text-xs text-muted-foreground/50 flex items-center gap-1 hover:text-muted-foreground transition-colors"
              onClick={() =>
                setExpandedId(expandedId === ivr.id ? null : ivr.id)
              }
            >
              {expandedId === ivr.id ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {expandedId === ivr.id ? "Menos detalhes" : "Mais detalhes"}
            </button>
          </div>

          {expandedId === ivr.id && (
            <CardContent className="pt-0 pb-4 border-t border-border/40">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs text-muted-foreground">
                <div>
                  <span className="text-foreground/60">Áudio:</span>{" "}
                  {ivr.audioFile || "silence/1"}
                </div>
                <div>
                  <span className="text-foreground/60">
                    Tentativas inválidas:
                  </span>{" "}
                  {ivr.maxInvalidAttempts}
                </div>
                <div>
                  <span className="text-foreground/60">Transbordo:</span>{" "}
                  {ivr.fallbackExtension ?? "–"}{" "}
                  {ivr.fallbackLabel ? `(${ivr.fallbackLabel})` : ""}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {/* Create/Edit dialog */}
      <IvrDialog
        open={dialogIvr !== null}
        ivr={dialogIvr === "new" ? null : (dialogIvr as InboundIvr | null)}
        voipLines={voipLines}
        onClose={() => setDialogIvr(null)}
        onSave={handleSave}
      />

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir central</DialogTitle>
            <DialogDescription>
              Remover <strong>{deleteTarget?.name}</strong>? O contexto{" "}
              <code>{deleteTarget?.contextName}</code> será removido do
              Asterisk.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
