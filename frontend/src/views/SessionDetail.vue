<template>
  <div class="page">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="!session" class="empty">这个局不存在</div>
    <template v-else>
      <router-link class="back" to="/sessions">返回找局</router-link>
      <div class="card detail-card">
        <div class="card-head">
          <span class="type">{{ session.gameType }}</span>
          <span class="status">{{ statusText(session.status) }}</span>
        </div>
        <h1 class="title">{{ session.title }}</h1>
        <p class="meta">
          {{ sessionPlace(session) }} · {{ session.playDate }} {{ session.playTime }}
          · {{ session.playMode }}{{ session.budgetRange ? ` · ${session.budgetRange}` : '' }}
        </p>
        <p class="seats">{{ session.currentPlayers }}/{{ session.maxPlayers }} 人，剩余 {{ session.seatsLeft }} 位</p>
        <div v-if="session.matchReasons && session.matchReasons.length" class="match-reasons">
          <span v-for="reason in session.matchReasons" :key="reason">{{ reason }}</span>
        </div>
        <div v-if="session.tags && session.tags.length" class="tags">
          <span v-for="tag in session.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <p v-if="session.note" class="note">{{ session.note }}</p>
        <div class="creator">发起人：{{ session.creator && session.creator.nickname }}</div>
      </div>

      <div v-if="session.contactNote || (session.creator && session.creator.wechat)" class="card contact-card">
        <h2>联系方式</h2>
        <p v-if="session.contactNote">{{ session.contactNote }}</p>
        <p v-if="session.creator && session.creator.wechat">微信号：{{ session.creator.wechat }}</p>
      </div>

      <div v-if="isCreator" class="card owner-card">
        <div class="owner-head">
          <h2>局管理</h2>
          <div class="status-actions">
            <router-link class="btn btn-ghost mini" :to="`/sessions/${session.id}/edit`">编辑</router-link>
            <button
              v-if="session.status !== 'open'"
              class="btn btn-ghost mini"
              type="button"
              @click="updateStatus('open')"
            >重新开放</button>
            <button
              v-if="session.status === 'open'"
              class="btn btn-ghost mini"
              type="button"
              @click="updateStatus('closed')"
            >标记满员</button>
            <button
              v-if="session.status !== 'cancelled'"
              class="btn btn-ghost mini danger"
              type="button"
              @click="updateStatus('cancelled')"
            >取消</button>
          </div>
        </div>
        <h2>申请列表</h2>
        <div v-if="requests.length === 0" class="muted">暂无申请</div>
        <div v-else class="request-list">
          <div v-if="approvedRequests.length" class="approved-box">
            <strong>已通过成员</strong>
            <span v-for="item in approvedRequests" :key="item.id">{{ item.user.nickname }}</span>
          </div>
          <div v-for="item in requests" :key="item.id" class="request-item">
            <div>
              <strong>{{ item.user.nickname }}</strong>
              <p class="muted">确定性：{{ certaintyText(item.certainty) }} · {{ item.createdAt }}</p>
              <p class="pref-line">{{ applicantSummary(item.user) }}</p>
              <p v-if="item.user.reliability && item.user.reliability.total" class="pref-line">
                可靠度 {{ item.user.reliability.score }}%，{{ item.user.reliability.wouldPlayAgain }} 人愿意再约
              </p>
              <p v-if="item.message">{{ item.message }}</p>
              <p class="muted">{{ requestStatusText(item.status) }}</p>
            </div>
            <div v-if="item.status === 'pending'" class="request-actions">
              <button class="btn btn-primary mini" type="button" @click="review(item, 'approved')">同意</button>
              <button class="btn btn-ghost mini" type="button" @click="review(item, 'rejected')">拒绝</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="card join-card">
        <h2>申请加入</h2>
        <p class="muted" v-if="session.requestStatus">当前状态：{{ requestStatusText(session.requestStatus) }}</p>
        <template v-if="session.canRequest">
          <select v-model="certainty" class="input">
            <option value="confirmed">确定参加</option>
            <option value="tentative">待确认</option>
            <option value="chat_first">想先沟通</option>
          </select>
          <textarea v-model.trim="message" class="input textarea" maxlength="200" placeholder="简单介绍一下自己，比如常玩类型和时间是否确定"></textarea>
          <button class="btn btn-primary submit" type="button" @click="requestJoin">{{ session.requestStatus ? '重新发送申请' : '发送申请' }}</button>
        </template>
        <p v-else-if="!session.requestStatus" class="muted">当前无法申请这个局</p>
      </div>

      <div v-if="session.requestStatus === 'approved' && session.creator" class="card feedback-card">
        <h2>局后反馈</h2>
        <label><input v-model="feedback.punctual" type="checkbox" /> 准时</label>
        <label><input v-model="feedback.friendly" type="checkbox" /> 友好</label>
        <label><input v-model="feedback.wouldPlayAgain" type="checkbox" /> 愿意再约</label>
        <button class="btn btn-ghost mini" type="button" @click="sendFeedback(session.creator.id)">保存反馈</button>
      </div>

      <div v-if="!isCreator && session.creator" class="safety-actions">
        <button class="btn btn-ghost mini danger" type="button" @click="reportCreator">举报</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../stores/user'
