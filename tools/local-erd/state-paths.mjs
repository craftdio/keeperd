import os from 'node:os';
import path from 'node:path';

export function stateDirectory({
    env = process.env,
    platform = process.platform,
    home = os.homedir(),
} = {}) {
    if (env.KEEPERD_STATE_DIR) {
        if (!path.isAbsolute(env.KEEPERD_STATE_DIR))
            throw new Error('KEEPERD_STATE_DIR은 절대 경로여야 합니다.');
        return path.normalize(env.KEEPERD_STATE_DIR);
    }
    if (platform === 'darwin')
        return path.join(home, 'Library', 'Application Support', 'KeepERD');
    if (platform === 'win32')
        return path.join(
            env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
            'KeepERD'
        );
    if (env.XDG_STATE_HOME) {
        if (!path.isAbsolute(env.XDG_STATE_HOME))
            throw new Error('XDG_STATE_HOME은 절대 경로여야 합니다.');
        return path.join(env.XDG_STATE_HOME, 'keeperd');
    }
    return path.join(home, '.local', 'state', 'keeperd');
}

export function statePaths(options) {
    const root = stateDirectory(options);
    return {
        root,
        config: path.join(root, 'config.json'),
        data: path.join(root, 'data'),
        snapshots: path.join(root, 'data', 'snapshots.json'),
        repositories: path.join(root, 'repositories'),
        lock: path.join(root, '.keeperd.lock'),
    };
}
