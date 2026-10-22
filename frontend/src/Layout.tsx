import { useMemo, useState, FC } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePbx } from "./context/PbxContext";
import type { NavItem, LanguageOption, RoleInfo } from "./types";

import {
  Monitor,
  Headset,
  ShieldCheck,
  PhoneCall,
  Mic,
  BarChart2,
  User,
  Users,
  Volume2,
  TrendingUp,
  Phone,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneOutgoing,
  Building2,
  ListFilter,
  FolderOpen,
  ShieldAlert,
  Settings2,
  PhoneIncoming,
} from "lucide-react";

const EXPANDED: number = 232;
const COLLAPSED: number = 60;

const LANGUAGES: LanguageOption[] = [
  { code: "pt-BR", flag: "🇧🇷", label: "Português (BR)" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

const ROLE_INFO: Record<string, RoleInfo> = {
  admin: { label: "Admin", dot: "#ef4444" },
  supervisor: { label: "Supervisor", dot: "#facc15" },
  agent: { label: "Atendente", dot: "#22c55e" },
};

/* ── Nav item ──────────────────────────────────────────────────── */
interface NavItemProps {
  to: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  hint?: string;
  collapsed: boolean;
  iconColor: string;
}

const NavItem: FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  hint,
  collapsed,
  iconColor: _iconColor,
}) => {
  return (
    <NavLink
      to={to}
      end
      title={collapsed ? [label, hint].filter(Boolean).join(" — ") : hint}
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-2.5 rounded-md transition-colors duration-150",
          "text-sm font-medium mx-2 mb-0.5",
          collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2",
          isActive
            ? "bg-[#16213f] text-[#eceef2] [&_svg]:text-[#8eaeff] before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-[#3d6bf5]"
            : "text-[#a0a7b3] hover:bg-[#1c2027] hover:text-[#eceef2]",
        ].join(" ")
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate leading-none">{label}</span>}
    </NavLink>
  );
};

/* ── Section separator ─────────────────────────────────────────── */
interface SectionLabelProps {
  label: string;
  collapsed: boolean;
}

const SectionLabel: FC<SectionLabelProps> = ({ label, collapsed }) => {
  if (collapsed) {
    return <div className="my-2 mx-4 border-t border-[#252a32]" />;
  }
  return (
    <p className="px-4 pt-4 pb-1.5 text-[11px] leading-[14px] font-semibold uppercase tracking-[0.08em] text-[#7f8794] select-none">
      {label}
    </p>
  );
};

interface NavSection {
  label?: string;
  items: NavItem[];
}

/* ── Layout ────────────────────────────────────────────────────── */
interface LayoutProps {
  onLogout: () => void;
}

