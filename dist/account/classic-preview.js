// Full-size Classic preview keeps the Account document (including file drafts) alive.
// The child reads saved data with its own authenticated owner session; no draft payload crosses frames.
export function mountClassicPreview({ doc = document, canOpen }) {
  const button = doc.getElementById('previewClassicButton');
  const dialog = doc.createElement('dialog');
  dialog.className = 'classic-preview-dialog';
  dialog.setAttribute('aria-label', 'Your GamID Classic preview');
  const bar = doc.createElement('div'); bar.className = 'classic-preview-bar';
  const back = doc.createElement('button'); back.type = 'button'; back.className = 'secondary'; back.textContent = 'Back to Edit';
  const note = doc.createElement('span'); note.textContent = 'Saved profile · Unsaved edits are kept in your editor';
  bar.append(back, note); dialog.append(bar); doc.body.append(dialog);
  let frame = null;
  const close = () => dialog.close();
  back.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    frame?.remove(); frame = null;
    doc.documentElement.classList.remove('classic-preview-open');
    button.focus();
  });
  button.addEventListener('click', () => {
    if (!canOpen() || dialog.open) return;
    frame = doc.createElement('iframe'); frame.title = 'Your saved GamID Classic Profile';
    frame.src = new URL('../public/?classic-preview=owner', doc.baseURI).href;
    dialog.append(frame); dialog.showModal();
    doc.documentElement.classList.add('classic-preview-open'); back.focus();
  });
  return { close: () => { if (dialog.open) close(); } };
}
