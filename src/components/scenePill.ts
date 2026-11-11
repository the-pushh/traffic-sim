/**
 * Scene pill above the dock: `‹ Scene name ›`. The arrows step through scenes once
 * the carousel exists (T11); until then they stay disabled.
 */
export function createScenePill(container: HTMLElement, sceneName: string) {
  const pill = document.createElement('div');
  pill.className = 'scene-pill';
  pill.innerHTML = `
    <button type="button" class="pill-arrow" data-action="previous-scene" aria-label="Previous scene" disabled>‹</button>
    <span class="scene-name"></span>
    <button type="button" class="pill-arrow" data-action="next-scene" aria-label="Next scene" disabled>›</button>
  `;
  pill.querySelector('.scene-name')!.textContent = sceneName;
  container.append(pill);

  return {
    element: pill,
    /** Arrows follow the same lock as the run settings. */
    setArrowsEnabled(enabled: boolean) {
      for (const arrow of pill.querySelectorAll<HTMLButtonElement>('.pill-arrow')) arrow.disabled = !enabled;
    },
  };
}
