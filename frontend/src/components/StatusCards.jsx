import { Card, CardContent, Grid, Typography } from '@mui/material';

const statuses = ['online', 'offline', 'paused', 'ringing', 'in_call', 'in_campaign'];

function StatusCards({ statusCounts }) {
  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      {statuses.map((key) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                {key}
              </Typography>
              <Typography variant="h5">{statusCounts[key] || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export default StatusCards;
