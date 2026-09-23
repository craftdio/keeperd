#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readKeeperdVersion } from '../tools/local-erd/keeperd-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const commands = Object.freeze({
    init: 'tools/local-erd/init.mjs',
    start: 'tools/local-erd/server.mjs',
    stop: 'tools/local-erd/stop.mjs',
    sync: 'tools/local-erd/sync.mjs',
});

export const help = `KeepERD local ERD CLI

Usage:
  keeperd <command> [options]

Commands:
  init    Prepare KeepERD user state and the local app build
  start   Start the local KeepERD server
  stop    Safely stop the local KeepERD server
  sync    Sync a repository branch into a local ERD

Options:
  -v, --version  Print the KeepERD version
  -h, --help     Print this help

Run \`keeperd <command> --help\` for command-specific options.`;

export function commandScript(command) {
    const relativePath = commands[command];
    return relativePath ? path.join(root, relativePath) : undefined;
}

function run(script, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...args], {
            cwd: root,
            env: { ...process.env, KEEPERD_CLI: '1' },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
    });
}

export async function main(args = process.argv.slice(2)) {
    const [command, ...commandArgs] = args;
    if (!command || command === '--help' || command === '-h') {
        console.log(help);
        return 0;
    }
    if (command === '--version' || command === '-v') {
        try {
            console.log(`KeepERD ${readKeeperdVersion(root)}`);
            return 0;
        } catch (error) {
            console.error(
                `keeperd version could not be read: ${error.message}`
            );
            return 1;
        }
    }
    const script = commandScript(command);
    if (!script) {
        console.error(`Unknown keeperd command: ${command}\n\n${help}`);
        return 1;
    }
    try {
        const { code, signal } = await run(script, commandArgs);
        if (signal) {
            console.error(`keeperd ${command} stopped by ${signal}.`);
            return 1;
        }
        return code ?? 1;
    } catch (error) {
        console.error(`keeperd ${command} could not start: ${error.message}`);
        return 1;
    }
}

function isDirectInvocation() {
    try {
        return (
            process.argv[1] &&
            realpathSync(process.argv[1]) ===
                realpathSync(fileURLToPath(import.meta.url))
        );
    } catch {
        return false;
    }
}

if (isDirectInvocation()) {
    main().then((code) => {
        process.exitCode = code;
    });
}
