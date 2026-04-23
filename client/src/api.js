/** Minimal fetch wrapper – auto-adds /api prefix */
export async function apiFetch(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export async function forceRefresh() {
  const res = await fetch('/api/refresh', { method: 'POST' });
  return res.json();
}
