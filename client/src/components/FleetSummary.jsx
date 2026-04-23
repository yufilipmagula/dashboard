import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@yunex/yds-react';

function Stat({ title, value, color = 'var(--text-primary)', sub, onClick, active = false }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        minWidth: 140,
        flex: 1,
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid',
        borderColor: active ? 'primary.main' : 'divider',
        boxShadow: active ? '0 0 0 2px rgba(37, 99, 235, 0.12)' : undefined,
      }}
    >
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          {title}
        </Typography>
        <Typography
          variant="h3"
          sx={{
            mt: 0.5,
            color,
            fontSize: { xs: '1.75rem', sm: '2rem' },
            lineHeight: 1.1,
            fontWeight: 700,
          }}
        >
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function FleetSummary({ summary, filter, onFilterChange }) {
  const { total, byState, critical, highRisk, topSites } = summary;
  const unknownCount = (byState.Unknown ?? 0) + (byState.Disconnected ?? 0);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleTopSitesCount = useMemo(() => {
    const estimatedColumns = Math.max(2, Math.floor((viewportWidth - 80) / 330));
    return Math.max(4, estimatedColumns * 2);
  }, [viewportWidth]);

  function applyQuickFilter(next) {
    onFilterChange(prev => {
      const isActive = prev.state === next.state && prev.minRisk === next.minRisk;
      if (isActive) {
        return { ...prev, state: '', minRisk: 0 };
      }
      return { ...prev, ...next };
    });
  }

  function isActive(state, minRisk) {
    return filter.state === state && filter.minRisk === minRisk;
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <Box
        sx={{
          mb: 1.5,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        }}
      >
        <Stat title="Total Devices" value={total} onClick={() => applyQuickFilter({ state: '', minRisk: 0 })} active={isActive('', 0)} />
        <Stat title="OK" value={byState.OK ?? 0} color="#22c55e" onClick={() => applyQuickFilter({ state: '3', minRisk: 0 })} active={isActive('3', 0)} />
        <Stat title="Warning" value={byState.Warning ?? 0} color="#eab308" onClick={() => applyQuickFilter({ state: '2', minRisk: 0 })} active={isActive('2', 0)} />
        <Stat title="Error" value={byState.Error ?? 0} color="#ef4444" onClick={() => applyQuickFilter({ state: '0', minRisk: 0 })} active={isActive('0', 0)} />
        <Stat title="Unknown" value={unknownCount} color="#f97316" onClick={() => applyQuickFilter({ state: 'unknown', minRisk: 0 })} active={isActive('unknown', 0)} />
        <Stat title="Critical Risk >= 50" value={critical} color="#ef4444" onClick={() => applyQuickFilter({ state: '', minRisk: 50 })} active={isActive('', 50)} />
        <Stat title="High Risk >= 35" value={highRisk} color="#f97316" onClick={() => applyQuickFilter({ state: '', minRisk: 35 })} active={isActive('', 35)} />
      </Box>

      {topSites.length > 0 && (
        <Card>
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Top sites by max device risk
              </Typography>
              <Typography variant="caption" color="text.secondary">
                showing {Math.min(visibleTopSitesCount, topSites.length)} / {topSites.length}
              </Typography>
            </Stack>
            <Box
              sx={{
                mt: 1,
                display: 'grid',
                gap: 1,
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              }}
            >
            {topSites.slice(0, visibleTopSitesCount).map(s => (
              <Card key={s.site} variant="outlined" sx={{ height: '100%' }}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                      rounded
                      label={`● ${s.maxRisk}`}
                      sx={{
                        bgcolor: riskColor(s.maxRisk),
                        color: contrastTextColor(riskColor(s.maxRisk)),
                        border: 'none',
                      }}
                      size="small"
                    />
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      noWrap
                      sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={s.site}
                    >
                      {s.site}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
                      {s.total} device{s.total !== 1 ? 's' : ''}
                    </Typography>
                  </Stack>
                {s.worstDevice && (
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      Worst: {s.worstDevice.id} | risk {s.worstDevice.risk}
                    </Typography>
                    {s.worstDevice.reasons?.slice(0, 2).map((r, i) => (
                      <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {r}
                      </Typography>
                    ))}
                  </Box>
                )}
                </CardContent>
              </Card>
            ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function riskColor(r) {
  if (r >= 50) return '#ef4444';
  if (r >= 35) return '#f97316';
  if (r >= 15) return '#eab308';
  return '#22c55e';
}

function contrastTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 150 ? '#111827' : '#ffffff';
}
