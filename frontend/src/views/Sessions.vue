<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h1 class="title">找桌游局</h1>
        <p class="subtitle">剧本杀、狼人杀、血染钟楼、桌游、跑团</p>
      </div>
      <router-link class="btn btn-primary small-btn" to="/sessions/new">发布</router-link>
    </div>

    <div v-if="needsProfile" class="card onboarding-card">
      <div>
        <strong>先完善资料，推荐会更准</strong>
        <p>还差：{{ profileCompleteness.missing.map((item) => item.label).join('、') }}</p>
      </div>
      <router-link class="btn btn-ghost mini-link" to="/profile">去完善</router-link>
    </div>

    <div class="card filters">
      <select v-model="filters.gameType" class="input" @change="load">
        <option value="">全部类型</option>
        <option v-for="type in options.gameTypes" :key="type" :value="type">{{ type }}</option>
      </select>
      <select v-model="filters.playMode" class="input" @change="load">
        <option value="">线上/线下</option>
        <option v-for="mode in options.playModes" :key="mode" :value="mode">{{ mode }}</option>
      </select>
      <select v-model="filters.budgetRange" class="input" @change="load">
        <option value="">全部预算</option>
        <option v-for="range in options.budgetRanges" :key="range" :value="range">{{ range }}</option>
      </select>
      <div class="row">
        <input v-model="filters.dateFrom" type="date" class="input" aria-label="开始日期" @change="manualDateLoad" />
        <input v-model="filters.dateTo" type="date" class="input" aria-label="结束日期" @change="manualDateLoad" />
      </div>
      <div class="preset-row">
        <button v-for="item in datePresets" :key="item.value" type="button" @click="applyDatePreset(item.value)">
          {{ item.label }}
        </button>
      </div>
      <div class="row">
        <select v-model="filters.minSeats" class="input" @change="load">
          <option value="">剩余席位</option>
          <option value="1">至少 1 位</option>
          <option value="2">至少 2 位</option>
          <option value="3">至少 3 位</option>
        </select>
        <select v-model="filters.onlyMatched" class="input" @change="load">
          <option value="">全部排序</option>
          <option value="1">只看匹配</option>
        </select>
      </div>
      <input v-model.trim="filters.city" class="input" placeholder="城市，如上海" @keyup.enter="load" />
      <input v-model.trim="filters.q" class="input" placeholder="关键词，如新手友好、阵营" @keyup.enter="load" />
      <button class="btn btn-ghost" type="button" @click="useNearby">{{ nearbyLoading ? '定位中...' : '附近 20km' }}</button>
      <button class="btn btn-ghost" type="button" @click="load">筛选</button>
    </div>

    <div class="quick-links">
      <router-link to="/my-sessions">我的局</router-link>
      <button type="button" @click="resetFilters">清空筛选</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="list.length === 0" class="empty">暂无开放中的局，先发布一局吧</div>
    <div v-else class="session-list">
      <router-link v-for="item in list" :key="item.id" :to="`/sessions/${item.id}`" class="card session-card">
        <div class="card-head">
          <span class="type">{{ item.gameType }}</span>
          <span class="seats">{{ item.currentPlayers }}/{{ item.maxPlayers }} 人</span>
        </div>
        <h2>{{ item.title }}</h2>
        <p class="meta">
          {{ sessionPlace(item) }} · {{ item.playDate }} {{ item.playTime }}
          · {{ item.playMode }}{{ item.budgetRange ? ` · ${item.budgetRange}` : '' }}
          {{ item.distanceKm !== undefined ? ` · ${item.distanceKm}km` : '' }}
        </p>
        <div v-if="item.matchReasons && item.matchReasons.length" class="match-reasons">
          <span v-for="reason in item.matchReasons" :key="reason">{{ reason }}</span>
        </div>
        <div v-if="item.tags && item.tags.length" class="tags">
          <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <p v-if="item.note" class="note">{{ item.note }}</p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '../api'

