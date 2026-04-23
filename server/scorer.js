/**
 * scorer.js  –  Turns raw Prometheus vectors into per-device intelligence.
 *
 * State values observed in prod:
 *   0 = Error  |  1 = Disconnected  |  2 = Warning  |  3 = OK
 *
 * Risk score: 0 (healthy) → 100 (critical), composed of:
 *   stateScore      0–25   based on current DMP device state
 *   cpuScore        0–25   based on week-over-week CPU growth ratio
 *   diskScore       0–20   based on disk free GB  (<5 GB = problem, <2 GB = critical)
 *   freshnessScore  0–15   based on age of last dmp_state_device_state sample in Prometheus
 *                          (fresh = <4h, delayed = 4–24h, stale = 24–48h, very stale = >48h)
 *   emmcScore       0–20   based on eMMC EOL + wear level (ORV1 only)
 *   uptimeScore     0–15   based on dmp_metrics_board_uptime ratio over last 7d
 *                          (ratio = min(uptime_s / 604800, 1); penalizes recent reboots)
 */

// 7 days in seconds
const WEEK_S = 7 * 24 * 3600;

const STATE_LABEL = { 0: 'Error', 1: 'Disconnected', 2: 'Warning', 3: 'OK' };
const STATE_COLOR = { 0: '#ef4444', 1: '#f97316', 2: '#eab308', 3: '#22c55e' };

function indexBy(results, key = 'device_identification_name') {
  const map = {};
  for (const r of results) {
    const k = r.metric[key];
    if (!k) continue;
    const val = parseFloat(r.value[1]);
    if (!isNaN(val)) {
      // Keep highest value when there are duplicates
      if (map[k] === undefined || val > map[k].value) {
        map[k] = { value: val, labels: r.metric };
      }
    }
  }
  return map;
}

function stateScore(state) {
  if (state === 0) return 20;
  if (state === 1) return 25;
  if (state === 2) return 15;
  return 0;
}

function cpuScore(cpuNow, cpuPrior) {
  if (!cpuNow || cpuNow <= 0) return 0;
  const ratio = cpuPrior > 0.1 ? cpuNow / cpuPrior : cpuNow / 0.1;
  if (ratio > 50)  return 25;
  if (ratio > 20)  return 20;
  if (ratio > 10)  return 16;
  if (ratio > 5)   return 12;
  if (ratio > 2)   return 8;
  if (ratio > 1.5) return 4;
  return 0;
}

function diskScore(diskFreeGb) {
  if (diskFreeGb === undefined) return 0;
  if (diskFreeGb < 2)  return 20;  // critical
  if (diskFreeGb < 5)  return 12;  // problem
  return 0;
}

function freshnessScore(lastSeenTs) {
  if (!lastSeenTs) return 15;
  const ageSeconds = Date.now() / 1000 - lastSeenTs;
  if (ageSeconds > 86400 * 2) return 15;
  if (ageSeconds > 86400)     return 10;
  if (ageSeconds > 3600 * 4)  return 5;
  return 0;
}

/** Uptime ratio in last 7d.
 *  dmp_metrics_board_uptime is seconds since last boot (gauge, resets on reboot).
 *  ratio = min(uptimeSeconds / 604800, 1.0)
 *  Score penalises devices that have recently rebooted within the week window.
 */
function uptimeScore(uptimeSeconds) {
  if (uptimeSeconds == null) return 0;
  const ratio = Math.min(uptimeSeconds / WEEK_S, 1);
  if (ratio < 0.05)  return 15;  // < ~8h  – very recent reboot
  if (ratio < 0.25)  return 10;  // < ~1.75d
  if (ratio < 0.50)  return 6;   // < 3.5d
  if (ratio < 0.85)  return 3;   // < ~6d
  return 0;
}

