import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePbx } from "../context/PbxContext";
import type { VoipLine } from "../types";

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
import { Separator } from "@/components/ui/separator";

import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const CODEC_OPTIONS = ["ulaw", "alaw", "g729", "g722", "gsm", "opus"];

const emptyForm = {
  name: "",
  username: "",
  secret: "",
  host: "",
  port: 5060,
  context: "default",
  inboundContext: "",
  transport: "udp",
  type: "peer",
  dtmfmode: "rfc2833",
  fromdomain: "",
  codecs: ["ulaw", "alaw"],
  callLimit: 0,
  insecure: "invite,port",
};

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
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}

function CodecCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (codec: string) => {
    if (selected.includes(codec)) {
      if (selected.length === 1) return; // mínimo 1
      onChange(selected.filter((c) => c !== codec));
    } else {
      onChange([...selected, codec]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {CODEC_OPTIONS.map((codec) => (
        <label
          key={codec}
          className="flex items-center gap-1.5 cursor-pointer select-none text-sm"
        >
          <input
            type="checkbox"
            checked={selected.includes(codec)}
            onChange={() => toggle(codec)}
            className="rounded"
          />
          {codec}
        </label>
      ))}
    </div>
  );
}

export default function LinhasVoip() {
  const { t } = useTranslation();
  const {
    voipLines,
    createVoipLine,
    updateVoipLine,
    deleteVoipLine,
    reprovisionVoipLine,
  } = usePbx();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<VoipLine | null>(null);
  const [editingLine, setEditingLine] = useState<VoipLine | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [reprovisioningId, setReprovisioningId] = useState<string | null>(null);

  const set = (field: string, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  const openCreate = () => {
    setEditingLine(null);
    setForm(emptyForm);
    setShowAdvanced(false);
    setDialogOpen(true);
  };

  const openEdit = (line: VoipLine) => {
    setEditingLine(line);
    setForm({
      name: line.name,
      username: line.username || "",
      secret: "",
      host: line.host,
      port: line.port || 5060,
      context: line.context || "default",
      inboundContext: line.inboundContext || "",
      transport: line.transport || "udp",
      type: line.type || "peer",
      dtmfmode: line.dtmfmode || "rfc2833",
      fromdomain: line.fromdomain || "",
      codecs: (line.codecs || "ulaw,alaw").split(",").map((c) => c.trim()),
      callLimit: line.callLimit ?? 0,
      insecure: line.insecure ?? "invite,port",
    });
    setShowAdvanced(false);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    const payload = {
      ...form,
      codecs: form.codecs.join(","),
      inboundContext: form.inboundContext.trim() || undefined,
      fromdomain: form.fromdomain.trim() || undefined,
      insecure: form.insecure.trim() || undefined,
      transport:
        form.transport === "udp"
          ? "transport-udp"
          : form.transport === "tcp"
            ? "transport-tcp"
            : form.transport === "tls"
              ? "transport-tls"
              : form.transport,
    };
    try {
      if (editingLine) {
        await updateVoipLine(editingLine.id, payload);
        setFeedback({ type: "success", message: "Linha salva com sucesso." });
      } else {
        await createVoipLine(payload);
        setFeedback({ type: "success", message: "Linha criada com sucesso." });
      }
      setDialogOpen(false);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.response?.data?.error || "Erro ao salvar linha.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setLoading(true);
    try {
      await deleteVoipLine(deleteDialog.id);
      setDeleteDialog(null);
      setFeedback({ type: "success", message: "Linha removida." });
    } catch {
      setFeedback({ type: "error", message: "Erro ao remover linha." });
    } finally {
      setLoading(false);
    }
  };

  const handleReprovision = async (id: string) => {
    setReprovisioningId(id);
    try {
      await reprovisionVoipLine(id);
      setFeedback({ type: "success", message: "Reprovisionado com sucesso." });
    } catch {
      setFeedback({ type: "error", message: "Erro ao reprovisionamento." });
    } finally {
      setReprovisioningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("voip.title")}</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t("voip.registerLine")}
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
            <Phone className="h-4 w-4" />
            Linhas cadastradas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Usuário / Host</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Porta</TableHead>
                <TableHead>Codecs</TableHead>
                <TableHead>Contexto saída</TableHead>
                <TableHead>Contexto entrada</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voipLines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhuma linha VoIP cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                voipLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.name}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {line.username}@
                      </span>
                      {line.host}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{line.type || "peer"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{line.port || 5060}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {line.codecs || "ulaw,alaw"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {line.context || "default"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {line.inboundContext ? (
                        <Badge
                          variant="secondary"
                          className="border-violet-500/40 text-violet-400"
                        >
                          {line.inboundContext}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReprovision(line.id)}
                          disabled={reprovisioningId === line.id}
                          title="Reprovisionamento"
                        >
                          {reprovisioningId === line.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(line)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteDialog(line)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLine ? "Editar linha VoIP" : "Nova linha VoIP"}
            </DialogTitle>
            <DialogDescription>
              Configure o tronco SIP. O <strong>Contexto de saída</strong> é
              usado pelos ramais para discar. O{" "}
              <strong>Contexto de entrada</strong> é o destino das chamadas
              recebidas (ex: URA receptiva).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identificação */}
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="Nome *"
                hint="Identificador único (ex: efix, voztel)"
              >
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="efix"
                  required
                  disabled={!!editingLine}
                />
              </FieldRow>
              <FieldRow label="Usuário / Número *">
                <Input
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  placeholder="4431425388"
                  required
                />
              </FieldRow>
              <FieldRow
                label={
                  editingLine
                    ? "Nova senha (deixe em branco para manter)"
                    : "Senha *"
                }
              >
                <Input
                  type="password"
                  value={form.secret}
                  onChange={(e) => set("secret", e.target.value)}
                  placeholder="••••••••"
                  required={!editingLine}
                />
              </FieldRow>
              <FieldRow label="Host *">
                <Input
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                  placeholder="sip.provedor.com.br"
                  required
                />
              </FieldRow>
              <FieldRow label="Porta">
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => set("port", Number(e.target.value))}
                  min={1}
                  max={65535}
                />
              </FieldRow>
              <FieldRow
                label="Tipo do tronco"
                hint="peer = sem registro | friend = bidirecional | user = registra"
              >
                <NativeSelect
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="peer">peer (tronco sem registro)</option>
                  <option value="friend">friend (bidirecional)</option>
                  <option value="user">user (registra no provedor)</option>
                </NativeSelect>
              </FieldRow>
            </div>

            {/* Roteamento */}
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Roteamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="Contexto de saída"
                hint="Contexto que os ramais usam para discar por esta linha"
              >
                <Input
                  value={form.context}
                  onChange={(e) => set("context", e.target.value)}
                  placeholder="default"
                />
              </FieldRow>
              <FieldRow
                label="Contexto de entrada (inbound)"
                hint="Para onde vão as chamadas recebidas (URA receptiva, direto para ramal, etc.)"
              >
                <Input
                  value={form.inboundContext}
                  onChange={(e) => set("inboundContext", e.target.value)}
                  placeholder="ura-receptiva (deixe vazio se não recebe)"
                />
              </FieldRow>
            </div>

            {/* Codecs */}
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Codecs de áudio
            </p>
            <CodecCheckboxes
              selected={form.codecs}
              onChange={(v) => set("codecs", v)}
            />

            {/* Avançado */}
            <Separator />
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Configurações avançadas
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Transporte">
                  <NativeSelect
                    value={form.transport}
                    onChange={(e) => set("transport", e.target.value)}
                  >
                    <option value="udp">UDP</option>
                    <option value="tcp">TCP</option>
                    <option value="tls">TLS</option>
                  </NativeSelect>
                </FieldRow>
                <FieldRow label="Modo DTMF">
                  <NativeSelect
                    value={form.dtmfmode}
                    onChange={(e) => set("dtmfmode", e.target.value)}
                  >
                    <option value="rfc2833">RFC 2833 (padrão)</option>
                    <option value="inband">Inband</option>
                    <option value="info">SIP INFO</option>
                    <option value="auto">Auto</option>
                  </NativeSelect>
                </FieldRow>
                <FieldRow
                  label="From Domain"
                  hint="Para provedores que exigem (ex: sip1.voztel.com.br)"
                >
                  <Input
                    value={form.fromdomain}
                    onChange={(e) => set("fromdomain", e.target.value)}
                    placeholder="sip.provedor.com.br"
                  />
                </FieldRow>
                <FieldRow
                  label="Insecure"
                  hint="invite,port = aceita qualquer origem (troncos sem registro)"
                >
                  <Input
                    value={form.insecure}
                    onChange={(e) => set("insecure", e.target.value)}
                    placeholder="invite,port"
                  />
                </FieldRow>
                <FieldRow label="Limite de chamadas" hint="0 = sem limite">
                  <Input
                    type="number"
                    value={form.callLimit}
                    onChange={(e) => set("callLimit", Number(e.target.value))}
                    min={0}
                  />
                </FieldRow>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingLine ? "Salvar alterações" : "Cadastrar linha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover linha VoIP</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover a linha{" "}
              <strong>{deleteDialog?.name}</strong>? Esta ação não pode ser
              desfeita.
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
