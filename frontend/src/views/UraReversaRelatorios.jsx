import { useEffect, useState } from 'react';
import { Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import api from '../api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function UraReversaRelatorios() {
  const [items, setItems] = useState([]);

  const resolveRecordingUrl = (recordingPath) => {
    if (!recordingPath) return null;
    if (/^https?:\/\//i.test(recordingPath)) return recordingPath;
    return `${API_URL}${recordingPath.startsWith('/') ? recordingPath : `/${recordingPath}`}`;
  };

  const fetchData = async () => {
    const response = await api.get('/reports/ura-reverse');
    setItems(response.data || []);
  };

  useEffect(() => {
    fetchData().catch(() => {});
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Relatórios URA Reversa</Typography>

      <Card>
        <CardContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Campanha</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Linha VoIP</TableCell>
                <TableCell>Chamando</TableCell>
                <TableCell>Atendidos</TableCell>
                <TableCell>Não atendeu</TableCell>
                <TableCell>Inválido</TableCell>
                <TableCell>Ocupado</TableCell>
                <TableCell>Áudios</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>{item.VoipLine?.name || '-'}</TableCell>
                  <TableCell>{item.stats?.calling || 0}</TableCell>
                  <TableCell>{item.stats?.answered || 0}</TableCell>
                  <TableCell>{item.stats?.no_answer || 0}</TableCell>
                  <TableCell>{item.stats?.invalid || 0}</TableCell>
                  <TableCell>{item.stats?.busy || 0}</TableCell>
                  <TableCell>
                    {(item.contacts || []).some((contact) => contact.recordingPath) ? (
                      <Stack spacing={0.5}>
                        {(item.contacts || [])
                          .filter((contact) => contact.recordingPath)
                          .slice(0, 5)
                          .map((contact) => {
                            const audioUrl = resolveRecordingUrl(contact.recordingPath);
                            return (
                              <a key={contact.id} href={audioUrl} download>
                                {contact.phoneNumber}
                              </a>
                            );
                          })}
                      </Stack>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default UraReversaRelatorios;
