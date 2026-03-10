import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import api, { setToken } from '../api';

const PbxContext = createContext(null);

export function PbxProvider({ token, onUnauthorized, children }) {
  const [statusCounts, setStatusCounts] = useState({
    online: 0,
    offline: 0,
    paused: 0,
    ringing: 0,
    in_call: 0,
    in_campaign: 0
  });
  const [extensions, setExtensions] = useState([]);
  const [voipLines, setVoipLines] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [reports, setReports] = useState({ quemAtendeu: 0, numeroNaoExiste: 0 });
  const [reportCallsByExtension, setReportCallsByExtension] = useState([]);
  const [reportCallsByCampaign, setReportCallsByCampaign] = useState([]);
  const [reportUraLogs, setReportUraLogs] = useState([]);
  const [reportRecordings, setReportRecordings] = useState([]);

  const socket = useMemo(() => io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'), []);

  useEffect(() => {
    setToken(token);
  }, [token]);

  const fetchAll = async () => {
    const [dashboardRes, extensionsRes, voipLinesRes, campaignsRes, reportsRes, byExtRes, byCampaignRes, uraRes, recordingsRes] = await Promise.all([
      api.get('/dashboard'),
      api.get('/extensions'),
      api.get('/voip-lines'),
      api.get('/campaigns'),
      api.get('/reports/summary'),
      api.get('/reports/calls-by-extension'),
      api.get('/reports/calls-by-campaign'),
      api.get('/reports/ura-logs'),
      api.get('/reports/recordings')
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

    socket.on('dashboard:update', () => {
      fetchAll().catch(() => {});
    });

    socket.on('call:update', () => {
      fetchAll().catch(() => {});
    });

    return () => {
      socket.off('dashboard:update');
      socket.off('call:update');
    };
  }, [token]);

  const createExtension = async (payload) => {
    await api.post('/extensions', payload);
    await fetchAll();
  };

  const updateExtension = async (id, payload) => {
    await api.patch(`/extensions/${id}`, payload);
    await fetchAll();
  };

  const deleteExtension = async (id) => {
    await api.delete(`/extensions/${id}`);
    await fetchAll();
  };

  const pauseExtension = async (id, reason) => {
    await api.patch(`/extensions/${id}/pause`, { reason });
    await fetchAll();
  };

  const resumeExtension = async (id) => {
    await api.patch(`/extensions/${id}/resume`);
    await fetchAll();
  };

  const createCampaign = async (payload) => {
    await api.post('/campaigns', payload);
    await fetchAll();
  };

  const updateCampaign = async (id, payload) => {
    await api.patch(`/campaigns/${id}`, payload);
    await fetchAll();
  };

  const deleteCampaign = async (id) => {
    await api.delete(`/campaigns/${id}`);
    await fetchAll();
  };

  const assignExtensions = async (campaignId, extensionIds) => {
    await api.post(`/campaigns/${campaignId}/assign-extensions`, { extensionIds });
    await fetchAll();
  };

  const assignVoipLines = async (campaignId, voipLineIds) => {
    await api.post(`/campaigns/${campaignId}/assign-voip-lines`, { voipLineIds });
    await fetchAll();
  };

  const uploadPhones = async (campaignId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/campaigns/${campaignId}/upload-phones`, formData);
    await fetchAll();
  };

  const startCampaign = async (campaignId) => {
    await api.post(`/campaigns/${campaignId}/start`);
    await fetchAll();
  };

  const createVoipLine = async (payload) => {
    await api.post('/voip-lines', payload);
    await fetchAll();
  };

  const updateVoipLine = async (id, payload) => {
    await api.patch(`/voip-lines/${id}`, payload);
    await fetchAll();
  };

  const deleteVoipLine = async (id) => {
    await api.delete(`/voip-lines/${id}`);
    await fetchAll();
  };

  const reprovisionVoipLine = async (id) => {
    await api.post(`/voip-lines/${id}/provision`);
    await fetchAll();
  };

  const testCallBetweenExtensions = async (sourceExtensionId, targetExtensionId) => {
    const response = await api.post('/calls/test-between-extensions', {
      sourceExtensionId,
      targetExtensionId
    });
    await fetchAll();
    return response.data;
  };

  const deleteRecording = async (recordingId) => {
    await api.delete(`/recordings/${recordingId}`);
    await fetchAll();
  };

  const value = {
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
    testCallBetweenExtensions,
    deleteRecording
  };

  return <PbxContext.Provider value={value}>{children}</PbxContext.Provider>;
}

export function usePbx() {
  const context = useContext(PbxContext);
  if (!context) {
    throw new Error('usePbx deve ser usado dentro de PbxProvider');
  }
  return context;
}
