<template>
  <Teleport to="body">    
    <ul class="notifications" v-show="notifications.state.notifications.length">
      <TransitionGroup>
        <li
          v-for="notification in notifications.state.notifications"
          :key="notification.id"
          class="notification adjust-dark"
          :class="[ `notification-${notification.type}` ]"
        >
          <div class="notification-icon" v-if="[ 'success', 'error', 'warning', 'processing' ].includes(notification.type)">
            <Icon v-if="notification.type == 'success'" name="Check" class="h-3 w-3 stroke-[3] shrink-0"/>
            <Icon v-else-if="notification.type == 'error'" name="X" class="h-3 w-3 stroke-[3] shrink-0"/>
            <Icon v-else-if="notification.type == 'warning'" name="Bell" class="h-3 w-3 stroke-[3] shrink-0"/>
            <div v-else-if="notification.type == 'processing'" class="spinner-black !h-3 !w-3"></div>
          </div>
          <div class="notification-content">
            <div class="notification-message">{{ notification.message }}</div>
            <ul class="notification-actions" v-if="notification.actions">
              <li v-for="(action, index) in notification.actions" :key="index">
                <button @click="action.handler(notification.id)" :class="[ action.primary ? 'btn-primary-sm' : 'btn-sm' ]">
                  {{ action.label }}
                </button>
              </li>
            </ul>
          </div>
          <button @click="notifications.close(notification.id)" class="btn-icon-secondary-sm -my-1.5 -mr-1">
            <Icon name="X" class="h-4 w-4 stroke-2 shrink-0"/>
          </button>
        </li>
      </TransitionGroup>
    </ul>
  </Teleport>
</template>

<script setup>
import notifications from '@/services/notifications';
import Icon from '@/components/utils/Icon.vue';
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