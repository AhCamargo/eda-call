import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  FC,
} from "react";
import { io, Socket } from "socket.io-client";
import api, { setToken, API_BASE } from "../api";
import type {
  User,
  StatusCounts,
  Extension,
  VoipLine,
  Campaign,
  ReportSummary,
  CallLogEntry,
  UraLog,
  Recording,
  IPbxContextValue,
  CreateExtensionPayload,
  CreateCampaignPayload,
  CreateVoipLinePayload,
} from "../types";

const PbxContext = createContext<IPbxContextValue | null>(null);

interface PbxProviderProps {
  token: string;
  user?: User;
  onUnauthorized: () => void;
  children: ReactNode;
}

export const PbxProvider: FC<PbxProviderProps> = ({
  token,
  user,
  onUnauthorized,
  children,
}) => {
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    online: 0,
    offline: 0,
    paused: 0,
    ringing: 0,
    in_call: 0,
    in_campaign: 0,
  });
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [voipLines, setVoipLines] = useState<VoipLine[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reports, setReports] = useState<ReportSummary>({
    quemAtendeu: 0,
    numeroNaoExiste: 0,
  });
  const [reportCallsByExtension, setReportCallsByExtension] = useState<
    CallLogEntry[]
  >([]);
  const [reportCallsByCampaign, setReportCallsByCampaign] = useState<
    CallLogEntry[]
  >([]);
  const [reportUraLogs, setReportUraLogs] = useState<UraLog[]>([]);
  const [reportRecordings, setReportRecordings] = useState<Recording[]>([]);

  // O backend agora exige um JWT válido no handshake do Socket.IO (ver
  // achado F17 da auditoria de segurança) — sem `auth.token`, a conexão é
  // recusada. PbxProvider só existe enquanto `token` é válido (App.tsx
  // desmonta este provider inteiro no logout), então capturar o token uma
  // única vez na criação do socket é seguro.
  const socket = useMemo<Socket>(
    () =>
      io(API_BASE, {
        auth: { token },
      }),
    [],
  );

  useEffect(() => {
    setToken(token);
  }, [token]);

  // Alguns endpoints agora são restritos a admin/supervisor (ver auditoria de
  // segurança — achados F2/F3/F5/F6). Um papel `agent` recebe 403 nessas
  // chamadas por design; isso não deve derrubar a sessão dele. Só um 401
  // (token ausente/inválido) deve disparar onUnauthorized(); um 403 (token
  // válido, papel sem permissão) apenas deixa aquele pedaço de estado vazio.
  const safeGet = async (url: string): Promise<any | null> => {
    try {
      const res = await api.get(url);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 401) throw err;
      return null;
    }
  };

  const fetchAll = async (): Promise<void> => {
    const [
      dashboardData,
      extensionsData,
      voipLinesData,
      campaignsData,
      reportsData,
      byExtData,
      byCampaignData,
      uraData,
      recordingsData,
    ] = await Promise.all([
      safeGet("/dashboard"),
      safeGet("/extensions"),
      safeGet("/voip-lines"),
      safeGet("/campaigns"),
      safeGet("/reports/summary"),
      safeGet("/reports/calls-by-extension"),
      safeGet("/reports/calls-by-campaign"),
      safeGet("/reports/ura-logs?limit=500"),
      safeGet("/reports/recordings?limit=200"),
    ]);

    if (dashboardData) setStatusCounts(dashboardData.statusCounts);
    setExtensions(extensionsData ?? []);
    setVoipLines(voipLinesData ?? []);
    setCampaigns(campaignsData ?? []);
    if (reportsData) setReports(reportsData);
    setReportCallsByExtension(byExtData ?? []);
    setReportCallsByCampaign(byCampaignData ?? []);
    setReportUraLogs(uraData?.data ?? uraData ?? []);
    setReportRecordings(recordingsData?.data ?? recordingsData ?? []);
  };

  useEffect(() => {
    if (!token) return;

    fetchAll().catch(() => {
      onUnauthorized();
    });

    socket.on("dashboard:update", () => {
      fetchAll().catch(() => {});
    });

    socket.on("call:update", () => {
      fetchAll().catch(() => {});
    });

    return () => {
      socket.off("dashboard:update");
      socket.off("call:update");
    };
  }, [token]);

  const createExtension = async (
    payload: CreateExtensionPayload,
  ): Promise<{ sipPassword?: string; warning?: string; detail?: string }> => {
    const res = await api.post("/extensions", payload);
    await fetchAll();
    return res.data;
  };

  const updateExtension = async (
    id: string,
    payload: Partial<CreateExtensionPayload>,
  ): Promise<void> => {
    await api.patch(`/extensions/${id}`, payload);
    await fetchAll();
  };

  const deleteExtension = async (id: string): Promise<void> => {
    await api.delete(`/extensions/${id}`);
    await fetchAll();
  };

  const pauseExtension = async (id: string, reason: string): Promise<void> => {
    await api.patch(`/extensions/${id}/pause`, { reason });
    await fetchAll();
  };

  const resumeExtension = async (id: string): Promise<void> => {
    await api.patch(`/extensions/${id}/resume`);
    await fetchAll();
  };

  const createCampaign = async (
    payload: CreateCampaignPayload,
  ): Promise<Campaign> => {
    const res = await api.post("/campaigns", payload);
    await fetchAll();
    return res.data;
  };

  const updateCampaign = async (
    id: string,
    payload: Partial<CreateCampaignPayload>,
  ): Promise<void> => {
    await api.patch(`/campaigns/${id}`, payload);
    await fetchAll();
  };

  const deleteCampaign = async (id: string): Promise<void> => {
    await api.delete(`/campaigns/${id}`);
    await fetchAll();
  };

  const assignExtensions = async (
    campaignId: string,
    extensionIds: string[],
  ): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/assign-extensions`, {
      extensionIds,
    });
    await fetchAll();
  };

  const assignVoipLines = async (
    campaignId: string,
    voipLineIds: string[],
  ): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/assign-voip-lines`, {
      voipLineIds,
    });
    await fetchAll();
  };

  const uploadPhones = async (
    campaignId: string,
    file: File,
  ): Promise<{ total: number; totalInvalid: number; totalDuplicates: number }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/campaigns/${campaignId}/upload-phones`, formData);
    await fetchAll();
    return {
      total: res.data?.total ?? 0,
      totalInvalid: res.data?.totalInvalid ?? 0,
      totalDuplicates: res.data?.totalDuplicates ?? 0,
    };
  };

  const startCampaign = async (campaignId: string): Promise<void> => {
    await api.post(`/campaigns/${campaignId}/start`);
    await fetchAll();
  };

  const createVoipLine = async (
    payload: CreateVoipLinePayload,
  ): Promise<void> => {
    await api.post("/voip-lines", payload);
    await fetchAll();
  };

  const updateVoipLine = async (
    id: string,
    payload: Partial<CreateVoipLinePayload>,
  ): Promise<void> => {
    await api.patch(`/voip-lines/${id}`, payload);
    await fetchAll();
  };

  const deleteVoipLine = async (id: string): Promise<void> => {
    await api.delete(`/voip-lines/${id}`);
    await fetchAll();
  };

  const reprovisionVoipLine = async (id: string): Promise<void> => {
    await api.post(`/voip-lines/${id}/provision`);
    await fetchAll();
  };

  const reprovisionExtension = async (id: string): Promise<void> => {
    await api.post(`/extensions/${id}/provision`);
    await fetchAll();
  };

  const testCallBetweenExtensions = async (
    sourceExtensionId: string,
    targetExtensionId: string,
  ): Promise<Record<string, unknown>> => {
    const response = await api.post("/calls/test-between-extensions", {
      sourceExtensionId,
      targetExtensionId,
    });
    await fetchAll();
    return response.data;
  };

  const deleteRecording = async (recordingId: string): Promise<void> => {
    await api.delete(`/recordings/${recordingId}`);
    await fetchAll();
  };

  const value: IPbxContextValue = {
    user,
    socket,
    statusCounts,
    extensions,
    voipLines,
    campaigns,
    reports,
    reportCallsByExtension,
    reportCallsByCampaign,
    reportUraLogs,
    reportRecordings,
    fetchAll,
    createExtension,
    updateExtension,
    deleteExtension,
    pauseExtension,
    resumeExtension,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    assignExtensions,
    assignVoipLines,
    uploadPhones,
    startCampaign,
    createVoipLine,
    updateVoipLine,
    deleteVoipLine,
    reprovisionVoipLine,
    reprovisionExtension,
    testCallBetweenExtensions,
    deleteRecording,
  };

  return <PbxContext.Provider value={value}>{children}</PbxContext.Provider>;
};

export const usePbx = (): IPbxContextValue => {
  const context = useContext(PbxContext);
  if (!context) {
    throw new Error("usePbx deve ser usado dentro de PbxProvider");
  }
  return context;
};
