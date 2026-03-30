import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';

import {
  Settings, Phone, Upload, PlayCircle, Loader2, Plus, Trash2,
  CheckCircle2, AlertCircle, List, Download, Mic
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const emptyCampaignForm = {
  name: '',
  voipLineId: '',
  digitTimeoutSeconds: 5,
  maxAttempts: 2,
  retryIntervalSeconds: 30,
  concurrentCalls: 5,
  codec: 'ulaw',
  callTimeoutSeconds: 25,
  detectVoicemail: false,
  autoCallback: false,
  dialTechnology: 'SIP',
};

const emptyOption = { keyDigit: '1', actionType: 'transfer_extension', targetExtension: '' };
const phoneRegex = /^\d{10,14}$/;

function Input({ ...props }) {
  return (
    <input
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function NativeSelect({ value, onChange, children, disabled }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function Label({ children }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}

function FieldCol({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const statusVariant = (s) => {
  if (s === 'running') return 'default';
  if (s === 'paused') return 'secondary';
  if (s === 'finished') return 'outline';
  return 'outline';
};

export default function UraReversa() {
  const [campaigns, setCampaigns] = useState([]);
  const [voipLines, setVoipLines] = useState([]);
  const [extensions, setExtensions] = useState([]);

  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [options, setOptions] = useState([emptyOption]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvInvalid, setCsvInvalid] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => String(c.id) === String(selectedCampaignId)) || null,
    [campaigns, selectedCampaignId]
  );

  const socket = useMemo(() => io(API_URL), []);

  const fetchData = async () => {
    const [campaignsRes, linesRes, extsRes] = await Promise.all([
      api.get('/ura-reverse/campaigns'),
      api.get('/voip-lines'),
      api.get('/extensions'),
    ]);
    setCampaigns(campaignsRes.data);
    setVoipLines(linesRes.data);
    setExtensions(extsRes.data);
    if (!selectedCampaignId && campaignsRes.data.length) {
      setSelectedCampaignId(String(campaignsRes.data[0].id));
    }
  };

  useEffect(() => {
    fetchData().catch(() => {});
    socket.on('ura-reverse:stats', ({ campaignId, stats }) => {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, stats } : c))
      );
    });
    socket.on('ura-reverse:campaign-status', ({ campaignId, status }) => {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, status } : c))
      );
    });
    socket.on('ura-reverse:call-event', ({ campaignId }) => {
      if (String(campaignId) === String(selectedCampaignId)) {
        fetchData().catch(() => {});
      }
    });
    return () => {
      socket.off('ura-reverse:stats');
      socket.off('ura-reverse:campaign-status');
      socket.off('ura-reverse:call-event');
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    api.get(`/ura-reverse/campaigns/${selectedCampaignId}/options`)
      .then((res) => {
        setOptions(res.data.length ? res.data.map((item) => ({
          keyDigit: item.keyDigit,
          actionType: item.actionType,
          targetExtension: item.targetExtension || '',
        })) : [emptyOption]);
      })
      .catch(() => {});
  }, [selectedCampaignId]);

  const showFeedback = (type, msg) => {
    setFeedback({ type, message: msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleCreateCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.voipLineId) {
      showFeedback('error', 'Preencha nome e linha VoIP.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/ura-reverse/campaigns', campaignForm);
      showFeedback('success', 'Campanha URA criada.');
      setCampaignForm(emptyCampaignForm);
      await fetchData();
      setSelectedCampaignId(String(res.data.id));
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || 'Erro ao criar campanha.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAudio = async () => {
    if (!selectedCampaignId || !audioFile) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/audio`, formData);
      showFeedback('success', 'Áudio enviado.');
      setAudioFile(null);
      await fetchData();
    } catch {
      showFeedback('error', 'Erro ao enviar áudio.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOptions = async () => {
    if (!selectedCampaignId) return;
    setLoading(true);
    try {
      await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/options`, { options });
      showFeedback('success', 'Fluxo salvo.');
      await fetchData();
    } catch {
      showFeedback('error', 'Erro ao salvar fluxo.');
    } finally {
      setLoading(false);
    }
  };

  const parseCsvPreview = async (file) => {
    if (!file) { setCsvPreview([]); setCsvInvalid([]); return; }
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setCsvPreview([]); setCsvInvalid([]); return; }
    const headers = lines[0].split(',').map((c) => c.trim().toLowerCase());
    const phoneIndex = headers.findIndex((c) => ['telefone', 'phone', 'phonenumber'].includes(c));
    if (phoneIndex < 0) {
      setCsvPreview([]);
      setCsvInvalid(['Coluna "telefone" não encontrada no CSV.']);
      return;
    }
    const parsed = lines.slice(1).map((line) => String(line.split(',')[phoneIndex] || '').replace(/\D/g, ''));
    setCsvPreview(parsed.filter((p) => phoneRegex.test(p)).slice(0, 20));
    setCsvInvalid(parsed.filter((p) => p && !phoneRegex.test(p)).slice(0, 20));
  };

  const handleUploadCsv = async () => {
    if (!selectedCampaignId || !csvFile) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/contacts/upload`, formData);
      showFeedback('success', 'Lista enviada.');
      setCsvFile(null); setCsvPreview([]); setCsvInvalid([]);
      await fetchData();
    } catch {
      showFeedback('error', 'Erro ao enviar lista.');
    } finally {
      setLoading(false);
    }
  };

  const handleControl = async (action) => {
    if (!selectedCampaignId) return;
    setLoading(true);
    try {
      await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/${action}`);
      await fetchData();
    } catch (err) {
      showFeedback('error', err?.response?.data?.error || `Erro ao ${action}.`);
    } finally {
      setLoading(false);
    }
  };

  const resolveRecordingUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const updateOption = (index, next) =>
    setOptions((prev) => prev.map((item, i) => (i === index ? { ...item, ...next } : item)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">URA Reversa</h1>
        
      </div>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="create">
        <TabsList className="w-full grid grid-cols-4 gap-4 mb-4">
          <TabsTrigger value="create"><Settings className="mr-1.5 h-3.5 w-3.5" />Criar URA</TabsTrigger>
          <TabsTrigger value="flow"><List className="mr-1.5 h-3.5 w-3.5" />Fluxo</TabsTrigger>
          <TabsTrigger value="contacts"><Upload className="mr-1.5 h-3.5 w-3.5" />Contatos</TabsTrigger>
          <TabsTrigger value="control"><PlayCircle className="mr-1.5 h-3.5 w-3.5" />Controle</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Criar / Configurar Campanha ── */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurar campanha URA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldCol label="Nome da campanha *">
                  <Input
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Cobrança Agosto"
                    required
                  />
                </FieldCol>
                <FieldCol label="Linha VoIP *">
                  <NativeSelect
                    value={campaignForm.voipLineId}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, voipLineId: e.target.value }))}
                  >
                    <option value="">Selecione...</option>
                    {voipLines.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} — {l.host}:{l.port}</option>
                    ))}
                  </NativeSelect>
                </FieldCol>
                <FieldCol label="Tempo para digitação (s)">
                  <Input type="number" value={campaignForm.digitTimeoutSeconds}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, digitTimeoutSeconds: Number(e.target.value) }))} />
                </FieldCol>
                <FieldCol label="Máx. tentativas">
                  <Input type="number" value={campaignForm.maxAttempts}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, maxAttempts: Number(e.target.value) }))} />
                </FieldCol>
                <FieldCol label="Intervalo entre tentativas (s)">
                  <Input type="number" value={campaignForm.retryIntervalSeconds}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, retryIntervalSeconds: Number(e.target.value) }))} />
                </FieldCol>
                <FieldCol label="Chamadas simultâneas">
                  <Input type="number" value={campaignForm.concurrentCalls}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, concurrentCalls: Number(e.target.value) }))} />
                </FieldCol>
                <FieldCol label="Timeout da chamada (s)">
                  <Input type="number" value={campaignForm.callTimeoutSeconds}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, callTimeoutSeconds: Number(e.target.value) }))} />
                </FieldCol>
                <FieldCol label="Tecnologia">
                  <NativeSelect
                    value={campaignForm.dialTechnology}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, dialTechnology: e.target.value }))}
                  >
                    <option value="SIP">SIP</option>
                    <option value="PJSIP">PJSIP</option>
                  </NativeSelect>
                </FieldCol>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={campaignForm.detectVoicemail}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, detectVoicemail: e.target.checked }))} />
                  Detectar caixa postal
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={campaignForm.autoCallback}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, autoCallback: e.target.checked }))} />
                  Callback automático
                </label>
              </div>
              <Button onClick={handleCreateCampaign} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-2 h-4 w-4" />
                Criar campanha URA
              </Button>

              {/* Campanha selecionada + áudio */}
              {campaigns.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <FieldCol label="Campanha ativa">
                    <NativeSelect
                      value={selectedCampaignId}
                      onChange={(e) => setSelectedCampaignId(e.target.value)}
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name} ({c.status || 'inativa'})</option>
                      ))}
                    </NativeSelect>
                  </FieldCol>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label>Áudio da URA (.wav 8 kHz mono)</Label>
                      <input
                        type="file"
                        accept=".wav"
                        onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground cursor-pointer"
                      />
                    </div>
                    <Button variant="outline" onClick={handleUploadAudio} disabled={loading || !audioFile || !selectedCampaignId}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Mic className="mr-1.5 h-4 w-4" />
                      Enviar áudio
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Fluxo da URA ── */}
        <TabsContent value="flow">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurar fluxo (opções de teclas)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedCampaignId ? (
                <p className="text-sm text-muted-foreground">Selecione ou crie uma campanha primeiro.</p>
              ) : (
                <>
                  {options.map((opt, index) => (
                    <div key={index} className="grid grid-cols-[90px_1fr_1fr_36px] gap-2 items-end">
                      <FieldCol label="Tecla">
                        <NativeSelect value={opt.keyDigit} onChange={(e) => updateOption(index, { keyDigit: e.target.value })}>
                          {Array.from({ length: 10 }, (_, i) => (
                            <option key={i} value={String(i)}>{i}</option>
                          ))}
                        </NativeSelect>
                      </FieldCol>
                      <FieldCol label="Ação">
                        <NativeSelect value={opt.actionType} onChange={(e) => updateOption(index, { actionType: e.target.value })}>
                          <option value="transfer_extension">Transferir para ramal</option>
                          <option value="speak_commercial">Falar com comercial</option>
                          <option value="hangup">Encerrar</option>
                        </NativeSelect>
                      </FieldCol>
                      <FieldCol label="Ramal destino">
                        <NativeSelect
                          value={opt.targetExtension}
                          onChange={(e) => updateOption(index, { targetExtension: e.target.value })}
                          disabled={opt.actionType !== 'transfer_extension'}
                        >
                          <option value="">Selecione...</option>
                          {extensions.map((ext) => (
                            <option key={ext.id} value={ext.number}>{ext.number} — {ext.name}</option>
                          ))}
                        </NativeSelect>
                      </FieldCol>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={() => setOptions((prev) => [...prev, { ...emptyOption }])}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Adicionar opção
                    </Button>
                    <Button onClick={handleSaveOptions} disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar fluxo
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Upload de contatos ── */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload da lista de contatos (CSV)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedCampaignId ? (
                <p className="text-sm text-muted-foreground">Selecione ou crie uma campanha primeiro.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Coluna esperada: <code className="bg-muted px-1 py-0.5 rounded text-xs">telefone</code> — números com 10-14 dígitos.
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] || null;
                      setCsvFile(f);
                      await parseCsvPreview(f);
                    }}
                    className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground cursor-pointer"
                  />
                  {csvInvalid.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {csvInvalid.length} número(s) inválido(s): {csvInvalid.slice(0, 5).join(', ')}
                        {csvInvalid.length > 5 ? '...' : ''}
                      </AlertDescription>
                    </Alert>
                  )}
                  {csvPreview.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Preview ({csvPreview.length} número(s) válido(s)):
                      </p>
                      <div className="border rounded-md p-2 max-h-32 overflow-y-auto">
                        {csvPreview.map((phone, i) => (
                          <p key={i} className="text-sm">{phone}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button onClick={handleUploadCsv} disabled={loading || !csvFile}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Upload className="mr-2 h-4 w-4" />
                    Enviar CSV
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Controle da Campanha ── */}
        <TabsContent value="control">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-zinc-200">Controle da campanha</CardTitle>
                {selectedCampaign && (
                  <Badge variant={statusVariant(selectedCampaign.status)} className="capitalize">
                    {selectedCampaign.status || 'inativa'}
                  </Badge>
                )}
              </div>
              {selectedCampaign && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => handleControl('start')} disabled={loading} className="bg-violet-600 hover:bg-violet-700 gap-1.5">
                    <PlayCircle className="h-4 w-4" />Iniciar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleControl('pause')} disabled={loading} className="border-zinc-700 text-zinc-300">
                    Pausar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleControl('finish')} disabled={loading}>
                    Finalizar
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0">
              {!selectedCampaignId ? (
                <p className="text-sm text-zinc-500 p-4">Selecione ou crie uma campanha primeiro.</p>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-5 divide-x divide-zinc-800 border-b border-zinc-800">
                    {[
                      { label: 'Chamando',   value: selectedCampaign?.stats?.calling   || 0, color: '#a78bfa' },
                      { label: 'Atendidos',  value: selectedCampaign?.stats?.answered  || 0, color: '#22c55e' },
                      { label: 'Não atendeu',value: selectedCampaign?.stats?.no_answer || 0, color: '#f87171' },
                      { label: 'Inválido',   value: selectedCampaign?.stats?.invalid   || 0, color: '#94a3b8' },
                      { label: 'Ocupado',    value: selectedCampaign?.stats?.busy      || 0, color: '#facc15' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex flex-col items-center justify-center py-4 px-2">
                        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                        <span className="text-xs text-zinc-500 mt-0.5">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Contacts table */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Gravações por contato</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400">Telefone</TableHead>
                        <TableHead className="text-zinc-400">Status</TableHead>
                        <TableHead className="text-zinc-400">Opção</TableHead>
                        <TableHead className="text-zinc-400">Resultado</TableHead>
                        <TableHead className="text-zinc-400">Áudio</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedCampaign?.contacts || []).slice(0, 30).map((contact) => {
                        const audioUrl = resolveRecordingUrl(contact.recordingPath);
                        return (
                          <TableRow key={contact.id} className="border-zinc-800 hover:bg-zinc-800/30">
                            <TableCell className="font-mono text-sm">{contact.phoneNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs border-zinc-700">{contact.status}</Badge>
                            </TableCell>
                            <TableCell className="text-zinc-400">{contact.selectedOption || '—'}</TableCell>
                            <TableCell className="text-zinc-400">{contact.lastResult || '—'}</TableCell>
                            <TableCell>
                              {audioUrl ? (
                                <audio controls preload="none" src={audioUrl} className="h-8 w-36" style={{ colorScheme: 'dark' }} />
                              ) : (
                                <span className="text-zinc-600 text-xs">Sem gravação</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {audioUrl && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400" asChild>
                                  <a href={audioUrl} download>
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!(selectedCampaign?.contacts || []).length && (
                        <TableRow className="border-zinc-800">
                          <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                            Sem contatos carregados.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Audio preview dialog */}
      <Dialog open={!!audioPreviewUrl} onOpenChange={() => setAudioPreviewUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Áudio da gravação</DialogTitle>
            <DialogDescription>Reprodução do arquivo de áudio selecionado.</DialogDescription>
          </DialogHeader>
          {audioPreviewUrl && (
            <audio controls autoPlay src={audioPreviewUrl} className="w-full mt-2" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
