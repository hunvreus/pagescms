<template>
  <!-- Loading screen -->
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <!-- Config error -->
  <template v-if="status == 'error'">
    <div class="error">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Something's not right.</h1>
        <p class="text-neutral-400 dark:text-neutral-500 mb-6">We couldn't retrieve the list of branches for this repository.</p>
        <div class="flex gap-x-2 justify-center">
          <button class="btn-primary" @click="window.location.reload()">Reload the page</button>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <!-- Branches -->
    <div class="flex items-center gap-x-2">
      <div class="relative w-full">
        <input v-model="name" type="text" placeholder="Search for branches by name" class="input w-full !pr-8 placeholder-neutral-400 dark:placeholder-neutral-500"/>
        <div class="absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
          <Icon name="Search" class="h-4 w-4 stroke-2 shrink-0"/>
        </div>
      </div>
      <button class="btn-primary" :disabled="!isValidNewBranchName" @click="create">Create</button>
    </div>
    <div class="h-[352px] mt-3 overflow-auto custom-scrollbar" :class="[ props.componentClass ]">
      <ul v-if="displayedBranches?.length > 0" class="flex flex-col gap-y-1">
        <li v-for="branch in displayedBranches">
          <router-link :to="{ name: route.name, params: {...route.params, branch: branch.name }}" class="link w-full" :class="[ repoStore.branch === branch.name ? 'bg-neutral-100 dark:bg-neutral-750 cursor-not-allowed' : '' ]">
            <div class="flex gap-x-2 items-center w-full">
              <div v-if="branch.protected" class="group relative flex items-center">
                <Icon name="ShieldAlert" class="h-4 w-4 stroke-2 shrink-0"/>
                <div class="tooltip-right">Protected</div>
              </div>
              <div class="truncate font-medium">{{ branch.name }}</div>
              <Icon v-if="branch.name === repoStore.branch" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
            </div>
          </router-link>
        </li>
      </ul>
      <div v-else class="text-center rounded-xl bg-neutral-100 dark:bg-neutral-850 p-6 h-full flex items-center">
        <div class="w-full">
          <h2 class="font-semibold tracking-tight">No matching branch.</h2>
          <p class="text-neutral-400 dark:text-neutral-500 mb-6">There are no branches with a name containing your input You can create a new branch with this name using the button above.</p>
        </div>
      </div>
    </div>
  </template>
  <!-- Waiting overlay -->
  <Teleport to="body">
    <div class="waiting" v-show="status === 'creating'"></div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/utils/Icon.vue';
import notifications from '@/services/notifications';
import github from '@/services/github';

const route = useRoute();
const router = useRouter();

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null });

const name = ref('');
const branches = ref([]);
const displayedBranches = computed(() => {
  return branches.value.filter(branch => 
    branch.name.toLowerCase().includes(name.value.trim().toLowerCase())
  );
});
const status = ref('');

const props = defineProps({
  componentClass: { type: String, default: '' },
});

const isValidNewBranchName = computed(() => {
  if (!name.value || name.value.length > 255) return false;
  if (branches.value.find(branch => branch.name === name.value)) return false;
  const validBranchRegex = /^(?!\/|.*(?:\/\.|\/\/|\.\.|@{|\\))[^\040\177 ~^:?*\[]+(?<!\.|\/)$/;;
  return validBranchRegex.test(name.value);
});

const create = async () => {
  status.value = 'creating';
  const newBranch = await github.createBranch(repoStore.owner, repoStore.repo, repoStore.branch, name.value);
  if (!newBranch) {
    notifications.notify(`Branch "${name.value}" couldn't be created from "${repoStore.branch}".`, 'error');
  } else {
    notifications.notify(`Branch "${name.value}" was successfully created from "${repoStore.branch}".`, 'success');
    router.push({ name: route.name, params: {...route.params, branch: name.value }});
  }
  status.value = '';
};

const setBranches = async () => {
  status.value = 'loading';
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const branchPage = await github.getBranches(repoStore.owner, repoStore.repo, perPage, page);
    if (!branchPage) {
      notifications.notify(`Failed to fetch branches.`, 'error');
      status.value = 'error';
      return;
    }
    if (branchPage.length === 0) break;
    branches.value.push(...branchPage);
    
    hasMore = branchPage.length === perPage;
    page++;
  }
  status.value = '';
};

onMounted(async () => {
  setBranches();
});
</script>