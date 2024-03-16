<template>
  <div class="h-screen flex flex-col">
    <div class="flex h-full justify-center items-center">
      <div class="max-w-[500px] w-full p-4 lg:p-8">
        <RepoMenu :customClass="'max-h-[calc(100vh-12rem)]'"/>
      </div>
    </div>
    <div class="flex grid-x-2 border-t border-neutral-200 dark:border-neutral-750 px-3 py-2.5 lg:px-4 lg:py-3">
      <User/>
      <About/>
    </div>
  </div>
</template>

<script setup>
import RepoMenu from '@/components/repo/RepoMenu.vue';
import About from '@/components/About.vue';
import User from '@/components/User.vue';
</script>