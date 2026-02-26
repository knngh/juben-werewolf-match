<template>
  <div class="page">
    <h1 class="title">我的资料</h1>
    <p class="subtitle">完善偏好，匹配更准</p>
    <div class="card">
      <div class="field">
        <label>常玩类型</label>
        <div class="chips">
          <button
            v-for="t in options.gameTypes"
            :key="t"
            type="button"
            :class="['chip', profile.gameTypes && profile.gameTypes.includes(t) ? 'active' : '']"
            @click="toggle(profile.gameTypes, t, 'gameTypes')"
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
            @click="toggle(profile.playStyles, s, 'playStyles')"
          >{{ s }}</button>
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
            @click="toggle(profile.preferredRoles, r, 'preferredRoles')"
          >{{ r }}</button>
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
const options = ref({ gameTypes: [], playStyles: [], preferredRoles: [] })
const profile = reactive({
  gameTypes: [],
  playStyles: [],
  preferredRoles: [],
  playFreq: '',
  city: '',
  intro: '',
})

function toggle(arr, item, key) {
  if (!profile[key]) profile[key] = []
  const i = profile[key].indexOf(item)
  if (i >= 0) profile[key].splice(i, 1)
  else profile[key].push(item)
}

async function loadOptions() {
  const res = await api.get('/api/options')
  if (res.data && res.data.data) options.value = res.data.data
}

async function loadMe() {
  const res = await api.get('/api/me')
  if (res.data && res.data.data) {
    const p = res.data.data.profile || {}
    profile.gameTypes = p.gameTypes || []
    profile.playStyles = p.playStyles || []
    profile.preferredRoles = p.preferredRoles || []
    profile.playFreq = p.playFreq || ''
    profile.city = p.city || ''
    profile.intro = p.intro || ''
  }
}

async function save() {
  const res = await api.post('/api/profile', profile)
  if (res.code === 0) alert('保存成功')
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
.field { margin-bottom: 20px; }
.field label { display: block; font-size: 13px; color: #71717a; margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 12px; border-radius: 20px; border: 1px solid #27272a; background: #0f0f12; color: #a1a1aa; font-size: 13px; cursor: pointer; }
.chip.active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #27272a; background: #0f0f12; color: #e4e4e7; }
.textarea { resize: vertical; min-height: 72px; }
.logout { margin-top: 24px; width: 100%; }
</style>
