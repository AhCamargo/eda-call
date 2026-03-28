import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { Plus, Pencil, Trash2, RefreshCw, Phone, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const emptyForm = {
  name: '',
  username: '',
  secret: '',
  host: '',
  port: 5060,
  context: 'default',
  transport: 'udp',
};

function FieldRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function Select({ value, onChange, children }) {
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

export default function LinhasVoip() {
  const { t } = useTranslation();
  const { voipLines, createVoipLine, updateVoipLine, deleteVoipLine, reprovisionVoipLine } = usePbx();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [reprovisioningId, setReprovisioningId] = useState(null);

  const openCreate = () => {
    setEditingLine(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (line) => {
    setEditingLine(line);
    setForm({
      name: line.name,
      username: line.username || '',
      secret: '',
      host: line.host,
      port: line.port || 5060,
      context: line.context || 'default',
      transport: line.transport || 'udp',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      if (editingLine) {
        await updateVoipLine(editingLine.id, form);
        setFeedback({ type: 'success', message: t('voip.saveLine') + ' ✓' });
      } else {
        await createVoipLine(form);
        setFeedback({ type: 'success', message: t('voip.registerLine') + ' ✓' });
      }
      setDialogOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.response?.data?.error || 'Erro ao salvar linha.' });
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
      setFeedback({ type: 'success', message: 'Linha removida.' });
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao remover linha.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReprovision = async (id) => {
    setReprovisioningId(id);
    try {
      await reprovisionVoipLine(id);
      setFeedback({ type: 'success', message: 'Reprovisionado com sucesso.' });
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao reprovisionamento.' });
    } finally {
      setReprovisioningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('voip.title')}</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('voip.registerLine')}
        </Button>
      </div>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          {feedback.type === 'success' ? (
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
                <TableHead>Porta</TableHead>
                <TableHead>Contexto</TableHead>
                <TableHead>Transporte</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voipLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma linha VoIP cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                voipLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.name}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{line.username}@</span>{line.host}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{line.port || 5060}</Badge>
                    </TableCell>
                    <TableCell>{line.context || 'default'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{line.transport || 'udp'}</Badge>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingLine ? 'Editar linha VoIP' : 'Nova linha VoIP'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Nome *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="efix"
                  required
                  disabled={!!editingLine}
                />
              </FieldRow>
              <FieldRow label="Usuário / Número *">
                <Input
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="431425388"
                  required
                />
              </FieldRow>
              <FieldRow label={editingLine ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}>
                <Input
                  type="password"
                  value={form.secret}
                  onChange={(e) => setForm((p) => ({ ...p, secret: e.target.value }))}
                  placeholder="••••••••"
                  required={!editingLine}
                />
              </FieldRow>
              <FieldRow label="Host *">
                <Input
                  value={form.host}
                  onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
                  placeholder="sip.provedor.com.br"
                  required
                />
              </FieldRow>
              <FieldRow label="Porta">
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm((p) => ({ ...p, port: Number(e.target.value) }))}
                  min={1}
                  max={65535}
                />
              </FieldRow>
              <FieldRow label="Contexto">
                <Input
                  value={form.context}
                  onChange={(e) => setForm((p) => ({ ...p, context: e.target.value }))}
                  placeholder="default"
                />
              </FieldRow>
              <FieldRow label="Transporte">
                <Select
                  value={form.transport}
                  onChange={(e) => setForm((p) => ({ ...p, transport: e.target.value }))}
                >
                  <option value="udp">UDP</option>
                  <option value="tcp">TCP</option>
                  <option value="tls">TLS</option>
                </Select>
              </FieldRow>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingLine ? t('voip.saveLine') : t('voip.registerLine')}
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
              Tem certeza que deseja remover a linha <strong>{deleteDialog?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
