/** What the pill shows: the scene's name, whether its arrows work, and which of Save and Reset apply. */
export interface PillState {
  name: string;
  /** Arrows are locked while a run is under way (running or paused). */
  canSwitch: boolean;
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
  const pill = document.createElement('div');
  pill.className = 'scene-pill';
  pill.innerHTML = `
    <button type="button" class="pill-arrow" data-action="previous" aria-label="Previous scene" title="Previous scene">‹</button>
    <span class="scene-name" aria-live="polite"></span>
    <button type="button" class="pill-arrow" data-action="next" aria-label="Next scene" title="Next scene">›</button>
    <button type="button" class="pill-action primary" data-action="save" hidden>Save</button>
    <button type="button" class="pill-action" data-action="reset" hidden title="Restore the designer’s road network">Reset</button>
  `;
  const name = pill.querySelector<HTMLElement>('.scene-name')!;
  const button = (action: keyof PillActions) => pill.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
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
      button('save').disabled = button('reset').disabled = !state.canSwitch;
    },
  };
}
