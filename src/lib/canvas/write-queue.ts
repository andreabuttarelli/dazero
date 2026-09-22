export function createWriteQueue() {
  const pending = new Map<string, Promise<void>>();

  return (id: string, save: () => Promise<void>): Promise<void> => {
    const previous = pending.get(id);
    const next = previous ? previous.catch(() => {}).then(save) : save();
    pending.set(id, next);
    void next.finally(() => {
      if (pending.get(id) === next) {
        pending.delete(id);
      }
    }).catch(() => {});
    return next;
  };
}