const Layout: FC<LayoutProps> = ({ onLogout }) => {
  const { t, i18n } = useTranslation();
  const { user } = usePbx();
  const role: string = user?.role || "admin";
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const changeLanguage = (code: string): void => {
    localStorage.setItem("language", code);
    i18n.changeLanguage(code);
  };

  // Menu agrupado pelo que a pessoa quer fazer, na ordem em que normalmente
  // faz. Cada item tem uma dica (hint) em linguagem simples, exibida ao
  // passar o mouse — quem nunca mexeu num PABX precisa entender só de olhar.
  const sections = useMemo<NavSection[]>(() => {
    const myExtension: NavItem = {
      to: "/agent",
      label: role === "agent" ? "Meu Ramal" : "Atender ligações",
      hint: "Telefone no navegador: atenda e faça ligações sem aparelho",
      icon: Headset,
      iconColor: "#22d3ee",
    };
    const myProfile: NavItem = {
      to: "/usuario",
      label: "Meu Perfil",
      hint: "Troque sua senha e escolha o ramal que você usa",
      icon: User,
      iconColor: "#94a3b8",
    };

    if (role === "agent") return [{ items: [myExtension, myProfile] }];

    const isAdmin = role === "admin";

    const monitor: NavItem[] = [
      {
        to: "/callcenter",
        label: "Painel ao vivo",
        hint: "Quem está online, em ligação ou em pausa agora",
        icon: Monitor,
        iconColor: "#8eaeff",
      },
      ...(isAdmin ? [myExtension] : []),
      {
        to: "/supervisor",
        label: "Supervisão",
        hint: "Ouça, oriente ou entre nas ligações dos atendentes",
        icon: ShieldCheck,
        iconColor: "#facc15",
      },
    ];

    const setup: NavItem[] = [
      ...(isAdmin
        ? [
            {
              to: "/linhas-voip",
              label: "Linhas telefônicas",
              hint: "1º passo: cadastre a conta do seu provedor de telefonia",
              icon: PhoneCall,
              iconColor: "#38bdf8",
            },
            {
              to: "/ramais",
              label: t("menu.extensions"),
              hint: "2º passo: crie um ramal para cada pessoa ou telefone",
              icon: PhoneOutgoing,
              iconColor: "#22d3ee",
            },
          ]
        : []),
      {
        to: "/central-telefonica",
        label: "Central Telefônica",
        hint: "3º passo: o que quem liga ouve e para onde a ligação vai",
        icon: Building2,
        iconColor: "#34d399",
      },
      {
        to: "/filas",
        label: "Filas",
        hint: "Grupos de atendentes que dividem as ligações recebidas",
        icon: ListFilter,
        iconColor: "#34d399",
      },
      {
        to: "/roteamento-entrada",
        label: t("menu.inboundRouting"),
        hint: "Para onde vai cada número que recebe ligações",
        icon: PhoneIncoming,
        iconColor: "#34d399",
      },
      ...(isAdmin
        ? [
            {
              to: "/audios-ura",
              label: "Áudios",
              hint: "Mensagens gravadas tocadas no atendimento e nas campanhas",
              icon: FolderOpen,
              iconColor: "#fb923c",
            },
          ]
        : []),
    ];

    const campaigns: NavItem[] = [
      {
        to: "/campanhas/discador",
        label: t("menu.campaignsDialer"),
        hint: "Liga automaticamente para uma lista e passa para um atendente",
        icon: Phone,
        iconColor: "#f87171",
      },
      {
        to: "/campanhas/ura-reversa",
        label: t("menu.campaignsReverseIvr"),
        hint: "Liga para uma lista, toca uma mensagem e o cliente digita uma opção",
        icon: Volume2,
        iconColor: "#4ade80",
      },
      {
        to: "/campanhas/ura-reversa/relatorios",
        label: t("menu.campaignsReverseIvrReports"),
        hint: "Resultado das campanhas de URA Reversa",
        icon: TrendingUp,
        iconColor: "#8eaeff",
      },
    ];

    const results: NavItem[] = [
      {
        to: "/relatorios",
        label: t("menu.reports"),
        hint: "Histórico de ligações feitas e recebidas",
        icon: BarChart2,
        iconColor: "#facc15",
      },
      {
        to: "/relatorios/produtividade",
        label: "Produtividade",
        hint: "Tempo em ligação e em pausa de cada atendente",
        icon: TrendingUp,
        iconColor: "#3d6bf5",
      },
      {
        to: "/gravacoes",
        label: "Gravações",
        hint: "Ouça e baixe as ligações gravadas",
        icon: Mic,
        iconColor: "#f87171",
      },
    ];

    const system: NavItem[] = isAdmin
      ? [
          {
            to: "/usuarios",
            label: "Usuários",
            hint: "Quem pode entrar no sistema e o que cada um pode fazer",
            icon: Users,
            iconColor: "#8eaeff",
          },
          {
            to: "/seguranca",
            label: "Segurança",
            hint: "Endereços bloqueados por tentativas de invasão",
            icon: ShieldAlert,
            iconColor: "#ef4444",
          },
          {
            to: "/configuracoes",
            label: "Configurações",
            hint: "Endereço do servidor e ajustes de rede",
            icon: Settings2,
            iconColor: "#8eaeff",
          },
          myProfile,
        ]
      : [myProfile];

    return [
      { label: "Acompanhar", items: monitor },
      { label: "Configurar", items: setup },
      { label: t("menu.campaigns"), items: campaigns },
      { label: "Resultados", items: results },
      { label: "Sistema", items: system },
    ];
  }, [role, t]);

  const roleInfo: RoleInfo = ROLE_INFO[role] || ROLE_INFO.agent;
  const sidebarWidth: number = collapsed ? COLLAPSED : EXPANDED;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside
        style={{ width: sidebarWidth }}
        className="fixed inset-y-0 left-0 z-40 flex flex-col bg-[#14171c] border-r border-[#252a32] transition-[width] duration-200 overflow-hidden"
      >
        {/* Logo / Toggle */}
        <div
          className="flex items-center h-14 shrink-0 border-b border-[#252a32]"
          style={{
            justifyContent: collapsed ? "center" : "space-between",
            padding: collapsed ? "0" : "0 12px 0 16px",
          }}
        >
          {!collapsed && (
            <span className="flex items-center gap-2.5 text-base font-semibold text-[#eceef2] select-none">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              EdaCall
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="flex items-center justify-center w-8 h-8 rounded-md text-[#7f8794] hover:bg-[#1c2027] hover:text-[#eceef2] transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[17px] w-[17px]" />
            ) : (
              <PanelLeftClose className="h-[17px] w-[17px]" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide">
          {sections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && (
                <SectionLabel label={section.label} collapsed={collapsed} />
              )}
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#252a32] p-2">
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-2 py-1 mb-1 min-w-0">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: roleInfo.dot }}
              />
              <span className="text-xs text-[#a0a7b3] truncate">
                {user?.username}
              </span>
              <span className="text-xs text-[#7f8794] shrink-0">
                {" "}
                - {roleInfo.label}
              </span>
            </div>
          )}

          <button
            onClick={onLogout}
            title={collapsed ? "Sair" : undefined}
            className={[
              "flex items-center gap-2.5 w-full rounded-md py-2 text-sm text-[#a0a7b3]",
              "hover:bg-[#2b1311] hover:text-[#ff7a72] transition-colors duration-150",
              collapsed ? "justify-center px-0" : "px-3",
            ].join(" ")}
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
        <header className="sticky top-0 z-30 flex items-center justify-end h-14 px-6 gap-1 bg-[#14171c] border-b border-[#252a32]">
          {LANGUAGES.map((lang) => {
            const active = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                title={lang.label}
                aria-pressed={active}
                className={[
                  "h-8 px-2.5 rounded-md text-xs font-semibold tracking-[0.06em] transition-colors duration-150",
                  active
                    ? "bg-[#16213f] text-[#8eaeff]"
                    : "text-[#7f8794] hover:bg-[#1c2027] hover:text-[#eceef2]",
                ].join(" ")}
              >
                {lang.code === "pt-BR" ? "PT" : lang.code.toUpperCase()}
              </button>
            );
          })}
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 bg-[#0c0e11]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
