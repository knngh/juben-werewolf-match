<template>
  <div class="page">
    <div class="card" style="margin-top: 48px;">
      <h1 class="title">本杀匹配</h1>
      <p class="subtitle">剧本杀 · 狼人杀 · 找同好</p>
      <form @submit.prevent="submit" class="form">
        <input v-model="phone" type="text" placeholder="手机号或微信号" class="input" />
        <input v-model="password" type="password" placeholder="密码" class="input" />
        <button type="submit" class="btn btn-primary" style="width:100%; margin-top:12px;">登录</button>
      </form>
      <p class="foot">还没有账号？ <router-link to="/register">去注册</router-link></p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const phone = ref('')
const password = ref('')
const err = ref('')

async function submit() {
  err.value = ''
  const account = phone.value.trim()
  const isWechat = account.includes('wx') || /^[a-zA-Z][a-zA-Z0-9_-]{5,}$/.test(account)
  const res = await api.post('/api/login', {
    [isWechat ? 'wechat' : 'phone']: account,
    password: password.value,
  })
  if (res.code === 0 && res.data) {
    userStore.setAuth(res.data.token, { userId: res.data.userId, nickname: res.data.nickname })
    router.replace('/discover')
  } else {
    err.value = res.message || '登录失败'
    alert(err.value)
  }
}
</script>

<style scoped>
.title { font-size: 28px; font-weight: 700; margin: 0 0 8px; }
.subtitle { color: #71717a; font-size: 14px; margin: 0 0 24px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.input { padding: 12px 16px; border-radius: 12px; border: 1px solid #27272a; background: #0f0f12; color: #e4e4e7; }
.foot { margin-top: 16px; color: #71717a; font-size: 14px; }
</style>
