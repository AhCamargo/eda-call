import { useState, useMemo } from 'react';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';

import {
  Plus, Pencil, Trash2, RefreshCw, Eye, EyeOff, Copy, Phone,
  CheckCircle2, AlertCircle, SlidersHorizontal, Info
} from 'lucide-react';

const STATUS_DOT = {
  online:      'bg-emerald-500',
  offline:     'bg-zinc-500',
  paused:      'bg-amber-500',
  ringing:     'bg-blue-400 animate-pulse',
  in_call:     'bg-green-400 animate-pulse',
  in_campaign: 'bg-purple-400',
};

const STATUS_LABEL = {
  online: 'Online', offline: 'Offline', paused: 'Pausa',
  ringing: 'Tocando', in_call: 'Em ligação', in_campaign: 'Em campanha',
};

const EMPTY_FORM = { number: '', name: '', sipPassword: '', voipLineId: '' };

function InputField({ label, value, onChange, placeholder, type = 'text', required, helper }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-zinc-300">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
      />
      {helper && <p className="text-xs text-zinc-500">{helper}</p>}
    </div>
  );
}

export default function Ramais() {
  const {
    extensions,
    voipLines,
    createExtension,
    updateExtension,
    deleteExtension,
    reprovisionExtension,
    testCallBetweenExtensions,
  } = usePbx();

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Test call
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [testFeedback, setTestFeedback] = useState(null);

  // UI states
  const [revealedId, setRevealedId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reprovisioningId, setReprovisioningId] = useState(null);

  const showFeedback = (msg, type = 'ok') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createExtension(createForm);
      setCreateForm(EMPTY_FORM);
      setCreateOpen(false);
      showFeedback('Ramal criado com sucesso.');
    } catch (err) {
      showFeedback(err?.response?.data?.message || 'Erro ao criar ramal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const openEdit = (ext) => {
    setEditTarget(ext);
    setEditForm({
      number: ext.number,
      name: ext.name,
      sipPassword: '',
      voipLineId: ext.voipLineId ? String(ext.voipLineId) : '',
    });
    setEditOpen(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { number: editForm.number, name: editForm.name, voipLineId: editForm.voipLineId ? Number(editForm.voipLineId) : null };
      if (editForm.sipPassword) payload.sipPassword = editForm.sipPassword;
      await updateExtension(editTarget.id, payload);
      setEditOpen(false);
      showFeedback('Ramal atualizado.');
    } catch (err) {
      showFeedback(err?.response?.data?.message || 'Erro ao editar ramal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const openDelete = (ext) => { setDeleteTarget(ext); setDeleteOpen(true); };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteExtension(deleteTarget.id);
      setDeleteOpen(false);
      showFeedback(`Ramal ${deleteTarget.number} excluído.`);
    } catch {
      showFeedback('Erro ao excluir ramal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Reprovision ───────────────────────────────────────────────────────────
  const handleReprovision = async (ext) => {
    setReprovisioningId(ext.id);
    try {
      await reprovisionExtension(ext.id);
      showFeedback(`Ramal ${ext.number} reprovisionado.`);
    } catch {
      showFeedback('Erro ao reprovisionar.', 'error');
    } finally {
      setReprovisioningId(null);
    }
  };

  // ── Test Call ─────────────────────────────────────────────────────────────
  const handleTestCall = async () => {
    if (!sourceId || !destId) { setTestFeedback({ msg: 'Selecione origem e destino.', type: 'error' }); return; }
    if (sourceId === destId) { setTestFeedback({ msg: 'Origem e destino precisam ser diferentes.', type: 'error' }); return; }
    setLoading(true);
    try {
      const res = await testCallBetweenExtensions(Number(sourceId), Number(destId));
      setTestFeedback({ msg: res.message || 'Ligação de teste iniciada.', type: 'ok' });
    } catch {
      setTestFeedback({ msg: 'Erro ao iniciar teste.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = (pwd) => {
    navigator.clipboard.writeText(pwd).then(
      () => showFeedback('Senha copiada.'),
      () => showFeedback('Não foi possível copiar.', 'error')
    );
  };

  const sortedExtensions = useMemo(() =>
    [...extensions].sort((a, b) => String(a.number).localeCompare(String(b.number))),
    [extensions]
  );

  const voipLineName = (id) => voipLines.find((l) => l.id === id)?.name || '—';

  return (
    <div className="space-y-4 text-zinc-100 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Ramais</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-zinc-700 text-zinc-300 hover:text-blue-400 hover:border-blue-500/40"
            onClick={() => { setTestFeedback(null); setTestOpen(true); }}
          >
            <Phone size={14} />
            Teste de ligação
          </Button>
          <Button
            size="sm"
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => { setCreateForm(EMPTY_FORM); setCreateOpen(true); }}
          >
            <Plus size={14} />
            Novo ramal
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <Alert className={`border ${feedback.type === 'error' ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/40 bg-green-500/10'}`}>
          {feedback.type === 'error'
            ? <AlertCircle size={15} className="text-red-400" />
            : <CheckCircle2 size={15} className="text-green-400" />
          }
          <AlertDescription className={feedback.type === 'error' ? 'text-red-300' : 'text-green-300'}>
            {feedback.msg}
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela de ramais */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {sortedExtensions.length} ramal{sortedExtensions.length !== 1 ? 'is' : ''} cadastrado{sortedExtensions.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 w-10" />
                <TableHead className="text-zinc-400">Número</TableHead>
                <TableHead className="text-zinc-400">Nome</TableHead>
                <TableHead className="text-zinc-400">Linha VoIP</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Senha SIP</TableHead>
                <TableHead className="text-zinc-400 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExtensions.length === 0 && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-10">
                    Nenhum ramal cadastrado. Clique em "Novo ramal" para começar.
                  </TableCell>
                </TableRow>
              )}
              {sortedExtensions.map((ext) => (
                <TableRow key={ext.id} className="border-zinc-800 hover:bg-zinc-800/40 transition-colors">
                  <TableCell>
                    <span className={`w-2 h-2 rounded-full inline-block ${STATUS_DOT[ext.status] || 'bg-zinc-500'}`} />
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-zinc-200">{ext.number}</TableCell>
                  <TableCell className="text-zinc-300">{ext.name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">
                    {ext.voipLineId ? voipLineName(ext.voipLineId) : <span className="text-zinc-600">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                      {STATUS_LABEL[ext.status] || ext.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-zinc-400">
                        {revealedId === ext.id ? ext.password : '••••••••'}
                      </span>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setRevealedId((p) => p === ext.id ? null : ext.id)}
                              className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                            >
                              {revealedId === ext.id ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{revealedId === ext.id ? 'Ocultar' : 'Mostrar'} senha</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => copyPassword(ext.password)}
                              className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                            >
                              <Copy size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar senha</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                              onClick={() => handleReprovision(ext)}
                              disabled={reprovisioningId === ext.id}
                            >
                              <RefreshCw size={13} className={reprovisioningId === ext.id ? 'animate-spin' : ''} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reprovisionar no Asterisk</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10"
                              onClick={() => openEdit(ext)}
                            >
                              <Pencil size={13} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar ramal</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => openDelete(ext)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Excluir ramal</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Dialog: Criar Ramal ────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} className="text-violet-400" />
              Novo ramal
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Preencha os dados. A senha SIP é gerada automaticamente se não informada.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 py-1">
            <InputField
              label="Número"
              value={createForm.number}
              onChange={(v) => setCreateForm((p) => ({ ...p, number: v }))}
              placeholder="ex: 2001 ou C1-1000"
              required
            />
            <InputField
              label="Nome"
              value={createForm.name}
              onChange={(v) => setCreateForm((p) => ({ ...p, name: v }))}
              placeholder="ex: João Silva"
              required
            />
            <InputField
              label="Senha SIP"
              value={createForm.sipPassword}
              onChange={(v) => setCreateForm((p) => ({ ...p, sipPassword: v }))}
              placeholder="deixe em branco para gerar automaticamente"
              helper="Mínimo 6 caracteres. Se vazio, o sistema gera uma senha segura."
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Linha VoIP (outbound)</label>
              <Select
                value={createForm.voipLineId}
                onValueChange={(v) => setCreateForm((p) => ({ ...p, voipLineId: v }))}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Nenhuma (somente chamadas internas)" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="" className="text-zinc-400 focus:bg-zinc-700">— Nenhuma —</SelectItem>
                  {voipLines.map((line) => (
                    <SelectItem key={line.id} value={String(line.id)} className="text-zinc-100 focus:bg-zinc-700">
                      {line.name} — {line.host}:{line.port}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {voipLines.length === 0 && (
                <p className="text-xs text-amber-400 flex items-center gap-1">
                  <Info size={11} /> Cadastre linhas VoIP em "Linhas VoIP" para habilitar chamadas outbound.
                </p>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
                {loading && <RefreshCw size={13} className="animate-spin" />}
                Criar ramal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar Ramal ───────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={18} className="text-amber-400" />
              Editar ramal {editTarget?.number}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3 py-1">
            <InputField
              label="Número"
              value={editForm.number}
              onChange={(v) => setEditForm((p) => ({ ...p, number: v }))}
              required
            />
            <InputField
              label="Nome"
              value={editForm.name}
              onChange={(v) => setEditForm((p) => ({ ...p, name: v }))}
              required
            />
            <InputField
              label="Nova senha SIP"
              value={editForm.sipPassword}
              onChange={(v) => setEditForm((p) => ({ ...p, sipPassword: v }))}
              placeholder="deixe em branco para manter a atual"
              helper="Preencha apenas se quiser alterar a senha."
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Linha VoIP (outbound)</label>
              <Select
                value={editForm.voipLineId}
                onValueChange={(v) => setEditForm((p) => ({ ...p, voipLineId: v }))}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="" className="text-zinc-400 focus:bg-zinc-700">— Nenhuma —</SelectItem>
                  {voipLines.map((line) => (
                    <SelectItem key={line.id} value={String(line.id)} className="text-zinc-100 focus:bg-zinc-700">
                      {line.name} — {line.host}:{line.port}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
                {loading && <RefreshCw size={13} className="animate-spin" />}
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmar exclusão ─────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 size={18} />
              Excluir ramal
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-800 rounded-lg p-3 my-1">
            <p className="font-mono font-semibold">{deleteTarget?.number}</p>
            <p className="text-sm text-zinc-400">{deleteTarget?.name}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDelete} disabled={loading} variant="destructive" className="gap-2">
              {loading && <RefreshCw size={13} className="animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Teste de ligação ───────────────────────────────────────── */}
      <Dialog open={testOpen} onOpenChange={(open) => { setTestOpen(open); if (!open) setTestFeedback(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone size={18} className="text-blue-400" />
              Teste de ligação entre ramais
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Origina uma chamada com gravação para testar a conectividade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {testFeedback && (
              <Alert className={`border ${testFeedback.type === 'error' ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/40 bg-green-500/10'}`}>
                <AlertDescription className={testFeedback.type === 'error' ? 'text-red-300' : 'text-green-300'}>
                  {testFeedback.msg}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Ramal de origem</label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {extensions.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)} className="text-zinc-100 focus:bg-zinc-700">
                      {e.number} — {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Ramal de destino</label>
              <Select value={destId} onValueChange={setDestId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {extensions.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)} className="text-zinc-100 focus:bg-zinc-700">
                      {e.number} — {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setTestOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={handleTestCall}
              disabled={loading || !sourceId || !destId}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {loading && <RefreshCw size={13} className="animate-spin" />}
              <Phone size={14} />
              Iniciar teste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
