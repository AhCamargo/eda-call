import { useState, useEffect, FormEvent } from 'react';
import { usePbx } from '../context/PbxContext';
import api from '../api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { UserCircle, KeyRound, Phone, Coffee, Loader2, CheckCircle2 } from 'lucide-react';

const PAUSE_OPTIONS = [
  'Almoço',
  'Banheiro',
  'Reunião',
  'Suporte Técnico',
  'Treinamento',
  'Pausa administrativa',
];

const STATUS_LABEL: Record<string, string> = {
  online: 'Disponível',
  offline: 'Offline',
  paused: 'Em pausa',
  ringing: 'Tocando',
  in_call: 'Em ligação',
  in_campaign: 'Em campanha',
};

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  offline: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ringing: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  in_call: 'bg-green-400/20 text-green-400 border-green-400/30',
  in_campaign: 'bg-purple-400/20 text-purple-400 border-purple-400/30',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  agent: 'Atendente',
};

const inputCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function useFeedback() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const show = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  };
  return { msg, show };
}

export default function Usuario() {
  const { user, extensions, pauseExtension, resumeExtension } = usePbx();
  const isAgent = user?.role === 'agent';

  // ── change password ──────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const pwFeedback = useFeedback();

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      pwFeedback.show(false, 'As senhas não coincidem.');
      return;
    }
    setPwLoading(true);
    try {
      await api.patch('/auth/me/password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.next,
      });
      pwFeedback.show(true, 'Senha alterada com sucesso.');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      pwFeedback.show(false, err?.response?.data?.message ?? 'Erro ao alterar senha.');
    } finally {
      setPwLoading(false);
    }
  };

  // ── ramal (agent only) ───────────────────────────────────────────
  const storageKey = `meu-ramal-${user?.id}`;
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem(storageKey) ?? '',
  );
  const [pauseReason, setPauseReason] = useState(PAUSE_OPTIONS[0]);
  const [ramalLoading, setRamalLoading] = useState(false);
  const ramalFeedback = useFeedback();

  useEffect(() => {
    if (selectedId) localStorage.setItem(storageKey, selectedId);
  }, [selectedId, storageKey]);

  const myExt = extensions.find((e) => String(e.id) === selectedId);

  const handlePause = async () => {
    if (!selectedId) return;
    setRamalLoading(true);
    try {
      await pauseExtension(selectedId, pauseReason);
      ramalFeedback.show(true, `Ramal em pausa: ${pauseReason}`);
    } catch {
      ramalFeedback.show(false, 'Erro ao pausar ramal.');
    } finally {
      setRamalLoading(false);
    }
  };

  const handleResume = async () => {
    if (!selectedId) return;
    setRamalLoading(true);
    try {
      await resumeExtension(selectedId);
      ramalFeedback.show(true, 'Ramal disponível.');
    } catch {
      ramalFeedback.show(false, 'Erro ao retornar da pausa.');
    } finally {
      setRamalLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Informações da sua conta.</p>
      </div>

      {/* ── Dados da conta ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-primary" />
            Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
            <div>
              <p className="text-xs text-muted-foreground">Usuário</p>
              <p className="font-medium">{user?.username}</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Alterar senha ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Senha atual</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={pwForm.current}
                onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={pwForm.next}
                onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Confirmar nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                className={inputCls}
              />
            </div>

            {pwFeedback.msg && (
              <Alert variant={pwFeedback.msg.ok ? 'default' : 'destructive'}>
                {pwFeedback.msg.ok && <CheckCircle2 className="h-4 w-4" />}
                <AlertDescription>{pwFeedback.msg.text}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={pwLoading} className="w-full">
              {pwLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Meu Ramal (só atendente) ── */}
      {isAgent && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Meu Ramal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Selecione seu ramal</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className={inputCls}
              >
                <option value="">— selecione —</option>
                {extensions.map((ext) => (
                  <option key={ext.id} value={String(ext.id)}>
                    {ext.number}{ext.name ? ` — ${ext.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {myExt && (
              <>
                <div className={`flex items-center justify-between px-3 py-2 rounded-md border ${STATUS_COLOR[myExt.status] ?? STATUS_COLOR.offline}`}>
                  <span className="text-sm font-medium">{myExt.number}</span>
                  <span className="text-xs font-semibold">{STATUS_LABEL[myExt.status] ?? myExt.status}</span>
                </div>

                {myExt.pauseReason && (
                  <p className="text-xs text-muted-foreground">
                    Motivo atual: <span className="font-medium">{myExt.pauseReason}</span>
                  </p>
                )}

                <Separator />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Coffee className="h-3 w-3" />
                    Motivo da pausa
                  </label>
                  <select
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    className={inputCls}
                  >
                    {PAUSE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {ramalFeedback.msg && (
                  <Alert variant={ramalFeedback.msg.ok ? 'default' : 'destructive'}>
                    <AlertDescription>{ramalFeedback.msg.text}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handlePause}
                    disabled={ramalLoading || myExt.status === 'paused'}
                    className="flex-1"
                    variant="outline"
                  >
                    {ramalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Entrar em pausa
                  </Button>
                  <Button
                    onClick={handleResume}
                    disabled={ramalLoading || myExt.status !== 'paused'}
                    className="flex-1"
                  >
                    {ramalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Retornar da pausa
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
