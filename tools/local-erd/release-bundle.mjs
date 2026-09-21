import { createHash } from 'node:crypto';
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { writeBuildMarker } from './build-state.mjs';
import { assertKeeperdVersion } from './keeperd-version.mjs';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);
const requiredEntries = [
    'bin/keeperd.mjs',
    'dist',
    'package.json',
    'package-lock.json',
    'KEEPERD_VERSION',
    'LICENSE',
    'NOTICE',
];
const requiredRuntimeTools = ['index.html', 'library.html'];

const isRuntimeTool = (name) =>
    /\.(?:html|mjs|js|sql)$/.test(name) && !/\.test\.(?:mjs|js)$/.test(name);

const tarBlockSize = 512;

const compareNames = (left, right) =>
    left < right ? -1 : left > right ? 1 : 0;

const octalField = (value, length) => {
    const encoded = value.toString(8);
    if (encoded.length > length - 1)
        throw new Error(`Tar value is too large: ${value}`);
    return `${encoded.padStart(length - 1, '0')}\0`;
};

const writeField = (header, offset, length, value) => {
    const source = Buffer.from(value);
    if (source.length > length)
        throw new Error(`Tar header value is too long: ${value}`);
    source.copy(header, offset);
};

function splitUstarPath(relativePath) {
    if (Buffer.byteLength(relativePath) <= 100)
        return { name: relativePath, prefix: '' };
    const parts = relativePath.split('/');
    for (let index = 1; index < parts.length; index += 1) {
        const prefix = parts.slice(0, index).join('/');
        const name = parts.slice(index).join('/');
        if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100)
            return { name, prefix };
    }
    throw new Error(
        `Path is too long for the KeepERD release archive: ${relativePath}`
    );
}

function tarHeader({ relativePath, size = 0, directory = false, mode }) {
    const header = Buffer.alloc(tarBlockSize, 0);
    const { name, prefix } = splitUstarPath(relativePath);
    writeField(header, 0, 100, name);
    writeField(header, 100, 8, octalField(mode, 8));
    writeField(header, 108, 8, octalField(0, 8));
    writeField(header, 116, 8, octalField(0, 8));
    writeField(header, 124, 12, octalField(size, 12));
    writeField(header, 136, 12, octalField(0, 12));
    header.fill(0x20, 148, 156);
    header[156] = directory ? '5'.charCodeAt(0) : '0'.charCodeAt(0);
    writeField(header, 257, 6, 'ustar\0');
    writeField(header, 263, 2, '00');
    writeField(header, 265, 32, 'root');
    writeField(header, 297, 32, 'root');
    writeField(header, 345, 155, prefix);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
    return header;
}

function archiveEntries(directory, relative = '') {
    return readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => compareNames(left.name, right.name))
        .flatMap((entry) => {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = path.posix.join(relative, entry.name);
            if (entry.isDirectory())
                return [
                    { absolutePath, relativePath, directory: true },
                    ...archiveEntries(absolutePath, relativePath),
                ];
            if (entry.isFile())
                return [{ absolutePath, relativePath, directory: false }];
            throw new Error(
                `Release bundle does not support non-file entry: ${relativePath}`
            );
        });
}

function createDeterministicArchive(bundleRoot, name) {
    const entries = [
        { absolutePath: bundleRoot, relativePath: name, directory: true },
        ...archiveEntries(bundleRoot, name),
    ];
    const blocks = [];
    for (const entry of entries) {
        const content = entry.directory
            ? Buffer.alloc(0)
            : readFileSync(entry.absolutePath);
        const mode = entry.directory
            ? 0o755
            : entry.relativePath === `${name}/bin/keeperd.mjs`
              ? 0o755
              : 0o644;
        blocks.push(
            tarHeader({
                relativePath: entry.directory
                    ? `${entry.relativePath}/`
                    : entry.relativePath,
                size: content.length,
                directory: entry.directory,
                mode,
            })
        );
        if (!entry.directory) {
            blocks.push(content);
            const padding = content.length % tarBlockSize;
            if (padding) blocks.push(Buffer.alloc(tarBlockSize - padding));
        }
    }
    blocks.push(Buffer.alloc(tarBlockSize * 2));
    return gzipSync(Buffer.concat(blocks), { mtime: 0 });
}

