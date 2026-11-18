/** Every private file the documentary worker reads, shared by validation and signing. */
export function documentaryMediaPaths(doc: { images: string[]; cutouts?: string[] | undefined; voice: { path: string }[] }): string[] {
  return [...new Set([...doc.images, ...(doc.cutouts ?? []), ...doc.voice.map(v => v.path)])];
}