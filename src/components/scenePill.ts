import { createPushButton } from '../hardware/controls';
import { icon } from './icons';
/** How long "Couldn't save" shows before Save returns, ms. */
const SAVE_FAILED_MS = 3000;

/** What the pill shows: the scene's name, whether its arrows work, and which of Save and Reset apply. */
export interface PillState {
  name: string;
  /** Arrows are locked while a run is under way (running or paused). */
  canSwitch: boolean;
  /** Save works whenever edits do: not while the run is going (paused is fine). Reset always works; it also ends the run. */
  canSave: boolean;
  /** The scene on screen has edits that aren't saved. */
  unsaved: boolean;
  /** The scene on screen differs from the designer's network. */
  differsFromDesign: boolean;
}

export interface PillActions {
  previous(): void;
  next(): void;
  save(): void;
  reset(): void;
}

/**
 * Scene pill above the dock: `‹ Scene ›` cycles the scenes, with Save when there are
 * unsaved edits and Reset when the network differs from the designer's.
 */
export function createScenePill(container: HTMLElement, actions: PillActions) {
  // A small machined panel: arrow push buttons either side of the scene's name, then Save and Reset.
  const pill = document.createElement('div');
  pill.className = 'scene-pill hw-panel';
  const name = document.createElement('span');
  name.className = 'scene-name';
  name.setAttribute('aria-live', 'polite');
  const parts = {
    previous: createPushButton({ label: 'Previous scene', icon: icon('caretLeft') }),
    next: createPushButton({ label: 'Next scene', icon: icon('caretRight') }),
    save: createPushButton({ label: 'Save', wide: true }),
    reset: createPushButton({ label: 'Reset', wide: true }),
  };
  parts.previous.element.classList.add('pill-arrow');
  parts.next.element.classList.add('pill-arrow');
  parts.save.element.classList.add('pill-action');
  parts.reset.element.classList.add('pill-action');
  parts.reset.element.title = 'Restore the designer’s road network';
  for (const [action, part] of Object.entries(parts)) part.element.dataset.action = action;
  pill.append(parts.previous.element, name, parts.next.element, parts.save.element, parts.reset.element);
  const button = (action: keyof PillActions) => parts[action].element;
  for (const action of ['previous', 'next', 'save', 'reset'] as const) button(action).addEventListener('click', () => actions[action]());
  container.append(pill);

  let shown = '';
  return {
    element: pill,
    /** Show the scene's state; cheap to call every frame. */
    sync(state: PillState) {
      const key = JSON.stringify(state);
      if (key === shown) return;
      shown = key;
      name.textContent = state.name;
      for (const arrow of [button('previous'), button('next')]) {
        arrow.disabled = !state.canSwitch;
        arrow.title = state.canSwitch ? arrow.getAttribute('aria-label')! : 'Scenes can’t change during a run';
      }
      button('save').hidden = !state.unsaved;
      button('reset').hidden = !state.differsFromDesign;
      button('save').disabled = !state.canSave;
    },
    /** Put keyboard focus back on a control after the scene reloads. */
    focus(action: 'previous' | 'next') {
      button(action).focus();
    },
    /** Say the browser wouldn't keep the save (storage full or blocked); Save stays offered. */
    saveFailed() {
      parts.save.setFace('<span>Couldn’t save</span>');
      parts.save.element.title = 'This browser wouldn’t keep the scene (storage full or blocked)';
      setTimeout(() => {
        parts.save.setFace('<span>Save</span>');
        parts.save.element.title = 'Save';
      }, SAVE_FAILED_MS);
    },
  };
}
