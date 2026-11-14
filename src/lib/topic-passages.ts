/** Stable evidence IDs let the reviewer select actual text, never rewrite quotations. */
export function sourcePassages(sources: { url: string; title: string; excerpts?: string[] | null | undefined }[]) {
  return sources.flatMap(s => (s.excerpts ?? []).flatMap(text => {
    const parts = text.match(/[^\n]{30,700}(?:\s|$)/g) ?? [text];
    return parts.map(quote => quote.trim()).filter(quote => quote.length >= 30).slice(0, 8).map(quote => ({ url: s.url, title: s.title, quote }));
  })).map((s, id) => ({ ...s, id }));
}