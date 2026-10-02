/** Shared with notification handling so a visual cover cannot bypass authentication. */
export function createUnlockGate() {
  let open = false;
  const waiting = new Set<() => void>();
  return {
    setOpen(value: boolean) {
      open = value;
      if (open) {
        for (const resolve of waiting) resolve();
        waiting.clear();
      }
    },
    async waitUntilOpen() {
      // Recheck after waking in case the app backgrounded before the continuation ran.
      while (!open) await new Promise<void>((resolve) => waiting.add(resolve));
    },
  };
}

export type UnlockGate = ReturnType<typeof createUnlockGate>;
