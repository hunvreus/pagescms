import { createRouter, createWebHistory } from 'vue-router'
import github from '@/services/github';
import Content from '@/components/Content.vue'
import Editor from '@/components/file/Editor.vue'
import Media from '@/components/Media.vue'
import LoginView from '@/views/LoginView.vue'
import RepoView from '@/views/RepoView.vue'
import SelectRepoView from '@/views/SelectRepoView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: SelectRepoView
    },
    {
      name: 'repo-no-branch',
      path: '/:owner/:repo',
      component: RepoView,
      props: true
    },
    {
      name: 'repo',
      path: '/:owner/:repo/:branch',
      component: RepoView,
      props: true,
      children: [
        {
          name: 'content-root',
          path: 'content',
          component: Content,
          props: true
        },
        {
          name: 'content',
          path: 'content/:name',
          component: Content,
          props: true,
          children: [
            {
              name: 'edit',
              path: 'edit/:path',
              component: Editor,
              props: true
            },
            {
              name: 'new',
              path: 'new/:path?',
              component: Editor,
              props: route => ({
                ...route.params,
                isNew: true
              })
            }
          ]
        },
        {
          name: 'media',
          path: 'media/:path?',
          component: Media,
          props: true
        },
        {
          name: 'settings',
          path: 'settings',
          component: Editor,
          props: route => ({
            ...route.params,
            path: '.pages.yml',
            title: 'Settings'
          })
        },
        {
          path: '',
          name: 'repo-default',
          redirect: { name: 'content-root' }
        }
      ]
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home'}
    }
  ]
})

router.beforeEach(async (to, from) => {
  // Callback from GitHub Oauth
  if (to.query.access_token) {
    github.setToken(to.query.access_token);
    var redirect = localStorage.getItem('redirect') ? localStorage.getItem('redirect') : '/' ;
    localStorage.removeItem('redirect');
    return { path: redirect }    
  }
  // If the user doesn't have a token, we redirect him to log in and save the
  // initial path for later redirection
  if (to.name != 'login' && github.token.value === null) {
    localStorage.setItem('redirect', to.fullPath);
    return { path: '/login' }
  }
  // If the user is logged in, we prevent him from going to the login page
  if (to.name == 'login' && github.token.value !== null) {
    return { path: '/' }
  }
})

export default router
