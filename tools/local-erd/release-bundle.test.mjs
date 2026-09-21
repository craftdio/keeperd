import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReleaseBundle } from './release-bundle.mjs';

const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);

function fixture(version = '0.1.0') {
    const root = mkdtempSync(
        path.join(os.tmpdir(), 'keeperd-release-fixture-')
    );
    const write = (file, contents = '') => {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, contents);
    };
    write(
        'bin/keeperd.mjs',
        readFileSync(path.join(sourceRoot, 'bin/keeperd.mjs'), 'utf8')
    );
    write('dist/index.html', '<!doctype html>');
    write('dist/old.js', 'old bundle');
    write('dist/.keeperd-build.json', '{"sourceRevision":"source"}\n');
    write('tools/local-erd/server.mjs', 'runtime server');
    write('tools/local-erd/schema-diff.js', 'runtime diff');
    write('tools/local-erd/introspect.sql', 'select 1;');
    write(
        'tools/local-erd/index.html',
        '<!doctype html><title>KeepERD</title>'
    );
    write(
        'tools/local-erd/library.html',
        '<!doctype html><title>Saved ERDs</title>'
    );
    write(
        'tools/local-erd/keeperd-version.mjs',
        readFileSync(
            path.join(sourceRoot, 'tools/local-erd/keeperd-version.mjs'),
            'utf8'
        )
    );
    write('tools/local-erd/server.test.mjs', 'test only');
    write('tools/local-erd/schema-diff.test.js', 'test only');
    write('package.json', '{}\n');
    write('package-lock.json', '{}\n');
    write('KEEPERD_VERSION', `${version}\n`);
    write('LICENSE', 'AGPL-3.0');
    write('NOTICE', 'notice');
    return root;
}

test('creates a portable runtime archive with a source-controlled version and checksum', () => {
    const root = fixture();
    const extract = mkdtempSync(
        path.join(os.tmpdir(), 'keeperd-release-extract-')
    );
    try {
        const { archive, checksum, sha256 } = createReleaseBundle({
            root,
            outputDirectory: path.join(root, 'output'),
        });
        assert.ok(existsSync(archive));
        assert.equal(
            readFileSync(checksum, 'utf8'),
            `${sha256}  keeperd-v0.1.0.tar.gz\n`
        );
        assert.equal(
            createHash('sha256').update(readFileSync(archive)).digest('hex'),
            sha256
        );

        execFileSync('tar', ['-xzf', archive, '-C', extract]);
        const bundle = path.join(extract, 'keeperd-v0.1.0');
        for (const file of [
            'bin/keeperd.mjs',
            'dist/index.html',
            'tools/local-erd/server.mjs',
            'tools/local-erd/schema-diff.js',
            'tools/local-erd/introspect.sql',
            'tools/local-erd/index.html',
            'tools/local-erd/library.html',
            'package.json',
            'package-lock.json',
            'KEEPERD_VERSION',
            'LICENSE',
            'NOTICE',
        ])
            assert.ok(existsSync(path.join(bundle, file)), file);
        assert.equal(
            JSON.parse(
                readFileSync(
                    path.join(bundle, 'dist/.keeperd-build.json'),
                    'utf8'
                )
            ).sourceRevision,
            null
        );
        assert.ok(statSync(path.join(bundle, 'bin/keeperd.mjs')).mode & 0o111);
        const version = spawnSync(
            process.execPath,
            [path.join(bundle, 'bin/keeperd.mjs'), '--version'],
            { encoding: 'utf8' }
        );
        assert.equal(version.status, 0, version.stderr);
        assert.equal(version.stdout, 'KeepERD 0.1.0\n');
        assert.equal(
            existsSync(path.join(bundle, 'tools/local-erd/server.test.mjs')),
            false
        );
        assert.equal(
            existsSync(
                path.join(bundle, 'tools/local-erd/schema-diff.test.js')
            ),
            false
        );
        assert.equal(existsSync(path.join(bundle, 'node_modules')), false);
    } finally {
        rmSync(root, { force: true, recursive: true });
        rmSync(extract, { force: true, recursive: true });
    }
});

test('creates byte-identical archives without host metadata', () => {
    const root = fixture();
    try {
        const first = createReleaseBundle({
            root,
            outputDirectory: path.join(root, 'first'),
        });
        const second = createReleaseBundle({
            root,
            outputDirectory: path.join(root, 'second'),
        });
        assert.deepEqual(
            readFileSync(first.archive),
            readFileSync(second.archive)
        );

        const entries = execFileSync('tar', ['-tzf', first.archive], {
            encoding: 'utf8',
        });
        assert.doesNotMatch(entries, /(^|\n)[^\n]*\._/);
        assert.doesNotMatch(entries, /PaxHeader/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('validates source and requested release versions', () => {
    const root = fixture();
    try {
        assert.equal(
            createReleaseBundle({
                root,
                version: '0.1.0',
                outputDirectory: path.join(root, 'output'),
            }).archive,
            path.join(root, 'output', 'keeperd-v0.1.0.tar.gz')
        );
        assert.throws(
            () => createReleaseBundle({ root, version: '0.2.0' }),
            /does not match KEEPERD_VERSION 0.1.0/
        );
        for (const version of ['v0.1.0', 'keeperd-v0.1.0', 'foo', '1.0'])
            assert.throws(
                () => createReleaseBundle({ root, version }),
                /SemVer value without a leading v/
            );
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('accepts prerelease SemVer from KEEPERD_VERSION', () => {
    const root = fixture('1.2.3-beta.1');
    try {
        assert.match(
            createReleaseBundle({
                root,
                outputDirectory: path.join(root, 'output'),
            }).archive,
            /keeperd-v1\.2\.3-beta\.1\.tar\.gz$/
        );
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('rejects invalid source-controlled versions', () => {
    const root = fixture('v0.1.0');
    try {
        assert.throws(
            () => createReleaseBundle({ root }),
            /SemVer value without a leading v/
        );
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});
