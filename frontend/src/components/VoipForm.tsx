import { useEffect, useState, FC, FormEvent } from "react";
import { Box, Button, FormControlLabel, Grid, Switch, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { CreateVoipLinePayload } from "../types";

interface VoipFormProps {
  onSubmit: (data: CreateVoipLinePayload) => Promise<void>;
  initialValues?: CreateVoipLinePayload | null;
  submitLabel?: string;
  onCancel?: () => void;
}

interface FormData {
  name: string;
  username: string;
  secret: string;
  host: string;
  port: number | string;
  context: string;
  transport: string;
  register: boolean;
}

const initialState: FormData = {
  name: "",
  username: "",
  secret: "",
  host: "",
  port: 5060,
  context: "default",
  transport: "transport-udp",
  register: false,
};

const VoipForm: FC<VoipFormProps> = ({
  onSubmit,
  initialValues = null,
  submitLabel = null,
  onCancel = null,
}) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormData>(
    initialValues
      ? { ...initialState, ...initialValues, register: initialValues.register ?? false }
      : initialState,
  );

  useEffect(() => {
    if (initialValues) {
      setForm({ ...initialState, ...initialValues, register: initialValues.register ?? false });
    } else {
      setForm(initialState);
    }
  }, [initialValues]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await onSubmit({ ...form, port: Number(form.port) });
    if (!initialValues) {
      setForm(initialState);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ mb: 2 }}>
      <Grid container spacing={1}>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.lineName")}
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.username")}
            value={form.username}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, username: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.password")}
            value={form.secret}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, secret: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.host")}
            value={form.host}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, host: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            type="number"
            label={t("voip.port")}
            value={form.port}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, port: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.context")}
            value={form.context}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, context: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            label={t("voip.transport")}
            value={form.transport}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, transport: e.target.value }))
            }
            required
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.register}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, register: e.target.checked }))
                }
              />
            }
            label={t("voip.registerWithProvider")}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{ height: "100%" }}
          >
            {submitLabel || t("voip.registerLine")}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              fullWidth
              onClick={onCancel}
              sx={{ mt: 1 }}
            >
              {t("common.cancel")}
            </Button>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default VoipForm;
