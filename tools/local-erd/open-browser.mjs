import { spawn } from 'node:child_process';

export const startHelp = `Usage: keeperd start [--no-open]

Start the local KeepERD server and open it in the macOS default browser.
  --no-open  Start the server without opening a browser
  -h, --help  Print this help`;

export function parseStartOptions(args) {
    if (args.includes('--help') || args.includes('-h')) return { help: true };
    const unknown = args.find((arg) => arg !== '--no-open');
    if (unknown) throw new Error(`Unknown keeperd start option: ${unknown}`);
    return { noOpen: args.includes('--no-open') };
}

export function shouldOpenBrowser({
    platform = process.platform,
    env = process.env,
} = {}) {
    return (
        platform === 'darwin' &&
        !['1', 'true'].includes(env.CI?.toLowerCase()) &&
        !env.SSH_CONNECTION &&
        !env.SSH_CLIENT &&
        !env.SSH_TTY
    );
}

export function openDefaultBrowser(
    url,
    {
        platform = process.platform,
        env = process.env,
        spawnProcess = spawn,
    } = {}
) {
    const match = /^http:\/\/localhost:(\d{1,5})\/$/.exec(url);
    const port = Number(match?.[1]);
    if (!match || port < 1 || port > 65535)
        throw new Error(
            'Only a listening localhost KeepERD URL may be opened.'
        );
    if (!shouldOpenBrowser({ platform, env }))
        return Promise.resolve('skipped');

    return new Promise((resolve) => {
        let child;
        try {
            child = spawnProcess('/usr/bin/open', [url], {
                stdio: 'ignore',
            });
        } catch {
            resolve('failed');
            return;
        }
        child.once('error', () => resolve('failed'));
        child.once('close', (code) =>
            resolve(code === 0 ? 'opened' : 'failed')
        );
    });
}
