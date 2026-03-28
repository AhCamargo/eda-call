import { useEffect, useState } from 'react';
import api from '../api';
import { usePbx } from '../context/PbxContext';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';

import {
  Users, Plus, Pencil, Trash2, RefreshCw,
  CheckCircle2, AlertCircle, ShieldCheck, Headset, Shield,
} from 'lucide-react';

const ROLES = [
  { value: 'admin',      label: 'Admin',      icon: Shield,      color: '#ef4444' },
  { value: 'supervisor', label: 'Supervisor',  icon: ShieldCheck, color: '#facc15' },
  { value: 'agent',      label: 'Atendente',   icon: Headset,     color: '#22c55e' },
];

const ROLE_MENUS = {
  admin: [
    'Call Center', 'Atendente', 'Supervisor', 'Ramais', 'Linhas VoIP',
    'Gravações', 'Relatórios', 'Usuários', 'Campanhas (Discador, URA Reversa)',
  ],
  supervisor: ['Call Center', 'Supervisor', 'Relatórios', 'Gravações'],
  agent: ['Meu Ramal', 'Meu Perfil'],
};

const roleInfo = (role) => ROLES.find((r) => r.value === role) || ROLES[0];

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const EMPTY_FORM = { username: '', password: '', role: 'agent' };

export default function Usuarios() {
  const { user: me } = usePbx();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  const showFeedback = (msg, type = 'ok') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const load = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch {
      showFeedback('Erro ao carregar usuários.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreateOpen(true);
  };

  const openEdit = (u) => {
    setForm({ username: u.username, password: '', role: u.role });
    setEditTarget(u);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/users', form);
      setCreateOpen(false);
      showFeedback('Usuário criado com sucesso.');
      load();
    } catch (e) {
      showFeedback(e?.response?.data?.message || 'Erro ao criar usuário.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      const payload = { username: form.username, role: form.role };
      if (form.password) payload.password = form.password;
      await api.patch(`/users/${editTarget.id}`, payload);
      setEditTarget(null);
      showFeedback('Usuário atualizado.');
      load();
    } catch (e) {
      showFeedback(e?.response?.data?.message || 'Erro ao atualizar usuário.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setDeleteTarget(null);
      showFeedback('Usuário excluído.');
      load();
    } catch (e) {
      showFeedback(e?.response?.data?.message || 'Erro ao excluir usuário.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4 text-zinc-100 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-violet-400" />
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-violet-600 hover:bg-violet-700">
          <Plus size={15} /> Novo Usuário
        </Button>
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

      {/* Permissões por perfil */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <Card key={r.value} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: r.color }}>
                <r.icon size={15} />
                {r.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ul className="space-y-1">
                {ROLE_MENUS[r.value].map((m) => (
                  <li key={m} className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full shrink-0" style={{ background: r.color }} />
                    {m}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {users.length} usuário{users.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Usuário</TableHead>
                <TableHead className="text-zinc-400">Perfil</TableHead>
                <TableHead className="text-zinc-400">Menus disponíveis</TableHead>
                <TableHead className="text-zinc-400">Criado em</TableHead>
                <TableHead className="text-zinc-400 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-10">
                    <RefreshCw size={16} className="animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && users.length === 0 && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-10">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => {
                const info = roleInfo(u.role);
                const isMe = String(u.id) === String(me?.id);
                return (
                  <TableRow key={u.id} className="border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200">{u.username}</span>
                        {isMe && (
                          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-400 py-0">
                            você
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="gap-1 border-zinc-700"
                        style={{ color: info.color }}
                      >
                        <info.icon size={11} />
                        {info.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {ROLE_MENUS[u.role]?.join(', ')}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => setDeleteTarget(u)}
                          disabled={isMe}
                          title={isMe ? 'Não é possível excluir sua própria conta' : undefined}
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

      {/* Dialog: Criar */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-400">
              <Plus size={18} /> Novo Usuário
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Preencha os dados do novo usuário do sistema.
            </DialogDescription>
          </DialogHeader>
          <UserForm form={form} onChange={setForm} field={field} requirePassword />
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {saving && <RefreshCw size={13} className="animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <Pencil size={18} /> Editar Usuário
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Deixe a senha em branco para não alterar.
            </DialogDescription>
          </DialogHeader>
          <UserForm form={form} onChange={setForm} field={field} requirePassword={false} />
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={saving} className="gap-2">
              {saving && <RefreshCw size={13} className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Excluir */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 size={18} /> Excluir Usuário
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="bg-zinc-800 rounded-lg p-3 my-1">
              <p className="text-sm font-medium text-zinc-200">{deleteTarget.username}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{roleInfo(deleteTarget.role).label}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleDelete} disabled={saving} variant="destructive" className="gap-2">
              {saving && <RefreshCw size={13} className="animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserForm({ form, field, requirePassword }) {
  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400">Usuário</label>
        <input
          value={form.username}
          onChange={field('username')}
          autoComplete="off"
          placeholder="ex: joao.silva"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400">
          Senha {!requirePassword && <span className="text-zinc-600">(deixe em branco para não alterar)</span>}
        </label>
        <input
          type="password"
          value={form.password}
          onChange={field('password')}
          autoComplete="new-password"
          placeholder={requirePassword ? 'Senha de acesso' : '••••••••'}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400">Perfil</label>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => field('role')({ target: { value: r.value } })}
              className={[
                'flex flex-col items-center gap-1.5 rounded-lg border py-3 px-2 text-xs font-medium transition-all',
                form.role === r.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600',
              ].join(' ')}
            >
              <r.icon size={16} style={{ color: form.role === r.value ? '#a78bfa' : r.color }} />
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
