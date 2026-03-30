import { useMemo, useState } from 'react';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

import {
  Mic, Download, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  Search, Clock, Filter
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const resolveUrl = (recording) => {
  if (recording.webPath) {
    const p = recording.webPath.startsWith('/') ? recording.webPath : `/${recording.webPath}`;
    return `${API_URL}${p}`;
  }
  if (recording.filePath?.includes('/asterisk-recordings/')) {
    const rel = recording.filePath.split('/asterisk-recordings/')[1];
    if (rel) return `${API_URL}/recordings/${rel}`;
  }
  return null;
};

const formatDuration = (secs) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
};

const basename = (path) => path?.split('/').pop() || path || '—';

export default function Gravacoes() {
  const { reportRecordings, extensions, deleteRecording } = usePbx();

  const [filterExtId, setFilterExtId] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const showFeedback = (msg, type = 'ok') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteRecording(deleteTarget.id);
      setDeleteTarget(null);
      showFeedback('Gravação excluída.');
    } catch {
      showFeedback('Erro ao excluir gravação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...reportRecordings];

    if (filterExtId && filterExtId !== 'all') {
      list = list.filter((r) => String(r.extensionId) === filterExtId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.filePath?.toLowerCase().includes(q) ||
        r.callUniqueId?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [reportRecordings, filterExtId, search]);

  const totalDuration = useMemo(() =>
    filtered.reduce((acc, r) => acc + (r.durationSeconds || 0), 0),
    [filtered]
  );

  return (
    <div className="space-y-4 text-zinc-100 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic size={20} className="text-red-400" />
          <h1 className="text-2xl font-bold tracking-tight">Gravações</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock size={13} />
          Duração total: {formatDuration(totalDuration)}
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

      {/* Filtros */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Busca por nome de arquivo */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome de arquivo..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
              />
            </div>

            {/* Filtro por ramal */}
            <div className="flex items-center gap-2 sm:w-64">
              <Filter size={14} className="text-zinc-500 flex-shrink-0" />
              <Select value={filterExtId} onValueChange={setFilterExtId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="Todos os ramais" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="all" className="text-zinc-400 focus:bg-zinc-700">Todos os ramais</SelectItem>
                  {extensions.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)} className="text-zinc-100 focus:bg-zinc-700">
                      {e.number} — {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(filterExtId !== 'all' || search) && (
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-400"
                onClick={() => { setFilterExtId('all'); setSearch(''); }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {filtered.length} gravação{filtered.length !== 1 ? 'ões' : ''}
            {filtered.length !== reportRecordings.length && (
              <span className="text-zinc-500 font-normal"> (filtrado de {reportRecordings.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Arquivo</TableHead>
                <TableHead className="text-zinc-400">Ramal</TableHead>
                <TableHead className="text-zinc-400">Duração</TableHead>
                <TableHead className="text-zinc-400">Data</TableHead>
                <TableHead className="text-zinc-400">Áudio</TableHead>
                <TableHead className="text-zinc-400 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                    {reportRecordings.length === 0
                      ? 'Nenhuma gravação sincronizada. As gravações aparecem automaticamente após chamadas.'
                      : 'Nenhuma gravação encontrada com os filtros aplicados.'
                    }
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((rec) => {
                const url = resolveUrl(rec);
                const ext = extensions.find((e) => e.id === rec.extensionId);
                return (
                  <TableRow key={rec.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                    <TableCell className="max-w-xs">
                      <span className="text-xs font-mono text-zinc-300 truncate block" title={rec.filePath}>
                        {basename(rec.filePath)}
                      </span>
                      {rec.callUniqueId && (
                        <span className="text-xs text-zinc-600">{rec.callUniqueId}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ext ? (
                        <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                          {ext.number} — {ext.name}
                        </Badge>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400 font-mono">
                      {formatDuration(rec.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(rec.createdAt)}
                    </TableCell>
                    <TableCell>
                      {url ? (
                        <audio
                          controls
                          preload="none"
                          src={url}
                          className="h-8 w-48 accent-violet-500"
                          style={{ colorScheme: 'dark' }}
                        />
                      ) : (
                        <span className="text-xs text-zinc-600">Indisponível</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                            asChild
                          >
                            <a href={url} download>
                              <Download size={13} />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setDeleteTarget(rec)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 size={18} />
              Excluir gravação
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              O arquivo será removido do banco de dados. Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="bg-zinc-800 rounded-lg p-3 my-1">
              <p className="text-xs font-mono text-zinc-300 break-all">{basename(deleteTarget.filePath)}</p>
              <p className="text-xs text-zinc-500 mt-1">Duração: {formatDuration(deleteTarget.durationSeconds)}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleDelete} disabled={loading} variant="destructive" className="gap-2">
              {loading && <RefreshCw size={13} className="animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