const options = ref({ gameTypes: [], playModes: [], budgetRanges: [] })
const filters = reactive({
  gameType: '',
  playMode: '',
  budgetRange: '',
  dateFrom: '',
  dateTo: '',
  datePreset: '',
  minSeats: '',
  onlyMatched: '',
  city: '',
  q: '',
  nearLng: '',
  nearLat: '',
  maxDistanceKm: '',
})
const list = ref([])
const loading = ref(true)
const nearbyLoading = ref(false)
const profileCompleteness = ref(null)
const datePresets = [
  { label: '今天', value: 'today' },
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '未来7天', value: 'next7' },
]
const needsProfile = computed(() => {
  return profileCompleteness.value &&
    profileCompleteness.value.score < 100 &&
    profileCompleteness.value.missing.length > 0
})

function toQuery(params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

async function loadOptions() {
  const res = await api.get('/api/options')
  if (res.code === 0 && res.data) options.value = res.data
}

async function loadMe() {
  const res = await api.get('/api/me')
  if (res.code === 0 && res.data) profileCompleteness.value = res.data.profileCompleteness || null
}

async function load() {
  loading.value = true
  const res = await api.get(`/api/sessions${toQuery(filters)}`)
  loading.value = false
  if (res.code === 0 && Array.isArray(res.data)) list.value = res.data
  else alert(res.message || '加载失败')
}

function sessionPlace(item) {
  return [item.city, item.area, item.address].filter(Boolean).join(' · ')
}

function applyDatePreset(value) {
  filters.datePreset = value
  filters.dateFrom = ''
  filters.dateTo = ''
  load()
}

function manualDateLoad() {
  filters.datePreset = ''
  load()
}

function useNearby() {
  if (!navigator.geolocation) {
    alert('当前浏览器不支持定位')
    return
  }
  nearbyLoading.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      filters.nearLng = String(position.coords.longitude)
      filters.nearLat = String(position.coords.latitude)
      filters.maxDistanceKm = '20'
      nearbyLoading.value = false
      load()
    },
    () => {
      nearbyLoading.value = false
      alert('定位失败，可以继续按城市筛选')
    },
    { enableHighAccuracy: false, timeout: 5000 }
  )
}

function resetFilters() {
  filters.gameType = ''
  filters.playMode = ''
  filters.budgetRange = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  filters.datePreset = ''
  filters.minSeats = ''
  filters.onlyMatched = ''
  filters.city = ''
  filters.q = ''
  filters.nearLng = ''
  filters.nearLat = ''
  filters.maxDistanceKm = ''
  load()
}

onMounted(async () => {
  await loadOptions()
  await loadMe()
  await load()
})
</script>

<style scoped>
.topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.small-btn { padding: 8px 14px; border-radius: 10px; white-space: nowrap; }
.onboarding-card { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.onboarding-card strong { display: block; font-size: 14px; margin-bottom: 4px; }
.onboarding-card p { margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.5; }
.mini-link { padding: 7px 10px; border-radius: 8px; font-size: 12px; white-space: nowrap; }
.filters { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 12px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.preset-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.preset-row button { border: 1px solid #27272a; border-radius: 8px; background: #0f0f12; color: #a1a1aa; padding: 8px 4px; font-size: 12px; cursor: pointer; }
.quick-links { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 16px; font-size: 13px; }
.quick-links button { border: 0; background: transparent; color: #71717a; cursor: pointer; }
.session-list { display: flex; flex-direction: column; gap: 12px; }
.session-card { display: block; color: inherit; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.type { font-size: 12px; color: #c4b5fd; background: rgba(124,58,237,0.16); padding: 4px 8px; border-radius: 8px; }
.seats { font-size: 12px; color: #a1a1aa; }
h2 { margin: 0 0 8px; font-size: 18px; line-height: 1.3; }
.meta, .note { margin: 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
.match-reasons { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.match-reasons span { font-size: 12px; color: #86efac; background: rgba(34,197,94,0.12); border-radius: 8px; padding: 4px 8px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.tag { font-size: 12px; color: #a1a1aa; background: #27272a; border-radius: 8px; padding: 4px 8px; }
</style>
