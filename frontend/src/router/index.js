import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  { path: '/', redirect: '/sessions' },
  { path: '/login', component: () => import('../views/Login.vue'), meta: { guest: true } },
  { path: '/register', component: () => import('../views/Register.vue'), meta: { guest: true } },
  { path: '/profile', component: () => import('../views/Profile.vue'), meta: { auth: true } },
  { path: '/sessions', component: () => import('../views/Sessions.vue'), meta: { auth: true } },
  { path: '/sessions/new', component: () => import('../views/CreateSession.vue'), meta: { auth: true } },
  { path: '/sessions/:id/edit', component: () => import('../views/CreateSession.vue'), meta: { auth: true } },
  { path: '/sessions/:id', component: () => import('../views/SessionDetail.vue'), meta: { auth: true } },
  { path: '/my-sessions', component: () => import('../views/MySessions.vue'), meta: { auth: true } },
  { path: '/discover', component: () => import('../views/Discover.vue'), meta: { auth: true } },
  { path: '/matches', component: () => import('../views/Matches.vue'), meta: { auth: true } },
  { path: '/notifications', component: () => import('../views/Notifications.vue'), meta: { auth: true } },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const store = useUserStore()
  const token = store.token
  if (to.meta.auth && !token) return next('/login')
  if (to.meta.guest && token) return next('/sessions')
  next()
})

export default router
