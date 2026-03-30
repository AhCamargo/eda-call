import { useMemo, useState } from 'react';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

import {
  Phone, PhoneOff, PhoneMissed, Clock, Coffee, Pause, Play,
  User, History, PhoneCall, Mic, MicOff, Volume2
} from 'lucide-react';

const STATUS_CONFIG = {
  online:      { label: 'Online',       color: 'bg-emerald-500',  text: 'text-emerald-400' },
  offline:     { label: 'Offline',      color: 'bg-zinc-500',     text: 'text-zinc-400'    },
  paused:      { label: 'Em pausa',     color: 'bg-amber-500',    text: 'text-amber-400'   },
  ringing:     { label: 'Tocando',      color: 'bg-blue-400',     text: 'text-blue-400'    },
  in_call:     { label: 'Em ligação',   color: 'bg-green-400',    text: 'text-green-400'   },
  in_campaign: { label: 'Em campanha',  color: 'bg-purple-400',   text: 'text-purple-400'  },
};

const PAUSE_REASONS = [
  { value: 'Almoço',           label: '🍽 Almoço' },
  { value: 'Banheiro',         label: '🚻 Banheiro' },
  { value: 'Reunião',          label: '📋 Reunião' },
  { value: 'Suporte Técnico',  label: '🔧 Suporte Técnico' },
  { value: 'Treinamento',      label: '📚 Treinamento' },
];

