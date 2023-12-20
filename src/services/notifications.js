import { reactive } from 'vue';

let counter = 0;
const state = reactive({
  notifications: []
});

const notify = (message, type = 'info', delay = 4000) => {
  const notification = { id: ++counter, message, type, closing: false };
  state.notifications.push(notification);

  if (delay > 0) {
    setTimeout(() => close(notification.id), delay);
  }
};

const close = (id) => {
  const index = state.notifications.findIndex(n => n.id === id);
  if (index !== -1) {
    state.notifications.splice(index, 1);
  }
};

export default { state, notify, close };