const systemTheme = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const userTheme = () => localStorage.getItem('userTheme');

const setTheme = (value) => {
  localStorage.setItem('userTheme', value);
  updateThemeClass();
};

const clearTheme = () => {
  localStorage.removeItem('userTheme');
  updateThemeClass();
};

const updateThemeClass = () => {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(getTheme());
};

const getTheme = () => {
  return userTheme() ? userTheme() : systemTheme();
}

updateThemeClass();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (!userTheme()) {
    updateThemeClass();
  }
});

export default { userTheme, setTheme, clearTheme, getTheme };
