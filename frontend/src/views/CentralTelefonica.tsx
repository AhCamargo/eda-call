import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
  AlertTriangle,
  PhoneIncoming,
  Volume2,
  Clock,
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
import type { Extension } from "../types";

/* ── Types ─────────────────────────────────────────────────────────── */

type ActionType = "transfer_extension" | "transfer_queue" | "hangup";

interface IvrOption {
  id?: number;
  keyDigit: string;
  label: string;
  actionType: ActionType;
  targetExtension: string;
}

interface ScheduleRule {
  days: string;
  open: string;
  close: string;
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
  scheduleEnabled: boolean;
  scheduleJson: string | null;
  closedAudioFile: string | null;
}

interface VoipLine {
  id: number;
  name: string;
}

interface Queue {
  id: number;
  name: string;
}

interface Sound {
  filename: string;
  asteriskPath: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function toContextName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {children}
    </p>
  );
}

function inputCls() {
  return "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
}

const KEY_COLORS: Record<string, string> = {
  "0": "#f59e0b",
  "5": "#f87171",
};
const defaultKeyColor = "#38bdf8";

const extensionLabel = (extensions: Extension[], number: string | null) => {
  if (!number) return null;
  const ext = extensions.find((e) => String(e.number) === String(number));
  return ext?.name ? `Ramal ${number} — ${ext.name}` : `Ramal ${number}`;
};

const parseRules = (json: string | null): ScheduleRule[] => {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
};

/* ── Seletores reutilizáveis ─────────────────────────────────────── */

function AudioSelect({
  value,
  sounds,
  onChange,
  emptyLabel,
}: {
  value: string | null;
  sounds: Sound[];
  onChange: (v: string | null) => void;
  emptyLabel: string;
}) {
  const known = sounds.some((s) => s.asteriskPath === value);
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={inputCls()}
    >
      <option value="">{emptyLabel}</option>
      {sounds.map((s) => (
        <option key={s.asteriskPath} value={s.asteriskPath}>
          {s.filename}
        </option>
      ))}
      {value && !known && <option value={value}>{value}</option>}
    </select>
  );
}

function ExtensionSelect({
  value,
  extensions,
  onChange,
  emptyLabel,
  disabled,
}: {
  value: string | null;
  extensions: Extension[];
  onChange: (v: string) => void;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const known = extensions.some((e) => String(e.number) === String(value));
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls()}
      disabled={disabled}
    >
      <option value="">{emptyLabel}</option>
      {extensions.map((e) => (
        <option key={e.id} value={e.number}>
          {e.number}
          {e.name ? ` — ${e.name}` : ""}
        </option>
      ))}
      {value && !known && <option value={value}>{value}</option>}
    </select>
  );
}

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
  scheduleEnabled: false,
  scheduleJson: null,
  closedAudioFile: null,
});

const DAYS_OPTIONS = [
  { value: "mon-fri", label: "Seg–Sex" },
  { value: "mon-sat", label: "Seg–Sáb" },
  { value: "mon-sun", label: "Todos os dias" },
  { value: "sat-sun", label: "Sáb–Dom" },
  { value: "sat", label: "Sábado" },
  { value: "sun", label: "Domingo" },
];

interface IvrDialogProps {
  open: boolean;
  ivr: InboundIvr | null;
  voipLines: VoipLine[];
  queues: Queue[];
  sounds: Sound[];
  extensions: Extension[];
  onClose: () => void;
  onSave: (form: Omit<InboundIvr, "id">, id?: number) => Promise<void>;
}