function CallTimer({ startTime }) {
  const [now, setNow] = useState(Date.now());
  useMemo(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return <span className="font-mono text-2xl font-bold text-green-400">{mm}:{ss}</span>;
}

export default function AgentView() {
  const { extensions, reports, reportCallsByExtension, pauseExtension, resumeExtension } = usePbx();

  const [selectedExtId, setSelectedExtId] = useState('');
  const [pauseReason, setPauseReason] = useState(PAUSE_REASONS[0].value);
  const [callStartTime] = useState(Date.now());
  const [micMuted, setMicMuted] = useState(false);

  const selectedExt = useMemo(
    () => extensions.find((e) => String(e.id) === selectedExtId),
    [extensions, selectedExtId]
  );

  const statusCfg = selectedExt ? (STATUS_CONFIG[selectedExt.status] || STATUS_CONFIG.offline) : null;
  const isInCall = selectedExt?.status === 'in_call';
  const isRinging = selectedExt?.status === 'ringing';
  const isPaused = selectedExt?.status === 'paused';

  // Histórico do ramal selecionado (últimas 8 ligações)
  const myHistory = useMemo(() => {
    if (!selectedExt) return [];
    return reportCallsByExtension
      .filter((c) => c.extensionId === selectedExt.id || c.Extension?.id === selectedExt.id)
      .slice(0, 8);
  }, [reportCallsByExtension, selectedExt]);

  const handlePause = () => {
    if (!selectedExtId) return;
    pauseExtension(selectedExtId, pauseReason);
  };

  const handleResume = () => {
    if (!selectedExtId) return;
    resumeExtension(selectedExtId);
  };

  const resultIcon = (result) => {
    if (result === 'atendida') return <Phone size={13} className="text-green-400" />;
    if (result === 'nao_atendida') return <PhoneMissed size={13} className="text-red-400" />;
    return <PhoneOff size={13} className="text-zinc-500" />;
  };

  const totalToday = reportCallsByExtension.filter(
    (c) => c.extensionId === selectedExt?.id
  ).length;

  const answeredToday = reportCallsByExtension.filter(
    (c) => c.extensionId === selectedExt?.id && c.result === 'atendida'
  ).length;

  return (
    <div className="space-y-4 text-zinc-100 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Meu Ramal</h1>

      {/* Seleção de ramal */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <User size={16} className="text-zinc-400 flex-shrink-0" />
            <Select value={selectedExtId} onValueChange={setSelectedExtId}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue placeholder="Selecione seu ramal..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {extensions.map((ext) => (
                  <SelectItem key={ext.id} value={String(ext.id)} className="text-zinc-100 focus:bg-zinc-700">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[ext.status]?.color || 'bg-zinc-500'}`} />
                      {ext.number} — {ext.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedExt && (
              <Badge
                className={`flex-shrink-0 ${
                  isInCall ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  isRinging ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                  isPaused ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  'bg-zinc-700 text-zinc-300 border-zinc-600'
                } border`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusCfg?.color}`} />
                {statusCfg?.label}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Painel de chamada atual */}
        <Card className={`bg-zinc-900 border-zinc-800 ${isInCall ? 'border-green-500/40 ring-1 ring-green-500/20' : isRinging ? 'border-blue-500/40 ring-1 ring-blue-500/20' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <PhoneCall size={16} />
              {isInCall ? 'Chamada em andamento' : isRinging ? 'Chamada recebida' : 'Aguardando chamada'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isInCall && (
              <>
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <Phone size={28} className="text-green-400" />
                  </div>
                  <CallTimer startTime={callStartTime} />
                  <p className="text-zinc-400 text-sm mt-1">tempo de atendimento</p>
                </div>

                <Separator className="bg-zinc-800" />

                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMicMuted((m) => !m)}
                    className={`border-zinc-700 gap-2 ${micMuted ? 'text-red-400 border-red-500/40' : 'text-zinc-300'}`}
                  >
                    {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    {micMuted ? 'Microfone mudo' : 'Microfone ativo'}
                  </Button>
                  <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 gap-2">
                    <Volume2 size={14} />
                    Volume
                  </Button>
                </div>

                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  disabled={!selectedExt}
                >
                  <PhoneOff size={16} />
                  Encerrar chamada
                </Button>
              </>
            )}

            {isRinging && !isInCall && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Phone size={28} className="text-blue-400" />
                </div>
                <p className="text-blue-400 font-medium">Chamada recebida</p>
                <div className="flex gap-2 mt-4 justify-center">
                  <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700">
                    <Phone size={14} />
                    Atender
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-2">
                    <PhoneOff size={14} />
                    Rejeitar
                  </Button>
                </div>
              </div>
            )}

            {!isInCall && !isRinging && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                  <Phone size={28} className="text-zinc-600" />
                </div>
                <p className="text-zinc-500 text-sm">
                  {selectedExt ? 'Aguardando chamadas...' : 'Selecione um ramal acima'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controle de pausa + métricas do dia */}
        <div className="space-y-4">
          {/* Pausa */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Pause size={16} />
                Status e pausa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={pauseReason} onValueChange={setPauseReason}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {PAUSE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-zinc-100 focus:bg-zinc-700">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                  disabled={!selectedExtId || isPaused}
                  onClick={handlePause}
                >
                  <Coffee size={14} />
                  Entrar em pausa
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                  disabled={!selectedExtId || !isPaused}
                  onClick={handleResume}
                >
                  <Play size={14} />
                  Voltar
                </Button>
              </div>

              {isPaused && selectedExt?.pauseReason && (
                <p className="text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1.5">
                  ⚠ Em pausa: {selectedExt.pauseReason}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Métricas pessoais do dia */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Clock size={16} />
                Meu dia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-zinc-100">{totalToday}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Total de ligações</p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{answeredToday}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">Atendidas</p>
                </div>
              </div>

              {totalToday > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1 text-zinc-400">
                    <span>Taxa de atendimento</span>
                    <span>{Math.round((answeredToday / totalToday) * 100)}%</span>
                  </div>
                  <Progress value={(answeredToday / totalToday) * 100} className="h-1.5" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Histórico recente */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <History size={16} />
            Histórico recente
            {selectedExt && <Badge variant="outline" className="ml-auto text-xs">{selectedExt.number}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myHistory.length > 0 ? (
            <div className="space-y-1">
              {myHistory.map((call, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {resultIcon(call.result)}
                    <span className="text-sm">{call.phoneNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        call.result === 'atendida' ? 'text-green-400 border-green-500/30' :
                        call.result === 'nao_atendida' ? 'text-red-400 border-red-500/30' :
                        'text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {call.result === 'atendida' ? 'Atendida' :
                       call.result === 'nao_atendida' ? 'Não atendida' :
                       call.result === 'numero_nao_existe' ? 'Inválido' : call.result}
                    </Badge>
                    {call.createdAt && (
                      <span className="text-xs text-zinc-500">
                        {new Date(call.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-6">
              {selectedExt ? 'Nenhuma ligação registrada para este ramal' : 'Selecione um ramal para ver o histórico'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