function emmcScore(emmcEolInfo, emmcLifeA, emmcLifeB) {
  const eol = emmcEolInfo >= 0 ? emmcEolInfo : null;
  const lifeA = emmcLifeA >= 0 ? emmcLifeA : null;
  const lifeB = emmcLifeB >= 0 ? emmcLifeB : null;

  if (eol == null && lifeA == null && lifeB == null) {
    return { score: 0, wear: null, eol: null };
  }

  let eolRisk = 0;
  if (eol === 3) eolRisk = 20;
  else if (eol === 2) eolRisk = 12;

  const wear = Math.max(lifeA ?? -1, lifeB ?? -1);
  let wearRisk = 0;
  if (wear >= 11) wearRisk = 20;
  else if (wear >= 10) wearRisk = 16;
  else if (wear >= 9) wearRisk = 12;
  else if (wear >= 8) wearRisk = 8;
  else if (wear >= 7) wearRisk = 4;

  return { score: Math.max(eolRisk, wearRisk), wear, eol };
}

function reasons(s, ss, cs, ds, fs, es, us, cpuNow, cpuRatio, diskFree, emmc, uptimeRatio) {
  const r = [];
  if (ss >= 25) r.push('Device disconnected from DMP');
  else if (ss >= 20) r.push('Device in Error state');
  else if (ss >= 15) r.push('Device in Warning state');
  if (cs >= 16) r.push(`CPU load surged ${cpuRatio.toFixed(1)}x vs prior week (now ${cpuNow?.toFixed(1)})`);
  else if (cs >= 8) r.push(`CPU load up ${cpuRatio.toFixed(1)}x vs prior week`);
  if (ds >= 20) r.push(`Disk critically low: ${diskFree?.toFixed(1)} GB free`);
  else if (ds > 0) r.push(`Disk low: ${diskFree?.toFixed(1)} GB free`);
  if (fs >= 10) r.push('Telemetry stale (>24h since last sample)');
  else if (fs >= 5) r.push('Telemetry delayed (>4h since last sample)');
    if (us >= 15) r.push(`Device rebooted recently (uptime ${(uptimeRatio * 100).toFixed(0)}% of last 7d)`);
    else if (us >= 6) r.push(`Device rebooted within last week (uptime ${(uptimeRatio * 100).toFixed(0)}% of 7d)`);
    else if (us >= 3) r.push(`Minor reboot gap last week (uptime ${(uptimeRatio * 100).toFixed(0)}% of 7d)`);
    if (es >= 20) {
    if (emmc?.wear >= 11) r.push('eMMC wear exceeded 100% lifetime (bucket 0x0B)');
    else if (emmc?.eol === 3) r.push('eMMC EOL urgent (90%+ life consumed)');
  } else if (es >= 12) {
    if (emmc?.wear >= 9) r.push(`eMMC wear high (bucket ${emmc.wear})`);
    else if (emmc?.eol === 2) r.push('eMMC EOL warning (>=80% life consumed)');
  } else if (es >= 4) {
    r.push(`eMMC wear rising (bucket ${emmc?.wear})`);
  }
  if (r.length === 0) r.push('All signals normal');
  return r;
}

