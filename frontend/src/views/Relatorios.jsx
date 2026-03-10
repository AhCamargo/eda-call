import { Card, CardContent, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

function Relatorios() {
  const { t } = useTranslation();
  const {
    reports,
    reportCallsByExtension,
    reportCallsByCampaign,
    reportUraLogs,
    reportRecordings
  } = usePbx();

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('reports.title')}</Typography>
      <Card>
        <CardContent>
          <Typography>{t('reports.whoAnswered')}: {reports.quemAtendeu}</Typography>
          <Typography>{t('reports.numberNotExists')}: {reports.numeroNaoExiste}</Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('reports.callLogsByExtension')}</Typography>
          <Stack spacing={0.5}>
            {reportCallsByExtension.slice(0, 10).map((item) => (
              <Typography key={`ext-${item.id}`} variant="body2">
                {item.Extension?.number || '-'} | {item.phoneNumber} | {item.result}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('reports.callLogsByCampaign')}</Typography>
          <Stack spacing={0.5}>
            {reportCallsByCampaign.slice(0, 10).map((item) => (
              <Typography key={`camp-${item.id}`} variant="body2">
                {item.Campaign?.name || '-'} | {item.phoneNumber} | {item.result}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('reports.uraLogs')}</Typography>
          <Stack spacing={0.5}>
            {reportUraLogs.slice(0, 10).map((item) => (
              <Typography key={`ura-${item.id}`} variant="body2">
                {item.phoneNumber} | op: {item.selectedOption || '-'} | áudio: {item.audioPath || '-'}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('reports.recordings')}</Typography>
          <Stack spacing={0.5}>
            {reportRecordings.slice(0, 10).map((item) => (
              <Typography key={`rec-${item.id}`} variant="body2">
                {item.Extension?.number || '-'} | {item.filePath} | {item.durationSeconds}s
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default Relatorios;
