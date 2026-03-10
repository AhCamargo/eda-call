import { useEffect, useState } from 'react';
import { Box, Button, Grid, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

const initialState = {
  name: '',
  username: '',
  secret: '',
  host: '',
  port: 5060,
  context: 'default',
  transport: 'transport-udp'
};

function VoipForm({ onSubmit, initialValues = null, submitLabel = null, onCancel = null }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initialValues || initialState);

  useEffect(() => {
    setForm(initialValues || initialState);
  }, [initialValues]);

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit({ ...form, port: Number(form.port) });
    if (!initialValues) {
      setForm(initialState);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ mb: 2 }}>
      <Grid container spacing={1}>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.lineName')}
        value={form.name}
        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.username')}
        value={form.username}
        onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.password')}
        value={form.secret}
        onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.host')}
        value={form.host}
        onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
        type="number"
        label={t('voip.port')}
        value={form.port}
        onChange={(e) => setForm((prev) => ({ ...prev, port: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.context')}
        value={form.context}
        onChange={(e) => setForm((prev) => ({ ...prev, context: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <TextField
            label={t('voip.transport')}
        value={form.transport}
        onChange={(e) => setForm((prev) => ({ ...prev, transport: e.target.value }))}
        required
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={3}>
          <Button type="submit" variant="contained" fullWidth sx={{ height: '100%' }}>
            {submitLabel || t('voip.registerLine')}
          </Button>
          {onCancel && (
            <Button type="button" variant="outlined" color="inherit" fullWidth onClick={onCancel} sx={{ mt: 1 }}>
              {t('common.cancel')}
            </Button>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

export default VoipForm;
