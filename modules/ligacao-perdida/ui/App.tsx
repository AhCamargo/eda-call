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

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const setWindow = (patch: Partial<Settings["window"]>) =>
    setForm((f) => (f ? { ...f, window: { ...f.window, ...patch } } : f));

  const st = STATUS_LABEL[conn ?? "UNAVAILABLE"];

  return (
    <div className="lp-root">
      <header className="lp-head">
        <h1>Ligação perdida → WhatsApp</h1>
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
                checked={form.enabled}
                disabled={!isAdmin}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              <span>{form.enabled ? "Ligada" : "Desligada"}</span>
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
              <input type="time" value={form.window.start} disabled={!isAdmin} onChange={(e) => setWindow({ start: e.target.value })} />
              <span>até</span>
              <input type="time" value={form.window.end} disabled={!isAdmin} onChange={(e) => setWindow({ end: e.target.value })} />
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
                onClick={() => run("save", () => api.saveSettings(form).then((s) => setForm(s)), "Configuração salva.")}
              >
                {busy === "save" ? "Salvando…" : "Salvar"}
              </button>
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
