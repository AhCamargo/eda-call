import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import CampanhaForm from '../components/CampanhaForm';
import { usePbx } from '../context/PbxContext';

function Campanhas() {
  const { t } = useTranslation();
  const {
    campaigns,
    extensions,
    voipLines,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    assignExtensions,
    assignVoipLines,
    uploadPhones,
    startCampaign
  } = usePbx();

  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedExtensions, setSelectedExtensions] = useState([]);
  const [selectedVoipLines, setSelectedVoipLines] = useState([]);
  const [file, setFile] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);

  const handleSubmitCampaign = async (payload) => {
    if (editingCampaign) {
      await updateCampaign(editingCampaign.id, payload);
      setEditingCampaign(null);
      return;
    }

    await createCampaign(payload);
  };

  const handleDeleteCampaign = async (campaign) => {
    if (!window.confirm(t('campaigns.confirmDelete', { name: campaign.name }))) {
      return;
    }

    await deleteCampaign(campaign.id);
    if (editingCampaign?.id === campaign.id) {
      setEditingCampaign(null);
    }
    if (String(campaign.id) === selectedCampaignId) {
      setSelectedCampaignId('');
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('campaigns.title')}</Typography>
      <Card>
        <CardContent>
      <CampanhaForm
        onSubmit={handleSubmitCampaign}
        initialValues={editingCampaign}
        submitLabel={editingCampaign ? t('campaigns.saveCampaign') : t('campaigns.createCampaign')}
        onCancel={editingCampaign ? () => setEditingCampaign(null) : null}
      />

      <Stack spacing={1}>
        <FormControl fullWidth>
          <InputLabel>{t('campaigns.selectCampaign')}</InputLabel>
          <Select
            label={t('campaigns.selectCampaign')}
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
          >
            {campaigns.map((campaign) => (
              <MenuItem value={String(campaign.id)} key={campaign.id}>
                {campaign.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth>
          <InputLabel>{t('campaigns.addExtensions')}</InputLabel>
          <Select
            multiple
            label={t('campaigns.addExtensions')}
            value={selectedExtensions.map(String)}
            onChange={(e) => setSelectedExtensions(e.target.value.map(Number))}
            renderValue={(selected) => selected.join(', ')}
          >
            {extensions.map((extension) => (
              <MenuItem key={extension.id} value={String(extension.id)}>
                <ListItemText primary={`${extension.number} - ${extension.name}`} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          type="button"
          variant="outlined"
          onClick={() => selectedCampaignId && assignExtensions(selectedCampaignId, selectedExtensions)}
        >
          {t('campaigns.addExtensions')}
        </Button>

        <FormControl fullWidth>
          <InputLabel>{t('campaigns.addVoipLines')}</InputLabel>
          <Select
            multiple
            label={t('campaigns.addVoipLines')}
            value={selectedVoipLines.map(String)}
            onChange={(e) => setSelectedVoipLines(e.target.value.map(Number))}
            renderValue={(selected) => selected.join(', ')}
          >
            {voipLines.map((line) => (
              <MenuItem key={line.id} value={String(line.id)}>
                <ListItemText primary={`${line.name} - ${line.host}:${line.port}`} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          type="button"
          variant="outlined"
          onClick={() => selectedCampaignId && assignVoipLines(selectedCampaignId, selectedVoipLines)}
        >
          {t('campaigns.addVoipLines')}
        </Button>

        <TextField
          type="file"
          inputProps={{ accept: '.csv' }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          fullWidth
        />
        <Button
          type="button"
          variant="contained"
          onClick={() => selectedCampaignId && file && uploadPhones(selectedCampaignId, file)}
        >
          {t('campaigns.uploadPhones')}
        </Button>

      <Stack spacing={1}>
        {campaigns.map((campaign) => (
          <Stack key={campaign.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center">
            <Typography sx={{ flex: 1 }}>
              {campaign.name} - {campaign.status} - contatos: {campaign.contacts?.length || 0}
              {' | linhas: '}
              {(campaign.voipLines || []).map((line) => line.name).join(', ') || t('campaigns.noLine')}
            </Typography>
            <Button type="button" variant="contained" onClick={() => startCampaign(campaign.id)}>
              {t('campaigns.start')}
            </Button>
            <Button type="button" variant="outlined" onClick={() => setEditingCampaign(campaign)}>
              {t('common.edit')}
            </Button>
            <Button type="button" variant="outlined" color="error" onClick={() => handleDeleteCampaign(campaign)}>
              {t('common.delete')}
            </Button>
          </Stack>
        ))}
      </Stack>
      </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default Campanhas;