function IvrDialog({
  open,
  ivr,
  voipLines,
  queues,
  sounds,
  extensions,
  onClose,
  onSave,
}: IvrDialogProps) {
  const [form, setForm] = useState<Omit<InboundIvr, "id">>(ivr ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setForm(ivr ? { ...ivr } : emptyForm());
    setShowAdvanced(false);
  }, [ivr, open]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // O nome técnico (contexto do Asterisk) acompanha o nome digitado até que
  // alguém o edite manualmente em "Ajustes técnicos".
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
    setForm((p) => {
      const used = p.options.map((o) => o.keyDigit);
      const nextKey =
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].find(
          (k) => !used.includes(k),
        ) ?? "";
      return {
        ...p,
        options: [
          ...p.options,
          {
            keyDigit: nextKey,
            label: "",
            actionType: "transfer_extension",
            targetExtension: "",
          },
        ],
      };
    });

  const setOption = (i: number, patch: Partial<IvrOption>) =>
    setForm((p) => {
      const options = [...p.options];
      options[i] = { ...options[i], ...patch };
      return { ...p, options };
    });

  const removeOption = (i: number) =>
    setForm((p) => ({
      ...p,
      options: p.options.filter((_, idx) => idx !== i),
    }));

  const usedKeys = form.options.map((o) => o.keyDigit);
  const availableKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  const rules = parseRules(form.scheduleJson);
  const setRules = (rs: ScheduleRule[]) =>
    setField("scheduleJson", rs.length ? JSON.stringify(rs) : null);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form, ivr?.id);
      onClose();
    } catch (e: any) {
      setSaveError(
        e?.response?.data?.message || "Erro ao salvar central telefônica.",
      );
    } finally {
      setSaving(false);
    }
  };

  const incompleteOption = form.options.find(
    (o) =>
      !o.keyDigit || (o.actionType !== "hangup" && !o.targetExtension.trim()),
  );
  const valid =
    form.name.trim() && form.contextName.trim() && !incompleteOption;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ivr ? "Editar central" : "Nova central telefônica"}
          </DialogTitle>
          <DialogDescription>
            Monte o atendimento automático: a mensagem que quem liga escuta e
            para onde vai cada tecla.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* 1. Identificação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Nome *" hint="Só para você reconhecer.">
              <input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Atendimento principal"
                className={inputCls()}
              />
            </FieldRow>
            <FieldRow
              label="Linha que recebe as ligações"
              hint={
                voipLines.length === 0
                  ? "Cadastre uma linha telefônica primeiro."
                  : "Quem ligar para esta linha cai nesta central."
              }
            >
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
                <option value="">Nenhuma (central desligada)</option>
                {voipLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>

          <Separator />

          {/* 2. Mensagem */}
          <div className="space-y-2">
            <SectionTitle>Mensagem de boas-vindas</SectionTitle>
            <AudioSelect
              value={form.audioFile}
              sounds={sounds}
              onChange={(v) => setField("audioFile", v)}
              emptyLabel="Nenhuma (silêncio)"
            />
            <p className="text-xs text-muted-foreground/60">
              Ex.: "Olá! Digite 1 para vendas ou 2 para suporte." Envie ou
              grave o áudio em{" "}
              <Link to="/audios-ura" className="underline hover:text-foreground">
                Áudios
              </Link>
              .
            </p>
          </div>

          <Separator />

          {/* 3. Opções */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionTitle>Opções do menu</SectionTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={addOption}
                type="button"
                disabled={usedKeys.length >= availableKeys.length}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar opção
              </Button>
            </div>

            {form.options.length === 0 && (
              <p className="text-xs text-muted-foreground/60 text-center py-2">
                Nenhuma opção. Sem opções, a ligação vai direto para o destino
                abaixo.
              </p>
            )}

            {form.options.map((opt, i) => (
              <div
                key={i}
                className="grid grid-cols-[64px_1fr_36px] sm:grid-cols-[64px_1fr_150px_1fr_36px] gap-2 items-end"
              >
                <FieldRow label="Tecla">
                  <select
                    value={opt.keyDigit}
                    onChange={(e) => setOption(i, { keyDigit: e.target.value })}
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
                <FieldRow label="Setor">
                  <input
                    value={opt.label}
                    onChange={(e) => setOption(i, { label: e.target.value })}
                    placeholder="Vendas"
                    className={inputCls()}
                  />
                </FieldRow>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive mb-0.5 sm:order-last"
                  onClick={() => removeOption(i)}
                  type="button"
                  title="Remover opção"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div className="col-span-3 sm:col-span-1">
                  <FieldRow label="Ao digitar">
                    <select
                      value={opt.actionType}
                      onChange={(e) =>
                        setOption(i, {
                          actionType: e.target.value as ActionType,
                          targetExtension: "",
                        })
                      }
                      className={inputCls()}
                    >
                      <option value="transfer_extension">Ligar para ramal</option>
                      <option value="transfer_queue">Ligar para fila</option>
                      <option value="hangup">Desligar</option>
                    </select>
                  </FieldRow>
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <FieldRow label="Destino">
                    {opt.actionType === "transfer_queue" ? (
                      <select
                        value={opt.targetExtension}
                        onChange={(e) =>
                          setOption(i, { targetExtension: e.target.value })
                        }
                        className={inputCls()}
                      >
                        <option value="">
                          {queues.length ? "Escolha a fila" : "Nenhuma fila criada"}
                        </option>
                        {queues.map((q) => (
                          <option key={q.id} value={q.name}>
                            {q.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <ExtensionSelect
                        value={opt.targetExtension}
                        extensions={extensions}
                        onChange={(v) => setOption(i, { targetExtension: v })}
                        emptyLabel={
                          opt.actionType === "hangup" ? "—" : "Escolha o ramal"
                        }
                        disabled={opt.actionType === "hangup"}
                      />
                    )}
                  </FieldRow>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* 4. Transbordo */}
          <FieldRow
            label="Se a pessoa não digitar nada, ligar para"
            hint="Também recebe quem digitar uma tecla errada várias vezes."
          >
            <ExtensionSelect
              value={form.fallbackExtension}
              extensions={extensions}
              onChange={(v) => setField("fallbackExtension", v || null)}
              emptyLabel="Ninguém — desligar a ligação"
            />
          </FieldRow>

          <Separator />

          {/* 5. Horário */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                checked={form.scheduleEnabled}
                onChange={(e) => setField("scheduleEnabled", e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Atender só em horário definido</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Fora do horário, quem ligar ouve um aviso e a ligação é
                  encerrada.
                </span>
              </span>
            </label>

            {form.scheduleEnabled && (
              <div className="space-y-3 pl-7">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_100px_100px_36px] gap-2 items-end"
                  >
                    <FieldRow label="Dias">
                      <select
                        value={rule.days}
                        onChange={(e) => {
                          const rs = [...rules];
                          rs[idx] = { ...rs[idx], days: e.target.value };
                          setRules(rs);
                        }}
                        className={inputCls()}
                      >
                        {DAYS_OPTIONS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </FieldRow>
                    <FieldRow label="Das">
                      <input
                        type="time"
                        value={rule.open}
                        onChange={(e) => {
                          const rs = [...rules];
                          rs[idx] = { ...rs[idx], open: e.target.value };
                          setRules(rs);
                        }}
                        className={inputCls()}
                      />
                    </FieldRow>
                    <FieldRow label="Até">
                      <input
                        type="time"
                        value={rule.close}
                        onChange={(e) => {
                          const rs = [...rules];
                          rs[idx] = { ...rs[idx], close: e.target.value };
                          setRules(rs);
                        }}
                        className={inputCls()}
                      />
                    </FieldRow>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive mb-0.5"
                      type="button"
                      title="Remover horário"
                      onClick={() => setRules(rules.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setRules([
                      ...rules,
                      { days: "mon-fri", open: "08:00", close: "18:00" },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar horário
                </Button>
                <FieldRow label="Aviso fora do horário">
                  <AudioSelect
                    value={form.closedAudioFile}
                    sounds={sounds}
                    onChange={(v) => setField("closedAudioFile", v)}
                    emptyLabel="Nenhum (só desliga)"
                  />
                </FieldRow>
              </div>
            )}
          </div>

          <Separator />

          {/* Avançado */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Ajustes técnicos
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FieldRow
                label="Tempo para digitar (s)"
                hint="Depois disso, vai para o destino padrão."
              >
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
              <FieldRow label="Tentativas com tecla errada">
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
                label="Contexto (Asterisk)"
                hint="Gerado a partir do nome."
              >
                <input
                  value={form.contextName}
                  onChange={(e) => setField("contextName", e.target.value)}
                  placeholder="atendimento-principal"
                  className={inputCls()}
                />
              </FieldRow>
            </div>
          )}
        </div>

        {incompleteOption && (
          <p className="text-xs text-amber-400">
            Escolha a tecla e o destino de todas as opções para salvar.
          </p>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

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
  const { user, extensions } = usePbx();
  const [ivrs, setIvrs] = useState<InboundIvr[]>([]);
  const [voipLines, setVoipLines] = useState<VoipLine[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dialogIvr, setDialogIvr] = useState<InboundIvr | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<InboundIvr | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    // Listas auxiliares dos seletores — se falharem (ex.: supervisor não
    // tem acesso a /sounds), o formulário continua funcionando sem elas.
    api.get("/queues").then((r) => setQueues(r.data)).catch(() => {});
    api.get("/sounds").then((r) => setSounds(r.data)).catch(() => {});
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
    setDeleteError(null);
    try {
      await api.delete(`/inbound-ivr/${deleteTarget.id}`);
      setIvrs((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message ?? "Erro ao excluir central.");
    } finally {
      setDeleting(false);
    }
  };

  const voipLineName = (id: number | null) =>
    voipLines.find((l) => l.id === id)?.name ?? "–";

  const soundName = (path: string | null) =>
    sounds.find((s) => s.asteriskPath === path)?.filename ?? path;

  const destinationText = (opt: IvrOption) => {
    if (opt.actionType === "hangup" || !opt.targetExtension) return "Desliga";
    if (opt.actionType === "transfer_queue") return `Fila ${opt.targetExtension}`;
    return extensionLabel(extensions, opt.targetExtension);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Central Telefônica
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Defina o que acontece quando alguém liga para a sua empresa: a
            mensagem de boas-vindas ("Digite 1 para vendas, 2 para
            suporte...") e para qual ramal ou fila cada opção leva.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
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
            Nenhuma central configurada — as ligações recebidas ainda não têm
            para onde ir.
            {canEdit && (
              <div className="mt-3">
                <Button size="sm" onClick={() => setDialogIvr("new")}>
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
              <div className="space-y-1.5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  {ivr.name}
                </CardTitle>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {ivr.voipLineId ? (
                    <span className="flex items-center gap-1">
                      <PhoneIncoming className="h-3 w-3 text-emerald-400" />
                      Recebe ligações da linha{" "}
                      <strong className="text-foreground/80">
                        {voipLineName(ivr.voipLineId)}
                      </strong>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Nenhuma linha — ninguém consegue ligar para esta central
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    {ivr.audioFile ? soundName(ivr.audioFile) : "Sem mensagem"}
                  </span>
                  {ivr.scheduleEnabled && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Com horário de atendimento
                    </span>
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
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(ivr);
                    }}
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
                    <TableHead>Setor</TableHead>
                    <TableHead>Vai para</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ivr.options
                    .slice()
                    .sort((a, b) => a.keyDigit.localeCompare(b.keyDigit))
                    .map((opt) => (
                      <TableRow key={opt.keyDigit}>
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
                            className="text-xs font-normal"
                          >
                            {destinationText(opt)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          )}

          <CardContent className="pt-3 pb-1 text-xs text-muted-foreground">
            {ivr.options.length === 0 && "Sem opções de menu. "}
            Sem tecla:{" "}
            <span className="text-foreground/80">
              {extensionLabel(extensions, ivr.fallbackExtension) ??
                "a ligação é encerrada"}
            </span>
          </CardContent>

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
                  <span className="text-foreground/60">Tempo para digitar:</span>{" "}
                  {ivr.digitTimeoutSeconds}s
                </div>
                <div>
                  <span className="text-foreground/60">
                    Tentativas com tecla errada:
                  </span>{" "}
                  {ivr.maxInvalidAttempts}
                </div>
                <div>
                  <span className="text-foreground/60">Contexto:</span>{" "}
                  <code>{ivr.contextName}</code>
                </div>
                {ivr.scheduleEnabled &&
                  parseRules(ivr.scheduleJson).map((r, i) => (
                    <div key={i}>
                      <span className="text-foreground/60">Horário:</span>{" "}
                      {DAYS_OPTIONS.find((d) => d.value === r.days)?.label ??
                        r.days}
                      , {r.open}–{r.close}
                    </div>
                  ))}
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
        queues={queues}
        sounds={sounds}
        extensions={extensions}
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
              Excluir <strong>{deleteTarget?.name}</strong>? As ligações que
              chegam por esta central deixarão de ser atendidas.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
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
