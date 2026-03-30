import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  Users, Phone, PhoneMissed, Headphones, MessageSquare, PhoneForwarded,
  Pause, Play, RefreshCw, Shield, Activity
} from 'lucide-react';

const STATUS_CONFIG = {
  online:      { label: 'Online',       dot: 'bg-emerald-500', badge: 'text-emerald-400 border-emerald-500/30'  },
  offline:     { label: 'Offline',      dot: 'bg-zinc-500',    badge: 'text-zinc-400 border-zinc-600'           },
  paused:      { label: 'Em pausa',     dot: 'bg-amber-500',   badge: 'text-amber-400 border-amber-500/30'      },
  ringing:     { label: 'Tocando',      dot: 'bg-blue-400',    badge: 'text-blue-400 border-blue-500/30'        },
  in_call:     { label: 'Em ligação',   dot: 'bg-green-400',   badge: 'text-green-400 border-green-500/30'      },
  in_campaign: { label: 'Em campanha',  dot: 'bg-purple-400',  badge: 'text-purple-400 border-purple-500/30'    },
};

const PAUSE_REASONS = [
  'Pausa administrativa',
  'Almoço',
  'Reunião',
  'Suporte Técnico',
  'Treinamento',
];

function AgentCard({ agent, onAction }) {
  const cfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.offline;
  const isActive = agent.status === 'in_call' || agent.status === 'ringing';

  return (
    <Card className={`bg-zinc-900 border-zinc-800 transition-all ${isActive ? 'ring-1 ring-green-500/30' : ''}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot} ${isActive ? 'animate-pulse' : ''}`} />
            <div>
              <p className="text-sm font-semibold leading-tight">{agent.name}</p>
              <p className="text-xs text-zinc-500">{agent.number}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${cfg.badge}`}>
            {cfg.label}
          </Badge>
        </div>

        {agent.pauseReason && (
          <p className="text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1 mb-2">
            {agent.pauseReason}
          </p>
        )}

        {agent.voipLine && (
          <p className="text-xs text-zinc-600 mb-2">Linha: {agent.voipLine}</p>
        )}

        <Separator className="bg-zinc-800 mb-2" />

        <div className="flex gap-1.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1 border-zinc-700 text-zinc-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10 text-xs"
                  disabled={!isActive}
                  onClick={() => onAction('listen', agent)}
                >
                  <Headphones size={12} />
                  Escutar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Escutar a chamada sem que o agente saiba</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1 border-zinc-700 text-zinc-400 hover:text-purple-400 hover:border-purple-500/40 hover:bg-purple-500/10 text-xs"
                  disabled={!isActive}
                  onClick={() => onAction('whisper', agent)}
                >
                  <MessageSquare size={12} />
                  Sussurrar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Falar com o agente sem que o cliente ouça</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1 border-zinc-700 text-zinc-400 hover:text-orange-400 hover:border-orange-500/40 hover:bg-orange-500/10 text-xs"
                  disabled={!isActive}
                  onClick={() => onAction('takeover', agent)}
                >
                  <PhoneForwarded size={12} />
                  Assumir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Assumir a chamada do agente</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex gap-1.5 mt-1.5">
          {agent.status !== 'paused' ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1 border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 text-xs"
              onClick={() => onAction('pause', agent)}
            >
              <Pause size={12} />
              Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1 border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500/40 text-xs"
              onClick={() => onAction('resume', agent)}
            >
              <Play size={12} />
              Retornar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SupervisorView() {
  const { statusCounts, extensions, fetchAll } = usePbx();
  const [actionDialog, setActionDialog] = useState(null); // { type, agent }
  const [pauseReason, setPauseReason] = useState(PAUSE_REASONS[0]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const showFeedback = (msg, type = 'ok') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleAction = (type, agent) => {
    if (type === 'resume') {
      setLoading(true);
      api.post(`/supervisor/agents/${agent.id}/resume`)
        .then(() => { fetchAll(); showFeedback(`${agent.name} retomou atendimento`); })
        .catch(() => showFeedback('Erro ao retomar agente', 'error'))
        .finally(() => setLoading(false));
      return;
    }
    setActionDialog({ type, agent });
  };

  const confirmAction = async () => {
    const { type, agent } = actionDialog;
    setLoading(true);
    try {
      if (type === 'pause') {
        await api.post(`/supervisor/agents/${agent.id}/force-pause`, { reason: pauseReason });
        await fetchAll();
        showFeedback(`${agent.name} colocado em pausa`);
      } else if (type === 'listen') {
        showFeedback(`Iniciando escuta do ramal ${agent.number}... (requer configuração Asterisk ChanSpy)`);
      } else if (type === 'whisper') {
        showFeedback(`Sussurrando para ${agent.name}... (requer configuração Asterisk ChanSpy)`);
      } else if (type === 'takeover') {
        showFeedback(`Assumindo chamada de ${agent.name}... (requer configuração Asterisk)`);
      }
    } catch {
      showFeedback('Erro ao executar ação', 'error');
    } finally {
      setLoading(false);
      setActionDialog(null);
    }
  };

  // Agentes separados por status
  const activeCalls = useMemo(() => extensions.filter((e) => e.status === 'in_call' || e.status === 'ringing'), [extensions]);
  const onlineAgents = useMemo(() => extensions.filter((e) => e.status === 'online'), [extensions]);
  const pausedAgents = useMemo(() => extensions.filter((e) => e.status === 'paused'), [extensions]);
  const offlineAgents = useMemo(() => extensions.filter((e) => e.status === 'offline'), [extensions]);

  const DIALOG_LABELS = {
    listen:   { title: '🎧 Escutar chamada',     desc: 'Você irá escutar a chamada sem que o agente ou cliente saibam.' },
    whisper:  { title: '🗣 Sussurrar para agente', desc: 'Somente o agente ouvirá você. O cliente não saberá.' },
    takeover: { title: '📞 Assumir chamada',      desc: 'A chamada será transferida para você. O agente será desconectado.' },
    pause:    { title: '⏸ Forçar pausa',          desc: 'O agente será colocado em pausa pelo supervisor.' },
  };

  return (
    <div className="space-y-5 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-amber-400" />
          <h1 className="text-2xl font-bold tracking-tight">Supervisor</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-zinc-400">Tempo real</span>
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className={`text-sm px-4 py-2.5 rounded-lg border ${
          feedback.type === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-green-500/10 border-green-500/30 text-green-400'
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Em ligação', value: activeCalls.length, color: 'text-green-400', icon: Phone },
          { label: 'Online', value: onlineAgents.length, color: 'text-emerald-400', icon: Activity },
          { label: 'Em pausa', value: pausedAgents.length, color: 'text-amber-400', icon: Pause },
          { label: 'Offline', value: offlineAgents.length, color: 'text-zinc-500', icon: PhoneMissed },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <kpi.icon size={18} className={kpi.color} />
              <div>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-zinc-500">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agentes em ligação */}
      {activeCalls.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Em ligação / Tocando ({activeCalls.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeCalls.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* Online */}
      {onlineAgents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Disponíveis ({onlineAgents.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {onlineAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* Em pausa */}
      {pausedAgents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Em pausa ({pausedAgents.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pausedAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {/* Offline */}
      {offlineAgents.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
            Offline ({offlineAgents.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {offlineAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onAction={handleAction} />
            ))}
          </div>
        </section>
      )}

      {extensions.length === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <Users size={36} className="text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500">Nenhum ramal cadastrado</p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmação de ação */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          {actionDialog && (
            <>
              <DialogHeader>
                <DialogTitle>{DIALOG_LABELS[actionDialog.type]?.title}</DialogTitle>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <p className="text-sm text-zinc-400">
                  {DIALOG_LABELS[actionDialog.type]?.desc}
                </p>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-sm font-medium">{actionDialog.agent.name}</p>
                  <p className="text-xs text-zinc-500">{actionDialog.agent.number} · {STATUS_CONFIG[actionDialog.agent.status]?.label}</p>
                </div>

                {actionDialog.type === 'pause' && (
                  <Select value={pauseReason} onValueChange={setPauseReason}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {PAUSE_REASONS.map((r) => (
                        <SelectItem key={r} value={r} className="text-zinc-100 focus:bg-zinc-700">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-400"
                  onClick={() => setActionDialog(null)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmAction}
                  disabled={loading}
                  className={
                    actionDialog.type === 'takeover' ? 'bg-orange-600 hover:bg-orange-700' :
                    actionDialog.type === 'pause' ? 'bg-amber-600 hover:bg-amber-700' :
                    'bg-primary hover:bg-primary/90'
                  }
                >
                  {loading ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
