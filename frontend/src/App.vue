<template>
  <div class="app">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <nav v-if="userStore.isLoggedIn && $route.meta.auth" class="bottom-nav">
      <router-link to="/sessions" class="nav-item">找局</router-link>
      <router-link to="/discover" class="nav-item">发现</router-link>
      <router-link to="/matches" class="nav-item">匹配</router-link>
      <router-link to="/profile" class="nav-item">我的<span v-if="unreadCount" class="badge">{{ unreadCount }}</span></router-link>
    </nav>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from './stores/user'
import api from './api'
const userStore = useUserStore()
const route = useRoute()
const unreadCount = ref(0)

async function loadUnread() {
  if (!userStore.isLoggedIn) {
    unreadCount.value = 0
    return
  }
  const res = await api.get('/api/notifications/unread-count')
  if (res.code === 0 && res.data) unreadCount.value = res.data.count || 0
}

watch(() => route.fullPath, loadUnread)
onMounted(loadUnread)
</script>

<style scoped>
.app { min-height: 100vh; }
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-around; align-items: center;
  height: 56px; background: #18181b; border-top: 1px solid #27272a;
  z-index: 100;
}
.nav-item {
  color: #71717a; font-size: 14px; font-weight: 500; position: relative;
  padding: 8px 16px; border-radius: 8px;
}
.nav-item.router-link-active { color: #a78bfa; }
.badge { position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; line-height: 16px; text-align: center; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
