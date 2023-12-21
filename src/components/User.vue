<template>
  <div v-if="profile" class="flex items-center gap-x-3">
    <div class="w-full flex items-center gap-x-2 rounded-xl py-2 pl-3 transition-colors w-full text-sm truncate" target="_blank">
      <img class="h-6 w-6 rounded-full" :src="profile.avatar_url" alt="Profile picture"/>
      <div class="text-left overflow-hidden font-medium truncate">{{ profile.name }}</div>
    </div>
    <button class="btn-icon-secondary group relative" @click="logout()">
      <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 17L21 12M21 12L16 7M21 12H9M9 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="tooltip-top-right">Sign out</div>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import github from '@/services/github';

const profile = ref(null);
const router = useRouter();

onMounted(async () => {
  profile.value = await github.getProfile();
});

const logout = async () => {
  await github.logout();
  router.push('/login');
};
</script>