<template>
  <Dropdown :elementClass="'dropdown-top flex-shrink'" :dropdownClass="'!max-w-none w-32 !right-auto left-0'">
    <template #trigger>
      <button v-if="profile" class="btn max-w-[12.5rem] group-x[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850">
        <img class="h-6 w-6 shrink-0 rounded-full -ml-1 lg:-ml-1.5" :src="profile.avatar_url" alt="Profile picture"/>
        <div class="text-left font-medium truncate">{{ profile.name || profile.login }}</div>
        <Icon name="ChevronsUpDown" class="h-4 w-4 stroke-2 shrink-0 -mr-1 lg:-mr-1.5"/>
      </button>
    </template>
    <template #content>
      <ul>
        <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400 dark:text-neutral-500">Mode</div></li>
        <li>
          <button @click="theme.setTheme('dark')" class="link w-full">
            Dark
            <Icon v-if="theme.userTheme() === 'dark'" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
          </button>
        </li>
        <li>
          <button @click="theme.setTheme('light')" class="link w-full">
            Light
            <Icon v-if="theme.userTheme() === 'light'" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
          </button>
        </li>
        <li>
          <button @click="theme.clearTheme()" class="link w-full">
            System
            <Icon v-if="!theme.userTheme()" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
          </button>
        </li>
        <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
        <li>
          <button @click="logout()" class="link w-full">
            Logout
            <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
          </button>
        </li>
      </ul>
    </template>
  </Dropdown>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import github from '@/services/github';
import theme from '@/services/theme';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';

const profile = ref(null);

const router = useRouter();

onMounted(async () => {
  profile.value = await github.getProfile();
});

const logout = async () => {
  await github.logout();
  router.push('/login');
};

defineExpose({ logout });
</script>