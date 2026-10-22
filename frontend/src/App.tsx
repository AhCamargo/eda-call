import { useState, useEffect, FC, FormEvent } from "react";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { jwtDecode } from "jwt-decode";
import api from "./api";
import Layout from "./Layout";
import type { User } from "./types";
import Ramais from "./views/Ramais";
import Campanhas from "./views/Campanhas";
import UraReversa from "./views/UraReversa";
import UraReversaRelatorios from "./views/UraReversaRelatorios";
import LinhasVoip from "./views/LinhasVoip";
import Relatorios from "./views/Relatorios";
import RelatoriosProdutividade from "./views/RelatoriosProdutividade";
import Usuario from "./views/Usuario";
import CallCenter from "./views/CallCenter";
import AgentView from "./views/AgentView";
import SupervisorView from "./views/SupervisorView";
import Gravacoes from "./views/Gravacoes";
import Usuarios from "./views/Usuarios";
import CentralTelefonica from "./views/CentralTelefonica";
import Filas from "./views/Filas";
import GerenciadorAudios from "./views/GerenciadorAudios";
import Seguranca from "./views/Seguranca";
import Configuracoes from "./views/Configuracoes";
import RoteamentoEntrada from "./views/RoteamentoEntrada";
import { PbxProvider } from "./context/PbxContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, PhoneCall } from "lucide-react";
import "./i18n";

const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#3d6bf5",
      light: "#8eaeff",
      dark: "#2f5ce6",
      contrastText: "#ffffff",
    },
    secondary: { main: "#8eaeff" },
    info: { main: "#8eaeff" },
    warning: { main: "#f5b941" },
    success: { main: "#45d98f" },
    error: { main: "#ff7a72" },
    background: { default: "#0c0e11", paper: "#14171c" },
    text: { primary: "#eceef2", secondary: "#a0a7b3" },
    divider: "#252a32",
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: "#0c0e11" } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: "1px solid #252a32" },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
});

const getDefaultRoute = (role?: string): string => {
  if (role === "agent") return "/agent";
  if (role === "supervisor") return "/supervisor";
  return "/callcenter";
};

interface LoginScreenProps {
  onLogin: (token: string) => void;
}

const LoginScreen: FC<LoginScreenProps> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<{ username: string; password: string }>({
    username: "",
    password: "",
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", form);
      localStorage.setItem("token", res.data.token);
      onLogin(res.data.token);
    } catch {
      setError("Usuário ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <PhoneCall className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">{t("login.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("login.username")}
              </label>
              <input
                autoComplete="username"
                value={form.username}
                onChange={(e) =>
                  setForm((p) => ({ ...p, username: e.target.value }))
                }
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("login.password")}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : t("login.enter")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

function App(): JSX.Element {
  const [token, setAuthToken] = useState<string>(
    localStorage.getItem("token") || "",
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (token) {
      try {
        setUser(jwtDecode(token));
      } catch {
        localStorage.removeItem("token");
        setAuthToken("");
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthToken("");
    setUser(null);
  };

  if (!token) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <LoginScreen onLogin={setAuthToken} />
      </ThemeProvider>
    );
  }

  // Espelha as restrições já aplicadas no backend (ver auditoria de
  // segurança, achado F7): só ocultar o menu não é controle de acesso, mas
  // ajuda a não confundir um agente com uma tela que ele não pode operar.
  const isAdmin = user?.role === "admin";
  const isSupervisorPlus = user?.role === "admin" || user?.role === "supervisor";
  const fallback = <Navigate to={getDefaultRoute(user?.role)} replace />;

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <PbxProvider token={token} user={user ?? undefined} onUnauthorized={handleLogout}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout onLogout={handleLogout} />}>
              <Route
                path="/"
                element={<Navigate to={getDefaultRoute(user?.role)} replace />}
              />
              <Route path="/callcenter" element={isSupervisorPlus ? <CallCenter /> : fallback} />
              <Route path="/agent" element={<AgentView />} />
              <Route path="/supervisor" element={isSupervisorPlus ? <SupervisorView /> : fallback} />
              <Route path="/ramais" element={isAdmin ? <Ramais /> : fallback} />
              <Route
                path="/campanhas"
                element={<Navigate to="/campanhas/discador" replace />}
              />
              <Route path="/campanhas/discador" element={isSupervisorPlus ? <Campanhas /> : fallback} />
              <Route path="/campanhas/ura-reversa" element={isSupervisorPlus ? <UraReversa /> : fallback} />
              <Route
                path="/campanhas/ura-reversa/relatorios"
                element={isSupervisorPlus ? <UraReversaRelatorios /> : fallback}
              />
              <Route path="/central-telefonica" element={isSupervisorPlus ? <CentralTelefonica /> : fallback} />
              <Route path="/filas" element={isSupervisorPlus ? <Filas /> : fallback} />
              {isAdmin && (
                <Route path="/audios-ura" element={<GerenciadorAudios />} />
              )}
              {isAdmin && (
                <Route path="/seguranca" element={<Seguranca />} />
              )}
              {isAdmin && (
                <Route path="/configuracoes" element={<Configuracoes />} />
              )}
              <Route path="/linhas-voip" element={isAdmin ? <LinhasVoip /> : fallback} />
              <Route path="/roteamento-entrada" element={isSupervisorPlus ? <RoteamentoEntrada /> : fallback} />
              <Route path="/gravacoes" element={isSupervisorPlus ? <Gravacoes /> : fallback} />
              <Route path="/relatorios" element={isSupervisorPlus ? <Relatorios /> : fallback} />
              <Route path="/relatorios/produtividade" element={isSupervisorPlus ? <RelatoriosProdutividade /> : fallback} />
              <Route path="/usuario" element={<Usuario />} />
              {isAdmin && (
                <Route path="/usuarios" element={<Usuarios />} />
              )}
              <Route
                path="*"
                element={<Navigate to={getDefaultRoute(user?.role)} replace />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </PbxProvider>
    </ThemeProvider>
  );
}

export default App;
