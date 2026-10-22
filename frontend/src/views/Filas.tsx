import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Pencil, Trash2, RefreshCw,
  Loader2, AlertCircle, Phone, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "../api";
import { usePbx } from "../context/PbxContext";

/* ── Types ──────────────────────────────────────────────────── */

interface QueueMember {
  id?: number;
  extensionNumber: string;
  penalty: number;
}

interface AsteriskQueue {
  id: number;
  name: string;
  strategy: string;
  timeout: number;
  maxlen: number;
  wrapuptime: number;
  musiconhold: string | null;
  announce: string | null;
  members: QueueMember[];
}

interface Extension {
  id: number;
  number: string;
  name: string;
}

/* ── Constants ──────────────────────────────────────────────── */

// Os valores são os nomes de estratégia do Asterisk; os rótulos descrevem
// o comportamento para quem não conhece o Asterisk.
const STRATEGIES = [
  { value: "ringall",     label: "Tocar em todos ao mesmo tempo" },
  { value: "rrmemory",    label: "Um de cada vez, revezando" },
  { value: "leastrecent", label: "Quem está há mais tempo sem atender" },
  { value: "fewestcalls", label: "Quem atendeu menos ligações" },
  { value: "linear",      label: "Sempre na mesma ordem (prioridade)" },
  { value: "random",      label: "Aleatório" },
  { value: "roundrobin",  label: "Revezamento simples" },
  { value: "wrandom",     label: "Aleatório por prioridade" },
];

/* ── Helpers ────────────────────────────────────────────────── */

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

