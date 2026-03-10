"use client";

import { useState } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from './api';
import Layout from './Layout';
import Dashboard from './views/Dashboard';
import Ramais from './views/Ramais';
import Campanhas from './views/Campanhas';
import UraReversa from './views/UraReversa';
import UraReversaRelatorios from './views/UraReversaRelatorios';
import LinhasVoip from './views/LinhasVoip';
import Relatorios from './views/Relatorios';
import Usuario from './views/Usuario';
import { PbxProvider } from './context/PbxContext';
import './i18n';
import './styles.css';

const theme = createTheme({
  palette: {
    mode: 'light'
  }
});

function App() {
  const { t } = useTranslation();
  const [token, setAuthToken] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''
  );
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '123456' });

  const handleLogin = async (event) => {
    event.preventDefault();
    const response = await api.post('/auth/login', loginForm);
    localStorage.setItem('token', response.data.token);
    setAuthToken(response.data.token);
  };

  if (!token) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Paper sx={{ width: '100%', maxWidth: 420, p: 3 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>
            {t('login.title')}
          </Typography>
          <Box component="form" onSubmit={handleLogin}>
            <Stack spacing={2}>
              <TextField
                label={t('login.username')}
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                fullWidth
              />
              <TextField
                type="password"
                label={t('login.password')}
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                fullWidth
              />
              <Button type="submit" variant="contained">
                {t('login.enter')}
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PbxProvider
        token={token}
        onUnauthorized={() => {
          localStorage.removeItem('token');
          setAuthToken('');
        }}
      >
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/ramais" element={<Ramais />} />
              <Route path="/campanhas" element={<Navigate to="/campanhas/discador" replace />} />
              <Route path="/campanhas/discador" element={<Campanhas />} />
              <Route path="/campanhas/ura-reversa" element={<UraReversa />} />
              <Route path="/campanhas/ura-reversa/relatorios" element={<UraReversaRelatorios />} />
              <Route path="/linhas-voip" element={<LinhasVoip />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/usuario" element={<Usuario />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PbxProvider>
    </ThemeProvider>
  );
}

export default App;
