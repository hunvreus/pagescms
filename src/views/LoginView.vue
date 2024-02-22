<template>
  <div class="h-screen flex justify-center items-center bg-dneutral-200 p-4 lg:p-8">
    <div class="max-w-[360px] text-center">
      <h1 class="font-semibold text-xl lg:text-2xl mb-2">Sign in</h1>
      <p class="text-neutral-400 dark:text-neutral-500 mb-6">Sign in with your GitHub account to access your repositories. Data is saved in your browser only.</p>
      <div class="flex flex-col gap-y-4">
        <a href="/auth/login" class="btn-primary justify-center w-full !gap-x-3">
          <Icon name="Github" class="h-6 w-6 stroke-2 shrink-0"/>
          <div>Sign in with GitHub</div>
        </a>
        <button v-if="offerPat" class="btn-secondary justify-center w-full" @click="patModal.openModal()">
          Sign in with a Fine-Grained PAT
        </button>
      </div>
    </div>
  </div>
  
  <!-- Fine-grained PAT modal -->
  <Modal v-if="offerPat" ref="patModal">
    <template #header>Login with a GitHub fine-gradined PAT</template>
    <template #content>
      <p class="text-sm mb-2 -mt-1 text-neutral-400 dark:text-neutral-500">
        Enter a valid <a class="underline hover:no-underline" href="https://github.com/settings/tokens?type=beta" target="_blank">Fine-grained GitHub Personal Access Token (PAT)</a> with read and write access for the "Contents" endpoints of "Repository permissions".
      </p>
      <input type="text" v-model="patToken" class="w-full"/>
      <div v-if="patToken && !patToken.startsWith('github_pat_')" class="mt-2 text-sm text-red-500 dark:text-red-400 flex gap-x-1 items-center">
        <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
        <span>Invalid format for a GitHub fine-grained PAT.</span>
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="patModal.closeModal()">Cancel</button>
        <button class="btn-primary" :disabled="!patToken.startsWith('github_pat_')" @click="savePat()">Save</button>
      </footer>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import github from '@/services/github';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';

const router = useRouter();

const offerPat = ref(import.meta.env?.VITE_GITHUB_PAT_LOGIN === 'true');
const patModal = ref(null);
const patToken = ref('');

const savePat = () => {
  if (patToken.value.startsWith('github_pat_')) {
    github.setToken(patToken.value);
    var redirect = localStorage.getItem('redirect') ? localStorage.getItem('redirect') : '/' ;
    localStorage.removeItem('redirect');
    router.push({ path: redirect });
  }
};
</script>