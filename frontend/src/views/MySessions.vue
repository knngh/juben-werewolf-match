<template>
  <div class="page">
    <h1 class="title">我的局</h1>
    <p class="subtitle">管理你发布的局和申请过的局</p>
    <div class="actions">
      <router-link class="btn btn-primary" to="/sessions/new">发布一局</router-link>
      <router-link class="btn btn-ghost" to="/sessions">去找局</router-link>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <section>
        <h2>我发布的</h2>
        <div v-if="created.length === 0" class="empty small-empty">还没有发布过局</div>
        <div v-for="item in created" :key="item.id" class="card session-card">
          <router-link :to="`/sessions/${item.id}`" class="session-link">
            <strong>{{ item.title }}</strong>
            <span>{{ item.gameType }} · {{ item.playDate }} {{ item.playTime }}</span>
            <span>{{ sessionPlace(item) }}</span>
            <span>{{ item.playMode }}{{ item.budgetRange ? ` · ${item.budgetRange}` : '' }}</span>
            <em>{{ item.currentPlayers }}/{{ item.maxPlayers }} 人 · {{ statusText(item.status) }}</em>
            <div v-if="item.requestCounts" class="count-row">
              <span>待审 {{ item.requestCounts.pending || 0 }}</span>
              <span>已通过 {{ item.requestCounts.approved || 0 }}</span>
              <span>已拒绝 {{ item.requestCounts.rejected || 0 }}</span>
            </div>
          </router-link>
          <div class="card-actions">
            <router-link class="btn btn-ghost mini" :to="`/sessions/${item.id}`">查看申请</router-link>
            <router-link class="btn btn-ghost mini" :to="`/sessions/${item.id}/edit`">编辑</router-link>
          </div>
        </div>
      </section>

      <section>
        <h2>我申请的</h2>
        <div v-if="requested.length === 0" class="empty small-empty">还没有申请过局</div>
        <div v-for="item in requested" :key="item.id" class="card session-card requested-card">
          <router-link :to="`/sessions/${item.id}`" class="session-link">
            <strong>{{ item.title }}</strong>
            <span>{{ item.gameType }} · {{ item.playDate }} {{ item.playTime }}</span>
            <span>{{ sessionPlace(item) }}</span>
            <span>{{ item.playMode }}{{ item.budgetRange ? ` · ${item.budgetRange}` : '' }}</span>
            <em>申请状态：{{ requestStatusText(item.requestStatus) }}</em>
            <span v-if="item.requestCertainty">确定性：{{ certaintyText(item.requestCertainty) }}</span>
            <span v-if="item.requestMessage">留言：{{ item.requestMessage }}</span>
            <div v-if="item.requestStatus === 'approved'" class="contact-box">
              <span v-if="item.contactNote">联系：{{ item.contactNote }}</span>
              <span v-if="item.creator && item.creator.wechat">微信号：{{ item.creator.wechat }}</span>
            </div>
          </router-link>
          <button
            v-if="item.requestStatus === 'pending' && item.requestId"
            class="btn btn-ghost mini"
            type="button"
            @click="withdraw(item)"
          >撤回申请</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '../api'

const loading = ref(true)
const created = ref([])
const requested = ref([])

function statusText(status) {
  return { open: '开放中', closed: '已满员', cancelled: '已取消' }[status] || status
}

function requestStatusText(status) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝', withdrawn: '已撤回' }[status] || status
}

function certaintyText(value) {
  return { confirmed: '确定参加', tentative: '待确认', chat_first: '想先沟通' }[value] || value
}

function sessionPlace(item) {
  return [item.city, item.area, item.address].filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  const res = await api.get('/api/my/sessions')
  loading.value = false
  if (res.code === 0 && res.data) {
    created.value = res.data.created || []
    requested.value = res.data.requested || []
  } else {
    alert(res.message || '加载失败')
  }
}

async function withdraw(item) {
  const res = await api.patch(`/api/session-requests/${item.requestId}/withdraw`, {})
  if (res.code === 0) await load()
  else alert(res.message || '撤回失败')
}

onMounted(load)
</script>

<style scoped>
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
section { margin-top: 24px; }
h2 { font-size: 16px; margin: 0 0 12px; }
.small-empty { padding: 24px 12px; }
.session-card { display: flex; flex-direction: column; gap: 6px; color: inherit; margin-bottom: 10px; }
.session-link { display: flex; flex-direction: column; gap: 6px; color: inherit; }
.session-card span { color: #a1a1aa; font-size: 13px; }
.session-card em { color: #c4b5fd; font-style: normal; font-size: 13px; }
.count-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.count-row span { color: #86efac; background: rgba(34,197,94,0.12); border-radius: 8px; padding: 3px 7px; font-size: 12px; }
.card-actions { display: flex; gap: 8px; margin-top: 8px; }
.contact-box { display: flex; flex-direction: column; gap: 4px; border: 1px solid #27272a; border-radius: 10px; padding: 10px; background: #0f0f12; }
.requested-card { gap: 12px; }
.mini { align-self: flex-start; padding: 6px 10px; border-radius: 8px; font-size: 12px; }
</style>
