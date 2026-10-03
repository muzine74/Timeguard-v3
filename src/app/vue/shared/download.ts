/**
 * Télécharge un fichier généré ou reçu (Blob) sous le nom donné.
 * Le lien temporaire est libéré après une minute, et non immédiatement : libéré trop tôt,
 * le téléchargement peut échouer (« annulé ») sur une machine lente ou dans Firefox/Safari.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
