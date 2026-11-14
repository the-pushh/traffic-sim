import type { SoundBoard } from '../audio/soundBoard';
import { icon } from './icons';

/**
 * The Sound switch in the camera panel, under the light/dark button: an icon button like the
 * rest of the panel (a speaker, crossed out when off), a switch to screen readers, and a tooltip
 * that says what a click does.
 */
export function createSoundToggle(sound: SoundBoard) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Sound');
  const show = () => {
    button.innerHTML = icon(sound.enabled ? 'soundOn' : 'soundOff');
    button.setAttribute('aria-checked', String(sound.enabled));
    button.title = sound.enabled ? 'Turn sound off' : 'Turn sound on';
  };
  button.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    show();
  });
  show();
  return button;
}
