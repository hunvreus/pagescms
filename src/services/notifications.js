/**
 * Service/store for notifications (errors, warnings, success and processing).
 * Coupled with the Notifications component.
 */

import { reactive } from 'vue';

let counter = 0;
const state = reactive({
  notifications: []
});

const notify = (message, type = 'info', options = {}) => {
  const notification = {
    id: ++counter,
    message,
    type,
    closing: false,
    actions: options.actions || null,
    tag: options.tag || null
  };
  state.notifications.push(notification);

  const delay = options.delay !== undefined ? options.delay : 4000;
  if (delay > 0) {
    setTimeout(() => close(notification.id), delay);
  }

  return notification.id;
};

const close = (id) => {
  const index = state.notifications.findIndex(n => n.id === id);
  if (index !== -1) {
    state.notifications.splice(index, 1);
  }
};

const flush = (tag) => {
  if (tag) {
    state.notifications = state.notifications.filter(n => n.tag !== tag);
  } else {
    state.notifications = [];
  }
};

export default { state, notify, close, flush };