import api from '../api'

const route = useRoute()
const userStore = useUserStore()
const loading = ref(true)
const session = ref(null)
const requests = ref([])
const message = ref('')
const certainty = ref('confirmed')
const feedback = ref({ punctual: true, friendly: true, wouldPlayAgain: true })

const currentUserId = computed(() => userStore.user?.id || userStore.user?.userId)
const isCreator = computed(() => session.value && session.value.creatorUserId === currentUserId.value)
const approvedRequests = computed(() => requests.value.filter((item) => item.status === 'approved'))

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

function applicantSummary(user) {
  return [
    user.city,
    ...(user.gameTypes || []).slice(0, 2),
    ...(user.playModes || []),
    user.budgetRange,
    user.playerCountRange,
  ].filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  const res = await api.get(`/api/sessions/${route.params.id}`)
  loading.value = false
  if (res.code === 0) {
    session.value = res.data
    if (isCreator.value) await loadRequests()
  } else {
    alert(res.message || '加载失败')
  }
}

async function loadRequests() {
  const res = await api.get(`/api/sessions/${route.params.id}/requests`)
  if (res.code === 0 && Array.isArray(res.data)) requests.value = res.data
}

async function requestJoin() {
  const res = await api.post(`/api/sessions/${route.params.id}/requests`, { message: message.value, certainty: certainty.value })
  if (res.code === 0) {
    alert('申请已发送')
    message.value = ''
    await load()
  } else {
    alert(res.message || '申请失败')
  }
}

async function sendFeedback(toUserId) {
  const res = await api.post(`/api/sessions/${route.params.id}/feedback`, {
    toUserId,
    ...feedback.value,
  })
  if (res.code === 0) alert('反馈已保存')
  else alert(res.message || '反馈失败')
}

async function reportCreator() {
  const detail = window.prompt('简单说明举报原因')
  if (detail === null) return
  const res = await api.post('/api/reports', {
    targetUserId: session.value.creator.id,
    sessionId: session.value.id,
    reason: '其他',
    detail,
  })
  if (res.code === 0) alert('举报已提交')
  else alert(res.message || '举报失败')
}

async function updateStatus(status) {
  const res = await api.patch(`/api/sessions/${route.params.id}/status`, { status })
  if (res.code === 0 && res.data) {
    session.value = res.data
    await loadRequests()
  } else {
    alert(res.message || '状态更新失败')
  }
}

async function review(item, status) {
  const res = await api.patch(`/api/session-requests/${item.id}`, { status })
  if (res.code === 0) {
    await load()
  } else {
    alert(res.message || '操作失败')
  }
}

onMounted(load)
</script>

<style scoped>
.back { display: inline-block; margin-bottom: 14px; color: #a1a1aa; font-size: 13px; }
.detail-card, .contact-card, .owner-card, .join-card, .feedback-card { margin-bottom: 12px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.type { font-size: 12px; color: #c4b5fd; background: rgba(124,58,237,0.16); padding: 4px 8px; border-radius: 8px; }
.status, .creator, .muted { color: #a1a1aa; font-size: 13px; }
.meta, .seats, .note { color: #a1a1aa; font-size: 14px; line-height: 1.5; margin: 8px 0; }
.match-reasons { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.match-reasons span { font-size: 12px; color: #86efac; background: rgba(34,197,94,0.12); border-radius: 8px; padding: 4px 8px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.tag { font-size: 12px; color: #a1a1aa; background: #27272a; border-radius: 8px; padding: 4px 8px; }
h2 { font-size: 16px; margin: 0 0 12px; }
.owner-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.owner-head h2 { margin-bottom: 0; }
.status-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.request-list { display: flex; flex-direction: column; gap: 12px; }
.approved-box { border: 1px solid #27272a; border-radius: 10px; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
.approved-box strong { width: 100%; font-size: 13px; }
.approved-box span { color: #86efac; background: rgba(34,197,94,0.12); border-radius: 8px; padding: 3px 7px; font-size: 12px; }
.request-item { border-top: 1px solid #27272a; padding-top: 12px; display: flex; justify-content: space-between; gap: 12px; }
.request-item p { margin: 4px 0 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
.pref-line { color: #c4b5fd !important; }
.request-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.mini { padding: 6px 10px; border-radius: 8px; font-size: 12px; }
.danger { color: #fca5a5; }
.submit { width: 100%; margin-top: 12px; }
.feedback-card { display: flex; flex-direction: column; gap: 10px; }
.feedback-card label { color: #a1a1aa; font-size: 13px; }
.safety-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
</style>