function copyRuntimeTools(source, target) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (entry.isDirectory()) copyRuntimeTools(from, to);
        else if (entry.isFile() && isRuntimeTool(entry.name)) cpSync(from, to);
    }
}

function assertBundleInputs(projectRoot) {
    for (const entry of requiredEntries) {
        if (!existsSync(path.join(projectRoot, entry)))
            throw new Error(`Release bundle input is missing: ${entry}`);
    }
    if (!existsSync(path.join(projectRoot, 'dist', 'index.html')))
        throw new Error('Release bundle input is missing: dist/index.html');
    if (!existsSync(path.join(projectRoot, 'tools', 'local-erd')))
        throw new Error('Release bundle input is missing: tools/local-erd');
    for (const entry of requiredRuntimeTools) {
        const relativePath = path.join('tools', 'local-erd', entry);
        if (!existsSync(path.join(projectRoot, relativePath)))
            throw new Error(`Release bundle input is missing: ${relativePath}`);
    }
}

export function createReleaseBundle({
    root: projectRoot = root,
    version,
    outputDirectory = path.join(projectRoot, 'release'),
} = {}) {
    const normalizedVersion = assertKeeperdVersion(version, projectRoot);
    assertBundleInputs(projectRoot);

    const name = `keeperd-v${normalizedVersion}`;
    const output = path.resolve(projectRoot, outputDirectory);
    const archive = path.join(output, `${name}.tar.gz`);
    const checksum = `${archive}.sha256`;
    const staging = mkdtempSync(path.join(os.tmpdir(), 'keeperd-release-'));
    const bundleRoot = path.join(staging, name);

    try {
        mkdirSync(bundleRoot, { recursive: true });
        for (const entry of requiredEntries) {
            const source = path.join(projectRoot, entry);
            const target = path.join(bundleRoot, entry);
            mkdirSync(path.dirname(target), { recursive: true });
            cpSync(source, target, { recursive: true });
        }
        copyRuntimeTools(
            path.join(projectRoot, 'tools', 'local-erd'),
            path.join(bundleRoot, 'tools', 'local-erd')
        );

        // Homebrew extracts a release asset without this repository's .git data.
        // A null revision makes the included build current in that environment.
        writeBuildMarker(bundleRoot, null);
        chmodSync(path.join(bundleRoot, 'bin', 'keeperd.mjs'), 0o755);

        mkdirSync(output, { recursive: true });
        writeFileSync(archive, createDeterministicArchive(bundleRoot, name));
        const digest = createHash('sha256')
            .update(readFileSync(archive))
            .digest('hex');
        writeFileSync(checksum, `${digest}  ${path.basename(archive)}\n`);
        return { archive, checksum, sha256: digest };
    } finally {
        rmSync(staging, { force: true, recursive: true });
    }
}

export function main(args = process.argv.slice(2)) {
    if (args.includes('--help')) {
        console.log(
            'Usage: node tools/local-erd/release-bundle.mjs [--version=0.1.0] [--output-directory=release]\n\n--version verifies that the requested release version matches KEEPERD_VERSION.'
        );
        return 0;
    }
    const options = Object.fromEntries(
        args.map((arg) => {
            const match = /^--([a-z-]+)=(.+)$/.exec(arg);
            if (!match) throw new Error(`Unsupported option: ${arg}`);
            return [match[1], match[2]];
        })
    );
    const result = createReleaseBundle({
        version: options.version,
        outputDirectory: options['output-directory'],
    });
    console.log(`Created ${result.archive}`);
    console.log(`SHA256 ${result.sha256}`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = main();
    } catch (error) {
        console.error(`Release bundle failed: ${error.message}`);
        process.exitCode = 1;
    }
}
