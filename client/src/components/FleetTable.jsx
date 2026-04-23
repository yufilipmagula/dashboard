import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Chip,
  MenuItem,
  ProgressBar,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@yunex/yds-react';

function riskColor(r) {
  if (r >= 50) return '#ef4444';
  if (r >= 35) return '#f97316';
  if (r >= 15) return '#eab308';
  return '#22c55e';
}

function RiskBar({ value }) {
  const barValue = Math.min((value / 60) * 100, 100);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <ProgressBar
        color={value >= 50 ? 'error' : value >= 35 ? 'warning' : 'primary'}
        variant="determinate"
        value={barValue}
        sx={{ minWidth: 72 }}
      />
      <Typography variant="caption" sx={{ minWidth: 28, textAlign: 'right', color: riskColor(value), fontWeight: 700 }}>
        {value}
      </Typography>
    </Stack>
  );
}

function StateChip({ label, color }) {
  return (
    <Chip
      rounded
      label={label}
      sx={{
        bgcolor: color,
        color: contrastTextColor(color),
        border: 'none',
      }}
      size="small"
    />
  );
}

function contrastTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 150 ? '#111827' : '#ffffff';
}

const COLS = [
  { key: 'id',           label: 'Device' },
  { key: 'risk',         label: 'Risk' },
  { key: 'stateLabel',   label: 'State' },
  { key: 'site',         label: 'Site' },
  { key: 'cpuMax7d',     label: 'CPU max 7d' },
  { key: 'cpuGrowthX',   label: 'CPU growth' },
  { key: 'emmcWearBucket', label: 'eMMC wear' },
  { key: 'diskFreeGb',   label: 'Disk GB' },
  { key: 'uptimeRatio7d', label: 'Uptime 7d' },
  { key: 'lastSeenAgo',  label: 'Last seen' },
];

function fmtAge(secs) {
  if (!secs) return '—';
  if (secs < 3600)     return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400)    return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export default function FleetTable({ fleet, loading, filter, onFilterChange, selectedId, onSelect }) {
  const [sort, setSort] = useState({ key: 'risk', dir: -1 });
  const numericKeys = ['cpuMax7d', 'cpuGrowthX', 'emmcWearBucket', 'diskFreeGb', 'uptimeRatio7d', 'lastSeenAgo'];

  function toggleSort(key) {
    setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }));
  }

  const sorted = [...fleet].sort((a, b) => {
    const av = numericKeys.includes(sort.key)
      ? (a.signals?.[sort.key] ?? -Infinity)
      : a[sort.key] ?? '';
    const bv = numericKeys.includes(sort.key)
      ? (b.signals?.[sort.key] ?? -Infinity)
      : b[sort.key] ?? '';
    if (av < bv) return -sort.dir;
    if (av > bv) return sort.dir;
    return 0;
  });

  return (
    <Card>
      <CardContent sx={{ pb: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap alignItems="center">
          <Typography variant="caption" color="text.secondary">Filter:</Typography>
          <TextField
            placeholder="Device type or site keyword"
            value={filter.q}
            size="small"
            onChange={e => onFilterChange(prev => ({ ...prev, q: e.target.value }))}
            sx={{ width: 360, maxWidth: '100%' }}
          />
          <Select
            value={filter.state}
            displayEmpty
            size="small"
            sx={{ minWidth: 140 }}
            onChange={e => onFilterChange(prev => ({ ...prev, state: e.target.value }))}
          >
            <MenuItem value="">All states</MenuItem>
            <MenuItem value="0">Error</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
            <MenuItem value="2">Warning</MenuItem>
            <MenuItem value="3">OK</MenuItem>
          </Select>
          <Select
            value={String(filter.minRisk)}
            size="small"
            sx={{ minWidth: 150 }}
            onChange={e => onFilterChange(prev => ({ ...prev, minRisk: Number(e.target.value) }))}
          >
            <MenuItem value="0">Any risk</MenuItem>
            <MenuItem value="35">{'High+ (>=35)'}</MenuItem>
            <MenuItem value="50">{'Critical (>=50)'}</MenuItem>
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {sorted.length} devices
          </Typography>
        </Stack>
      </CardContent>

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              {COLS.map(c => (
                <TableCell
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  sx={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontSize: theme => theme.typography.caption.fontSize,
                  }}
                >
                  {c.label} {sort.key === c.key ? (sort.dir === -1 ? '↓' : '↑') : ''}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={COLS.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Loading fleet data...
                </TableCell>
              </TableRow>
            )}
            {!loading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLS.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No devices match filters
                </TableCell>
              </TableRow>
            )}
            {sorted.map(d => {
              const isSelected = d.id === selectedId;
              return (
                <TableRow
                  key={d.id}
                  hover
                  selected={isSelected}
                  onClick={() => onSelect(d)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.id}</TableCell>
                  <TableCell sx={{ minWidth: 120 }}><RiskBar value={d.risk} /></TableCell>
                  <TableCell><StateChip label={d.stateLabel} color={d.stateColor} /></TableCell>
                  <TableCell sx={{ color: 'text.secondary', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.site}>{d.site ?? '—'}</TableCell>
                  <TableCell sx={{ color: d.signals?.cpuMax7d > 50 ? '#ef4444' : d.signals?.cpuMax7d > 20 ? '#f97316' : 'text.secondary' }}>
                    {d.signals?.cpuMax7d != null ? d.signals.cpuMax7d.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell sx={{ color: d.signals?.cpuGrowthX > 5 ? '#ef4444' : d.signals?.cpuGrowthX > 2 ? '#f97316' : 'text.secondary' }}>
                    {d.signals?.cpuGrowthX != null ? `${d.signals.cpuGrowthX.toFixed(1)}×` : '—'}
                  </TableCell>
                  <TableCell sx={{ color: d.signals?.emmcWearBucket >= 11 ? '#ef4444' : d.signals?.emmcWearBucket >= 9 ? '#f97316' : d.signals?.emmcWearBucket >= 7 ? '#eab308' : 'text.secondary' }}>
                    {d.signals?.emmcWearBucket != null ? `0x${d.signals.emmcWearBucket.toString(16).toUpperCase()}` : '—'}
                  </TableCell>
                  <TableCell sx={{ color: d.signals?.diskFreeGb < 2 ? '#ef4444' : d.signals?.diskFreeGb < 5 ? '#f97316' : 'text.secondary' }}>
                    {d.signals?.diskFreeGb != null ? d.signals.diskFreeGb.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell sx={{ color: d.signals?.uptimeRatio7d != null && d.signals.uptimeRatio7d < 0.05 ? '#ef4444' : d.signals?.uptimeRatio7d < 0.5 ? '#f97316' : d.signals?.uptimeRatio7d < 0.85 ? '#eab308' : '#22c55e' }}>
                    {d.signals?.uptimeRatio7d != null ? `${(d.signals.uptimeRatio7d * 100).toFixed(0)}%` : '—'}
                  </TableCell>
                  <TableCell sx={{ color: d.signals?.lastSeenAgo > 86400 ? '#f97316' : 'text.secondary' }}>
                    {fmtAge(d.signals?.lastSeenAgo)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
