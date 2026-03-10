import { useMemo, useState } from 'react';
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
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

function Usuario() {
  const { t } = useTranslation();
  const pauseOptions = [
    { value: 'Banheiro', label: t('user.reasons.bathroom') },
    { value: 'Suporte Técnico', label: t('user.reasons.technicalSupport') },
    { value: 'Reunião', label: t('user.reasons.meeting') }
  ];

  const { extensions, pauseExtension, resumeExtension } = usePbx();
  const [selectedExtensionId, setSelectedExtensionId] = useState('');
  const [pauseReason, setPauseReason] = useState(pauseOptions[0].value);

  const selectedExtension = useMemo(
    () => extensions.find((ext) => String(ext.id) === String(selectedExtensionId)),
    [extensions, selectedExtensionId]
  );

  const handlePause = async () => {
    if (!selectedExtensionId) return;
    await pauseExtension(selectedExtensionId, pauseReason);
  };

  const handleResume = async () => {
    if (!selectedExtensionId) return;
    await resumeExtension(selectedExtensionId);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('user.title')}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t('user.pauseMode')}</Typography>

            <FormControl fullWidth>
              <InputLabel>{t('user.extension')}</InputLabel>
              <Select label={t('user.extension')} value={selectedExtensionId} onChange={(e) => setSelectedExtensionId(e.target.value)}>
                {extensions.map((extension) => (
                  <MenuItem key={extension.id} value={String(extension.id)}>
                    {extension.number} - {extension.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>{t('user.pauseReason')}</InputLabel>
              <Select label={t('user.pauseReason')} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)}>
                {pauseOptions.map((reason) => (
                  <MenuItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedExtension && (
              <Alert severity={selectedExtension.status === 'paused' ? 'warning' : 'info'}>
                {t('user.currentStatus')}: {selectedExtension.status}
                {selectedExtension.pauseReason ? ` | ${t('user.reason')}: ${selectedExtension.pauseReason}` : ''}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" onClick={handlePause} disabled={!selectedExtensionId}>
                {t('user.enterPause')}
              </Button>
              <Button variant="outlined" onClick={handleResume} disabled={!selectedExtensionId}>
                {t('user.returnPause')}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default Usuario;
