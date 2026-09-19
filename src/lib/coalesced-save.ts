export function coalescedSave(save: (id: string) => Promise<void>) {
    const pending = new Map<
        string,
        {
            timer: ReturnType<typeof setTimeout>;
            waiters: {
                resolve: () => void;
                reject: (error: unknown) => void;
            }[];
        }
    >();
    return (id: string): Promise<void> =>
        new Promise((resolve, reject) => {
            const previous = pending.get(id);
            if (previous) clearTimeout(previous.timer);
            const waiters = [...(previous?.waiters ?? []), { resolve, reject }];
            const timer = setTimeout(async () => {
                pending.delete(id);
                try {
                    await save(id);
                    waiters.forEach((waiter) => waiter.resolve());
                } catch (error) {
                    waiters.forEach((waiter) => waiter.reject(error));
                }
            }, 40);
            pending.set(id, { timer, waiters });
        });
}
