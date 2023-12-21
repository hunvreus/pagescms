<template>
  <div class="h-screen flex flex-col">
    <div class="flex h-full justify-center items-center">
      <div class="max-w-[500px] w-full p-4 lg:p-8">
        <h1 class="font-semibold text-xl lg:text-2xl mb-6 text-center">Select a repository</h1>
        <repo-picker/>
      </div>
    </div>
    <div class="border-t border-neutral-200 px-3 py-2.5 lg:px-4 lg:py-3">
      <User/>
    </div>
  </div>
</template>

<script setup>
import RepoPicker from '@/components/RepoPicker.vue';
import User from '@/components/User.vue';
</script>