import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  Trash2,
  Play,
  Pause,
  Music,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  FileAudio,
  Phone,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "../api";

interface SoundFile {
  filename: string;
  asteriskPath: string;
  size: number;
  uploadedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GerenciadorAudios() {
  const [files, setFiles] = useState<SoundFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SoundFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<SoundFile[]>("/sounds");
      setFiles(res.data);
    } catch {
      setError("Erro ao carregar áudios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (file: File) => {
    setUploadError("");
    if (!/\.(mp3|wav)$/i.test(file.name)) {
      setUploadError("Apenas arquivos MP3 ou WAV são aceitos.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("O arquivo não pode ultrapassar 20 MB.");
      return;
    }
    const formData = new FormData();
    formData.append("audio", file);
    setUploading(true);
    try {
      await api.post("/sounds/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchFiles();
    } catch (err: any) {
      setUploadError(err?.response?.data?.message ?? "Erro ao enviar áudio.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/sounds/${encodeURIComponent(deleteTarget.filename)}`);
      if (playingFile === deleteTarget.filename) stopAudio();
      setDeleteTarget(null);
      await fetchFiles();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Erro ao remover áudio.");
    } finally {
      setDeleting(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    setPlayingFile(null);
  };

  const togglePlay = async (file: SoundFile) => {
    if (playingFile === file.filename) {
      stopAudio();
      return;
    }
    stopAudio();
    setPlayingFile(file.filename);
    try {
      const res = await api.get(`/sounds/stream/${encodeURIComponent(file.filename)}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPlayingFile(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPlayingFile(null); };
      audioRef.current = audio;
      audio.play().catch(() => { URL.revokeObjectURL(url); setPlayingFile(null); });
    } catch {
      setPlayingFile(null);
    }
  };

  const copyPath = (asteriskPath: string) => {
    navigator.clipboard.writeText(asteriskPath).then(() => {
      setCopiedPath(asteriskPath);
      setTimeout(() => setCopiedPath(null), 2000);
    });
  };

  const handleDialplanReload = async () => {
    setReloading(true);
    setReloadMsg(null);
    try {
      await api.post("/sounds/dialplan-reload");
      setReloadMsg({ ok: true, text: "Dialplan recarregado. O ramal *77 já está ativo." });
    } catch {
      setReloadMsg({ ok: false, text: "Erro ao recarregar o dialplan." });
    } finally {
      setReloading(false);
      setTimeout(() => setReloadMsg(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Áudios para URA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faça upload de arquivos MP3 ou WAV, ou grave direto pelo telefone.
        </p>
      </div>

      {/* Painel do gravador via telefone */}
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-orange-400">
            <Phone className="h-4 w-4" />
            Gravar pelo telefone — ramal *77
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Ligue de qualquer ramal para <span className="font-mono font-semibold text-foreground">*77</span></li>
            <li>Após o bipe, fale sua mensagem — pressione <span className="font-mono font-semibold text-foreground">#</span> para parar</li>
            <li>Ouça a gravação: pressione <span className="font-mono font-semibold text-foreground">1</span> para salvar · <span className="font-mono font-semibold text-foreground">2</span> para regravar · outra tecla para cancelar</li>
            <li>O arquivo aparece automaticamente na lista abaixo</li>
          </ol>
          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDialplanReload}
              disabled={reloading}
              className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
            >
              {reloading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              Ativar *77 agora
            </Button>
            <span className="text-xs text-muted-foreground">
              Recarrega o dialplan do Asterisk sem reiniciar
            </span>
          </div>
          {reloadMsg && (
            <p className={`text-xs font-medium ${reloadMsg.ok ? "text-green-400" : "text-red-400"}`}>
              {reloadMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upload zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={[
              "border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]",
            ].join(" ")}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              {uploading
                ? "Enviando..."
                : "Arraste um arquivo ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground/60">MP3 ou WAV · máx. 20 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadError && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* File list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            Arquivos enviados
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchFiles} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <Alert variant="destructive" className="m-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && files.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <FileAudio className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nenhum áudio enviado ainda.</p>
            </div>
          )}

          {files.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Nome do arquivo</TableHead>
                  <TableHead>Caminho no Asterisk</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => {
                  const ext = f.filename.split(".").pop()?.toUpperCase() ?? "";
                  const isPlaying = playingFile === f.filename;
                  return (
                    <TableRow key={f.filename}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => togglePlay(f)}
                          title={isPlaying ? "Pausar" : "Ouvir"}
                        >
                          {isPlaying ? (
                            <Pause className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {ext}
                          </Badge>
                          {f.filename}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => copyPath(f.asteriskPath)}
                          className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title="Copiar caminho"
                        >
                          {copiedPath === f.asteriskPath ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {f.asteriskPath}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(f.uploadedAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(f)}
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover áudio</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.filename}</strong>?
              Qualquer URA que referencie este arquivo deixará de reproduzi-lo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
