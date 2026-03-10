import { Button, Card, CardContent, Stack, Typography } from '@mui/material';
import VoipForm from '../components/VoipForm';
import { usePbx } from '../context/PbxContext';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function LinhasVoip() {
  const { t } = useTranslation();
  const { voipLines, createVoipLine, updateVoipLine, deleteVoipLine, reprovisionVoipLine } = usePbx();
  const [editingLine, setEditingLine] = useState(null);

  const handleSubmitLine = async (payload) => {
    if (editingLine) {
      await updateVoipLine(editingLine.id, payload);
      setEditingLine(null);
      return;
    }

    await createVoipLine(payload);
  };

  const handleDeleteLine = async (line) => {
    if (!window.confirm(t('voip.confirmDelete', { name: line.name }))) {
      return;
    }

    await deleteVoipLine(line.id);
    if (editingLine?.id === line.id) {
      setEditingLine(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('voip.title')}</Typography>
      <Card>
        <CardContent>
      <VoipForm
        onSubmit={handleSubmitLine}
        initialValues={editingLine}
        submitLabel={editingLine ? t('voip.saveLine') : t('voip.registerLine')}
        onCancel={editingLine ? () => setEditingLine(null) : null}
      />

      <Stack spacing={1}>
        {voipLines.map((line) => (
          <Stack key={line.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center">
            <Typography sx={{ flex: 1 }}>
              {line.name} - {line.username}@{line.host}:{line.port} ({line.transport})
            </Typography>
            <Button type="button" variant="outlined" onClick={() => reprovisionVoipLine(line.id)}>
              {t('voip.reprovision')}
            </Button>
            <Button type="button" variant="outlined" onClick={() => setEditingLine(line)}>
              {t('common.edit')}
            </Button>
            <Button type="button" variant="outlined" color="error" onClick={() => handleDeleteLine(line)}>
              {t('common.delete')}
            </Button>
          </Stack>
        ))}
      </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default LinhasVoip;
