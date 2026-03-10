import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { useMemo } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { usePbx } from '../context/PbxContext';

function Dashboard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { statusCounts, reports, extensions, campaigns } = usePbx();

  const totalExtensions = useMemo(() => extensions.length, [extensions]);
  const activeCalls = statusCounts.in_call || 0;
  const ringingCalls = statusCounts.ringing || 0;
  const availableAgents = statusCounts.online || 0;

  const ongoingCallAgents = useMemo(
    () => extensions.filter((ext) => ext.status === 'in_call' || ext.status === 'ringing').slice(0, 6),
    [extensions]
  );

  const startingCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'in_progress' || campaign.status === 'pending').slice(0, 5),
    [campaigns]
  );

  const breakAgents = useMemo(() => extensions.filter((ext) => ext.status === 'paused' || ext.status === 'offline').slice(0, 6), [extensions]);
  const allExtensions = useMemo(() => [...extensions].sort((a, b) => String(a.number).localeCompare(String(b.number))), [extensions]);

  const totalRelevantCalls = (reports.quemAtendeu || 0) + (reports.numeroNaoExiste || 0);

  const statItems = [
    { label: t('dashboard.activeExtensions'), value: availableAgents },
    { label: t('dashboard.inCall'), value: activeCalls },
    { label: t('dashboard.ringing'), value: ringingCalls },
    { label: t('dashboard.totalExtensions'), value: totalExtensions }
  ];

  const activitySeries = [
    Math.max(20, availableAgents * 8),
    Math.max(10, activeCalls * 18),
    Math.max(10, ringingCalls * 14),
    Math.max(12, statusCounts.paused * 10),
    Math.max(10, statusCounts.offline * 8),
    Math.max(15, statusCounts.in_campaign * 12)
  ];

  const callsReceived = totalRelevantCalls + activeCalls + ringingCalls;
  const answeredCalls = reports.quemAtendeu || 0;
  const abandonedCalls = reports.numeroNaoExiste || 0;
  const routedCalls = Math.max(0, callsReceived - answeredCalls - abandonedCalls);
  const serviceLevel = callsReceived ? Math.round((answeredCalls / callsReceived) * 100) : 0;
  const callsInQueue = ringingCalls;
  const oldestInQueueSeconds = Math.max(0, callsInQueue * 14);
  const oldestMinutes = String(Math.floor(oldestInQueueSeconds / 60)).padStart(2, '0');
  const oldestSeconds = String(oldestInQueueSeconds % 60).padStart(2, '0');
  const abandonRate = callsReceived ? Math.round((abandonedCalls / callsReceived) * 100) : 0;

  const now = new Date();
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const agentStateItems = [
    { label: t('dashboard.notReady'), value: statusCounts.paused || 0, color: 'error.main' },
    { label: t('dashboard.talking'), value: activeCalls, color: 'warning.main' },
    { label: t('dashboard.ready'), value: availableAgents, color: 'success.main' }
  ];

  const topAgents = [...extensions]
    .sort((a, b) => {
      const score = (ext) => {
        if (ext.status === 'in_call') return 4;
        if (ext.status === 'ringing') return 3;
        if (ext.status === 'online') return 2;
        if (ext.status === 'paused') return 1;
        return 0;
      };
      return score(b) - score(a);
    })
    .slice(0, 5)
    .map((ext, index) => ({
      id: ext.id,
      label: ext.name,
      score: Math.max(5, 50 - index * 8 + (ext.status === 'in_call' ? 15 : 0))
    }));

  const getStatusColor = (status) => {
    if (status === 'in_call') return 'success';
    if (status === 'ringing') return 'warning';
    if (status === 'online') return 'primary';
    return 'default';
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('dashboard.title')}</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">{t('dashboard.stats')}</Typography>

                <Grid container spacing={1.5}>
                  {statItems.map((item) => (
                    <Grid key={item.label} item xs={12} sm={6} md={3}>
                      <Card variant="outlined">
                        <CardContent sx={{ py: 1.5 }}>
                          <Typography variant="body2" color="text.secondary">
                            {item.label}
                          </Typography>
                          <Typography variant="h5">{item.value}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                <Card variant="outlined">
                  <CardContent
                    sx={{
                      width: { lg: 'calc(100% + 200px)' },
                      maxWidth: 'none',
                      bgcolor: 'primary.dark',
                      color: 'common.white',
                      borderRadius: 1,
                      backgroundImage: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${alpha(theme.palette.secondary.dark, 0.9)})`
                    }}
                  >
                    <Typography variant="subtitle1" sx={{ mb: 2, color: alpha(theme.palette.common.white, 0.9) }}>
                      {t('dashboard.callActivity')}
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="overline" sx={{ color: alpha(theme.palette.common.white, 0.8) }}>
                          {t('dashboard.callReceived')}
                        </Typography>
                        <Typography variant="h3">{callsReceived}</Typography>
                        <Typography sx={{ color: 'success.light' }}>{t('dashboard.answered')}: {answeredCalls}</Typography>
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="overline" sx={{ color: alpha(theme.palette.common.white, 0.8) }}>
                          {t('dashboard.serviceLevel')}
                        </Typography>
                        <Typography variant="h3">{serviceLevel}%</Typography>
                        <LinearProgress
                          variant="determinate"
                          value={serviceLevel}
                          sx={{ mt: 1, height: 8, borderRadius: 99, bgcolor: alpha(theme.palette.common.white, 0.2) }}
                        />
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="overline" sx={{ color: alpha(theme.palette.common.white, 0.8) }}>
                          {t('dashboard.timeDate')}
                        </Typography>
                        <Typography variant="h3">{timeLabel}</Typography>
                        <Typography sx={{ textTransform: 'capitalize' }}>{dateLabel}</Typography>
                      </Grid>

                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="overline" sx={{ color: alpha(theme.palette.common.white, 0.8) }}>
                          {t('dashboard.queue')}
                        </Typography>
                        <Typography variant="h3">{callsInQueue}</Typography>
                        <Typography sx={{ color: 'warning.light' }}>{t('dashboard.oldest')}: {oldestMinutes}:{oldestSeconds}</Typography>
                      </Grid>
                    </Grid>

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={3}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('dashboard.incomingDistribution')}</Typography>
                        <Stack spacing={1}>
                          {[{ label: t('dashboard.answered'), value: answeredCalls, color: 'success.main' }, { label: t('dashboard.abandoned'), value: abandonedCalls, color: 'error.main' }, { label: t('dashboard.routed'), value: routedCalls, color: 'info.main' }].map((item) => (
                            <Box key={item.label}>
                              <Stack direction="row" justifyContent="space-between">
                                <Typography variant="body2">{item.label}</Typography>
                                <Typography variant="body2">{item.value}</Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={callsReceived ? Math.min(100, (item.value / callsReceived) * 100) : 0}
                                sx={{
                                  mt: 0.5,
                                  height: 8,
                                  borderRadius: 99,
                                  bgcolor: alpha(theme.palette.common.white, 0.2),
                                  '& .MuiLinearProgress-bar': { bgcolor: item.color }
                                }}
                              />
                            </Box>
                          ))}
                        </Stack>
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('dashboard.agentStates')}</Typography>
                        <Stack spacing={1}>
                          {agentStateItems.map((item) => (
                            <Stack key={item.label} direction="row" spacing={1} alignItems="center">
                              <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: item.color }} />
                              <Typography variant="body2" sx={{ minWidth: 80 }}>{item.label}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.value}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('dashboard.topAgents')}</Typography>
                        <Stack spacing={1}>
                          {topAgents.length ? (
                            topAgents.map((agent) => (
                              <Stack key={agent.id} direction="row" spacing={1} alignItems="center">
                                <Box sx={{ width: `${Math.min(100, agent.score)}%`, maxWidth: 130, height: 10, bgcolor: 'success.light', borderRadius: 99 }} />
                                <Typography variant="body2" sx={{ minWidth: 24 }}>{agent.score}</Typography>
                                <Typography variant="body2" noWrap>{agent.label}</Typography>
                              </Stack>
                            ))
                          ) : (
                            <Typography variant="body2" sx={{ color: alpha(theme.palette.common.white, 0.75) }}>
                              {t('dashboard.noActiveAgents')}
                            </Typography>
                          )}
                        </Stack>
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('dashboard.abandonRate')}</Typography>
                        <Box
                          sx={{
                            width: 130,
                            height: 130,
                            borderRadius: '50%',
                            display: 'grid',
                            placeItems: 'center',
                            background: `conic-gradient(${theme.palette.error.main} ${abandonRate * 3.6}deg, ${alpha(theme.palette.common.white, 0.25)} 0deg)`
                          }}
                        >
                          <Box
                            sx={{
                              width: 96,
                              height: 96,
                              borderRadius: '50%',
                              display: 'grid',
                              placeItems: 'center',
                              bgcolor: alpha(theme.palette.primary.dark, 0.95)
                            }}
                          >
                            <Typography variant="h5">{abandonRate}%</Typography>
                          </Box>
                        </Box>
                      </Grid>
                    </Grid>

                    <Stack spacing={1.2} sx={{ mt: 2 }}>
                      {activitySeries.map((value, index) => (
                        <LinearProgress
                          key={`activity-${index}`}
                          variant="determinate"
                          value={Math.min(100, value)}
                          sx={{
                            height: 6,
                            borderRadius: 999,
                            bgcolor: alpha(theme.palette.common.white, 0.2),
                            '& .MuiLinearProgress-bar': { bgcolor: alpha(theme.palette.success.light, 0.9) }
                          }}
                        />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1.5 }}>
                      {t('dashboard.ongoing')}
                    </Typography>
                    <Grid container spacing={1.2}>
                      {ongoingCallAgents.length ? (
                        ongoingCallAgents.map((ext) => (
                          <Grid key={ext.id} item xs={12} sm={6} md={4}>
                            <Card variant="outlined">
                              <CardContent sx={{ py: 1.2 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Avatar>{String(ext.name || ext.number).slice(0, 1).toUpperCase()}</Avatar>
                                  <Stack>
                                    <Typography variant="subtitle2">{ext.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {ext.number}
                                    </Typography>
                                  </Stack>
                                </Stack>
                                <Chip
                                  size="small"
                                  label={ext.status}
                                  sx={{ mt: 1 }}
                                  color={ext.status === 'in_call' ? 'success' : 'warning'}
                                />
                              </CardContent>
                            </Card>
                          </Grid>
                        ))
                      ) : (
                        <Grid item xs={12}>
                          <Typography color="text.secondary">{t('dashboard.noOngoing')}</Typography>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1.5 }}>
                      {t('dashboard.registeredExtensions')}
                    </Typography>
                    <Stack spacing={1}>
                      {allExtensions.length ? (
                        allExtensions.map((ext) => (
                          <Stack key={ext.id} direction="row" justifyContent="space-between" alignItems="center">
                            <Typography>
                              {ext.number} - {ext.name}
                            </Typography>
                            <Chip size="small" label={ext.status} color={getStatusColor(ext.status)} />
                          </Stack>
                        ))
                      ) : (
                        <Typography color="text.secondary">{t('dashboard.noExtensions')}</Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {t('dashboard.startingCalls')}
                </Typography>
                <Stack spacing={1}>
                  {startingCampaigns.length ? (
                    startingCampaigns.map((campaign) => (
                      <Stack key={campaign.id} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography>{campaign.name}</Typography>
                        <Chip size="small" label={campaign.status} color={campaign.status === 'in_progress' ? 'primary' : 'default'} />
                      </Stack>
                    ))
                  ) : (
                    <Typography color="text.secondary">{t('dashboard.noCampaigns')}</Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {t('dashboard.break')}
                </Typography>
                <Stack spacing={1}>
                  {breakAgents.length ? (
                    breakAgents.map((ext) => (
                      <Stack key={ext.id} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography>{ext.name}</Typography>
                        <Chip size="small" label={ext.status} />
                      </Stack>
                    ))
                  ) : (
                    <Typography color="text.secondary">{t('dashboard.noBreak')}</Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6">{t('dashboard.metrics')}</Typography>
                <Divider sx={{ my: 1 }} />
                <Typography>{t('dashboard.whoAnswered')}: {reports.quemAtendeu}</Typography>
                <Typography>{t('dashboard.numberNotExists')}: {reports.numeroNaoExiste}</Typography>
                <Typography sx={{ mt: 1 }} color="text.secondary">
                  {t('dashboard.totalProcessed')}: {totalRelevantCalls}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}

export default Dashboard;
