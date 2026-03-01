import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

const TOKEN_KEY = 'jwm_token'
const USER_KEY = 'jwm_user'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY))
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  function setAuth(t, u) {
    token.value = t
    user.value = u
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
      localStorage.setItem(USER_KEY, JSON.stringify(u || {}))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }

  function logout() {
    setAuth(null, null)
  }

  async function fetchMe() {
    if (!token.value) return
    const res = await api.get('/api/me')
    if (res.code === 0 && res.data) user.value = res.data
  }

  return { token, user, isLoggedIn, setAuth, logout, fetchMe }
})
