import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../api";
import type { InboundRoute, CreateInboundRoutePayload } from "../types";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { PhoneIncoming, Plus, Pencil, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

const emptyForm: CreateInboundRoutePayload = {
  did: "",
  description: "",
  destinationType: "extension",
  destinationTarget: "",
  priority: 0,
  enabled: true,
};

interface Feedback {
  msg: string;
  type: "ok" | "error";
}

export default function RoteamentoEntrada() {
  const { t } = useTranslation();
  const [routes, setRoutes] = useState<InboundRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<InboundRoute | null>(null);
  const [editingRoute, setEditingRoute] = useState<InboundRoute | null>(null);
  const [form, setForm] = useState<CreateInboundRoutePayload>(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CreateInboundRoutePayload>(
    key: K,
    value: CreateInboundRoutePayload[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/inbound-routes");
      setRoutes(res.data);
    } catch {
      setFeedback({ msg: "Erro ao carregar rotas.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingRoute(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (route: InboundRoute) => {
    setEditingRoute(route);
    setForm({
      did: route.did,
      description: route.description ?? "",
      destinationType: route.destinationType,
      destinationTarget: route.destinationTarget,
      priority: route.priority,
      enabled: route.enabled,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingRoute) {
        await api.patch(`/inbound-routes/${editingRoute.id}`, form);
        setFeedback({ msg: "Rota atualizada.", type: "ok" });
      } else {
        await api.post("/inbound-routes", form);
        setFeedback({ msg: "Rota criada.", type: "ok" });
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      const msg = err.response?.data?.message || "Erro ao salvar rota.";
      setFeedback({ msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/inbound-routes/${deleteDialog.id}`);
      setFeedback({ msg: "Rota removida.", type: "ok" });
      setDeleteDialog(null);
      await load();
    } catch {
      setFeedback({ msg: "Erro ao remover rota.", type: "error" });
    }
  };

  const handleReprovisionAll = async () => {
    try {
      await api.post("/inbound-routes/reprovision-all");
      setFeedback({ msg: "Reprovisionamento concluído.", type: "ok" });
    } catch {
      setFeedback({ msg: "Erro ao reprovisionar.", type: "error" });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneIncoming className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">{t("inboundRoutes.title")}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReprovisionAll}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("inboundRoutes.reprovisionAll")}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t("inboundRoutes.addRoute")}
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{feedback.msg}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {routes.length} {routes.length === 1 ? "rota" : "rotas"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-4">Carregando...</p>
          ) : routes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t("inboundRoutes.noRoutes")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("inboundRoutes.did")}</TableHead>
                  <TableHead>{t("inboundRoutes.description")}</TableHead>
                  <TableHead>{t("inboundRoutes.destinationTarget")}</TableHead>
                  <TableHead>{t("inboundRoutes.enabled")}</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell className="font-mono">{route.did}</TableCell>
                    <TableCell className="text-muted-foreground">{route.description || "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{route.destinationTarget}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({t("inboundRoutes.extension")})</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={route.enabled ? "default" : "secondary"}>
                        {route.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(route)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteDialog(route)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRoute ? t("inboundRoutes.saveRoute") : t("inboundRoutes.addRoute")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("inboundRoutes.did")} *</label>
              <input
                value={form.did}
                onChange={(e) => set("did", e.target.value)}
                placeholder={t("inboundRoutes.didPlaceholder")}
                required
                pattern="\d{8,15}"
                title="Somente dígitos, 8 a 15 caracteres"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("inboundRoutes.description")}</label>
              <input
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder={t("inboundRoutes.descriptionPlaceholder")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("inboundRoutes.destinationTarget")} *</label>
              <input
                value={form.destinationTarget}
                onChange={(e) => set("destinationTarget", e.target.value)}
                placeholder={t("inboundRoutes.destinationTargetPlaceholder")}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("inboundRoutes.extension")}</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={form.enabled ?? true}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              <span className="text-sm font-medium">{t("inboundRoutes.enabled")}</span>
            </label>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : (editingRoute ? t("inboundRoutes.saveRoute") : t("inboundRoutes.addRoute"))}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.delete")}</DialogTitle>
            <DialogDescription>
              {t("inboundRoutes.confirmDelete", { did: deleteDialog?.did })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("common.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
