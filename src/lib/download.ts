/** Offers text as a file download: backups, shopping lists, calendars, spending. */
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers (Safari).
  setTimeout(() => URL.revokeObjectURL(url), 40000);
}
