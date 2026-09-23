export function createMemoryCache({ ttl = Infinity, now = Date.now } = {}) {
    const entries = new Map();

    async function get(key, load, { refresh = false } = {}) {
        const current = entries.get(key);
        if (
            !refresh &&
            current?.value !== undefined &&
            current.expiresAt > now()
        )
            return { value: current.value, cached: true };
        if (!refresh && current?.pending)
            return { value: await current.pending, cached: true };

        const pending = Promise.resolve().then(load);
        entries.set(key, { pending });
        try {
            const value = await pending;
            if (entries.get(key)?.pending === pending)
                entries.set(key, { value, expiresAt: now() + ttl });
            return { value, cached: false };
        } catch (error) {
            if (entries.get(key)?.pending === pending) entries.delete(key);
            throw error;
        }
    }

    function clear(key) {
        if (key === undefined) entries.clear();
        else entries.delete(key);
    }

    return { get, clear };
}
