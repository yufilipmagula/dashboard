/**
 * metrics.js  –  Thin wrapper around Grafana's Prometheus HTTP API.
 * Every function returns raw Prometheus result arrays (metric+value).
 */
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const BASE = process.env.GRAFANA_URL.replace(/\/$/, '');
const TOKEN = process.env.GRAFANA_TOKEN;
const DS_UID = process.env.PROMETHEUS_DS_UID;

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10);

async function queryInstant(expr) {
  const url = `${BASE}/api/datasources/proxy/uid/${DS_UID}/api/v1/query`;
  const params = new URLSearchParams({ query: expr, time: Math.floor(Date.now() / 1000) });
  const res = await fetch(`${url}?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Prometheus query failed (${res.status}): ${expr}`);
  const body = await res.json();
  return body.data?.result ?? [];
}

/** Latest DMP device state per device (0=Error, 1=Disconnected, 2=Warning?, 3=OK) */
export async function fetchDeviceStates() {
  return queryInstant(
    `max by(device_identification_name,device_location_name,device_identification_typeId,policyId,thingId)` +
    ` (last_over_time(dmp_state_device_state{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d]))`
  );
}

/** Max CPU in last 7 days (current week) */
export async function fetchCpuWeek() {
  return queryInstant(
    `max by(device_identification_name,device_location_name)` +
    ` (max_over_time(dmp_metrics_hw_cpu_load{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d]))`
  );
}

/** Max CPU in the week BEFORE last 7 days (prior week baseline) */
export async function fetchCpuPriorWeek() {
  return queryInstant(
    `max by(device_identification_name,device_location_name)` +
    ` (max_over_time(dmp_metrics_hw_cpu_load{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d] offset 7d))`
  );
}

/** Latest disk free (GB) */
export async function fetchDiskFree() {
  return queryInstant(
    `max by(device_identification_name,device_location_name)` +
    ` (last_over_time(dmp_metrics_disk_free{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d]))`
  );
}

/** Timestamp of most recent sample to measure telemetry freshness */
export async function fetchLastSeen() {
  return queryInstant(
    `max by(device_identification_name)` +
    ` (timestamp(last_over_time(dmp_state_device_state{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d])))`
  );
}

/** Container restart count in last 24h (per device) */
export async function fetchRestarts() {
  return queryInstant(
    `max by(device_identification_name)` +
    ` (increase(dmp_metrics_container_status_restarts_total{device_identification_typeId="Orin_CTI-Forge"}[24h]))`
  );
}

// ── eMMC health (ORV1 only) ──────────────────────────────────────────────────
// JEDEC JESD84: EolInfo 1=Normal 2=Warning(80%) 3=Urgent(90%+)
// LifetimeEstimation 1-10 = 0-100% P/E wear (10% steps), 11 = exceeded 100%
// Value -1 = metric not available (ORV3 devices, skip in scoring)

const EMMC_FILTER =
  `device_identification_typeId="Orin_CTI-Forge",` +
  `device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"`;

export async function fetchEmmcEol() {
  return queryInstant(
    `max by(device_identification_name) (last_over_time(dmp_metrics_mmcDetails_mmcEolInfo{${EMMC_FILTER}}[7d]))`
  );
}

export async function fetchEmmcLifetimeA() {
  return queryInstant(
    `max by(device_identification_name) (last_over_time(dmp_metrics_mmcDetails_mmcLifetimeEstimationA{${EMMC_FILTER}}[7d]))`
  );
}

export async function fetchEmmcLifetimeB() {
  return queryInstant(
    `max by(device_identification_name) (last_over_time(dmp_metrics_mmcDetails_mmcLifetimeEstimationB{${EMMC_FILTER}}[7d]))`
  );
}

/** Board uptime in seconds (gauge, resets to 0 on reboot).
 *  Uptime ratio for last 7d = min(value / 604800, 1).
 */
export async function fetchBoardUptime() {
  return queryInstant(
    `max by(device_identification_name,device_location_name)` +
    ` (last_over_time(dmp_metrics_board_uptime{device_identification_typeId="Orin_CTI-Forge",` +
    `  device_location_name!~"CZ, Brno, Lab.*|ERR: Cannot get location"}[7d]))`
  );
}
