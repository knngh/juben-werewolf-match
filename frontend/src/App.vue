<template>
  <div class="app">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <nav v-if="userStore.isLoggedIn && $route.meta.auth" class="bottom-nav">
      <router-link to="/discover" class="nav-item">发现</router-link>
      <router-link to="/matches" class="nav-item">匹配</router-link>
      <router-link to="/profile" class="nav-item">我的</router-link>
    </nav>
  </div>
</template>

<script setup>
import { useUserStore } from './stores/user'
const userStore = useUserStore()
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
  color: #71717a; font-size: 14px; font-weight: 500;
  padding: 8px 16px; border-radius: 8px;
}
.nav-item.router-link-active { color: #a78bfa; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
