import type { SoundBoard } from '../audio/soundBoard';
import { icon } from './icons';

/** The HUD's Sound switch: it reads "Sound on" or "Sound off", with a matching icon (a switch to screen readers). */
export function createSoundToggle(sound: SoundBoard) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Sound');
  const show = () => {
    button.innerHTML = `${icon(sound.enabled ? 'soundOn' : 'soundOff')}<span>Sound ${sound.enabled ? 'on' : 'off'}</span>`;
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
