<template>
  <div class="page">
    <h1 class="title">我的资料</h1>
    <p class="subtitle">完善偏好，匹配更准</p>
    <div class="profile-links">
      <router-link class="btn btn-ghost" to="/my-sessions">我的局</router-link>
      <router-link class="btn btn-ghost" to="/sessions/new">发布一局</router-link>
      <router-link class="btn btn-ghost" to="/notifications">通知</router-link>
    </div>
    <div class="card completion-card">
      <div class="completion-head">
        <strong>资料完整度</strong>
        <span>{{ completeness.score }}%</span>
      </div>
      <div class="progress"><i :style="{ width: `${completeness.score}%` }"></i></div>
      <p v-if="completeness.missing.length" class="completion-text">
        还差：{{ completeness.missing.map((item) => item.label).join('、') }}
      </p>
      <p v-else class="completion-text">资料已完整，推荐会优先使用你的偏好。</p>
    </div>
    <div class="card">
      <div class="suggestions">
        <button class="btn btn-ghost suggestion-btn" type="button" @click="applyStarterProfile">套用新手推荐</button>
      </div>
      <div class="field">
        <label>常玩类型</label>
        <div class="chips">
          <button
            v-for="t in options.gameTypes"
            :key="t"
            type="button"
            :class="['chip', profile.gameTypes && profile.gameTypes.includes(t) ? 'active' : '']"
            @click="toggle(profile.gameTypes, t)"
          >{{ t }}</button>
        </div>
      </div>
      <div class="field">
        <label>游玩风格</label>
        <div class="chips">
          <button
            v-for="s in options.playStyles"
            :key="s"
            type="button"
            :class="['chip', profile.playStyles && profile.playStyles.includes(s) ? 'active' : '']"
            @click="toggle(profile.playStyles, s)"
          >{{ s }}</button>
        </div>
      </div>
      <div class="field">
        <label>常有空的时间</label>
        <div class="chips">
          <button
            v-for="time in options.availabilityOptions"
            :key="time"
            type="button"
            :class="['chip', profile.availability && profile.availability.includes(time) ? 'active' : '']"
            @click="toggle(profile.availability, time)"
          >{{ time }}</button>
        </div>
      </div>
      <div class="field">
        <label>偏好角色</label>
        <div class="chips">
          <button
            v-for="r in options.preferredRoles"
            :key="r"
            type="button"
            :class="['chip', profile.preferredRoles && profile.preferredRoles.includes(r) ? 'active' : '']"
            @click="toggle(profile.preferredRoles, r)"
          >{{ r }}</button>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label>预算偏好</label>
          <select v-model="profile.budgetRange" class="input">
            <option value="">暂不填写</option>
            <option v-for="range in options.budgetRanges" :key="range" :value="range">{{ range }}</option>
          </select>
        </div>
        <div class="field">
          <label>人数偏好</label>
          <select v-model="profile.playerCountRange" class="input">
            <option value="">暂不填写</option>
            <option v-for="range in options.playerCountRanges" :key="range" :value="range">{{ range }}</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>线上/线下</label>
        <div class="chips">
          <button
            v-for="mode in options.playModes"
            :key="mode"
            type="button"
            :class="['chip', profile.playModes && profile.playModes.includes(mode) ? 'active' : '']"
            @click="toggle(profile.playModes, mode)"
          >{{ mode }}</button>
        </div>
      </div>
      <div class="field">
        <label>常玩频率</label>
        <input v-model="profile.playFreq" placeholder="如：每周1-2次" class="input" />
      </div>
      <div class="field">
        <label>所在城市</label>
        <input v-model="profile.city" placeholder="如：北京" class="input" />
      </div>
      <div class="field">
        <label>个人简介</label>
        <textarea v-model="profile.intro" placeholder="介绍一下自己，方便同好认识你" class="input textarea" rows="3"></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%; margin-top:8px;" @click="save">保存</button>
    </div>
    <button class="btn btn-ghost logout" @click="logout">退出登录</button>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import api from '../api'

const router = useRouter()
const userStore = useUserStore()
const options = ref({
  gameTypes: [],
  playStyles: [],
  preferredRoles: [],
  availabilityOptions: [],
  budgetRanges: [],
  playerCountRanges: [],
  playModes: [],
})
const profile = reactive({
  gameTypes: [],
  playStyles: [],
  preferredRoles: [],
  availability: [],
  budgetRange: '',
  playerCountRange: '',
  playModes: [],
  playFreq: '',
  city: '',
  intro: '',
})
const completeness = ref({ score: 0, completed: 0, total: 8, missing: [] })

function toggle(arr, item) {
  if (!arr) return
  const i = arr.indexOf(item)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(item)
}

function applyStarterProfile() {
  profile.gameTypes = ['桌游', '狼人杀']
  profile.playStyles = ['欢乐型', '社交型']
  profile.preferredRoles = ['无所谓']
  profile.availability = ['周五晚', '周末晚上']
  profile.budgetRange = '100-200'
  profile.playerCountRange = '5-8人'
  profile.playModes = ['线下']
  profile.playFreq = profile.playFreq || '每月 2-3 次'
  profile.city = profile.city || '上海'
  profile.intro = profile.intro || '新手友好，准时不鸽，想找稳定桌游搭子。'
}

async function loadOptions() {
  const res = await api.get('/api/options')
  if (res.code === 0 && res.data) options.value = res.data
}

async function loadMe() {
  const res = await api.get('/api/me')
  if (res.code === 0 && res.data) {
    const p = res.data.profile || {}
    profile.gameTypes = p.gameTypes || []
    profile.playStyles = p.playStyles || []
    profile.preferredRoles = p.preferredRoles || []
    profile.availability = p.availability || []
    profile.budgetRange = p.budgetRange || ''
    profile.playerCountRange = p.playerCountRange || ''
    profile.playModes = p.playModes || []
    profile.playFreq = p.playFreq || ''
    profile.city = p.city || ''
    profile.intro = p.intro || ''
    completeness.value = res.data.profileCompleteness || completeness.value
  }
}

async function save() {
  const res = await api.post('/api/profile', profile)
  if (res.code === 0) {
    await loadMe()
    await userStore.fetchMe()
    alert('保存成功')
  }
  else alert(res.message || '保存失败')
}

function logout() {
  userStore.logout()
  router.replace('/login')
}

onMounted(() => {
  loadOptions()
  loadMe()
})
</script>

<style scoped>
.title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.subtitle { color: #71717a; font-size: 14px; margin: 0 0 20px; }
.profile-links { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.profile-links .btn { text-align: center; }
.suggestions { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.suggestion-btn { padding: 7px 12px; border-radius: 8px; font-size: 12px; }
.completion-card { margin-bottom: 16px; }
.completion-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; }
.completion-head span { color: #86efac; font-weight: 700; }
.progress { height: 8px; border-radius: 999px; background: #27272a; overflow: hidden; }
.progress i { display: block; height: 100%; background: #22c55e; border-radius: inherit; }
.completion-text { margin: 10px 0 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { margin-bottom: 20px; }
.field label { display: block; font-size: 13px; color: #71717a; margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 12px; border-radius: 20px; border: 1px solid #27272a; background: #0f0f12; color: #a1a1aa; font-size: 13px; cursor: pointer; }
.chip.active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #27272a; background: #0f0f12; color: #e4e4e7; }
.textarea { resize: vertical; min-height: 72px; }
.logout { margin-top: 24px; width: 100%; }
</style>
