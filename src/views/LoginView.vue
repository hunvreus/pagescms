<template>
  <div class="h-screen flex justify-center items-center bg-dneutral-200">
    <div class="max-w-[360px] text-center">
      <h1 class="font-semibold text-xl lg:text-2xl mb-2">Sign in</h1>
      <p class="text-neutral-400 dark:text-neutral-500 mb-6">Sign in with your GitHub account to access your repositories. Data is saved in your browser only.</p>
      <a href="/auth/login" class="btn-primary justify-center w-full !gap-x-3">
        <Icon name="Github" class="h-6 w-6 stroke-2 shrink-0"/>
        <div>Sign in with GitHub</div>
      </a>
    </div>
  </div>
</template>

<script setup>
import Icon from '@/components/utils/Icon.vue';
</script>