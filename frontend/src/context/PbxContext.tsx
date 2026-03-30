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
import api, { setToken } from "../api";
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

  const socket = useMemo<Socket>(
    () => io(import.meta.env.VITE_API_URL || "http://localhost:5000"),
    [],
  );

  useEffect(() => {
    setToken(token);
  }, [token]);

  const fetchAll = async (): Promise<void> => {
    const [
      dashboardRes,
      extensionsRes,
      voipLinesRes,
      campaignsRes,
      reportsRes,
      byExtRes,
      byCampaignRes,
      uraRes,
      recordingsRes,
    ] = await Promise.all([
      api.get("/dashboard"),
      api.get("/extensions"),
      api.get("/voip-lines"),
      api.get("/campaigns"),
      api.get("/reports/summary"),
      api.get("/reports/calls-by-extension"),
      api.get("/reports/calls-by-campaign"),
      api.get("/reports/ura-logs"),
      api.get("/reports/recordings"),
    ]);

    setStatusCounts(dashboardRes.data.statusCounts);
    setExtensions(extensionsRes.data);
    setVoipLines(voipLinesRes.data);
    setCampaigns(campaignsRes.data);
    setReports(reportsRes.data);
    setReportCallsByExtension(byExtRes.data);
    setReportCallsByCampaign(byCampaignRes.data);
    setReportUraLogs(uraRes.data);
    setReportRecordings(recordingsRes.data);
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
  ): Promise<void> => {
    await api.post("/extensions", payload);
    await fetchAll();
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
  ): Promise<void> => {
    await api.post("/campaigns", payload);
    await fetchAll();
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
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    await api.post(`/campaigns/${campaignId}/upload-phones`, formData);
    await fetchAll();
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
