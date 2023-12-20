<template>  
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <template v-else-if="config && config.content">
    <!-- Sidebar -->
    <div class="sidebar" :class="{ 'sidebar-active': isSidebarActive }">
      <div class="sidebar-overlay" @click="isSidebarActive = false"></div>
      <div class="sidebar-trigger" @click="isSidebarActive = true">
        <svg class="shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 12H21M3 6H21M3 18H21"/>
        </svg>
      </div>
      <div class="sidebar-content">
        <div class="flex grow flex-col overflow-y-auto border-r border-neutral-200 bg-white">
          <!-- Repository info and links -->
          <div class="px-4 py-3">
            <Dropdown>
              <template #trigger>
                <button class="border border-neutral-200 hover:bg-neutral-100 group-[.dropdown-active]:bg-neutral-100 w-full flex items-center justify-between gap-x-2 rounded-xl py-2 px-3 transition-colors">
                  <div class="flex items-center gap-x-2">
                    <img class="h-10 w-10 rounded-lg" :src="'https://github.com/' + props.owner + '.png'" alt="Owner's avatar"/>
                    <div class="text-left overflow-hidden">
                      <div class="font-medium truncate">{{ props.repo }}</div>
                      <div class="truncate text-xs">{{ props.branch }}</div>
                    </div>
                  </div>
                  <div>
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7 15L12 20L17 15M7 9L12 4L17 9"/>
                    </svg>
                  </div>
                </button>
              </template>
              <template #content>
                <ul>
                  <li><button @click.prevent="repoPickerModal.openModal(); isSidebarActive = false;" class="link w-full">Change repository</button></li>
                  <li><hr class="border-t border-neutral-150 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400">Owner</div></li>
                  <li>
                    <a class="link w-full" :href="`https://github.com/${props.owner}`" target="_blank">
                      <div class="truncate">{{ props.owner }}</div>
                      <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14"/>
                      </svg>
                    </a>
                  </li>
                  <li><hr class="border-t border-neutral-150 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400">Repository</div></li>
                  <li>
                    <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}`" target="_blank">
                      <div class="truncate">{{ props.repo }}</div>
                      <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14"/>
                      </svg>
                    </a>
                  </li>
                  <li><hr class="border-t border-neutral-150 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400">Branch</div></li>
                  <li>
                    <router-link
                      v-for="branch in branches" :to="{ name: route.name, params: {...route.params, branch: branch }}"
                      @click="isSidebarActive = false"
                      class="link w-full"
                    >
                      {{ branch }}
                      <svg v-if="branch == props.branch" class="shrink-0 h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12"/>
                      </svg>
                    </router-link>
                  </li>
                </ul>
              </template>
            </Dropdown>
          </div>
          <!-- Main navigation: Content, Media, Files and Settings -->
          <nav class="flex flex-1 flex-col px-4 pb-3 navigation">
            <ul role="list" class="flex flex-1 flex-col">
              <li>
                <ul role="list" class="space-y-1">
                  <li>
                    <div>
                      <div class="font-medium text-neutral-950 flex items-center gap-x-2 rounded-xl py-2 px-3 transition-colors">
                        <svg class="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14 11H8M10 15H8M16 7H8M20 6.8V17.2C20 18.8802 20 19.7202 19.673 20.362C19.3854 20.9265 18.9265 21.3854 18.362 21.673C17.7202 22 16.8802 22 15.2 22H8.8C7.11984 22 6.27976 22 5.63803 21.673C5.07354 21.3854 4.6146 20.9265 4.32698 20.362C4 19.7202 4 18.8802 4 17.2V6.8C4 5.11984 4 4.27976 4.32698 3.63803C4.6146 3.07354 5.07354 2.6146 5.63803 2.32698C6.27976 2 7.11984 2 8.8 2H15.2C16.8802 2 17.7202 2 18.362 2.32698C18.9265 2.6146 19.3854 3.07354 19.673 3.63803C20 4.27976 20 5.11984 20 6.8Z"/>
                        </svg>
                        Content
                      </div>
                      <!-- Collections and files from the content configuration -->
                      <ul class="mt-1 pl-8 space-y-1">
                        <li v-for="item in config.content" :key="item.name">
                          <router-link
                            :to="{ name: 'content', params: { name: item.name } }"
                            @click="isSidebarActive = false"
                            class="link !text-sm"
                          >
                            {{ item.label }}
                          </router-link>
                        </li>
                      </ul>
                    </div>
                  </li>
                  <li>
                    <router-link :to="{ name: 'media' }" @click="isSidebarActive = false" class="link">
                      <svg class="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.2 21H6.93137C6.32555 21 6.02265 21 5.88238 20.8802C5.76068 20.7763 5.69609 20.6203 5.70865 20.4608C5.72312 20.2769 5.93731 20.0627 6.36569 19.6343L14.8686 11.1314C15.2646 10.7354 15.4627 10.5373 15.691 10.4632C15.8918 10.3979 16.1082 10.3979 16.309 10.4632C16.5373 10.5373 16.7354 10.7354 17.1314 11.1314L21 15V16.2M16.2 21C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2M16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2M10.5 8.5C10.5 9.60457 9.60457 10.5 8.5 10.5C7.39543 10.5 6.5 9.60457 6.5 8.5C6.5 7.39543 7.39543 6.5 8.5 6.5C9.60457 6.5 10.5 7.39543 10.5 8.5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      Media
                    </router-link>
                  </li>
                  <li class=" mt-auto">
                    <router-link :to="{ name: 'settings' }" @click="isSidebarActive = false" class="link">
                      <svg class="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"/>
                        <path d="M18.7273 14.7273C18.6063 15.0015 18.5702 15.3056 18.6236 15.6005C18.6771 15.8954 18.8177 16.1676 19.0273 16.3818L19.0818 16.4364C19.2509 16.6052 19.385 16.8057 19.4765 17.0265C19.568 17.2472 19.6151 17.4838 19.6151 17.7227C19.6151 17.9617 19.568 18.1983 19.4765 18.419C19.385 18.6397 19.2509 18.8402 19.0818 19.0091C18.913 19.1781 18.7124 19.3122 18.4917 19.4037C18.271 19.4952 18.0344 19.5423 17.7955 19.5423C17.5565 19.5423 17.3199 19.4952 17.0992 19.4037C16.8785 19.3122 16.678 19.1781 16.5091 19.0091L16.4545 18.9545C16.2403 18.745 15.9682 18.6044 15.6733 18.5509C15.3784 18.4974 15.0742 18.5335 14.8 18.6545C14.5311 18.7698 14.3018 18.9611 14.1403 19.205C13.9788 19.4489 13.8921 19.7347 13.8909 20.0273V20.1818C13.8909 20.664 13.6994 21.1265 13.3584 21.4675C13.0174 21.8084 12.5549 22 12.0727 22C11.5905 22 11.1281 21.8084 10.7871 21.4675C10.4461 21.1265 10.2545 20.664 10.2545 20.1818V20.1C10.2475 19.7991 10.1501 19.5073 9.97501 19.2625C9.79991 19.0176 9.55521 18.8312 9.27273 18.7273C8.99853 18.6063 8.69437 18.5702 8.39947 18.6236C8.10456 18.6771 7.83244 18.8177 7.61818 19.0273L7.56364 19.0818C7.39478 19.2509 7.19425 19.385 6.97353 19.4765C6.7528 19.568 6.51621 19.6151 6.27727 19.6151C6.03834 19.6151 5.80174 19.568 5.58102 19.4765C5.36029 19.385 5.15977 19.2509 4.99091 19.0818C4.82186 18.913 4.68775 18.7124 4.59626 18.4917C4.50476 18.271 4.45766 18.0344 4.45766 17.7955C4.45766 17.5565 4.50476 17.3199 4.59626 17.0992C4.68775 16.8785 4.82186 16.678 4.99091 16.5091L5.04545 16.4545C5.25503 16.2403 5.39562 15.9682 5.4491 15.6733C5.50257 15.3784 5.46647 15.0742 5.34545 14.8C5.23022 14.5311 5.03887 14.3018 4.79497 14.1403C4.55107 13.9788 4.26526 13.8921 3.97273 13.8909H3.81818C3.33597 13.8909 2.87351 13.6994 2.53253 13.3584C2.19156 13.0174 2 12.5549 2 12.0727C2 11.5905 2.19156 11.1281 2.53253 10.7871C2.87351 10.4461 3.33597 10.2545 3.81818 10.2545H3.9C4.2009 10.2475 4.49273 10.1501 4.73754 9.97501C4.98236 9.79991 5.16883 9.55521 5.27273 9.27273C5.39374 8.99853 5.42984 8.69437 5.37637 8.39947C5.3229 8.10456 5.18231 7.83244 4.97273 7.61818L4.91818 7.56364C4.74913 7.39478 4.61503 7.19425 4.52353 6.97353C4.43203 6.7528 4.38493 6.51621 4.38493 6.27727C4.38493 6.03834 4.43203 5.80174 4.52353 5.58102C4.61503 5.36029 4.74913 5.15977 4.91818 4.99091C5.08704 4.82186 5.28757 4.68775 5.50829 4.59626C5.72901 4.50476 5.96561 4.45766 6.20455 4.45766C6.44348 4.45766 6.68008 4.50476 6.9008 4.59626C7.12152 4.68775 7.32205 4.82186 7.49091 4.99091L7.54545 5.04545C7.75971 5.25503 8.03183 5.39562 8.32674 5.4491C8.62164 5.50257 8.9258 5.46647 9.2 5.34545H9.27273C9.54161 5.23022 9.77093 5.03887 9.93245 4.79497C10.094 4.55107 10.1807 4.26526 10.1818 3.97273V3.81818C10.1818 3.33597 10.3734 2.87351 10.7144 2.53253C11.0553 2.19156 11.5178 2 12 2C12.4822 2 12.9447 2.19156 13.2856 2.53253C13.6266 2.87351 13.8182 3.33597 13.8182 3.81818V3.9C13.8193 4.19253 13.906 4.47834 14.0676 4.72224C14.2291 4.96614 14.4584 5.15749 14.7273 5.27273C15.0015 5.39374 15.3056 5.42984 15.6005 5.37637C15.8954 5.3229 16.1676 5.18231 16.3818 4.97273L16.4364 4.91818C16.6052 4.74913 16.8057 4.61503 17.0265 4.52353C17.2472 4.43203 17.4838 4.38493 17.7227 4.38493C17.9617 4.38493 18.1983 4.43203 18.419 4.52353C18.6397 4.61503 18.8402 4.74913 19.0091 4.91818C19.1781 5.08704 19.3122 5.28757 19.4037 5.50829C19.4952 5.72901 19.5423 5.96561 19.5423 6.20455C19.5423 6.44348 19.4952 6.68008 19.4037 6.9008C19.3122 7.12152 19.1781 7.32205 19.0091 7.49091L18.9545 7.54545C18.745 7.75971 18.6044 8.03183 18.5509 8.32674C18.4974 8.62164 18.5335 8.9258 18.6545 9.2V9.27273C18.7698 9.54161 18.9611 9.77093 19.205 9.93245C19.4489 10.094 19.7347 10.1807 20.0273 10.1818H20.1818C20.664 10.1818 21.1265 10.3734 21.4675 10.7144C21.8084 11.0553 22 11.5178 22 12C22 12.4822 21.8084 12.9447 21.4675 13.2856C21.1265 13.6266 20.664 13.8182 20.1818 13.8182H20.1C19.8075 13.8193 19.5217 13.906 19.2778 14.0676C19.0339 14.2291 18.8425 14.4584 18.7273 14.7273Z"/>
                      </svg>
                      Settings
                    </router-link>
                  </li>
                </ul>
              </li>
            </ul>
          </nav>
          <!-- User profile and logout -->
          <div class="mt-auto border-t border-neutral-200 px-4 py-3">
            <User/>
          </div>
        </div>
      </div>
    </div>
    <div class="lg:pl-72 pb-16 lg:pb-0" id="main">
      <div class="w-full min-h-screen relative">
        <router-view v-slot="{ Component }">
          <component :is="Component" :config="config"/>
        </router-view>
      </div>
    </div>
    <!-- Repo picker modal -->
    <Modal ref="repoPickerModal" :customClass="'modal-repo-picker'">
      <template #header>Change repository</template>
      <template #content>
        <div class="p-3">
          <RepoPicker/>
        </div>
      </template>
    </Modal>
  </template>
</template>

<script setup>
import { onMounted, ref, reactive, provide, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import YAML from 'js-yaml';
import notifications from '@/services/notifications';
import github from '@/services/github';
import Dropdown from '@/components/utils/Dropdown.vue';
import Modal from '@/components/utils/Modal.vue';
import RepoPicker from '@/components/RepoPicker.vue';
import User from '@/components/User.vue';

const route = useRoute();
const router = useRouter();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  path: String,
  name: String
});
const branches = ref(null);
const config = ref(null);
const status = ref('loading');
const repoPickerModal = ref(null);
const isSidebarActive = ref(false);

const repoStore = reactive({
  owner: props.owner,
  repo: props.repo,
  branch: props.branch,
  config: config,
  details: null
});
provide('repoStore', repoStore);

const setRepo = async () => {
  status.value = 'loading';

  repoStore.owner = props.owner;
  repoStore.repo = props.repo;
  repoStore.branch = props.branch;
  
  const repoDetails = await github.getRepo(props.owner, props.repo);
  if (!repoDetails) {
    notifications.notify(`The repo "${props.owner}/${props.repo}" doesn't exist.`, 'error');
    router.push({ name: 'home' });
    return;
  } else {
    repoStore.details = repoDetails;
  }
  
  if (!props.branch) {
    // If the branch isn't provided, we use the default one
    notifications.notify(`No branch provided. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'warning');
    router.push({ name: 'content-root', params: { ...route.params, branch: repoDetails.default_branch } });
    return;
  } else {
    // Else, we retrieve the list of branches and check if the provided branch exists
    const repoBranches = await github.getBranches(props.owner, props.repo);
    if (!repoBranches.includes(props.branch)) {
      notifications.notify(`The branch "${props.branch}" doesn't exist. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'error', 0);
      router.push({ name: route.name, params: { ...route.params, branch: repoDetails.default_branch } });
      return;
    }
    branches.value = repoBranches;
  }  

  let configFile = await github.getFile(props.owner, props.repo, props.branch, '.pages.yml', true);
  
  // If we can't find a config file, we fetch the default config
  // TODO: this should send the user to a config wizard
  if (!configFile || configFile === null) {
    notifications.notify('No configuration file in the repository, switching to default configuration.', 'warning');
    try {
      const response = await axios.get('/.pages.yml');
      configFile = response.data;
      console.warn('Missing .pages.yml configuration file, switched to default configuration.');
    } catch (error) {
      console.error('Error fetching the default configuration:', error);
      notifications.notify('Failed to retrieve the default configuration.', 'error', 0);
    }
  }
  if (configFile) {
    config.value = YAML.load(configFile);
  }

  status.value = '';
};

onMounted(async () => {
  setRepo();
});

watch(
  [
    () => props.owner,
    () => props.repo,
    () => props.branch
  ],
  async () => {
    await setRepo();
  }
);
</script>
