/**
 * Scene pill above the dock: `‹ Scene name ›`. The arrows stay disabled until the
 * scene carousel exists (T11), which will also lock them during a run.
 */
export function createScenePill(container: HTMLElement, sceneName: string) {
  const pill = document.createElement('div');
  pill.className = 'scene-pill';
  pill.innerHTML = `
    <button type="button" class="pill-arrow" data-action="previous-scene" aria-label="Previous scene" title="More scenes arrive with the carousel" disabled>‹</button>
    <span class="scene-name"></span>
    <button type="button" class="pill-arrow" data-action="next-scene" aria-label="Next scene" title="More scenes arrive with the carousel" disabled>›</button>
  `;
  pill.querySelector('.scene-name')!.textContent = sceneName;
  container.append(pill);

  return { element: pill };
}
