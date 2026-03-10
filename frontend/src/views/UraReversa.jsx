import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { io } from 'socket.io-client';
import api from '../api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const emptyCampaignForm = {
  name: '',
  voipLineId: '',
  digitTimeoutSeconds: 5,
  maxAttempts: 2,
  retryIntervalSeconds: 30,
  concurrentCalls: 5,
  codec: 'ulaw',
  callTimeoutSeconds: 25,
  detectVoicemail: false,
  autoCallback: false,
  dialTechnology: 'PJSIP'
};

const emptyOption = { keyDigit: '1', actionType: 'transfer_extension', targetExtension: '' };

const phoneRegex = /^\d{10,14}$/;

function UraReversa() {
  const [campaigns, setCampaigns] = useState([]);
  const [voipLines, setVoipLines] = useState([]);
  const [extensions, setExtensions] = useState([]);

  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [options, setOptions] = useState([emptyOption]);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvInvalid, setCsvInvalid] = useState([]);
  const [feedback, setFeedback] = useState('');

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => String(campaign.id) === String(selectedCampaignId)) || null,
    [campaigns, selectedCampaignId]
  );

  const socket = useMemo(() => io(API_URL), []);

  const fetchData = async () => {
    const [campaignsRes, linesRes, extensionsRes] = await Promise.all([
      api.get('/ura-reverse/campaigns'),
      api.get('/voip-lines'),
      api.get('/extensions')
    ]);

    setCampaigns(campaignsRes.data);
    setVoipLines(linesRes.data);
    setExtensions(extensionsRes.data);

    if (!selectedCampaignId && campaignsRes.data.length) {
      setSelectedCampaignId(String(campaignsRes.data[0].id));
    }
  };

  useEffect(() => {
    fetchData().catch(() => {});

    socket.on('ura-reverse:stats', ({ campaignId, stats }) => {
      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === campaignId ? { ...campaign, stats } : campaign
        )
      );
    });

    socket.on('ura-reverse:campaign-status', ({ campaignId, status }) => {
      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === campaignId ? { ...campaign, status } : campaign
        )
      );
    });

    socket.on('ura-reverse:call-event', ({ campaignId }) => {
      if (String(campaignId) === String(selectedCampaignId)) {
        fetchData().catch(() => {});
      }
    });

    return () => {
      socket.off('ura-reverse:stats');
      socket.off('ura-reverse:campaign-status');
      socket.off('ura-reverse:call-event');
    };
  }, [selectedCampaignId]);

  const loadOptions = async (campaignId) => {
    if (!campaignId) return;

    const response = await api.get(`/ura-reverse/campaigns/${campaignId}/options`);
    if (!response.data.length) {
      setOptions([emptyOption]);
      return;
    }

    setOptions(
      response.data.map((item) => ({
        keyDigit: item.keyDigit,
        actionType: item.actionType,
        targetExtension: item.targetExtension || ''
      }))
    );
  };

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadOptions(selectedCampaignId).catch(() => {});
  }, [selectedCampaignId]);

  const handleCreateCampaign = async () => {
    if (!campaignForm.name.trim() || !campaignForm.voipLineId) {
      setFeedback('Preencha os campos obrigatórios da campanha URA.');
      return;
    }

    const response = await api.post('/ura-reverse/campaigns', campaignForm);
    setFeedback('Campanha URA criada com sucesso.');
    setCampaignForm(emptyCampaignForm);
    await fetchData();
    setSelectedCampaignId(String(response.data.id));
  };

  const handleUploadAudio = async () => {
    if (!selectedCampaignId || !audioFile) return;

    const formData = new FormData();
    formData.append('audio', audioFile);

    await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/audio`, formData);
    setFeedback('Áudio enviado com sucesso.');
    await fetchData();
  };

  const handleSaveOptions = async () => {
    if (!selectedCampaignId) return;

    await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/options`, {
      options
    });

    setFeedback('Fluxo da URA salvo com sucesso.');
    await fetchData();
  };

  const parseCsvPreview = async (file) => {
    if (!file) {
      setCsvPreview([]);
      setCsvInvalid([]);
      return;
    }

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setCsvPreview([]);
      setCsvInvalid([]);
      return;
    }

    const headers = lines[0].split(',').map((column) => column.trim().toLowerCase());
    const phoneIndex = headers.findIndex((column) => ['telefone', 'phone', 'phonenumber'].includes(column));

    if (phoneIndex < 0) {
      setCsvPreview([]);
      setCsvInvalid(['Coluna telefone não encontrada no CSV.']);
      return;
    }

    const parsed = lines.slice(1).map((line) => {
      const cols = line.split(',');
      return String(cols[phoneIndex] || '').replace(/\D/g, '');
    });

    const valid = parsed.filter((phone) => phoneRegex.test(phone));
    const invalid = parsed.filter((phone) => phone && !phoneRegex.test(phone));

    setCsvPreview(valid.slice(0, 20));
    setCsvInvalid(invalid.slice(0, 20));
  };

  const handleUploadCsv = async () => {
    if (!selectedCampaignId || !csvFile) return;

    const formData = new FormData();
    formData.append('file', csvFile);

    await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/contacts/upload`, formData);
    setFeedback('Lista enviada com sucesso.');
    setCsvFile(null);
    setCsvPreview([]);
    setCsvInvalid([]);
    await fetchData();
  };

  const handleControl = async (action) => {
    if (!selectedCampaignId) return;

    await api.post(`/ura-reverse/campaigns/${selectedCampaignId}/${action}`);
    await fetchData();
  };

  const addOptionLine = () => {
    setOptions((prev) => [...prev, { ...emptyOption }]);
  };

  const removeOptionLine = (index) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateOption = (index, nextValue) => {
    setOptions((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...nextValue } : item)));
  };

  const resolveRecordingUrl = (recordingPath) => {
    if (!recordingPath) return null;
    if (/^https?:\/\//i.test(recordingPath)) return recordingPath;
    return `${API_URL}${recordingPath.startsWith('/') ? recordingPath : `/${recordingPath}`}`;
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">URA Reversa</Typography>
      {feedback ? <Alert severity="info">{feedback}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Tela 1 – Criar URA</Typography>
            <TextField
              label="Nome da campanha"
              value={campaignForm.name}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />

            <FormControl fullWidth required>
              <InputLabel>Linha VoIP (PJSIP)</InputLabel>
              <Select
                label="Linha VoIP (PJSIP)"
                value={campaignForm.voipLineId}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, voipLineId: e.target.value }))}
              >
                {voipLines.map((line) => (
                  <MenuItem key={line.id} value={line.id}>
                    {line.name} - {line.host}:{line.port}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                type="number"
                label="Tempo de espera para digitação (s)"
                value={campaignForm.digitTimeoutSeconds}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, digitTimeoutSeconds: Number(e.target.value) }))}
                fullWidth
                required
              />
              <TextField
                type="number"
                label="Número máximo de tentativas"
                value={campaignForm.maxAttempts}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, maxAttempts: Number(e.target.value) }))}
                fullWidth
                required
              />
              <TextField
                type="number"
                label="Intervalo entre tentativas (s)"
                value={campaignForm.retryIntervalSeconds}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, retryIntervalSeconds: Number(e.target.value) }))}
                fullWidth
                required
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                type="number"
                label="Chamadas simultâneas"
                value={campaignForm.concurrentCalls}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, concurrentCalls: Number(e.target.value) }))}
                fullWidth
              />
              <TextField
                type="number"
                label="Timeout da chamada (s)"
                value={campaignForm.callTimeoutSeconds}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, callTimeoutSeconds: Number(e.target.value) }))}
                fullWidth
              />
              <TextField
                label="Codec"
                value={campaignForm.codec}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, codec: e.target.value }))}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Tecnologia de discagem</InputLabel>
                <Select
                  label="Tecnologia de discagem"
                  value={campaignForm.dialTechnology}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, dialTechnology: e.target.value }))}
                >
                  <MenuItem value="PJSIP">PJSIP</MenuItem>
                  <MenuItem value="SIP">SIP</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={campaignForm.detectVoicemail}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, detectVoicemail: e.target.checked }))}
                  />
                }
                label="Detectar caixa postal"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={campaignForm.autoCallback}
                    onChange={(e) => setCampaignForm((prev) => ({ ...prev, autoCallback: e.target.checked }))}
                  />
                }
                label="Callback automático"
              />
            </Stack>

            <Button variant="contained" onClick={handleCreateCampaign}>
              Criar campanha URA
            </Button>

            <FormControl fullWidth>
              <InputLabel>Campanha URA selecionada</InputLabel>
              <Select
                label="Campanha URA selecionada"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
              >
                {campaigns.map((campaign) => (
                  <MenuItem key={campaign.id} value={String(campaign.id)}>
                    {campaign.name} ({campaign.status})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              type="file"
              inputProps={{ accept: '.wav' }}
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              helperText="Upload de áudio (.wav 8kHz mono)"
              fullWidth
            />
            <Button variant="outlined" onClick={handleUploadAudio} disabled={!selectedCampaignId || !audioFile}>
              Enviar áudio
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Tela 2 – Configurar Opções (Fluxo da URA)</Typography>

            {options.map((option, index) => (
              <Stack key={`option-${index}`} direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Tecla</InputLabel>
                  <Select
                    label="Tecla"
                    value={option.keyDigit}
                    onChange={(e) => updateOption(index, { keyDigit: e.target.value })}
                  >
                    {Array.from({ length: 10 }).map((_, digit) => (
                      <MenuItem key={digit} value={String(digit)}>
                        {digit}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Tipo de ação</InputLabel>
                  <Select
                    label="Tipo de ação"
                    value={option.actionType}
                    onChange={(e) => updateOption(index, { actionType: e.target.value })}
                  >
                    <MenuItem value="transfer_extension">Transferir para ramal</MenuItem>
                    <MenuItem value="speak_commercial">Falar com comercial</MenuItem>
                    <MenuItem value="hangup">Encerrar</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth disabled={option.actionType !== 'transfer_extension'}>
                  <InputLabel>Ramal</InputLabel>
                  <Select
                    label="Ramal"
                    value={option.targetExtension}
                    onChange={(e) => updateOption(index, { targetExtension: e.target.value })}
                  >
                    {extensions.map((extension) => (
                      <MenuItem key={extension.id} value={extension.number}>
                        {extension.number} - {extension.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button color="error" onClick={() => removeOptionLine(index)}>
                  Remover
                </Button>
              </Stack>
            ))}

            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={addOptionLine}>
                Adicionar opção
              </Button>
              <Button variant="contained" onClick={handleSaveOptions} disabled={!selectedCampaignId}>
                Salvar fluxo
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Tela 3 – Upload da Lista</Typography>
            <TextField
              type="file"
              inputProps={{ accept: '.csv' }}
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                setCsvFile(file);
                await parseCsvPreview(file);
              }}
              fullWidth
            />

            <Typography variant="body2">Coluna esperada: telefone</Typography>

            {csvInvalid.length ? (
              <Alert severity="warning">CSV com itens inválidos: {csvInvalid.join(', ')}</Alert>
            ) : null}

            <Box>
              <Typography variant="subtitle2">Preview (até 20 números válidos):</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {csvPreview.map((phone, index) => (
                  <Typography key={`${phone}-${index}`} variant="body2">
                    {phone}
                  </Typography>
                ))}
                {!csvPreview.length ? <Typography variant="body2">Sem preview disponível.</Typography> : null}
              </Stack>
            </Box>

            <Button variant="contained" onClick={handleUploadCsv} disabled={!selectedCampaignId || !csvFile}>
              Enviar CSV
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Tela 4 – Controle da Campanha</Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Button variant="contained" onClick={() => handleControl('start')} disabled={!selectedCampaignId}>
                Iniciar
              </Button>
              <Button variant="outlined" onClick={() => handleControl('pause')} disabled={!selectedCampaignId}>
                Pausar
              </Button>
              <Button color="error" variant="outlined" onClick={() => handleControl('finish')} disabled={!selectedCampaignId}>
                Finalizar
              </Button>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Chamando</TableCell>
                  <TableCell>Atendidos</TableCell>
                  <TableCell>Não atendeu</TableCell>
                  <TableCell>Inválido</TableCell>
                  <TableCell>Ocupado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{selectedCampaign?.stats?.calling || 0}</TableCell>
                  <TableCell>{selectedCampaign?.stats?.answered || 0}</TableCell>
                  <TableCell>{selectedCampaign?.stats?.no_answer || 0}</TableCell>
                  <TableCell>{selectedCampaign?.stats?.invalid || 0}</TableCell>
                  <TableCell>{selectedCampaign?.stats?.busy || 0}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Typography variant="subtitle1">Gravações por contato</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Telefone</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Opção</TableCell>
                  <TableCell>Resultado</TableCell>
                  <TableCell>Áudio</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(selectedCampaign?.contacts || []).slice(0, 30).map((contact) => {
                  const audioUrl = resolveRecordingUrl(contact.recordingPath);

                  return (
                    <TableRow key={contact.id}>
                      <TableCell>{contact.phoneNumber}</TableCell>
                      <TableCell>{contact.status}</TableCell>
                      <TableCell>{contact.selectedOption || '-'}</TableCell>
                      <TableCell>{contact.lastResult || '-'}</TableCell>
                      <TableCell>
                        {audioUrl ? (
                          <audio controls preload="none" src={audioUrl} />
                        ) : (
                          <Typography variant="body2">Sem gravação</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {audioUrl ? (
                          <Button component="a" href={audioUrl} download variant="outlined" size="small">
                            Baixar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!(selectedCampaign?.contacts || []).length ? (
                  <TableRow>
                    <TableCell colSpan={6}>Sem contatos carregados para esta campanha.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default UraReversa;
