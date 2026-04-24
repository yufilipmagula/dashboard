/**
 * index.js  –  Express API server
 *
 * GET /api/fleet          full fleet with risk scores (cached, refreshed every REFRESH_INTERVAL_MS)
 * GET /api/fleet/:id      single device detail
 * GET /api/status         cache freshness info
 * POST /api/refresh       force a cache refresh
 */
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import {
  fetchDeviceStates,
  fetchCpuWeek,
  fetchCpuPriorWeek,
  fetchDiskFree,
  fetchLastSeen,
  fetchRestarts,
  fetchEmmcEol,
  fetchEmmcLifetimeA,
  fetchEmmcLifetimeB,
  fetchBoardUptime,
} from './metrics.js';
import { buildFleet } from './scorer.js';

const app = express();
const PORT = process.env.PORT || 3001;
const INTERVAL = parseInt(process.env.REFRESH_INTERVAL_MS || '900000', 10);

app.use(cors());
app.use(express.json());

// ── Cache ────────────────────────────────────────────────────────────────────
let cache = { fleet: [], refreshedAt: null, refreshing: false, error: null };

async function refresh() {
  if (cache.refreshing) return;
  cache.refreshing = true;
  console.log('[collector] fetching metrics…');
  try {
    const [states, cpuWeek, cpuPrior, disk, lastSeen, restarts, emmcEol, emmcLifeA, emmcLifeB, boardUptime] = await Promise.all([
      fetchDeviceStates(),
      fetchCpuWeek(),
      fetchCpuPriorWeek(),
      fetchDiskFree(),
      fetchLastSeen(),
      fetchRestarts(),
      fetchEmmcEol(),
      fetchEmmcLifetimeA(),
      fetchEmmcLifetimeB(),
      fetchBoardUptime(),
    ]);
    cache.fleet = buildFleet(states, cpuWeek, cpuPrior, disk, lastSeen, restarts, emmcEol, emmcLifeA, emmcLifeB, boardUptime);
    cache.refreshedAt = new Date().toISOString();
    cache.error = null;
    console.log(`[collector] done – ${cache.fleet.length} devices, at ${cache.refreshedAt}`);
  } catch (err) {
    cache.error = err.message;
    console.error('[collector] error:', err.message);
  } finally {
    cache.refreshing = false;
  }
}

// Initial load + periodic refresh
refresh();
setInterval(refresh, INTERVAL);

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({
    devices: cache.fleet.length,
    refreshedAt: cache.refreshedAt,
    refreshing: cache.refreshing,
    error: cache.error,
    nextRefreshMs: cache.refreshedAt
      ? Math.max(0, INTERVAL - (Date.now() - new Date(cache.refreshedAt).getTime()))
      : 0,
  });
});

app.post('/api/refresh', (_req, res) => {
  refresh();
  res.json({ ok: true, message: 'Refresh triggered' });
});

app.get('/api/fleet', (req, res) => {
  let fleet = cache.fleet;

  // Optional filters
  const { state, minRisk, site, type, q } = req.query;
  if (state !== undefined) {
    if (state === 'unknown') {
      fleet = fleet.filter(d => d.stateLabel === 'Unknown' || d.stateLabel === 'Disconnected');
    } else {
      fleet = fleet.filter(d => String(d.state) === state);
    }
  }
  if (minRisk !== undefined) fleet = fleet.filter(d => d.risk >= parseInt(minRisk, 10));
  if (q) {
    const query = String(q).toLowerCase();
    fleet = fleet.filter(d =>
      d.id?.toLowerCase().includes(query) ||
      d.site?.toLowerCase().includes(query)
    );
  }
  if (site) fleet = fleet.filter(d => d.site?.toLowerCase().includes(site.toLowerCase()));
  if (type) fleet = fleet.filter(d => d.id?.includes(type));

  res.json({
    refreshedAt: cache.refreshedAt,
    total: fleet.length,
    devices: fleet,
  });
});

app.get('/api/fleet/:id', (req, res) => {
  const device = cache.fleet.find(d => d.id === req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

// Summary stats
app.get('/api/summary', (_req, res) => {
  const f = cache.fleet;
  const byState = { Error: 0, Disconnected: 0, Warning: 0, OK: 0, Unknown: 0 };
  let highRisk = 0, critical = 0;
  const bySite = {};

  for (const d of f) {
    byState[d.stateLabel] = (byState[d.stateLabel] ?? 0) + 1;
    if (d.risk >= 50) critical++;
    else if (d.risk >= 35) highRisk++;
    const siteKey = d.site ?? 'Unknown';
    bySite[siteKey] = bySite[siteKey] ?? { site: siteKey, total: 0, maxRisk: 0, devices: [], worstDevice: null };
    bySite[siteKey].total++;
    if (d.risk > bySite[siteKey].maxRisk) {
      bySite[siteKey].maxRisk = d.risk;
      bySite[siteKey].worstDevice = { id: d.id, risk: d.risk, stateLabel: d.stateLabel, reasons: d.reasons };
    }
    if (d.risk >= 35) bySite[siteKey].devices.push(d.id);
  }

  const topSites = Object.values(bySite)
    .sort((a, b) => b.maxRisk - a.maxRisk)
    .slice(0, 10);

  res.json({
    refreshedAt: cache.refreshedAt,
    total: f.length,
    byState,
    critical,
    highRisk,
    topSites,
  });
});

// ── Serve client build (production) ──────────────────────────────────────────
const publicDir = join(__dirname, 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));
  console.log('[server] serving static client from', publicDir);
}

app.listen(PORT, () => console.log(`[server] running on http://localhost:${PORT}`));
