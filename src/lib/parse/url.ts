export function hostOf(url: string): string {
  const match = url.match(/^(?:https?:\/\/)?([^/?#]+)/i);
  return (match?.[1] ?? '').replace(/^www\./, '').toLowerCase();
}
