import { useEffect, useRef, useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { usePbx } from '../context/PbxContext';

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// Ícones
import {
  PhoneCall, PhoneIncoming, Users, Clock, AlertTriangle,
  TrendingUp, Activity, CheckCircle2, XCircle
} from 'lucide-react';

const MAX_HISTORY = 20;

const statusLabel = (s) => ({
  online: 'Online',
  offline: 'Offline',
  paused: 'Pausa',
  ringing: 'Tocando',
  in_call: 'Em ligação',
  in_campaign: 'Em campanha',
}[s] || s);

const statusColor = (s) => ({
  online: 'bg-emerald-500',
  offline: 'bg-zinc-500',
  paused: 'bg-amber-500',
  ringing: 'bg-blue-400',
  in_call: 'bg-green-400',
  in_campaign: 'bg-purple-400',
}[s] || 'bg-zinc-400');

const badgeVariant = (s) => ({
  online: 'default',
  in_call: 'default',
  ringing: 'secondary',
  paused: 'outline',
}[s] || 'outline');

function KpiCard({ icon: Icon, label, value, sub, color = 'text-primary', alert = false }) {
  return (
    <Card className={`bg-zinc-900 border-zinc-800 ${alert ? 'border-red-500/50' : ''}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-zinc-800 ${alert ? 'text-red-400' : 'text-zinc-300'}`}>
            <Icon size={20} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CallCenter() {
  const { statusCounts, extensions, reports } = usePbx();

  // Histórico de pontos para o gráfico de área
  const [history, setHistory] = useState(() =>
    Array.from({ length: MAX_HISTORY }, (_, i) => ({
      t: `${i}`,
      ativas: 0,
      fila: 0,
      online: 0,
    }))
  );

  const tickRef = useRef(0);

  useEffect(() => {
    tickRef.current += 1;
    const label = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory((prev) => {
      const next = [...prev.slice(1), {
        t: label,
        ativas: statusCounts.in_call || 0,
        fila: statusCounts.ringing || 0,
        online: statusCounts.online || 0,
      }];
      return next;
    });
  }, [statusCounts]);

  // Métricas calculadas
  const totalAnswered = reports.quemAtendeu || 0;
  const totalInvalid = reports.numeroNaoExiste || 0;
  const totalCalls = totalAnswered + totalInvalid + (statusCounts.in_call || 0) + (statusCounts.ringing || 0);
  const sla = totalCalls > 0 ? Math.round((totalAnswered / totalCalls) * 100) : 0;
  const abandonRate = totalCalls > 0 ? Math.round((totalInvalid / totalCalls) * 100) : 0;
  const queueAlert = (statusCounts.ringing || 0) > 3;

  const activeCalls = statusCounts.in_call || 0;
  const inQueue = statusCounts.ringing || 0;
  const onlineAgents = statusCounts.online || 0;
  const pausedAgents = statusCounts.paused || 0;

  // Distribuição de estados dos agentes para bar chart
  const agentDistribution = [
    { name: 'Online', value: onlineAgents, color: '#10b981' },
    { name: 'Em ligação', value: activeCalls, color: '#22c55e' },
    { name: 'Tocando', value: statusCounts.ringing || 0, color: '#60a5fa' },
    { name: 'Pausa', value: pausedAgents, color: '#f59e0b' },
    { name: 'Offline', value: statusCounts.offline || 0, color: '#52525b' },
    { name: 'Campanha', value: statusCounts.in_campaign || 0, color: '#a855f7' },
  ].filter((d) => d.value > 0);

  const sortedExtensions = useMemo(() =>
    [...extensions].sort((a, b) => {
      const order = { in_call: 0, ringing: 1, in_campaign: 2, online: 3, paused: 4, offline: 5 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    }),
    [extensions]
  );

  return (
    <div className="space-y-4 text-zinc-100">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Call Center</h1>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
          Tempo real
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={PhoneCall}
          label="Chamadas ativas"
          value={activeCalls}
          sub="Em andamento agora"
          color="text-green-400"
        />
        <KpiCard
          icon={PhoneIncoming}
          label="Na fila"
          value={inQueue}
          sub={inQueue > 0 ? 'Aguardando atendimento' : 'Fila vazia'}
          color={queueAlert ? 'text-red-400' : 'text-blue-400'}
          alert={queueAlert}
        />
        <KpiCard
          icon={Users}
          label="Agentes online"
          value={onlineAgents}
          sub={`${pausedAgents} em pausa`}
          color="text-emerald-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="SLA"
          value={`${sla}%`}
          sub={`Taxa de abandono: ${abandonRate}%`}
          color={sla >= 80 ? 'text-green-400' : sla >= 60 ? 'text-amber-400' : 'text-red-400'}
        />
      </div>

      {/* Linha 2: Gráfico + Distribuição */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Gráfico de área — chamadas por tempo */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Activity size={16} />
              Atividade de chamadas (tempo real)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAtivas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradFila" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area type="monotone" dataKey="online" name="Online" stroke="#10b981" fill="url(#gradOnline)" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="ativas" name="Em ligação" stroke="#22c55e" fill="url(#gradAtivas)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="fila" name="Na fila" stroke="#60a5fa" fill="url(#gradFila)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição dos agentes */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Users size={16} />
              Estado dos agentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agentDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={agentDistribution} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#71717a' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#71717a' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {agentDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="space-y-1.5">
                  {agentDistribution.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: item.color }} />
                        <span className="text-zinc-400">{item.name}</span>
                      </div>
                      <span className="font-semibold text-zinc-200">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-4">Sem agentes cadastrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linha 3: SLA + Lista de agentes */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Métricas de qualidade */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Clock size={16} />
              Indicadores de qualidade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">SLA de atendimento</span>
                <span className={sla >= 80 ? 'text-green-400' : sla >= 60 ? 'text-amber-400' : 'text-red-400'}>
                  {sla}%
                </span>
              </div>
              <Progress value={sla} className="h-2" />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">Taxa de abandono</span>
                <span className={abandonRate <= 10 ? 'text-green-400' : abandonRate <= 20 ? 'text-amber-400' : 'text-red-400'}>
                  {abandonRate}%
                </span>
              </div>
              <Progress value={abandonRate} className="h-2" />
            </div>

            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-green-400" /> Atendidas
                </span>
                <span className="font-semibold">{totalAnswered}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <XCircle size={13} className="text-red-400" /> Não atendidas
                </span>
                <span className="font-semibold">{totalInvalid}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <AlertTriangle size={13} className="text-amber-400" /> Fila atual
                </span>
                <span className={`font-semibold ${queueAlert ? 'text-red-400' : ''}`}>{inQueue}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de todos os agentes */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Users size={16} />
              Agentes ({extensions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {sortedExtensions.length > 0 ? sortedExtensions.map((ext) => (
                <div
                  key={ext.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor(ext.status)}`} />
                    <div>
                      <p className="text-sm font-medium leading-none">{ext.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{ext.number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={badgeVariant(ext.status)} className="text-xs">
                      {statusLabel(ext.status)}
                    </Badge>
                    {ext.pauseReason && (
                      <p className="text-xs text-zinc-500 mt-0.5">{ext.pauseReason}</p>
                    )}
                  </div>
                </div>
              )) : (
                <p className="text-zinc-500 text-sm text-center py-6">Nenhum ramal cadastrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
