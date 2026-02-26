<template>
  <div class="page">
    <div class="card" style="margin-top: 48px;">
      <h1 class="title">注册</h1>
      <form @submit.prevent="submit" class="form">
        <input v-model="nickname" type="text" placeholder="昵称" class="input" maxlength="20" />
        <input v-model="account" type="text" placeholder="手机号或微信号" class="input" />
        <input v-model="password" type="password" placeholder="密码（至少6位）" class="input" />
        <button type="submit" class="btn btn-primary" style="width:100%; margin-top:12px;">注册</button>
      </form>
      <p class="foot"><router-link to="/login">已有账号？去登录</router-link></p>
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
const nickname = ref('')
const account = ref('')
const password = ref('')

async function submit() {
  if (!nickname.value.trim()) { alert('请填写昵称'); return }
  if (!account.value.trim()) { alert('请填写手机号或微信号'); return }
  if (password.value.length < 6) { alert('密码至少6位'); return }
  const isWechat = account.value.includes('wx') || /^[a-zA-Z][a-zA-Z0-9_-]{5,}$/.test(account.value)
  const res = await api.post('/api/register', {
    nickname: nickname.value.trim(),
    [isWechat ? 'wechat' : 'phone']: account.value.trim(),
    password: password.value,
  })
  if (res.code === 0 && res.data) {
    userStore.setAuth(res.data.token, { userId: res.data.userId, nickname: res.data.nickname })
    router.replace('/profile')
  } else {
    alert(res.message || '注册失败')
  }
}
</script>

<style scoped>
.title { font-size: 28px; font-weight: 700; margin: 0 0 24px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.input { padding: 12px 16px; border-radius: 12px; border: 1px solid #27272a; background: #0f0f12; color: #e4e4e7; }
.foot { margin-top: 16px; font-size: 14px; }
</style>
