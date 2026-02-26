<template>
  <div class="page">
    <h1 class="title">我的匹配</h1>
    <p class="subtitle">互相点赞即匹配，可查看对方微信号联系</p>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="list.length === 0" class="empty">暂无匹配，去发现页点赞同好吧</div>
    <div v-else class="match-list">
      <div v-for="u in list" :key="u.id" class="card match-card">
        <div class="avatar">{{ (u.nickname || '?')[0] }}</div>
        <div class="info">
          <h3 class="name">{{ u.nickname }}</h3>
          <p v-if="u.intro" class="intro">{{ u.intro }}</p>
          <p v-if="u.city" class="city">{{ u.city }}</p>
          <p v-if="u.wechat" class="wechat">微信号：{{ u.wechat }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'

const list = ref([])
const loading = ref(true)

async function load() {
  loading.value = true
  const res = await api.get('/api/matches')
  loading.value = false
  if (res.data && res.data.data) list.value = res.data.data
}

onMounted(load)
</script>

<style scoped>
.title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.subtitle { color: #71717a; font-size: 14px; margin: 0 0 20px; }
.loading, .empty { text-align: center; padding: 48px 24px; color: #71717a; }
.match-list { display: flex; flex-direction: column; gap: 12px; }
.match-card { display: flex; align-items: flex-start; gap: 16px; }
.match-card .avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #a78bfa); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #fff; }
.info { flex: 1; min-width: 0; }
.name { margin: 0 0 4px; font-size: 18px; }
.intro, .city { font-size: 13px; color: #a1a1aa; margin: 0 0 2px; }
.wechat { font-size: 13px; color: #a78bfa; margin: 8px 0 0; }
</style>
