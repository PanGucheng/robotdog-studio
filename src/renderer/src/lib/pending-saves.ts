const writers = new Set<() => Promise<void>>()
export function registerPendingSave(writer: () => Promise<void>): () => void {
  writers.add(writer)
  return () => { writers.delete(writer) }
}
export async function flushPendingSaves(): Promise<void> {
  for (const writer of [...writers]) await writer()
}
