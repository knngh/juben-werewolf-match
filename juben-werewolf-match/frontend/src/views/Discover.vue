<template>
  <div class="page">
    <h1 class="title">发现同好</h1>
    <p class="subtitle">根据你的偏好推荐，左滑跳过 · 右滑点赞</p>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="list.length === 0" class="empty">暂无更多推荐，完善资料或稍后再来</div>
    <div v-else class="stack">
      <div v-for="(u, i) in list" :key="u.id" class="user-card card" :style="{ zIndex: list.length - i }">
        <div class="avatar-wrap">
          <div class="avatar">{{ (u.nickname || '?')[0] }}</div>
        </div>
        <h2 class="name">{{ u.nickname }}</h2>
        <div v-if="(u.gameTypes && u.gameTypes.length) || (u.playStyles && u.playStyles.length)" class="tags">
          <span v-for="t in (u.gameTypes || []).slice(0,3)" :key="t" class="tag">{{ t }}</span>
          <span v-for="s in (u.playStyles || []).slice(0,2)" :key="s" class="tag style">{{ s }}</span>
        </div>
        <p v-if="u.intro" class="intro">{{ u.intro }}</p>
        <p v-if="u.city" class="city">{{ u.city }}</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="pass(u)">跳过</button>
          <button type="button" class="btn btn-primary" @click="like(u)">喜欢</button>
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
  const res = await api.get('/api/discover')
  loading.value = false
  if (res.data && res.data.data) list.value = res.data.data
}

function pass(u) {
  list.value = list.value.filter(x => x.id !== u.id)
}

async function like(u) {
  const res = await api.post(`/api/like/${u.id}`)
  if (res.data && res.data.matched) alert('匹配成功！去「匹配」页查看')
  list.value = list.value.filter(x => x.id !== u.id)
}

onMounted(load)
</script>

<style scoped>
.title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.subtitle { color: #71717a; font-size: 14px; margin: 0 0 20px; }
.loading, .empty { text-align: center; padding: 48px 24px; color: #71717a; }
.stack { position: relative; min-height: 360px; }
.user-card { margin-bottom: 16px; }
.avatar-wrap { text-align: center; margin-bottom: 12px; }
.avatar { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #a78bfa); display: inline-flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #fff; }
.name { font-size: 20px; margin: 0 0 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.tag { font-size: 12px; padding: 4px 10px; border-radius: 12px; background: #27272a; color: #a1a1aa; }
.tag.style { background: #3f3f46; }
.intro { font-size: 14px; color: #a1a1aa; margin: 0 0 4px; line-height: 1.5; }
.city { font-size: 12px; color: #71717a; margin: 0 0 16px; }
.actions { display: flex; gap: 12px; justify-content: center; }
.actions .btn { flex: 1; }
</style>