function inputCls() {
  return "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

/* ── Queue Form Dialog ──────────────────────────────────────── */

const emptyForm = (): Omit<AsteriskQueue, "id"> => ({
  name: "",
  strategy: "ringall",
  timeout: 30,
  maxlen: 0,
  wrapuptime: 0,
  musiconhold: null,
  announce: null,
  members: [],
});

interface QueueDialogProps {
  open: boolean;
  queue: AsteriskQueue | null;
  extensions: Extension[];
  onClose: () => void;
  onSave: (form: Omit<AsteriskQueue, "id">, id?: number) => Promise<void>;
}

function QueueDialog({ open, queue, extensions, onClose, onSave }: QueueDialogProps) {
  const [form, setForm] = useState<Omit<AsteriskQueue, "id">>(queue ?? emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setForm(queue ? { ...queue } : emptyForm());
    setSaveError(null);
    setShowAdvanced(false);
  }, [queue, open]);

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const addMember = (extNumber: string) => {
    if (!extNumber || form.members.some((m) => m.extensionNumber === extNumber)) return;
    setForm((p) => ({
      ...p,
      members: [...p.members, { extensionNumber: extNumber, penalty: 0 }],
    }));
  };

  const removeMember = (extNumber: string) =>
    setForm((p) => ({ ...p, members: p.members.filter((m) => m.extensionNumber !== extNumber) }));

  const setPenalty = (extNumber: string, penalty: number) =>
    setForm((p) => ({
      ...p,
      members: p.members.map((m) =>
        m.extensionNumber === extNumber ? { ...m, penalty } : m,
      ),
    }));

  const availableExtensions = extensions.filter(
    (e) => !form.members.some((m) => m.extensionNumber === e.number),
  );

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form, queue?.id);
      onClose();
    } catch (e: any) {
      setSaveError(e?.response?.data?.message ?? "Erro ao salvar fila.");
    } finally {
      setSaving(false);
    }
  };

  const valid = form.name.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{queue ? "Editar fila" : "Nova fila"}</DialogTitle>
          <DialogDescription>
            Escolha quem atende esta fila e como as ligações são distribuídas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name + Strategy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow
              label="Nome da fila *"
              hint={queue ? "O nome não pode ser alterado." : "Sem espaços (ex: vendas, suporte)."}
            >
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                placeholder="suporte"
                className={inputCls()}
                disabled={!!queue}
              />
            </FieldRow>
            <FieldRow label="Como distribuir as ligações">
              <select value={form.strategy} onChange={(e) => setField("strategy", e.target.value)} className={inputCls()}>
                {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FieldRow>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Ajustes técnicos
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FieldRow label="Tempo tocando cada ramal (s)">
                <input type="number" min={5} max={120} value={form.timeout} onChange={(e) => setField("timeout", Number(e.target.value))} className={inputCls()} />
              </FieldRow>
              <FieldRow label="Máximo de pessoas esperando" hint="0 = sem limite">
                <input type="number" min={0} value={form.maxlen} onChange={(e) => setField("maxlen", Number(e.target.value))} className={inputCls()} />
              </FieldRow>
              <FieldRow label="Descanso após cada ligação (s)" hint="Antes de receber a próxima">
                <input type="number" min={0} max={300} value={form.wrapuptime} onChange={(e) => setField("wrapuptime", Number(e.target.value))} className={inputCls()} />
              </FieldRow>
              <FieldRow label="Música de espera" hint="Classe de música do Asterisk (padrão: default)">
                <input value={form.musiconhold ?? ""} onChange={(e) => setField("musiconhold", e.target.value || null)} placeholder="default" className={inputCls()} />
              </FieldRow>
              <FieldRow label="Aviso de posição na fila" hint="Áudio opcional (ex: custom/posicao)">
                <input value={form.announce ?? ""} onChange={(e) => setField("announce", e.target.value || null)} placeholder="custom/posicao" className={inputCls()} />
              </FieldRow>
            </div>
          )}

          <Separator />

          {/* Members */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quem atende
              <Badge variant="secondary" className="ml-2">{form.members.length}</Badge>
            </p>
            {availableExtensions.length > 0 && (
              <div className="flex gap-2 items-center">
                <select
                  id="ext-add-select"
                  className={inputCls() + " w-44 h-8 text-xs"}
                  defaultValue=""
                  onChange={(e) => { addMember(e.target.value); e.target.value = ""; }}
                >
                  <option value="">+ Adicionar ramal</option>
                  {availableExtensions.map((e) => (
                    <option key={e.number} value={e.number}>{e.number} — {e.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {form.members.length === 0 && (
            <p className="text-xs text-amber-400/80 text-center py-2">
              Adicione pelo menos um ramal — sem ninguém, quem liga fica esperando sem ser atendido.
            </p>
          )}

          {form.members.map((m) => {
            const ext = extensions.find((e) => e.number === m.extensionNumber);
            return (
              <div key={m.extensionNumber} className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-md border border-border bg-muted/30 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono font-semibold">{m.extensionNumber}</span>
                  {ext && <span className="text-muted-foreground text-xs">— {ext.name}</span>}
                </div>
                <FieldRow label="Prioridade">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={m.penalty}
                    onChange={(e) => setPenalty(m.extensionNumber, Number(e.target.value))}
                    className={inputCls() + " w-20"}
                    title="0 = recebe primeiro; números maiores recebem só se os anteriores estiverem ocupados"
                  />
                </FieldRow>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive mt-5 shrink-0"
                  onClick={() => removeMember(m.extensionNumber)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {saveError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button disabled={!valid || saving} onClick={handleSubmit}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {queue ? "Salvar alterações" : "Criar fila"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main view ──────────────────────────────────────────────── */

export default function Filas() {
  const { user } = usePbx();
  const [queues, setQueues] = useState<AsteriskQueue[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogQueue, setDialogQueue] = useState<AsteriskQueue | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<AsteriskQueue | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "supervisor";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, eRes] = await Promise.all([
        api.get("/queues"),
        api.get("/extensions"),
      ]);
      setQueues(qRes.data);
      setExtensions(eRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Erro ao carregar filas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: Omit<AsteriskQueue, "id">, id?: number) => {
    if (id) {
      const res = await api.put(`/queues/${id}`, form);
      setQueues((prev) => prev.map((q) => (q.id === id ? res.data : q)));
    } else {
      const res = await api.post("/queues", form);
      setQueues((prev) => [...prev, res.data]);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/queues/${deleteTarget.id}`);
      setQueues((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message ?? "Erro ao excluir fila.");
    } finally {
      setDeleting(false);
    }
  };

  const strategyLabel = (val: string) =>
    STRATEGIES.find((s) => s.value === val)?.label ?? val;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Filas de Atendimento
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Um grupo de atendentes que divide as ligações recebidas. Quem liga
            espera ouvindo música até alguém ficar livre.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Recarregar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {canEdit && (
            <Button onClick={() => setDialogQueue("new")} className="gap-2">
              <Plus className="h-4 w-4" /> Nova fila
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

      {!loading && queues.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma fila ainda. Filas são opcionais — use quando várias
            pessoas atendem o mesmo setor.
            {canEdit && (
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => setDialogQueue("new")}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Criar primeira fila
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && queues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {queues.length} {queues.length === 1 ? "fila configurada" : "filas configuradas"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">Distribuição</TableHead>
                  <TableHead className="w-28 text-center">Atendentes</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{q.name}</span>
                        {q.members.length > 0 && (
                          <div className="hidden lg:flex gap-1 flex-wrap">
                            {q.members.slice(0, 4).map((m) => (
                              <Badge key={m.extensionNumber} variant="outline" className="text-[10px] px-1.5 py-0">
                                {m.extensionNumber}
                              </Badge>
                            ))}
                            {q.members.length > 4 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{q.members.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {strategyLabel(q.strategy)}
                    </TableCell>
                    <TableCell className="text-center">
                      {q.members.length > 0 ? (
                        <Badge variant="secondary">{q.members.length}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/40" title="Sem atendentes, ninguém recebe as ligações desta fila">
                          Nenhum
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialogQueue(q)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { setDeleteError(null); setDeleteTarget(q); }} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <QueueDialog
        open={dialogQueue !== null}
        queue={dialogQueue === "new" ? null : (dialogQueue as AsteriskQueue | null)}
        extensions={extensions}
        onClose={() => setDialogQueue(null)}
        onSave={handleSave}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir fila</DialogTitle>
            <DialogDescription>
              Excluir a fila <strong>{deleteTarget?.name}</strong>? Opções da
              Central Telefônica que apontam para ela deixarão de funcionar.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
