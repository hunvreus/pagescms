<template>
  <div class="h-screen flex flex-col">
    <div class="flex h-full justify-center items-center">
      <div class="max-w-[500px] w-full p-4 lg:p-8">
        <h1 class="font-semibold text-xl lg:text-2xl mb-6 text-center">Select a repository</h1>
        <repo-picker/>
      </div>
    </div>
    <div class="flex grid-x-2 border-t border-neutral-200 dark:border-neutral-750 px-3 py-2.5 lg:px-4 lg:py-3">
      <User/>
      <About/>
    </div>
  </div>
</template>

<script setup>
import RepoPicker from '@/components/RepoPicker.vue';
import About from '@/components/About.vue';
import User from '@/components/User.vue';
</script>