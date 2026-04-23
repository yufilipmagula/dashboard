import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  AppHeader,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Popover,
  Stack,
  Switch,
  Typography,
  Theme,
  useTheme,
  useSwitchTheme,
} from '@yunex/yds-react';
import { Cogwheel16 } from '@yunex/yds-icons';
import { apiFetch, forceRefresh } from './api.js';
import FleetSummary from './components/FleetSummary.jsx';
import FleetTable   from './components/FleetTable.jsx';
import DeviceDetail from './components/DeviceDetail.jsx';

export default function App() {
  const drawerTopOffset = 56;
  const [summary,    setSummary]    = useState(null);
  const [fleet,      setFleet]      = useState([]);
  const [status,     setStatus]     = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [filter,     setFilter]     = useState({ q: '', state: '', minRisk: 0 });
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const settingsButtonRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const theme = useTheme();
  const switchTheme = useSwitchTheme();

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([apiFetch('/summary'), apiFetch('/status')]);
      setSummary(s);
      setStatus(st);

      const params = new URLSearchParams();
      if (filter.q)       params.set('q', filter.q);
      if (filter.state)   params.set('state', filter.state);
      if (filter.minRisk) params.set('minRisk', filter.minRisk);
      const q = params.toString() ? `?${params}` : '';
      const f = await apiFetch(`/fleet${q}`);
      setFleet(f.devices ?? []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh every 2 minutes in the UI
  useEffect(() => { const t = setInterval(load, 120_000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === Theme.Dark || storedTheme === Theme.Light) {
      switchTheme(storedTheme);
    }
  }, [switchTheme]);

  async function handleForceRefresh() {
    await forceRefresh();
    setTimeout(load, 2000);
  }

  function toggleTheme() {
    const nextTheme = theme.palette.mode === Theme.Dark ? Theme.Light : Theme.Dark;
    switchTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  }

  function openSettingsMenu(event) {
    setMenuAnchorEl(event.currentTarget);
  }

  function closeSettingsMenu() {
    setMenuAnchorEl(null);
  }

  const isSettingsMenuOpen = Boolean(menuAnchorEl);

  function toggleSettingsMenu(event) {
    if (isSettingsMenuOpen) {
      closeSettingsMenu();
      return;
    }
    openSettingsMenu(event);
  }

  useEffect(() => {
    if (!isSettingsMenuOpen) return undefined;

    function handleOutsidePointerDown(event) {
      const target = event.target;
      if (settingsButtonRef.current?.contains(target)) return;
      if (settingsMenuRef.current?.contains(target)) return;
      closeSettingsMenu();
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        closeSettingsMenu();
      }
    }

    document.addEventListener('mousedown', handleOutsidePointerDown);
    document.addEventListener('touchstart', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointerDown);
      document.removeEventListener('touchstart', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isSettingsMenuOpen]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppHeader
        appName="AP Field Intelligence"
        style={{ position: 'sticky', top: 0, zIndex: 1200, flexShrink: 0 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ ml: 'auto' }}>
          {status?.refreshing && <Chip rounded color="info" label="Refreshing" size="small" />}
          <IconButton
            ref={settingsButtonRef}
            color="secondary"
            aria-label="Open settings"
            aria-haspopup="menu"
            aria-expanded={isSettingsMenuOpen ? 'true' : 'false'}
            onClick={toggleSettingsMenu}
          >
            <Cogwheel16 />
          </IconButton>

          <Popover
            arrow
            open={isSettingsMenuOpen}
            anchorEl={menuAnchorEl}
            placement="bottom-end"
            sx={{ zIndex: 1400 }}
            paperProps={{
              ref: settingsMenuRef,
              sx: {
                width: 300,
                p: 1.5,
              },
            }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" fontWeight={600}>Environment</Typography>
                <Chip rounded size="small" label="eu-prod" />
              </Stack>

              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2">Dark mode</Typography>
                <Switch checked={theme.palette.mode === Theme.Dark} onChange={() => toggleTheme()} />
              </Stack>

              <Typography variant="caption" color={status?.error ? 'error.main' : 'text.secondary'}>
                {status?.refreshedAt ? `Updated ${new Date(status.refreshedAt).toLocaleTimeString()}` : 'Loading status'}
                {status?.error ? ' | collector error' : ''}
              </Typography>

              <Button
                color="secondary"
                fullWidth
                onClick={async () => {
                  closeSettingsMenu();
                  await handleForceRefresh();
                }}
              >
                Refresh now
              </Button>
            </Stack>
          </Popover>
        </Stack>
      </AppHeader>

      <Box sx={{ p: 2.5, flex: 1, overflow: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {summary && <FleetSummary summary={summary} filter={filter} onFilterChange={setFilter} />}

        <FleetTable
          fleet={fleet}
          loading={loading}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selected?.id}
          onSelect={setSelected}
        />
      </Box>

      <Drawer
        anchor="right"
        variant="temporary"
        open={Boolean(selected)}
        slotProps={{ backdrop: { onClick: () => setSelected(null) } }}
        sx={{
          '& [class*=MuiPaper-root]': {
            width: { xs: '100%', sm: 520 },
            maxWidth: '100vw',
            top: drawerTopOffset,
            height: `calc(100% - 56px)`,
            borderTop: 'none',
            overflowX: 'hidden',
          },
          '& [class*=MuiPaper-root] > div': {
            overflowX: 'hidden',
            minWidth: 0,
          },
        }}
      >
        {selected && <DeviceDetail device={selected} onClose={() => setSelected(null)} />}
      </Drawer>
    </Box>
  );
}
