import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  { path: '/', redirect: '/discover' },
  { path: '/login', component: () => import('../views/Login.vue'), meta: { guest: true } },
  { path: '/register', component: () => import('../views/Register.vue'), meta: { guest: true } },
  { path: '/profile', component: () => import('../views/Profile.vue'), meta: { auth: true } },
  { path: '/discover', component: () => import('../views/Discover.vue'), meta: { auth: true } },
  { path: '/matches', component: () => import('../views/Matches.vue'), meta: { auth: true } },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const store = useUserStore()
  const token = store.token
  if (to.meta.auth && !token) return next('/login')
  if (to.meta.guest && token) return next('/discover')
  next()
})

export default router
