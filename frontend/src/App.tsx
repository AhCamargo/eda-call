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
import Usuario from "./views/Usuario";
import CallCenter from "./views/CallCenter";
import AgentView from "./views/AgentView";
import SupervisorView from "./views/SupervisorView";
import Gravacoes from "./views/Gravacoes";
import Usuarios from "./views/Usuarios";
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
      main: "#6c5ce7",
      light: "#8577ed",
      dark: "#5a4bd4",
      contrastText: "#ffffff",
    },
    secondary: { main: "#00d2ff" },
    info: { main: "#41D1FF" },
    warning: { main: "#FFEA83" },
    success: { main: "#00c853" },
    background: { default: "#0a0a0f", paper: "#16161f" },
    text: { primary: "#e4e4eb", secondary: "#9494a8" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: "#0a0a0f" } },
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

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <PbxProvider token={token} user={user} onUnauthorized={handleLogout}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout onLogout={handleLogout} />}>
              <Route
                path="/"
                element={<Navigate to={getDefaultRoute(user?.role)} replace />}
              />
              <Route path="/callcenter" element={<CallCenter />} />
              <Route path="/agent" element={<AgentView />} />
              <Route path="/supervisor" element={<SupervisorView />} />
              <Route path="/ramais" element={<Ramais />} />
              <Route
                path="/campanhas"
                element={<Navigate to="/campanhas/discador" replace />}
              />
              <Route path="/campanhas/discador" element={<Campanhas />} />
              <Route path="/campanhas/ura-reversa" element={<UraReversa />} />
              <Route
                path="/campanhas/ura-reversa/relatorios"
                element={<UraReversaRelatorios />}
              />
              <Route path="/linhas-voip" element={<LinhasVoip />} />
              <Route path="/gravacoes" element={<Gravacoes />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/usuario" element={<Usuario />} />
              {user?.role === "admin" && (
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
