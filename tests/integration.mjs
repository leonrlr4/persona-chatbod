const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function req(path, init) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch {}
  } else {
    try { data = await res.text(); } catch {}
  }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const results = [];

  results.push({ name: 'GET /api/personas', ...(await req('/api/personas')) });
  results.push({ name: 'GET /api/auth/me (unauthenticated)', ...(await req('/api/auth/me')) });
  results.push({ name: 'POST /api/chat/stream', ...(await req('/api/chat/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'integration test' }) })) });

  for (const r of results) {
    console.log(`${r.name} -> ${r.status} ${r.ok ? 'OK' : 'ERR'}`);
  }
}

main().catch(e => { console.error('integration tests failed', e); process.exit(1); });
