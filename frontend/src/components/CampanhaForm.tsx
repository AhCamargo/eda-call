import { useEffect, useState, FC, FormEvent } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { CreateCampaignPayload } from "../types";

interface CampanhaFormProps {
  onSubmit: (data: CreateCampaignPayload) => Promise<void>;
  initialValues?: CreateCampaignPayload | null;
  submitLabel?: string;
  onCancel?: () => void;
}

interface FormData {
  name: string;
  intervalSeconds: number | string;
}

const CampanhaForm: FC<CampanhaFormProps> = ({
  onSubmit,
  initialValues = null,
  submitLabel = null,
  onCancel = null,
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormData>({
    name: initialValues?.name || "",
    intervalSeconds: initialValues?.intervalSeconds ?? 15,
  });

  useEffect(() => {
    setForm({
      name: initialValues?.name || "",
      intervalSeconds: initialValues?.intervalSeconds ?? 15,
    });
  }, [initialValues]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await onSubmit({ ...form, intervalSeconds: Number(form.intervalSeconds) });
    if (!initialValues) {
      setForm({ name: "", intervalSeconds: 15 });
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ mb: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          label={t("campaigns.title")}
          value={form.name}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, name: e.target.value }))
          }
          required
          fullWidth
        />
        <TextField
          type="number"
          label="Intervalo (s)"
          min="1"
          value={form.intervalSeconds}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, intervalSeconds: e.target.value }))
          }
          required
        />
        <Button type="submit" variant="contained">
          {submitLabel || t("campaigns.createCampaign")}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outlined"
            color="inherit"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default CampanhaForm;
