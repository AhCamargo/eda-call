import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
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
import { usePbx } from '../context/PbxContext';
import RamalForm from '../components/RamalForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function Ramais() {
  const {
    extensions,
    reportRecordings,
    createExtension,
    updateExtension,
    deleteExtension,
    testCallBetweenExtensions,
    deleteRecording
  } = usePbx();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ number: '', name: '' });
  const [sourceExtensionId, setSourceExtensionId] = useState('');
  const [targetExtensionId, setTargetExtensionId] = useState('');
  const [testFeedback, setTestFeedback] = useState('');

  const startEdit = (extension) => {
    setEditingId(extension.id);
    setEditForm({ number: extension.number, name: extension.name });
  };

  const saveEdit = async (id) => {
    await updateExtension(id, editForm);
    setEditingId(null);
  };

  const removeExtension = async (id, number) => {
    if (!window.confirm(`Deseja excluir o ramal ${number}?`)) {
      return;
    }
    await deleteExtension(id);
  };

  const resolveRecordingUrl = (recording) => {
    if (recording.webPath) {
      return `${API_URL}${recording.webPath.startsWith('/') ? recording.webPath : `/${recording.webPath}`}`;
    }

    if (recording.filePath && recording.filePath.includes('/asterisk-recordings/')) {
      const relativePath = recording.filePath.split('/asterisk-recordings/')[1];
      if (relativePath) {
        return `${API_URL}/recordings/${relativePath}`;
      }
    }

    return null;
  };

  const handleTestCall = async () => {
    if (!sourceExtensionId || !targetExtensionId) {
      setTestFeedback('Selecione origem e destino para iniciar o teste.');
      return;
    }

    if (String(sourceExtensionId) === String(targetExtensionId)) {
      setTestFeedback('Origem e destino precisam ser diferentes.');
      return;
    }

    const result = await testCallBetweenExtensions(Number(sourceExtensionId), Number(targetExtensionId));
    setTestFeedback(result.message || 'Ligação de teste iniciada.');
  };

  const handleDeleteRecording = async (recording) => {
    if (!window.confirm(`Deseja excluir a gravação?\n${recording.filePath}`)) {
      return;
    }

    await deleteRecording(recording.id);
    setTestFeedback('Gravação excluída com sucesso.');
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Ramais</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6">Teste de ligação entre ramais (com gravação)</Typography>

            {testFeedback ? <Alert severity="info">{testFeedback}</Alert> : null}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Ramal de origem</InputLabel>
                <Select
                  label="Ramal de origem"
                  value={sourceExtensionId}
                  onChange={(e) => setSourceExtensionId(e.target.value)}
                >
                  {extensions.map((extension) => (
                    <MenuItem key={`source-${extension.id}`} value={String(extension.id)}>
                      {extension.number} - {extension.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>Ramal de destino</InputLabel>
                <Select
                  label="Ramal de destino"
                  value={targetExtensionId}
                  onChange={(e) => setTargetExtensionId(e.target.value)}
                >
                  {extensions.map((extension) => (
                    <MenuItem key={`target-${extension.id}`} value={String(extension.id)}>
                      {extension.number} - {extension.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button variant="contained" onClick={handleTestCall}>
                Iniciar teste
              </Button>
            </Stack>
          </Stack>

          <RamalForm onCreate={createExtension} />

          <Stack spacing={1}>
            {extensions.map((extension) => {
              const isEditing = editingId === extension.id;
              return (
                <Stack key={extension.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center">
                  {isEditing ? (
                    <>
                      <TextField
                        size="small"
                        label="Número"
                        value={editForm.number}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, number: e.target.value }))}
                      />
                      <TextField
                        size="small"
                        label="Nome"
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </>
                  ) : (
                    <Typography sx={{ flex: 1 }}>
                      {extension.number} - {extension.name}
                      {extension.sector ? ` [${extension.sector}]` : ''} ({extension.status})
                    </Typography>
                  )}

                  <Typography sx={{ minWidth: 180, textAlign: 'right' }}>
                    Status: {extension.status}
                  </Typography>

                  {isEditing ? (
                    <>
                      <Button variant="contained" onClick={() => saveEdit(extension.id)}>
                        Salvar
                      </Button>
                      <Button variant="text" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outlined" onClick={() => startEdit(extension)}>
                        Editar
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => removeExtension(extension.id, extension.number)}>
                        Excluir
                      </Button>
                    </>
                  )}
                </Stack>
              );
            })}
          </Stack>

          <Stack spacing={1} sx={{ mt: 3 }}>
            <Typography variant="h6">Gravações recentes</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Arquivo</TableCell>
                  <TableCell>Áudio</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportRecordings.slice(0, 10).map((recording) => {
                  const recordingUrl = resolveRecordingUrl(recording);
                  return (
                    <TableRow key={recording.id}>
                      <TableCell>{recording.filePath}</TableCell>
                      <TableCell>
                        {recordingUrl ? <audio controls preload="none" src={recordingUrl} /> : 'Indisponível'}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          {recordingUrl ? (
                            <Button component="a" href={recordingUrl} download size="small" variant="outlined">
                              Baixar
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleDeleteRecording(recording)}
                          >
                            Excluir
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!reportRecordings.length ? (
                  <TableRow>
                    <TableCell colSpan={3}>Sem gravações sincronizadas ainda.</TableCell>
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

export default Ramais;
