import { useState } from 'react';
import { Box, Button, Stack, TextField, FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { usePbx } from '../context/PbxContext';
import { useTranslation } from 'react-i18next';

function RamalForm({ onCreate }) {
  const { t } = useTranslation();
  const { voipLines } = usePbx();
  const [form, setForm] = useState({ number: '', name: '', sipPassword: '', voipLineId: '' });

  const submit = async (event) => {
    event.preventDefault();
    await onCreate(form);
    setForm({ number: '', name: '', sipPassword: '', voipLineId: '' });
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
        <TextField
          label={t('extensions.sipPassword')}
          value={form.sipPassword}
          onChange={(e) => setForm((prev) => ({ ...prev, sipPassword: e.target.value }))}
          placeholder={t('extensions.sipPasswordPlaceholder')}
          helperText={t('extensions.sipPasswordHelper')}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Linha VoIP</InputLabel>
          <Select
            label="Linha VoIP"
            value={form.voipLineId}
            onChange={(e) => setForm((prev) => ({ ...prev, voipLineId: e.target.value }))}
          >
            <MenuItem value="">-- Nenhuma --</MenuItem>
            {voipLines.map((line) => (
              <MenuItem key={line.id} value={String(line.id)}>
                {line.name} - {line.host}:{line.port}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button type="submit" variant="contained" color="primary">
          {t('extensions.create')}
        </Button>
      </Stack>
    </Box>
  );
}

export default RamalForm;