export function buildFleet(
  stateResults,
  cpuWeekResults,
  cpuPriorResults,
  diskResults,
  lastSeenResults,
  restartResults,
  emmcEolResults,
  emmcLifeAResults,
  emmcLifeBResults,
  boardUptimeResults
) {
  const stateIdx       = indexBy(stateResults);
  const cpuNowIdx      = indexBy(cpuWeekResults);
  const cpuPriorIdx    = indexBy(cpuPriorResults);
  const diskIdx        = indexBy(diskResults);
  const lastSeenIdx    = indexBy(lastSeenResults);
  const restartIdx     = indexBy(restartResults);
  const emmcEolIdx     = indexBy(emmcEolResults);
  const emmcLifeAIdx   = indexBy(emmcLifeAResults);
  const emmcLifeBIdx   = indexBy(emmcLifeBResults);
  const boardUptimeIdx = indexBy(boardUptimeResults ?? []);

  const allDevices = new Set([
    ...Object.keys(stateIdx),
    ...Object.keys(cpuNowIdx),
    ...Object.keys(boardUptimeIdx),
  ]);

  const fleet = [];

  for (const id of allDevices) {
    const stateEntry     = stateIdx[id];
    const cpuNowEntry    = cpuNowIdx[id];
    const cpuPriorEntry  = cpuPriorIdx[id];
    const diskEntry      = diskIdx[id];
    const lastSeenEntry  = lastSeenIdx[id];
    const restartEntry   = restartIdx[id];
    const emmcEolEntry   = emmcEolIdx[id];
    const emmcLifeAEntry = emmcLifeAIdx[id];
    const emmcLifeBEntry = emmcLifeBIdx[id];
    const uptimeEntry    = boardUptimeIdx[id];

    const state         = stateEntry ? Math.round(stateEntry.value) : undefined;
    const cpuNow        = cpuNowEntry?.value;
    const cpuPrior      = cpuPriorEntry?.value ?? 0;
    const diskFree      = diskEntry?.value;
    const lastSeen      = lastSeenEntry?.value;
    const restarts      = restartEntry?.value ?? 0;
    const emmcEolInfo   = emmcEolEntry?.value;
    const emmcLifeA     = emmcLifeAEntry?.value;
    const emmcLifeB     = emmcLifeBEntry?.value;
    const uptimeSeconds = uptimeEntry?.value;

    const cpuRatio = cpuPrior > 0.1 ? (cpuNow ?? 0) / cpuPrior : (cpuNow ?? 0) / 0.1;
    const uptimeRatio = Math.min((uptimeSeconds ?? 0) / WEEK_S, 1);

    const ss = state !== undefined ? stateScore(state) : 10;
    const cs = cpuScore(cpuNow, cpuPrior);
    const ds = diskScore(diskFree);
    const fs = freshnessScore(lastSeen);
    const emmc = emmcScore(emmcEolInfo, emmcLifeA, emmcLifeB);
    const es = emmc.score;
    const us = uptimeScore(uptimeSeconds);

    const risk = Math.min(100, ss + cs + ds + fs + es + us);
    const labels = stateEntry?.labels ?? cpuNowEntry?.labels ?? {};

    // Derive site: strip VPN suffix for grouping, e.g. "DE, Essen, ..." or "Göteborg"
    const rawLocation = labels.device_location_name ?? 'Unknown';
    const site = rawLocation.replace(/\s*\(VPN[s]? Active.*\)$/, '').trim();

    fleet.push({
      id,
      state,
      stateLabel: STATE_LABEL[state] ?? 'Unknown',
      stateColor: STATE_COLOR[state] ?? '#6b7280',
      site,
      policyId: labels.policyId,
      thingId: labels.thingId,
      risk,
      reasons: reasons(state, ss, cs, ds, fs, es, us, cpuNow, cpuRatio, diskFree, emmc, uptimeRatio),
      signals: {
        cpuMax7d: cpuNow != null ? +cpuNow.toFixed(2) : null,
        cpuMax14d: cpuPrior > 0 ? +cpuPrior.toFixed(2) : null,
        cpuGrowthX: cpuNow != null ? +cpuRatio.toFixed(2) : null,
        diskFreeGb: diskFree != null ? +diskFree.toFixed(2) : null,
        restarts24h: +restarts.toFixed(0),
        lastSeenTs: lastSeen ? Math.round(lastSeen) : null,
        lastSeenAgo: lastSeen ? Math.round(Date.now() / 1000 - lastSeen) : null,
        emmcEolInfo: emmcEolInfo != null && emmcEolInfo >= 0 ? +emmcEolInfo.toFixed(0) : null,
        emmcLifetimeA: emmcLifeA != null && emmcLifeA >= 0 ? +emmcLifeA.toFixed(0) : null,
        emmcLifetimeB: emmcLifeB != null && emmcLifeB >= 0 ? +emmcLifeB.toFixed(0) : null,
        emmcWearBucket: emmc.wear != null && emmc.wear >= 0 ? +emmc.wear.toFixed(0) : null,
        uptimeRatio7d: uptimeSeconds != null ? +uptimeRatio.toFixed(3) : null,
        uptimeHours: uptimeSeconds != null ? +(uptimeSeconds / 3600).toFixed(1) : null,
      },
      scores: {
        stateScore: ss,
        cpuScore: cs,
        diskScore: ds,
        freshnessScore: fs,
        emmcScore: es,
        uptimeScore: us,
      },
    });
  }

  return fleet.sort((a, b) => b.risk - a.risk);
}
