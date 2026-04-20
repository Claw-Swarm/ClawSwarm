import { createRouter, createWebHistory } from 'vue-router'
import ChatLayout from '@/views/chat/ChatLayout.vue'
import { useAuthStore } from '@/stores/authStore'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      redirect: '/chat'
    },
    {
      path: '/chat',
      component: ChatLayout,
      children: [
        {
          path: '',
          component: () => import('@/views/chat/ChatWelcome.vue')
        },
        {
          path: 'room/:id',
          component: () => import('@/views/chat/RoomView.vue'),
          meta: { title: 'Room' }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  const authStore = useAuthStore()
  if (!authStore.token) return '/login'
})

export default router
