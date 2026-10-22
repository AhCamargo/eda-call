import { useEffect, useState } from "react";
import { Loader2, Play, Download } from "lucide-react";
import api from "../api";

// As gravações exigem login (GET /recordings/:arquivo usa verifyToken), mas
// <audio src> e <a download> não enviam o cabeçalho Authorization. Por isso
// o áudio é baixado pelo `api` (com token) e tocado a partir de um blob.

const fetchBlobUrl = async (src: string) => {
  const res = await api.get(src, { responseType: "blob" });
  return URL.createObjectURL(res.data);
};

export const downloadAuthenticated = async (src: string, filename?: string) => {
  const url = await fetchBlobUrl(src);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || src.split("/").pop() || "gravacao.wav";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function AuthAudio({ src, className }: { src: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  if (blobUrl) {
    return (
      <audio
        controls
        autoPlay
        src={blobUrl}
        className={className}
        style={{ colorScheme: "dark" }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        setError(false);
        try {
          setBlobUrl(await fetchBlobUrl(src));
        } catch {
          setError(true);
        } finally {
          setLoading(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      title={error ? "Não foi possível carregar a gravação" : "Ouvir"}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {error ? "Indisponível" : "Ouvir"}
    </button>
  );
}

export function AuthDownloadButton({
  src,
  className,
  children,
  title = "Baixar",
}: {
  src: string;
  className?: string;
  children?: React.ReactNode;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title={title}
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadAuthenticated(src);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : children ?? <Download className="h-3 w-3" />}
    </button>
  );
}
