import { useCallback, useEffect, useMemo, useState } from "react";
import { createApi, HistoryItem, ModuleContext, Settings, StatusResponse } from "./api";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  CONNECTED: { text: "Conectado", tone: "ok" },
  WAITING_QR: { text: "Aguardando leitura do QR Code", tone: "warn" },
  STARTING: { text: "Iniciando…", tone: "warn" },
  DISCONNECTED: { text: "Nenhum número conectado", tone: "muted" },
  FAILED: { text: "Falhou — conecte de novo", tone: "bad" },
  UNAVAILABLE: { text: "Serviço do WhatsApp fora do ar", tone: "bad" },
};

const ROW_STATUS: Record<HistoryItem["status"], { text: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  sent: { text: "Enviada", tone: "ok" },
  pending: { text: "Aguardando", tone: "warn" },
  skipped: { text: "Não enviada", tone: "muted" },
  failed: { text: "Falhou", tone: "bad" },
};

const fmtPhone = (digits: string | null, raw: string) => {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits || "");
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return /\d{3}/.test(raw) ? raw : "Número oculto";
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function App({ ctx }: { ctx: ModuleContext }) {
  const api = useMemo(() => createApi(ctx), [ctx]);
  const isAdmin = ctx.user.role === "admin";
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  // Última configuração gravada no servidor — para saber se há alteração por salvar.
  const [saved, setSaved] = useState<Settings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [qr, setQr] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [testPhone, setTestPhone] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.status(), api.history()]);
      setStatus(s);
      setHistory(h.items);
      setForm((f) => f ?? s.settings);
      setSaved((v) => v ?? s.settings);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const conn = status?.connection.status;

  // Enquanto espera a leitura, o QR Code muda a cada ~20 s.
  useEffect(() => {
    if (conn !== "WAITING_QR" || !isAdmin) {
      setQr("");
      return;
    }
    let alive = true;
    const load = () =>
      api
        .qr()
        .then((r) => alive && setQr(r.image))
        .catch(() => {});
    load();
    const t = setInterval(() => {
      load();
      refresh();
    }, 5_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [conn, isAdmin, api, refresh]);

  const run = async (label: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
      if (ok) setNotice(ok);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  // Fechar ou recarregar a aba com alteração por salvar pede confirmação.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Botão Recarregar (como nas outras telas do EdaCall): busca tudo de novo no
  // servidor e descarta o que não foi salvo.
  const reload = async () => {
    if (dirty && !window.confirm("Descartar as alterações que ainda não foram salvas?")) return;
    setBusy("reload");
    try {
      const [s, h] = await Promise.all([api.status(), api.history()]);
      setStatus(s);
      setHistory(h.items);
      setForm(s.settings);
      setSaved(s.settings);
      setError("");
      setNotice("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  // Ligar/desligar grava na hora: é a chave geral do envio, não pode depender
  // de lembrar de clicar em Salvar.
  const toggleEnabled = (enabled: boolean) =>
    run(
      "toggle",
      () =>
        api.saveSettings({ ...(saved ?? form!), enabled }).then((s) => {
          setSaved(s);
          setForm((f) => (f ? { ...f, enabled: s.enabled } : s));
        }),
      enabled ? "Envio automático ligado." : "Envio automático desligado.",
    );

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setWindow = (patch: Partial<Settings["window"]>) =>
    setForm((f) => (f ? { ...f, window: { ...f.window, ...patch } } : f));

  const st = STATUS_LABEL[conn ?? "UNAVAILABLE"];

  return (
    <div className="lp-root">
      <header className="lp-head">
        <div className="lp-head-row">
          <h1>Ligação perdida → WhatsApp</h1>
          <button className="lp-icon-btn" onClick={reload} disabled={!!busy} title="Recarregar" aria-label="Recarregar">
            <svg
              className={busy === "reload" ? "lp-spin" : ""}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
        <p>
          Quando alguém liga e ninguém atende, o EdaCall manda uma mensagem no WhatsApp dessa pessoa. Se um atendente
          retornar a ligação antes, a mensagem não sai.
        </p>
      </header>

      {error && <div className="lp-alert lp-alert-bad">{error}</div>}
      {notice && <div className="lp-alert lp-alert-ok">{notice}</div>}

      {status && (
        <div className="lp-stats">
          <Stat label="Enviadas (24h)" value={status.last24h.sent} tone="ok" />
          <Stat label="Aguardando" value={status.last24h.pending} tone="warn" />
          <Stat label="Não enviadas (24h)" value={status.last24h.skipped} tone="muted" />
          <Stat label="Falharam (24h)" value={status.last24h.failed} tone="bad" />
        </div>
      )}

      <section className="lp-card">
        <div className="lp-card-head">
          <h2>Número de WhatsApp</h2>
          <span className={`lp-pill lp-${st.tone}`}>{st.text}</span>
        </div>
        {status?.connection.phone && <p className="lp-muted">Conectado: {fmtPhone(status.connection.phone, "")}</p>}
        {conn === "WAITING_QR" && isAdmin && (
          <div className="lp-qr">
            {qr ? <img src={qr} alt="QR Code do WhatsApp" /> : <div className="lp-qr-empty">Gerando QR Code…</div>}
            <ol>
              <li>Abra o WhatsApp no celular da empresa.</li>
              <li>Toque em ⋮ ou Configurações → Dispositivos conectados → Conectar dispositivo.</li>
              <li>Aponte a câmera para este código.</li>
            </ol>
          </div>
        )}
        {isAdmin ? (
          <div className="lp-actions">
            {(conn === "DISCONNECTED" || conn === "FAILED") && (
              <button className="lp-btn lp-primary" disabled={!!busy} onClick={() => run("connect", api.connect)}>
                {busy === "connect" ? "Iniciando…" : "Conectar número"}
              </button>
            )}
            {(conn === "CONNECTED" || conn === "WAITING_QR" || conn === "STARTING") && (
              <button
                className="lp-btn lp-danger"
                disabled={!!busy}
                onClick={() => run("logout", api.logout, "Número desconectado.")}
              >
                Desconectar
              </button>
            )}
          </div>
        ) : (
          <p className="lp-muted">Só o administrador conecta ou troca o número.</p>
        )}
        <p className="lp-hint">
          O número conectado é usado por um cliente não oficial do WhatsApp. Envie em volume baixo: o WhatsApp pode
          bloquear números que mandam muitas mensagens para quem não os tem salvos.
        </p>
      </section>

      {form && (
        <section className="lp-card">
          <div className="lp-card-head">
            <h2>Mensagem automática</h2>
            <label className="lp-switch">
              <input
                type="checkbox"
                checked={saved?.enabled ?? form.enabled}
                disabled={!isAdmin || !!busy}
                onChange={(e) => toggleEnabled(e.target.checked)}
                role="switch"
                aria-checked={saved?.enabled ?? form.enabled}
              />
              <span className="lp-track" aria-hidden="true">
                <span className="lp-thumb" />
              </span>
              <span>{busy === "toggle" ? "Salvando…" : (saved?.enabled ?? form.enabled) ? "Ligada" : "Desligada"}</span>
            </label>
          </div>

          <div className="lp-grid">
            <Field label="Nome da empresa" hint="Aparece no lugar de {empresa}">
              <input value={form.companyName} disabled={!isAdmin} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field label="DDD da cidade" hint="Usado quando a operadora manda o número sem DDD">
              <input
                value={form.defaultAreaCode}
                maxLength={2}
                disabled={!isAdmin}
                onChange={(e) => set("defaultAreaCode", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>

          <Field label="Texto da mensagem" hint="Pode usar {empresa}, {horario} (hora da ligação) e {telefone}">
            <textarea rows={4} value={form.message} disabled={!isAdmin} onChange={(e) => set("message", e.target.value)} />
          </Field>

          <div className="lp-grid lp-grid-3">
            <Field label="Esperar antes de mandar (min)" hint="Tempo para o atendente retornar a ligação">
              <input
                type="number"
                min={0}
                max={120}
                value={form.delayMinutes}
                disabled={!isAdmin}
                onChange={(e) => set("delayMinutes", Number(e.target.value))}
              />
            </Field>
            <Field label="Não repetir para o mesmo número por (h)">
              <input
                type="number"
                min={1}
                max={720}
                value={form.cooldownHours}
                disabled={!isAdmin}
                onChange={(e) => set("cooldownHours", Number(e.target.value))}
              />
            </Field>
            <Field label="Ignorar ligações com mais de (h)">
              <input
                type="number"
                min={1}
                max={72}
                value={form.maxAgeHours}
                disabled={!isAdmin}
                onChange={(e) => set("maxAgeHours", Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Horário de envio" hint="Fora desse horário a mensagem espera o próximo período">
            <div className="lp-window">
              <TimeSelect value={form.window.start} disabled={!isAdmin} onChange={(v) => setWindow({ start: v })} label="Início" />
              <span>até</span>
              <TimeSelect value={form.window.end} disabled={!isAdmin} onChange={(v) => setWindow({ end: v })} label="Fim" />
              <div className="lp-days">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!isAdmin}
                    className={`lp-day ${form.window.days.includes(i) ? "on" : ""}`}
                    onClick={() =>
                      setWindow({
                        days: form.window.days.includes(i) ? form.window.days.filter((x) => x !== i) : [...form.window.days, i],
                      })
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </Field>

          <label className="lp-check">
            <input type="checkbox" checked={form.onlyMobile} disabled={!isAdmin} onChange={(e) => set("onlyMobile", e.target.checked)} />
            Mandar só para celulares (telefone fixo quase nunca tem WhatsApp)
          </label>

          {isAdmin && (
            <div className="lp-actions">
              <button
                className="lp-btn lp-primary"
                disabled={!!busy}
                onClick={() =>
                  run(
                    "save",
                    () =>
                      api.saveSettings({ ...form, enabled: saved?.enabled ?? form.enabled }).then((s) => {
                        setForm(s);
                        setSaved(s);
                      }),
                    "Configuração salva.",
                  )
                }
              >
                {busy === "save" ? "Salvando…" : "Salvar"}
              </button>
              {dirty && <span className="lp-dirty">Alterações não salvas</span>}
              <div className="lp-test">
                <input placeholder="DDD + celular para teste" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                <button
                  className="lp-btn"
                  disabled={!!busy || !testPhone || conn !== "CONNECTED"}
                  title={conn !== "CONNECTED" ? "Conecte um número primeiro" : ""}
                  onClick={() => run("test", () => api.test(testPhone), "Mensagem de teste enviada.")}
                >
                  {busy === "test" ? "Enviando…" : "Enviar teste"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="lp-card">
        <div className="lp-card-head">
          <h2>Últimas ligações perdidas</h2>
        </div>
        {history.length === 0 ? (
          <p className="lp-muted">Nenhuma ligação perdida desde que o módulo foi ligado.</p>
        ) : (
          <table className="lp-table">
            <thead>
              <tr>
                <th>Ligou em</th>
                <th>Número</th>
                <th>Situação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const s = ROW_STATUS[h.status];
                return (
                  <tr key={h.id}>
                    <td>{fmtDate(h.missed_at)}</td>
                    <td>{fmtPhone(h.phone, h.phone_raw)}</td>
                    <td>
                      <span className={`lp-pill lp-${s.tone}`}>{h.is_test ? "Teste" : s.text}</span>
                    </td>
                    <td className="lp-muted">
                      {h.status === "sent" && h.sent_at ? `Enviada às ${fmtDate(h.sent_at)}` : h.reason || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// Horários de meia em meia hora, no formato 24 h. O campo nativo de hora
// segue o idioma do navegador (AM/PM em inglês) e é ruim de editar.
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function TimeSelect({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string }) {
  // Valor salvo fora da grade (ex.: 08:10) continua aparecendo como opção.
  const options = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <select className="lp-select" value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="lp-stat">
      <span className={`lp-stat-value lp-text-${tone}`}>{value}</span>
      <span className="lp-stat-label">{label}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="lp-field">
      <span className="lp-label">{label}</span>
      {children}
      {hint && <span className="lp-hint">{hint}</span>}
    </label>
  );
}
