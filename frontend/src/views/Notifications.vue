<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1 class="title">通知</h1>
        <p class="subtitle">申请、审批和局状态变化</p>
      </div>
      <button class="btn btn-ghost mini" type="button" @click="readAll">全部已读</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="list.length === 0" class="empty">暂无通知</div>
    <div v-else class="notice-list">
      <router-link
        v-for="item in list"
        :key="item.id"
        :to="item.link || '/profile'"
        :class="['card', 'notice-card', item.readAt ? '' : 'unread']"
        @click="markRead(item)"
      >
        <strong>{{ item.title }}</strong>
        <span v-if="item.body">{{ item.body }}</span>
        <em>{{ item.createdAt }}</em>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '../api'

const loading = ref(true)
const list = ref([])

async function load() {
  loading.value = true
  const res = await api.get('/api/notifications')
  loading.value = false
  if (res.code === 0 && Array.isArray(res.data)) list.value = res.data
}

async function markRead(item) {
  if (!item.readAt) await api.patch(`/api/notifications/${item.id}/read`, {})
}

async function readAll() {
  const res = await api.patch('/api/notifications/read-all', {})
  if (res.code === 0) await load()
  else alert(res.message || '操作失败')
}

onMounted(load)
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.subtitle { color: #71717a; font-size: 14px; margin: 4px 0 0; }
.mini { padding: 7px 10px; border-radius: 8px; font-size: 12px; white-space: nowrap; }
.notice-list { display: flex; flex-direction: column; gap: 10px; }
.notice-card { display: flex; flex-direction: column; gap: 6px; color: inherit; }
.notice-card.unread { border-color: #22c55e; }
.notice-card span { color: #a1a1aa; font-size: 13px; line-height: 1.5; }
.notice-card em { color: #71717a; font-style: normal; font-size: 12px; }
</style>
