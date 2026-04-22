import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import api from "../api";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Plus,
  PlayCircle,
  Pause,
  StopCircle,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
  Users,
  Music,
  ChevronRight,
  ChevronLeft,
  Download,
  Settings,
  Pencil,
} from "lucide-react";

const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:5000";
const phoneRegex = /^\d{10,14}$/;

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

function FieldCol({ label, hint = "", children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

interface VoipLine { id: number; name: string; host: string; port: number }
interface Extension { id: number; number: string; name: string }
interface SoundFile { filename: string; asteriskPath: string }
interface UraOption { keyDigit: string; actionType: "transfer_extension" | "hangup"; targetExtension: string }
interface Campaign {
  id: number;
  name: string;
  status?: string;
  audioFile?: string;
  voipLineId?: number;
  concurrentCalls?: number;
  VoipLine?: VoipLine;
  contacts?: { id: number; phoneNumber: string; status: string; selectedOption?: string; lastResult?: string; recordingPath?: string }[];
  stats?: { calling?: number; answered?: number; no_answer?: number; invalid?: number; busy?: number };
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  running:  { label: "Rodando",   cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  paused:   { label: "Pausada",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  finished: { label: "Finalizada",cls: "bg-zinc-500/20 text-zinc-400 border-zinc-600" },
  inactive: { label: "Inativa",   cls: "bg-zinc-500/20 text-zinc-400 border-zinc-600" },
};

function StatusBadge({ status }: { status?: string }) {
  const s = STATUS_MAP[status ?? "inactive"] ?? STATUS_MAP.inactive;
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

const STEPS = ["Campanha", "Áudio", "Menu", "Contatos"];

export default function UraReversa() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [voipLines, setVoipLines] = useState<VoipLine[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [sounds, setSounds] = useState<SoundFile[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [form, setForm] = useState({ name: "", voipLineId: "", concurrentCalls: 5 });
  const [audioMode, setAudioMode] = useState<"library" | "upload">("library");
  const [selectedSound, setSelectedSound] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [options, setOptions] = useState<UraOption[]>([
    { keyDigit: "1", actionType: "transfer_extension", targetExtension: "" },
  ]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [csvInvalid, setCsvInvalid] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const socket = useState(() => io(API_URL))[0];

  const showMsg = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchAll = async () => {
    const [cRes, lRes, eRes, sRes] = await Promise.all([
      api.get<Campaign[]>("/ura-reverse/campaigns"),
      api.get<VoipLine[]>("/voip-lines"),
      api.get<Extension[]>("/extensions"),
      api.get<SoundFile[]>("/sounds").catch(() => ({ data: [] })),
    ]);
    setCampaigns(cRes.data);
    setVoipLines(lRes.data);
    setExtensions(eRes.data);
    setSounds((sRes as any).data ?? []);
  };

  useEffect(() => {
    fetchAll().catch(() => {});
    socket.on("ura-reverse:stats", ({ campaignId, stats }) =>
      setCampaigns((p) => p.map((c) => (c.id === campaignId ? { ...c, stats } : c))),
    );
    socket.on("ura-reverse:campaign-status", ({ campaignId, status }) =>
      setCampaigns((p) => p.map((c) => (c.id === campaignId ? { ...c, status } : c))),
    );
    return () => { socket.off("ura-reverse:stats"); socket.off("ura-reverse:campaign-status"); };
  }, []);

  const resetCreate = () => {
    setStep(0);
    setEditMode(false);
    setForm({ name: "", voipLineId: "", concurrentCalls: 5 });
    setAudioMode("library");
    setSelectedSound("");
    setAudioFile(null);
    setOptions([{ keyDigit: "1", actionType: "transfer_extension", targetExtension: "" }]);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvInvalid([]);
    setCreatedId(null);
  };

  const openEdit = async (c: Campaign) => {
    setEditMode(true);
    setCreatedId(c.id);
    setForm({
      name: c.name,
      voipLineId: String(c.voipLineId ?? ""),
      concurrentCalls: c.concurrentCalls ?? 5,
    });
    const isLibrary = !!c.audioFile && !c.audioFile.includes("campaigns/ura-campaign");
    setAudioMode(isLibrary ? "library" : "upload");
    setSelectedSound(isLibrary ? (c.audioFile ?? "") : "");
    setAudioFile(null);
    try {
      const res = await api.get(`/ura-reverse/campaigns/${c.id}/options`);
      setOptions(
        res.data.length
          ? res.data.map((o: any) => ({ keyDigit: o.keyDigit, actionType: o.actionType, targetExtension: o.targetExtension ?? "" }))
          : [{ keyDigit: "1", actionType: "transfer_extension", targetExtension: "" }],
      );
    } catch {
      setOptions([{ keyDigit: "1", actionType: "transfer_extension", targetExtension: "" }]);
    }
    setCsvFile(null);
    setCsvPreview([]);
    setCsvInvalid([]);
    setStep(0);
    setShowCreate(true);
  };

  // Step 1: create or update campaign
  const handleStepCampaign = async () => {
    if (!form.name.trim() || !form.voipLineId) {
      showMsg(false, "Preencha o nome e a linha VoIP.");
      return;
    }
    setSaving(true);
    try {
      if (editMode && createdId) {
        await api.patch(`/ura-reverse/campaigns/${createdId}`, {
          name: form.name.trim(),
          voipLineId: Number(form.voipLineId),
          concurrentCalls: form.concurrentCalls,
        });
      } else {
        const res = await api.post<Campaign>("/ura-reverse/campaigns", {
          name: form.name.trim(),
          voipLineId: Number(form.voipLineId),
          concurrentCalls: form.concurrentCalls,
        });
        setCreatedId(res.data.id);
      }
      setStep(1);
    } catch (err: any) {
      showMsg(false, err?.response?.data?.message ?? "Erro ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  };

  // Step 2: audio
  const handleStepAudio = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      if (audioMode === "library" && selectedSound) {
        await api.patch(`/ura-reverse/campaigns/${createdId}`, { audioFile: selectedSound });
      } else if (audioMode === "upload" && audioFile) {
        const fd = new FormData();
        fd.append("audio", audioFile);
        await api.post(`/ura-reverse/campaigns/${createdId}/audio`, fd);
      }
      setStep(2);
    } catch {
      showMsg(false, "Erro ao definir áudio.");
    } finally {
      setSaving(false);
    }
  };

  // Step 3: menu options
  const handleStepMenu = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      await api.post(`/ura-reverse/campaigns/${createdId}/options`, { options });
      setStep(3);
    } catch {
      showMsg(false, "Erro ao salvar menu.");
    } finally {
      setSaving(false);
    }
  };

  // Step 4: CSV
  const parseCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headers = lines[0]?.split(",").map((c) => c.trim().toLowerCase()) ?? [];
    const idx = headers.findIndex((c) => ["telefone", "phone", "phonenumber"].includes(c));
    if (idx < 0) { setCsvInvalid(['Coluna "telefone" não encontrada.']); setCsvPreview([]); return; }
    const parsed = lines.slice(1).map((l) => String(l.split(",")[idx] ?? "").replace(/\D/g, ""));
    setCsvPreview(parsed.filter((p) => phoneRegex.test(p)).slice(0, 20));
    setCsvInvalid(parsed.filter((p) => p && !phoneRegex.test(p)).slice(0, 5));
  };

  const handleStepContacts = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      if (csvFile) {
        const fd = new FormData();
        fd.append("file", csvFile);
        await api.post(`/ura-reverse/campaigns/${createdId}/contacts/upload`, fd);
      }
      await fetchAll();
      setShowCreate(false);
      resetCreate();
      showMsg(true, editMode ? "Campanha atualizada com sucesso!" : "Campanha criada com sucesso!");
    } catch {
      showMsg(false, "Erro ao enviar contatos.");
    } finally {
      setSaving(false);
    }
  };

  const handleControl = async (id: number, action: string) => {
    try {
      await api.post(`/ura-reverse/campaigns/${id}/${action}`);
      await fetchAll();
    } catch (err: any) {
      showMsg(false, err?.response?.data?.error ?? `Erro ao ${action}.`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/ura-reverse/campaigns/${deleteTarget.id}`);
      await fetchAll();
      setDeleteTarget(null);
      if (detailId === deleteTarget.id) setDetailId(null);
    } catch {
      showMsg(false, "Erro ao remover campanha.");
    } finally {
      setDeleting(false);
    }
  };

  const detail = campaigns.find((c) => c.id === detailId);
  const resolveAudio = (p?: string) => {
    if (!p) return null;
    if (/^https?:\/\//i.test(p)) return p;
    return `${API_URL}${p.startsWith("/") ? p : `/${p}`}`;
  };

  const updateOption = (i: number, patch: Partial<UraOption>) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">URA Reversa</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Campanhas de discagem com menu interativo.
          </p>
        </div>
        <Button onClick={() => { resetCreate(); setShowCreate(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {feedback && (
        <Alert variant={feedback.ok ? "default" : "destructive"}>
          {feedback.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{feedback.msg}</AlertDescription>
        </Alert>
      )}

      {/* Campaigns list */}
      <div className="grid gap-3">
        {campaigns.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Phone className="h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhuma campanha criada ainda.</p>
              <Button variant="outline" size="sm" onClick={() => { resetCreate(); setShowCreate(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Criar primeira campanha
              </Button>
            </CardContent>
          </Card>
        )}

        {campaigns.map((c) => {
          const isRunning = c.status === "running";
          const isPaused = c.status === "paused";
          const contacts = c.contacts ?? [];
          const done = contacts.filter((x) => x.status === "done").length;
          const pct = contacts.length ? Math.round((done / contacts.length) * 100) : 0;

          return (
            <Card key={c.id} className={`transition-all ${detailId === c.id ? "ring-1 ring-primary" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{c.name}</span>
                      <StatusBadge status={c.status} />
                      {c.VoipLine && (
                        <span className="text-xs text-muted-foreground">{c.VoipLine.name}</span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {contacts.length} contato{contacts.length !== 1 ? "s" : ""}
                      </span>
                      {contacts.length > 0 && (
                        <>
                          <span className="text-green-400">{c.stats?.answered ?? 0} atendidos</span>
                          <span className="text-red-400">{c.stats?.no_answer ?? 0} sem resposta</span>
                          {isRunning && <span className="text-purple-400">{c.stats?.calling ?? 0} chamando</span>}
                          <span>{pct}% concluído</span>
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    {contacts.length > 0 && (
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isRunning && (
                      <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 h-8"
                        onClick={() => handleControl(c.id, "start")}>
                        <PlayCircle className="h-3.5 w-3.5" /> Iniciar
                      </Button>
                    )}
                    {isRunning && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5"
                        onClick={() => handleControl(c.id, "pause")}>
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </Button>
                    )}
                    {isPaused && (
                      <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700 h-8"
                        onClick={() => handleControl(c.id, "start")}>
                        <PlayCircle className="h-3.5 w-3.5" /> Retomar
                      </Button>
                    )}
                    {(isRunning || isPaused) && (
                      <Button size="sm" variant="destructive" className="h-8"
                        onClick={() => handleControl(c.id, "finish")}>
                        <StopCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                      title="Editar campanha"
                      onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={() => setDetailId(detailId === c.id ? null : c.id)}>
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>

              {/* Detail panel */}
              {detailId === c.id && detail && (
                <div className="border-t mx-4 mb-4 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Contatos — {detail.contacts?.length ?? 0} registros
                  </p>
                  {(detail.contacts?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum contato carregado.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Opção</TableHead>
                            <TableHead>Resultado</TableHead>
                            <TableHead>Áudio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.contacts!.slice(0, 50).map((ct) => {
                            const url = resolveAudio(ct.recordingPath);
                            return (
                              <TableRow key={ct.id}>
                                <TableCell className="font-mono text-xs">{ct.phoneNumber}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{ct.status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {ct.selectedOption ?? "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {ct.lastResult ?? "—"}
                                </TableCell>
                                <TableCell>
                                  {url ? (
                                    <div className="flex items-center gap-1">
                                      <audio controls preload="none" src={url}
                                        className="h-7 w-32" style={{ colorScheme: "dark" }} />
                                      <a href={url} download>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                          <Download className="h-3 w-3" />
                                        </Button>
                                      </a>
                                    </div>
                                  ) : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Create campaign dialog ── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) { setShowCreate(false); if (!createdId) resetCreate(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? "Editar campanha" : "Nova campanha URA"}</DialogTitle>
            <DialogDescription>
              Passo {step + 1} de {STEPS.length} — {STEPS[step]}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0
                  ${i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/80 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>

          {/* Step 0: Campanha */}
          {step === 0 && (
            <div className="space-y-3">
              <FieldCol label="Nome da campanha *">
                <input className={inputCls} placeholder="Ex: Cobrança Agosto"
                  value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </FieldCol>
              <FieldCol label="Linha VoIP *" hint="Tronco pelo qual as ligações serão feitas.">
                <select className={selectCls} value={form.voipLineId}
                  onChange={(e) => setForm((p) => ({ ...p, voipLineId: e.target.value }))}>
                  <option value="">Selecione a linha...</option>
                  {voipLines.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </FieldCol>
              <FieldCol label="Ligações simultâneas" hint="Quantas ligações rodar ao mesmo tempo (recomendado: 5–10).">
                <input className={inputCls} type="number" min={1} max={50}
                  value={form.concurrentCalls}
                  onChange={(e) => setForm((p) => ({ ...p, concurrentCalls: Number(e.target.value) }))} />
              </FieldCol>
            </div>
          )}

          {/* Step 1: Áudio */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escolha o áudio que será reproduzido quando o cliente atender.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={audioMode === "library" ? "default" : "outline"}
                  onClick={() => setAudioMode("library")} className="gap-1.5">
                  <Music className="h-3.5 w-3.5" /> Da biblioteca
                </Button>
                <Button size="sm" variant={audioMode === "upload" ? "default" : "outline"}
                  onClick={() => setAudioMode("upload")} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" /> Fazer upload
                </Button>
              </div>

              {audioMode === "library" && (
                <FieldCol label="Arquivo de áudio">
                  {sounds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum áudio na biblioteca. Faça upload em <strong>Áudios URA</strong> ou use a opção acima.
                    </p>
                  ) : (
                    <select className={selectCls} value={selectedSound}
                      onChange={(e) => setSelectedSound(e.target.value)}>
                      <option value="">— sem áudio por enquanto —</option>
                      {sounds.map((s) => (
                        <option key={s.filename} value={s.asteriskPath}>{s.filename}</option>
                      ))}
                    </select>
                  )}
                </FieldCol>
              )}

              {audioMode === "upload" && (
                <FieldCol label="Arquivo WAV (8 kHz, mono)">
                  <input type="file" accept=".wav" className="text-sm text-muted-foreground"
                    onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
                </FieldCol>
              )}
            </div>
          )}

          {/* Step 2: Menu */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Defina o que acontece quando o cliente pressiona uma tecla.
              </p>
              {options.map((opt, i) => (
                <div key={i} className="flex items-end gap-2 p-3 rounded-md border bg-muted/20">
                  <FieldCol label="Tecla">
                    <select className={`${selectCls} w-20`} value={opt.keyDigit}
                      onChange={(e) => updateOption(i, { keyDigit: e.target.value })}>
                      {Array.from({ length: 10 }, (_, k) => (
                        <option key={k} value={String(k)}>{k}</option>
                      ))}
                    </select>
                  </FieldCol>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mb-2 shrink-0" />
                  <FieldCol label="Ação">
                    <select className={selectCls} value={opt.actionType}
                      onChange={(e) => updateOption(i, { actionType: e.target.value as any, targetExtension: "" })}>
                      <option value="transfer_extension">Transferir para ramal</option>
                      <option value="hangup">Encerrar chamada</option>
                    </select>
                  </FieldCol>
                  {opt.actionType === "transfer_extension" && (
                    <FieldCol label="Ramal">
                      <select className={selectCls} value={opt.targetExtension}
                        onChange={(e) => updateOption(i, { targetExtension: e.target.value })}>
                        <option value="">Selecione...</option>
                        {extensions.map((ext) => (
                          <option key={ext.id} value={ext.number}>
                            {ext.number}{ext.name ? ` — ${ext.name}` : ""}
                          </option>
                        ))}
                      </select>
                    </FieldCol>
                  )}
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive mb-0 shrink-0"
                    onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))}
                    disabled={options.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => setOptions((p) => [...p, { keyDigit: String(p.length), actionType: "transfer_extension", targetExtension: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Adicionar opção
              </Button>
            </div>
          )}

          {/* Step 3: Contatos */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {editMode
                  ? "Adicione mais contatos à campanha (opcional). Os já cadastrados serão mantidos."
                  : "Envie uma planilha CSV com os números a ligar."}{" "}
                A coluna deve se chamar{" "}
                <code className="bg-muted px-1 rounded text-xs">telefone</code>.
              </p>
              <div
                className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => csvInputRef.current?.click()}>
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {csvFile ? csvFile.name : "Clique para selecionar o arquivo CSV"}
                </p>
              </div>
              <input ref={csvInputRef} type="file" accept=".csv" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setCsvFile(f);
                  if (f) await parseCsv(f);
                }} />

              {csvInvalid.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {csvInvalid.length} número(s) inválido(s): {csvInvalid.join(", ")}
                  </AlertDescription>
                </Alert>
              )}
              {csvPreview.length > 0 && (
                <div className="border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5">
                  <p className="text-xs text-muted-foreground mb-1">{csvPreview.length} número(s) válido(s) — prévia:</p>
                  {csvPreview.map((p, i) => (
                    <p key={i} className="font-mono text-xs">{p}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm"
              onClick={() => { if (step === 0) { setShowCreate(false); resetCreate(); } else setStep((s) => s - 1); }}
              disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {step === 0 ? "Cancelar" : "Voltar"}
            </Button>

            <Button size="sm" disabled={saving}
              onClick={() => {
                if (step === 0) handleStepCampaign();
                else if (step === 1) handleStepAudio();
                else if (step === 2) handleStepMenu();
                else handleStepContacts();
              }}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {step < 3 ? <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></> : "Concluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover campanha</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong>? Todos os contatos e histórico serão apagados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
