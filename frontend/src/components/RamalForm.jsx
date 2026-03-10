import { useState } from 'react';
import { Box, Button, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

function RamalForm({ onCreate }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ number: '', name: '' });

  const submit = async (event) => {
    event.preventDefault();
    await onCreate(form);
    setForm({ number: '', name: '' });
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          label={t('extensions.numberPlaceholder')}
        value={form.number}
        onChange={(e) => setForm((prev) => ({ ...prev, number: e.target.value }))}
        required
        fullWidth
      />
        <TextField
          label={t('extensions.name')}
        value={form.name}
        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        required
        fullWidth
      />
        <Button type="submit" variant="contained">
          {t('extensions.create')}
        </Button>
      </Stack>
    </Box>
  );
}

export default RamalForm;
