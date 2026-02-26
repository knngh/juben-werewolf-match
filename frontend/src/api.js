const BASE = import.meta.env.VITE_API_BASE || ''

function getToken() {
  return localStorage.getItem('jwm_token')
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + url, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    localStorage.removeItem('jwm_token')
    window.location.href = '/#/login'
  }
  return { ...data, status: res.status }
}

export default {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
}
