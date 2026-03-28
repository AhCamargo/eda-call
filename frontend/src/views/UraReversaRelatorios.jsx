import { useEffect, useState } from 'react';
import api from '../api';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Download, BarChart2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const statusVariant = (s) => {
  if (s === 'running') return 'default';
  if (s === 'paused') return 'secondary';
  if (s === 'finished') return 'outline';
  return 'outline';
};

const resolveRecordingUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export default function UraReversaRelatorios() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get('/reports/ura-reverse').then((res) => setItems(res.data || [])).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 className="h-5 w-5" />
        <h1 className="text-2xl font-semibold">Relatórios URA Reversa</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campanhas e resultados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linha VoIP</TableHead>
                <TableHead className="text-center">Chamando</TableHead>
                <TableHead className="text-center">Atendidos</TableHead>
                <TableHead className="text-center">Não atendeu</TableHead>
                <TableHead className="text-center">Inválido</TableHead>
                <TableHead className="text-center">Ocupado</TableHead>
                <TableHead>Gravações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhum dado de relatório disponível.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const recordingContacts = (item.contacts || []).filter((c) => c.recordingPath);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(item.status)}>{item.status || '—'}</Badge>
                      </TableCell>
                      <TableCell>{item.VoipLine?.name || '—'}</TableCell>
                      <TableCell className="text-center">{item.stats?.calling || 0}</TableCell>
                      <TableCell className="text-center">{item.stats?.answered || 0}</TableCell>
                      <TableCell className="text-center">{item.stats?.no_answer || 0}</TableCell>
                      <TableCell className="text-center">{item.stats?.invalid || 0}</TableCell>
                      <TableCell className="text-center">{item.stats?.busy || 0}</TableCell>
                      <TableCell>
                        {recordingContacts.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {recordingContacts.slice(0, 5).map((contact) => {
                              const url = resolveRecordingUrl(contact.recordingPath);
                              return (
                                <Button key={contact.id} size="sm" variant="outline" asChild className="h-7 text-xs">
                                  <a href={url} download>
                                    <Download className="mr-1 h-3 w-3" />
                                    {contact.phoneNumber}
                                  </a>
                                </Button>
                              );
                            })}
                            {recordingContacts.length > 5 && (
                              <span className="text-xs text-muted-foreground">
                                +{recordingContacts.length - 5} mais
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
