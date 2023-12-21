<template>
  <Teleport to="body">    
    <ul class="notifications">
      <TransitionGroup>
        <li
          v-for="notification in notifications.state.notifications"
          :key="notification.id"
          class="notification"
          :class="[ `notification-${notification.type}` ]"
        >
          <div class="notification-icon">
            <svg v-if="notification.type == 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else-if="notification.type == 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else-if="notification.type == 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.9998 8.99999V13M11.9998 17H12.0098M10.6151 3.89171L2.39019 18.0983C1.93398 18.8863 1.70588 19.2803 1.73959 19.6037C1.769 19.8857 1.91677 20.142 2.14613 20.3088C2.40908 20.5 2.86435 20.5 3.77487 20.5H20.2246C21.1352 20.5 21.5904 20.5 21.8534 20.3088C22.0827 20.142 22.2305 19.8857 22.2599 19.6037C22.2936 19.2803 22.0655 18.8863 21.6093 18.0983L13.3844 3.89171C12.9299 3.10654 12.7026 2.71396 12.4061 2.58211C12.1474 2.4671 11.8521 2.4671 11.5935 2.58211C11.2969 2.71396 11.0696 3.10655 10.6151 3.89171Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 18V10M12 6H12.01" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="notification-message">{{ notification.message }}</div>
          <button @click="notifications.close(notification.id)" class="link !p-2 -my-1.5 -mr-1">
            <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </li>
      </TransitionGroup>
    </ul>
  </Teleport>
</template>

<script setup>
import notifications from '@/services/notifications';
</script>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: all 150ms ease;
}

.v-enter-to,
.v-leave-from {
  opacity: 100%;
  transform: scale(1);
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>