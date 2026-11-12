export type LeaveChoice = 'save' | 'discard' | 'cancel';

/**
 * Asks before leaving a scene with unsaved edits: "Leaving resets the road network to
 * default." with Save and switch, Discard and switch, and × to cancel.
 */
export function createLeaveDialog(container: HTMLElement) {
  const dialog = document.createElement('dialog');
  dialog.className = 'leave-dialog';
  dialog.setAttribute('aria-labelledby', 'leave-dialog-message');
  dialog.innerHTML = `
    <button type="button" class="dialog-close" data-choice="cancel" aria-label="Cancel">×</button>
    <p id="leave-dialog-message">Leaving resets the road network to default.</p>
    <div class="dialog-actions">
      <button type="button" class="primary" data-choice="save">Save and switch</button>
      <button type="button" data-choice="discard">Discard and switch</button>
    </div>
  `;
  container.append(dialog);

  let answer: ((choice: LeaveChoice) => void) | null = null;
  const close = (choice: LeaveChoice) => {
    if (dialog.open) dialog.close();
    answer?.(choice);
    answer = null;
  };
  dialog.addEventListener('click', (e) => {
    const choice = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset.choice as LeaveChoice | undefined;
    if (choice) close(choice);
  });
  // Escape cancels, like ×.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close('cancel');
  });

  return {
    /** Ask, and resolve with what the player chose. */
    ask(): Promise<LeaveChoice> {
      return new Promise((resolve) => {
        answer = resolve;
        dialog.showModal();
        dialog.querySelector<HTMLButtonElement>('[data-choice="save"]')!.focus();
      });
    },
  };
}
