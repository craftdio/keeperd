export function localCommand(name, { env = process.env } = {}) {
    return env.KEEPERD_CLI === '1'
        ? `keeperd ${name}`
        : `npm run local:${name}`;
}
