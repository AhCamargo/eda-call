import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { Coffee, Loader2, Phone, UserCircle } from 'lucide-react';

const PAUSE_OPTIONS = [
  { value: 'Banheiro', label: 'Banheiro' },
  { value: 'Almoço', label: 'Almoço' },
  { value: 'Reunião', label: 'Reunião' },
  { value: 'Suporte Técnico', label: 'Suporte Técnico' },
  { value: 'Treinamento', label: 'Treinamento' },
  { value: 'Pausa administrativa', label: 'Pausa administrativa' },
];

const statusVariant = (s) => {
  if (s === 'in_call') return 'default';
  if (s === 'paused') return 'secondary';
  if (s === 'online') return 'outline';
  return 'outline';
};

const statusLabel = (s) => {
  const map = {
    in_call: 'Em ligação',
    ringing: 'Tocando',
    online: 'Disponível',
    paused: 'Em pausa',
    offline: 'Offline',
  };
  return map[s] || s;
};

export default function Usuario() {
  const { t } = useTranslation();
  const { extensions, pauseExtension, resumeExtension } = usePbx();
  const [selectedId, setSelectedId] = useState('');
  const [pauseReason, setPauseReason] = useState(PAUSE_OPTIONS[0].value);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const selected = useMemo(
    () => extensions.find((e) => String(e.id) === selectedId),
    [extensions, selectedId]
  );

  const showFeedback = (type, msg) => {
    setFeedback({ type, message: msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handlePause = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await pauseExtension(selectedId, pauseReason);
      showFeedback('success', `${selected?.number} colocado em pausa: ${pauseReason}`);
    } catch {
      showFeedback('error', 'Erro ao pausar ramal.');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await resumeExtension(selectedId);
      showFeedback('success', `${selected?.number} retornou da pausa.`);
    } catch {
      showFeedback('error', 'Erro ao retornar da pausa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <UserCircle className="h-5 w-5" />
        <h1 className="text-2xl font-semibold">{t('user.title')}</h1>
      </div>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Extension selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              Selecionar ramal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {extensions.map((ext) => (
                <button
                  key={ext.id}
                  onClick={() => setSelectedId(String(ext.id))}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    selectedId === String(ext.id)
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="font-medium">{ext.number}</span>
                  <div className="flex items-center gap-2">
                    {ext.name && <span className="text-xs opacity-70">{ext.name}</span>}
                    <Badge
                      variant={statusVariant(ext.status)}
                      className="text-xs"
                    >
                      {statusLabel(ext.status)}
                    </Badge>
                  </div>
                </button>
              ))}
              {extensions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum ramal cadastrado.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pause control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coffee className="h-4 w-4" />
              {t('user.pauseMode')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div>
                    <p className="font-medium">{selected.number}</p>
                    {selected.name && <p className="text-xs text-muted-foreground">{selected.name}</p>}
                  </div>
                  <Badge variant={statusVariant(selected.status)}>
                    {statusLabel(selected.status)}
                  </Badge>
                </div>
                {selected.pauseReason && (
                  <p className="text-xs text-muted-foreground">
                    Motivo atual: <span className="font-medium">{selected.pauseReason}</span>
                  </p>
                )}
                <Separator />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t('user.pauseReason')}</label>
                  <select
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {PAUSE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePause} disabled={loading || !selectedId} className="flex-1">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('user.enterPause')}
                  </Button>
                  <Button variant="outline" onClick={handleResume} disabled={loading || !selectedId} className="flex-1">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('user.returnPause')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione um ramal para gerenciar a pausa.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
