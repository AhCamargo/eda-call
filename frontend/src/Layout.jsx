import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePbx } from './context/PbxContext';

import {
  Monitor, Headset, ShieldCheck, PhoneCall, Mic,
  BarChart2, User, Users, Volume2, TrendingUp, Phone,
  LogOut, PanelLeftClose, PanelLeftOpen, PhoneOutgoing,
} from 'lucide-react';

const EXPANDED = 240;
const COLLAPSED = 56;

const LANGUAGES = [
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português (BR)' },
  { code: 'en',    flag: '🇺🇸', label: 'English' },
  { code: 'es',    flag: '🇪🇸', label: 'Español' },
];

const ROLE_INFO = {
  admin:      { label: 'Admin',      dot: '#ef4444' },
  supervisor: { label: 'Supervisor', dot: '#facc15' },
  agent:      { label: 'Atendente',  dot: '#22c55e' },
};

/* ── Nav item ──────────────────────────────────────────────────── */
function NavItem({ to, icon: Icon, label, collapsed, iconColor }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-lg transition-all duration-150',
          'text-sm font-medium mx-2 mb-2 ',
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
          isActive
            ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#6c5ce7]'
            : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
        ].join(' ')
      }
    >
      <Icon
        style={{ color: iconColor }}
        className="h-[18px] w-[18px] shrink-0"
      />
      {!collapsed && <span className="truncate leading-none">{label}</span>}
    </NavLink>
  );
}

/* ── Section separator ─────────────────────────────────────────── */
function SectionLabel({ label, collapsed }) {
  if (collapsed) {
    return <div className="my-2 mx-4 border-t border-white/10" />;
  }
  return (
    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 select-none">
      {label}
    </p>
  );
}

/* ── Layout ────────────────────────────────────────────────────── */
export default function Layout({ onLogout }) {
  const { t, i18n } = useTranslation();
  const { user } = usePbx();
  const role = user?.role || 'admin';
  const [collapsed, setCollapsed] = useState(false);

  const changeLanguage = (code) => {
    localStorage.setItem('language', code);
    i18n.changeLanguage(code);
  };

  const mainItems = useMemo(() => {
    if (role === 'agent') return [
      { to: '/agent',   label: 'Meu Ramal',      icon: Headset,      iconColor: '#22d3ee' },
      { to: '/usuario', label: t('menu.user'),    icon: User,         iconColor: '#94a3b8' },
    ];
    if (role === 'supervisor') return [
      { to: '/callcenter', label: 'Call Center',    icon: Monitor,     iconColor: '#a78bfa' },
      { to: '/supervisor', label: 'Supervisor',     icon: ShieldCheck, iconColor: '#facc15' },
      { to: '/relatorios', label: t('menu.reports'), icon: BarChart2,  iconColor: '#38bdf8' },
      { to: '/gravacoes',  label: 'Gravações',      icon: Mic,         iconColor: '#f87171' },
    ];
    return [
      { to: '/callcenter',  label: 'Call Center',       icon: Monitor,      iconColor: '#a78bfa' },
      { to: '/agent',       label: 'Atendente',          icon: Headset,      iconColor: '#22d3ee' },
      { to: '/supervisor',  label: 'Supervisor',         icon: ShieldCheck,  iconColor: '#facc15' },
      { to: '/ramais',      label: t('menu.extensions'), icon: PhoneOutgoing,iconColor: '#22d3ee' },
      { to: '/linhas-voip', label: t('menu.voipLines'),  icon: PhoneCall,    iconColor: '#38bdf8' },
      { to: '/gravacoes',   label: 'Gravações',          icon: Mic,          iconColor: '#f87171' },
      { to: '/relatorios',  label: t('menu.reports'),    icon: BarChart2,    iconColor: '#facc15' },
      { to: '/usuario',     label: t('menu.user'),       icon: User,         iconColor: '#94a3b8' },
      { to: '/usuarios',    label: 'Usuários',            icon: Users,        iconColor: '#a78bfa' },
    ];
  }, [role, t]);

  const campaignItems = useMemo(() => {
    if (role === 'agent') return [];
    return [
      { to: '/campanhas/discador',               label: t('menu.campaignsDialer'),            icon: Phone,      iconColor: '#f87171' },
      { to: '/campanhas/ura-reversa',            label: t('menu.campaignsReverseIvr'),        icon: Volume2,    iconColor: '#4ade80' },
      { to: '/campanhas/ura-reversa/relatorios', label: t('menu.campaignsReverseIvrReports'), icon: TrendingUp, iconColor: '#a78bfa' },
    ];
  }, [role, t]);

  const roleInfo = ROLE_INFO[role] || ROLE_INFO.agent;
  const sidebarWidth = collapsed ? COLLAPSED : EXPANDED;

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside
        style={{ width: sidebarWidth }}
        className="fixed inset-y-0 left-0 z-40 flex flex-col bg-[#111118] border-r border-white/[0.08] transition-[width] duration-200 overflow-hidden"
      >
        {/* Logo / Toggle */}
        <div
          className="flex items-center h-14 shrink-0 border-b border-white/[0.08]"
          style={{ justifyContent: collapsed ? 'center' : 'space-between', padding: collapsed ? '0' : '0 12px 0 16px' }}
        >
          {!collapsed && (
            <span className="text-sm font-bold select-none">
              <span style={{ color: '#e4e4eb' }}>EDA</span>
              <span style={{ color: '#8577ed' }}>Call</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:bg-white/10 hover:text-zinc-200 transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen  className="h-[17px] w-[17px]" />
              : <PanelLeftClose className="h-[17px] w-[17px]" />
            }
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide">
          {mainItems.map(item => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          {campaignItems.length > 0 && (
            <>
              <SectionLabel label={t('menu.campaigns')} collapsed={collapsed} />
              {campaignItems.map(item => (
                <NavItem key={item.to} {...item} collapsed={collapsed} />
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.08] p-2">
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-2 py-1 mb-1 min-w-0">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: roleInfo.dot }}
              />
              <span className="text-xs text-zinc-500 truncate">
                {user?.username}
              </span>
              <span className="text-xs text-zinc-600 shrink-0"> - {roleInfo.label}</span>
            </div>
          )}

          <button
            onClick={onLogout}
            title={collapsed ? 'Sair' : undefined}
            className={[
              'flex items-center gap-3 w-full rounded-lg py-2 text-sm text-zinc-500',
              'hover:bg-rose-500/10 hover:text-rose-400 transition-colors duration-150',
              collapsed ? 'justify-center px-0' : 'px-3',
            ].join(' ')}
          >
            <LogOut className="h-[17px] w-[17px] shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* ══════════════════ MAIN ══════════════════ */}
      <div
        style={{ marginLeft: sidebarWidth }}
        className="flex flex-col flex-1 min-w-0 transition-[margin-left] duration-200"
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-end h-14 px-4 gap-2 bg-[#111118]/80 backdrop-blur-sm border-b border-white/[0.08]">
          {LANGUAGES.map(lang => {
            const active = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                title={lang.label}
                className="flex items-center justify-center h-8 w-8 rounded-full text-lg transition-all duration-150"
                style={{
                  opacity: active ? 1 : 0.45,
                  transform: active ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: active ? '0 0 0 2px #6c5ce7, 0 0 8px rgba(108,92,231,0.5)' : 'none',
                }}
              >
                {lang.flag}
              </button>
            );
          })}
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
