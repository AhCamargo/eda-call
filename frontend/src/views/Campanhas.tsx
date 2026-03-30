import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';
import api from '../api';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  Plus, Pencil, Trash2, Play, Upload, CheckCircle2, AlertCircle,
  Loader2, Megaphone, Phone, Users, BarChart2,
  PhoneCall, PhoneOff, PhoneMissed, PhoneForwarded,
} from 'lucide-react';

function Input({ ...props }) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function Label({ children }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}

const RESULT_CONFIG = {
  atendida:          { label: 'Atendida',       icon: PhoneCall,     color: '#22c55e' },
  nao_atendida:      { label: 'Não atendida',   icon: PhoneMissed,   color: '#f87171' },
  numero_nao_existe: { label: 'Nº inexistente', icon: PhoneOff,      color: '#94a3b8' },
  rejeitada:         { label: 'Rejeitada',       icon: PhoneForwarded,color: '#facc15' },
};

function ResultBadge({ result }) {
  const cfg = RESULT_CONFIG[result] || { label: result, icon: PhoneOff, color: '#94a3b8' };
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: cfg.color }}>
      <cfg.icon size={11} />
      {cfg.label}
    </span>
  );
}

const statusVariant = (status) => {
  if (status === 'active' || status === 'running') return 'default';
  if (status === 'paused') return 'secondary';
  if (status === 'finished') return 'outline';
  return 'outline';
};

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
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Report state
  const [reportDialog, setReportDialog] = useState(null); // { campaign, stats, calls } | null
  const [reportLoading, setReportLoading] = useState(false);

  const openReport = async (campaign) => {
    setReportLoading(true);
    setReportDialog({ campaign, stats: null, calls: [] });
    try {
      const res = await api.get(`/campaigns/${campaign.id}/report`);
      setReportDialog({ campaign, ...res.data });
    } catch {
      showFeedback('error', 'Erro ao carregar relatório.');
      setReportDialog(null);
    } finally {
      setReportLoading(false);
    }
  };

  // Assignment state
  const [assignDialog, setAssignDialog] = useState(null); // { campaign, tab: 'extensions'|'voiplines'|'phones' }
  const [selectedExtensions, setSelectedExtensions] = useState([]);
  const [selectedVoipLines, setSelectedVoipLines] = useState([]);
  const [csvFile, setCsvFile] = useState(null);

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setForm({ name: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (campaign) => {
    setEditingCampaign(campaign);
    setForm({ name: campaign.name, description: campaign.description || '' });
    setDialogOpen(true);
  };

  const openAssign = (campaign) => {
    setAssignDialog({ campaign });
    setSelectedExtensions((campaign.extensions || []).map((e) => String(e.id)));
    setSelectedVoipLines((campaign.voipLines || []).map((l) => String(l.id)));
    setCsvFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, form);
        showFeedback('success', 'Campanha atualizada.');
      } else {
        await createCampaign(form);
        showFeedback('success', 'Campanha criada.');
      }
      setDialogOpen(false);
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Erro ao salvar.');
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
      showFeedback('success', 'Campanha removida.');
    } catch {
      showFeedback('error', 'Erro ao remover.');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (id) => {
    setLoading(true);
    try {
      await startCampaign(id);
      showFeedback('success', 'Campanha iniciada.');
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Erro ao iniciar.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignExtensions = async () => {
    if (!assignDialog?.campaign) return;
    setLoading(true);
    try {
      await assignExtensions(assignDialog.campaign.id, selectedExtensions.map(Number));
      showFeedback('success', 'Ramais associados.');
    } catch {
      showFeedback('error', 'Erro ao associar ramais.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVoipLines = async () => {
    if (!assignDialog?.campaign) return;
    setLoading(true);
    try {
      await assignVoipLines(assignDialog.campaign.id, selectedVoipLines.map(Number));
      showFeedback('success', 'Linhas VoIP associadas.');
    } catch {
      showFeedback('error', 'Erro ao associar linhas.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhones = async () => {
    if (!assignDialog?.campaign || !csvFile) return;
    setLoading(true);
    try {
      await uploadPhones(assignDialog.campaign.id, csvFile);
      setCsvFile(null);
      showFeedback('success', 'Lista enviada.');
    } catch {
      showFeedback('error', 'Erro ao enviar lista.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExtension = (id) => {
    setSelectedExtensions((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleVoipLine = (id) => {
    setSelectedVoipLines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('campaigns.title')}</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('campaigns.createCampaign')}
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
            <Megaphone className="h-4 w-4" />
            Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contatos</TableHead>
                <TableHead>Linhas VoIP</TableHead>
                <TableHead className="text-right pr-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma campanha cadastrada.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(campaign.status)}>
                        {campaign.status || 'inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>{campaign.contacts?.length || 0}</TableCell>
                    <TableCell>
                      {(campaign.voipLines || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(campaign.voipLines || []).map((l) => (
                            <Badge key={l.id} variant="outline" className="text-xs">{l.name}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">{t('campaigns.noLine')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Ver relatório"
                          onClick={() => openReport(campaign)}
                        >
                          <BarChart2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Associar ramais / linhas / contatos"
                          onClick={() => openAssign(campaign)}
                        >
                          <Users className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleStart(campaign.id)}
                          disabled={loading}
                          title={t('campaigns.start')}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(campaign)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteDialog(campaign)}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? t('campaigns.saveCampaign') : t('campaigns.createCampaign')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Black Friday 2025"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCampaign ? t('campaigns.saveCampaign') : t('campaigns.createCampaign')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar campanha: {assignDialog?.campaign?.name}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="extensions">
            <TabsList className="w-full gap-4 mb-4">
              <TabsTrigger value="extensions" className="flex-1">
                <Phone className="mr-1.5 h-3.5 w-3.5" />Ramais
              </TabsTrigger>
              <TabsTrigger value="voiplines" className="flex-1">
                <Megaphone className="mr-1.5 h-3.5 w-3.5" />Linhas VoIP
              </TabsTrigger>
              <TabsTrigger value="phones" className="flex-1">
                <Upload className="mr-1.5 h-3.5 w-3.5" />Contatos CSV
              </TabsTrigger>
            </TabsList>

            <TabsContent value="extensions" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">Selecione os ramais para esta campanha:</p>
              <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2">
                {extensions.map((ext) => (
                  <label key={ext.id} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedExtensions.includes(String(ext.id))}
                      onChange={() => toggleExtension(String(ext.id))}
                    />
                    {ext.number} — {ext.name}
                  </label>
                ))}
              </div>
              <Button onClick={handleAssignExtensions} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar ramais
              </Button>
            </TabsContent>

            <TabsContent value="voiplines" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">Selecione as linhas VoIP para esta campanha:</p>
              <div className="max-h-52 overflow-y-auto space-y-1 border rounded-md p-2">
                {voipLines.map((line) => (
                  <label key={line.id} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedVoipLines.includes(String(line.id))}
                      onChange={() => toggleVoipLine(String(line.id))}
                    />
                    {line.name} — {line.host}:{line.port}
                  </label>
                ))}
              </div>
              <Button onClick={handleAssignVoipLines} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar linhas VoIP
              </Button>
            </TabsContent>

            <TabsContent value="phones" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">Envie um arquivo CSV com coluna <code className="text-xs bg-muted px-1 py-0.5 rounded">telefone</code>:</p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground cursor-pointer"
              />
              {csvFile && (
                <p className="text-xs text-muted-foreground">Arquivo selecionado: {csvFile.name}</p>
              )}
              <Button onClick={handleUploadPhones} disabled={loading || !csvFile} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Upload className="mr-2 h-4 w-4" />
                Enviar lista
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={!!reportDialog} onOpenChange={(o) => !o && setReportDialog(null)}>
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
                  { label: 'Total contatos', value: reportDialog.stats.totalContacts, icon: Users,          color: '#a78bfa' },
                  { label: 'Atendidas',       value: reportDialog.stats.atendida,       icon: PhoneCall,     color: '#22c55e' },
                  { label: 'Não atendidas',   value: reportDialog.stats.nao_atendida,   icon: PhoneMissed,   color: '#f87171' },
                  { label: 'Nº inexistente',  value: reportDialog.stats.numero_nao_existe, icon: PhoneOff,   color: '#94a3b8' },
                ].map((k) => (
                  <div key={k.label} className="bg-zinc-800 rounded-lg p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <k.icon size={12} style={{ color: k.color }} />
                      {k.label}
                    </div>
                    <span className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</span>
                  </div>
                ))}
              </div>

              {/* Progresso */}
              {reportDialog.stats.totalContacts > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>Progresso ({reportDialog.stats.totalCalls} de {reportDialog.stats.totalContacts} chamadas)</span>
                    <span>{Math.round((reportDialog.stats.totalCalls / reportDialog.stats.totalContacts) * 100)}%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.round((reportDialog.stats.totalCalls / reportDialog.stats.totalContacts) * 100))}%` }}
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
                        <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
                          Nenhuma chamada registrada ainda.
                        </TableCell>
                      </TableRow>
                    ) : reportDialog.calls.map((call) => (
                      <TableRow key={call.id} className="border-zinc-800 hover:bg-zinc-800/30">
                        <TableCell className="font-mono text-sm text-zinc-300">{call.phoneNumber}</TableCell>
                        <TableCell>
                          <ResultBadge result={call.result} />
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {call.Extension ? `${call.Extension.number} — ${call.Extension.name}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500">
                          {new Date(call.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setReportDialog(null)}>
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
              Tem certeza que deseja remover <strong>{deleteDialog?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancelar</Button>
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
