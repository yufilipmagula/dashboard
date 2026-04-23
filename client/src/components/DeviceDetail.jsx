import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  ProgressBar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@yunex/yds-react';

function riskColor(r) {
  if (r >= 50) return '#ef4444';
  if (r >= 35) return '#f97316';
  if (r >= 15) return '#eab308';
  return '#22c55e';
}

function ScoreBreakdown({ scores }) {
  const items = [
    { key: 'stateScore',    label: 'State',       max: 25 },
    { key: 'cpuScore',      label: 'CPU growth',  max: 25 },
    { key: 'diskScore',     label: 'Disk',        max: 20 },
    { key: 'freshnessScore',label: 'Freshness',   max: 15 },
    { key: 'emmcScore',     label: 'eMMC wear',   max: 20 },
    { key: 'uptimeScore',   label: 'Uptime (7d)', max: 15 },
  ];
  return (
    <Stack spacing={1.25}>
      {items.map(i => {
        const v = scores?.[i.key] ?? 0;
        const pct = Math.round(v / i.max * 100);
        return (
          <Box key={i.key}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" noWrap>{i.label}</Typography>
              <Typography variant="caption" sx={{ color: riskColor(pct), fontWeight: 700, whiteSpace: 'nowrap', ml: 1 }}>
                {v} / {i.max}
              </Typography>
            </Stack>
            <ProgressBar
              color={pct >= 60 ? 'error' : pct >= 35 ? 'warning' : 'primary'}
              variant="determinate"
              value={pct}
              size="small"
            />
          </Box>
        );
      })}
    </Stack>
  );
}

function fmtAge(secs) {
  if (!secs) return '—';
  if (secs < 3600) return `${Math.round(secs / 60)} minutes ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} hours ago`;
  return `${Math.round(secs / 86400)} days ago`;
}

function DetailTable({ rows }) {
  return (
    <TableContainer sx={{ mt: 1, overflowX: 'hidden' }}>
      <Table sx={{ tableLayout: 'fixed', width: '100%' }}>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell
                sx={{
                  width: '46%',
                  py: 1,
                  px: 0,
                  pr: 2,
                  verticalAlign: 'top',
                  color: 'text.secondary',
                  fontSize: theme => theme.typography.caption.fontSize,
                }}
              >
                {label}
              </TableCell>
              <TableCell
                sx={{
                  py: 1,
                  px: 0,
                  minWidth: 0,
                  fontWeight: 600,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              >
                {value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function DeviceDetail({ device: d, onClose }) {
  if (!d) return null;
  const signals = d.signals ?? {};
  const signalRows = [
    ['CPU max (7d)', signals.cpuMax7d != null ? signals.cpuMax7d.toFixed(2) : '—'],
    ['CPU max (prior 7d)', signals.cpuMax14d != null ? signals.cpuMax14d.toFixed(2) : '—'],
    ['CPU growth ratio', signals.cpuGrowthX != null ? `${signals.cpuGrowthX.toFixed(2)}×` : '—'],
    ['eMMC wear bucket', signals.emmcWearBucket != null ? `0x${signals.emmcWearBucket.toString(16).toUpperCase()}` : '—'],
    ['eMMC EOL info', signals.emmcEolInfo != null ? signals.emmcEolInfo : '—'],
    ['eMMC lifetime A', signals.emmcLifetimeA != null ? signals.emmcLifetimeA : '—'],
    ['eMMC lifetime B', signals.emmcLifetimeB != null ? signals.emmcLifetimeB : '—'],
    ['Disk free (GB)', signals.diskFreeGb != null ? signals.diskFreeGb.toFixed(2) : '—'],
    ['Uptime ratio (7d)', signals.uptimeRatio7d != null ? `${(signals.uptimeRatio7d * 100).toFixed(1)}%` : '—'],
    ['Uptime hours', signals.uptimeHours != null ? `${signals.uptimeHours}h` : '—'],
    ['Restarts (24h)', signals.restarts24h ?? '—'],
    ['Last seen', fmtAge(signals.lastSeenAgo)],
  ];
  const identityRows = [
    ['Site', d.site || '—'],
    ['Policy', d.policyId || '—'],
    ['Thing ID', d.thingId || '—'],
  ];

  return (
    <Box sx={{
      pt: 2, px: 2, pb: 2, minWidth: 0, width: '100%', boxSizing: 'border-box', overflow: 'hidden',
      '& .MuiCard-root': { maxWidth: '100%', boxSizing: 'border-box' },
    }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', minWidth: 0 }}>{d.id}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip rounded label={d.stateLabel} size="small" sx={{ color: d.stateColor }} />
            <Chip rounded label={`Risk ${d.risk}`} size="small" sx={{ color: riskColor(d.risk) }} />
          </Stack>
        </Box>
        <Button color="tertiary" onClick={onClose}>Close</Button>
      </Stack>

      {d.reasons?.length > 0 && (
        <Card sx={{ mb: 2, maxWidth: '100%', overflow: 'hidden' }}>
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Why flagged
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
          {d.reasons.map((r, i) => (
              <Card key={i} variant="outlined">
                <CardContent sx={{ py: 1.2, '&:last-child': { pb: 1.2 } }}>
                  <Typography variant="body2">{r}</Typography>
                </CardContent>
              </Card>
          ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 2, maxWidth: '100%', overflow: 'hidden' }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            Risk breakdown
          </Typography>
          <Box sx={{ mt: 1 }}>
            <ScoreBreakdown scores={d.scores} />
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2, maxWidth: '100%', overflow: 'hidden' }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            Signals
          </Typography>
          <DetailTable rows={signalRows} />
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: '100%', overflow: 'hidden' }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            Identity
          </Typography>
          <DetailTable rows={identityRows} />
        </CardContent>
      </Card>
    </Box>
  );
}
