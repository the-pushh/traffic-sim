import '../styles/main.css';
import { runningOnHandheld } from './device';

/**
 * The page's entry. Phones and tablets get a message on the background and nothing else
 * (the 3D app and its models aren't even loaded); laptops and desktops get the app.
 */
if (runningOnHandheld()) {
  const app = document.querySelector<HTMLElement>('#app')!;
  app.className = 'laptop-only';
  app.innerHTML = `
    <h1>Traffic Simulator</h1>
    <p>This app is meant to be experienced on a laptop.</p>
    <p class="laptop-only-detail">Open it on a laptop or desktop, with a mouse or trackpad, to build roads and run traffic.</p>`;
} else {
  void import('./main');
}
