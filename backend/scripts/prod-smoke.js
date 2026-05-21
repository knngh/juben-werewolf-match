const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

async function getJson(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(`${path} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(`${path} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const health = await getJson('/api/health');
  const sessions = await getJson('/api/sessions');
  const result = {
    health: health.data.status,
    openSessions: sessions.data.length,
  };

  if (process.env.SMOKE_WECHAT && process.env.SMOKE_PASSWORD) {
    const login = await postJson('/api/login', {
      wechat: process.env.SMOKE_WECHAT,
      password: process.env.SMOKE_PASSWORD,
    });
    const me = await getJson('/api/me', login.data.token);
    result.login = me.data.nickname;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
