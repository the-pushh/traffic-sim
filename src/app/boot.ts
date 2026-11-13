import '../styles/main.css';
import { runningOnHandheld } from './device';

// A light or dark choice saved in this browser applies everywhere, the message page included.
try {
  const saved = localStorage.getItem('traffic-sim:theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {
  // Storage blocked: follow the system setting.
}

/**
 * The page's entry. Phones and tablets get a message on the background and nothing else
 * (the 3D app and its models aren't even loaded); laptops and desktops get the app. If a
 * window is resized across that line, the page reloads into the other one.
 */
const handheld = runningOnHandheld();
if (handheld) {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.className = 'laptop-only';
  app.innerHTML = '<h1>This app is meant to be experienced on a laptop.</h1>';
} else {
  void import('./main');
}
let resized: number | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resized);
  resized = window.setTimeout(() => {
    if (runningOnHandheld() !== handheld) location.reload();
  }, 300);
});
