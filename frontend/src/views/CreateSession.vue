<template>
  <div class="page">
    <h1 class="title">{{ isEdit ? '编辑这局' : '发布一局' }}</h1>
    <p class="subtitle">{{ isEdit ? '调整时间、人数、预算和说明' : '只面向桌游类搭子，不接商家和棋牌局' }}</p>

    <div v-if="loading" class="loading">加载中...</div>
    <form v-else class="card" @submit.prevent="submit">
      <div class="field">
        <label for="gameType">类型</label>
        <select id="gameType" v-model="form.gameType" class="input">
          <option value="">请选择</option>
          <option v-for="type in options.gameTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div class="field">
        <label for="title">标题</label>
        <input id="title" v-model.trim="form.title" class="input" maxlength="40" placeholder="如：周五晚新手友好狼人杀" />
      </div>
      <div class="row">
        <div class="field">
          <label for="city">城市</label>
          <input id="city" v-model.trim="form.city" class="input" placeholder="上海" @input="clearSelectedLocation" />
        </div>
        <div class="field">
          <label for="area">区域</label>
          <input id="area" v-model.trim="form.area" class="input" placeholder="静安" @input="clearSelectedLocation" />
        </div>
      </div>
      <div class="field">
        <label for="address">地点</label>
        <div class="location-search">
          <input
            id="address"
            v-model.trim="form.address"
            class="input"
            maxlength="100"
            placeholder="输入地点或商圈，如人民广场"
            @input="clearSelectedLocation"
          />
          <button class="btn btn-ghost location-btn" type="button" :disabled="geoSearching" @click="searchPlaces">
            {{ geoSearching ? '搜索中' : '搜索' }}
          </button>
        </div>
        <p v-if="selectedLocationText" class="location-hint">{{ selectedLocationText }}</p>
        <p v-else-if="geoMessage" class="location-hint">{{ geoMessage }}</p>
        <div v-if="geoResults.length" class="place-list">
          <button v-for="place in geoResults" :key="`${place.lng}-${place.lat}-${place.name}`" type="button" @click="selectPlace(place)">
            <strong>{{ place.name }}</strong>
            <span>{{ place.city }}{{ place.area ? ` · ${place.area}` : '' }}{{ place.address ? ` · ${place.address}` : '' }}</span>
          </button>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="playDate">日期</label>
          <input id="playDate" v-model="form.playDate" type="date" class="input" />
        </div>
        <div class="field">
          <label for="playTime">时间</label>
          <input id="playTime" v-model="form.playTime" type="time" class="input" />
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="playMode">玩法</label>
          <select id="playMode" v-model="form.playMode" class="input">
            <option v-for="mode in options.playModes" :key="mode" :value="mode">{{ mode }}</option>
          </select>
        </div>
        <div class="field">
          <label for="budgetRange">预算</label>
          <select id="budgetRange" v-model="form.budgetRange" class="input">
            <option value="">看局而定</option>
            <option v-for="range in options.budgetRanges" :key="range" :value="range">{{ range }}</option>
          </select>
        </div>
      </div>
      <div class="row people-row">
        <div class="field">
          <label for="minPlayers">最低人数</label>
          <input id="minPlayers" v-model.number="form.minPlayers" type="number" min="2" max="30" class="input" />
        </div>
        <div class="field">
          <label for="currentPlayers">已有人数</label>
          <input id="currentPlayers" v-model.number="form.currentPlayers" type="number" min="1" max="30" class="input" />
          <p v-if="approvedMinimum > 1" class="field-hint">已通过 {{ approvedMinimum - 1 }} 人，已有人数至少 {{ approvedMinimum }}</p>
        </div>
        <div class="field">
          <label for="maxPlayers">目标人数</label>
          <input id="maxPlayers" v-model.number="form.maxPlayers" type="number" min="2" max="30" class="input" />
        </div>
      </div>
      <div class="field">
        <label for="tags">标签</label>
        <input id="tags" v-model.trim="tagText" class="input" placeholder="新手友好, 阵营, 不鸽" />
      </div>
      <div class="field">
        <label for="note">局说明</label>
        <textarea id="note" v-model.trim="form.note" class="input textarea" maxlength="500" placeholder="说清楚玩法、氛围、是否接受新手"></textarea>
      </div>
      <div class="field">
        <label for="contactNote">通过后联系方式说明</label>
        <textarea id="contactNote" v-model.trim="form.contactNote" class="input textarea" maxlength="200" placeholder="如：通过后拉微信群，或发微信号"></textarea>
      </div>
      <button class="btn btn-primary submit" type="submit" :disabled="submitting">
        {{ submitting ? (isEdit ? '保存中...' : '发布中...') : (isEdit ? '保存' : '发布') }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import api from '../api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const options = ref({ gameTypes: [], playModes: ['线下'], budgetRanges: [] })
const tagText = ref('')
const loading = ref(false)
const submitting = ref(false)
const geoSearching = ref(false)
const geoResults = ref([])
const geoMessage = ref('')
const approvedMinimum = ref(1)
const isEdit = computed(() => !!route.params.id)
const form = reactive({
  gameType: '',
  title: '',
  city: '',
  area: '',
  address: '',
  locationLng: '',
  locationLat: '',
  playDate: '',
  playTime: '',
  playMode: '线下',
  budgetRange: '',
  minPlayers: 2,
  maxPlayers: 6,
  currentPlayers: 1,
  note: '',
  contactNote: '',
})
const selectedLocationText = computed(() => {
  if (!form.locationLng || !form.locationLat) return ''
  return `已选坐标：${form.locationLng}, ${form.locationLat}`
})

async function loadOptions() {
  const res = await api.get('/api/options')
  if (res.code === 0 && res.data) options.value = res.data
}

async function loadSession() {
  loading.value = true
  const res = await api.get(`/api/sessions/${route.params.id}`)
  loading.value = false
  if (res.code !== 0 || !res.data) {
    alert(res.message || '加载失败')
    router.replace('/sessions')
    return
  }
  const session = res.data
  const currentUserId = userStore.user?.id || userStore.user?.userId
  if (session.creatorUserId !== currentUserId) {
    alert('只能编辑自己发布的局')
    router.replace(`/sessions/${route.params.id}`)
    return
  }

  form.gameType = session.gameType || ''
  form.title = session.title || ''
  form.city = session.city || ''
  form.area = session.area || ''
  form.address = session.address || ''
  form.locationLng = session.location?.lng || ''
  form.locationLat = session.location?.lat || ''
  form.playDate = session.playDate || ''
  form.playTime = session.playTime || ''
  form.playMode = session.playMode || '线下'
  form.budgetRange = session.budgetRange || ''
  form.minPlayers = session.minPlayers || 2
  form.maxPlayers = session.maxPlayers || 6
  form.currentPlayers = session.currentPlayers || 1
  form.note = session.note || ''
  form.contactNote = session.contactNote || ''
  approvedMinimum.value = (session.requestCounts?.approved || 0) + 1
  tagText.value = (session.tags || []).join(', ')
}

function clearSelectedLocation() {
  form.locationLng = ''
  form.locationLat = ''
  geoMessage.value = ''
}

async function searchPlaces() {
  const keyword = form.address || form.area || form.city
  if (!keyword) {
    geoMessage.value = '先输入城市、区域或地点关键词'
    return
  }

  geoSearching.value = true
  geoResults.value = []
  geoMessage.value = ''
  const query = new URLSearchParams({ keyword })
  if (form.city) query.set('city', form.city)
  const res = await api.get(`/api/geo/search?${query.toString()}`)
  geoSearching.value = false

  if (res.code === 0 && Array.isArray(res.data)) {
    geoResults.value = res.data
    geoMessage.value = res.data.length ? '' : '没有找到地点，换个关键词试试'
  } else {
    geoMessage.value = res.message || '地点搜索失败'
  }
}

function selectPlace(place) {
  form.city = place.city || form.city
  form.area = place.area || form.area
  form.address = place.address || place.name || form.address
  form.locationLng = place.lng
  form.locationLat = place.lat
  geoResults.value = []
  geoMessage.value = `已选：${place.name}`
}

function validate() {
  if (!form.gameType) return '请选择类型'
  if (!form.title) return '请填写标题'
  if (!form.city) return '请填写城市'
  if (!form.playDate || !form.playTime) return '请选择日期和时间'
  if (form.minPlayers > form.maxPlayers) return '最低人数不能大于目标人数'
  if (form.currentPlayers > form.maxPlayers) return '已有人数不能大于目标人数'
  if (form.currentPlayers < approvedMinimum.value) return `已有人数不能小于 ${approvedMinimum.value}`
  return ''
}

async function submit() {
  const error = validate()
  if (error) { alert(error); return }

  submitting.value = true
  const payload = {
    ...form,
    tags: tagText.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
  }
  const res = isEdit.value
    ? await api.patch(`/api/sessions/${route.params.id}`, payload)
    : await api.post('/api/sessions', payload)
  submitting.value = false

  if (res.code === 0 && res.data) router.replace(`/sessions/${res.data.id}`)
  else alert(res.message || (isEdit.value ? '保存失败' : '发布失败'))
}

onMounted(async () => {
  await loadOptions()
  if (isEdit.value) await loadSession()
})
</script>

<style scoped>
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.people-row { grid-template-columns: repeat(3, 1fr); }
.location-search { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: stretch; }
.location-btn { padding: 0 14px; border-radius: 10px; white-space: nowrap; }
.location-hint { margin: 8px 0 0; color: #a1a1aa; font-size: 12px; line-height: 1.5; }
.field-hint { margin: 6px 0 0; color: #a1a1aa; font-size: 12px; line-height: 1.4; }
.place-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.place-list button { text-align: left; border: 1px solid #27272a; border-radius: 10px; background: #0f0f12; color: #e4e4e7; padding: 10px 12px; cursor: pointer; }
.place-list strong { display: block; font-size: 13px; margin-bottom: 4px; }
.place-list span { display: block; color: #a1a1aa; font-size: 12px; line-height: 1.4; }
.submit { width: 100%; margin-top: 8px; }
button[disabled] { opacity: 0.7; cursor: not-allowed; }
</style>
