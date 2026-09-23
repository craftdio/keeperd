import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { airflowDockerArguments } from './airflow-replay.mjs';
import { airflowProfile } from './schema-replay.mjs';

const docker = (args, options = {}) =>
    execFileSync('docker', args, {
        encoding: 'utf8',
        timeout: 600000,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
    });

test(
    'official Airflow image migrates only an empty metadata database',
    { skip: process.env.LOCAL_ERD_AIRFLOW_TEST !== '1', timeout: 900000 },
    async () => {
        const suffix = randomBytes(6).toString('hex');
        const postgres = `keeperd-airflow-pg-${suffix}`;
        const database = `airflow_${suffix}`;
        const profile = {
            ...airflowProfile(
                'https://github.com/NangmanAzit/nangmanazit-data-airflow.git'
            ),
            airflowVersion: '3.3.1',
            pythonVersion: '3.12',
            airflowImage: 'apache/airflow:3.3.1-python3.12',
        };
        try {
            docker([
                'run',
                '-d',
                '--rm',
                '--name',
                postgres,
                '--network',
                'none',
                '-e',
                'POSTGRES_HOST_AUTH_METHOD=trust',
                'postgres:17-alpine',
            ]);
            for (let attempt = 0; attempt < 60; attempt += 1) {
                try {
                    docker(['exec', postgres, 'pg_isready', '-U', 'postgres']);
                    break;
                } catch (error) {
                    if (attempt === 59) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
            docker(['exec', postgres, 'createdb', '-U', 'postgres', database]);
            docker(
                airflowDockerArguments({
                    profile,
                    container: postgres,
                    database,
                })
            );
            const result = docker([
                'exec',
                postgres,
                'psql',
                '-X',
                '-qAt',
                '-U',
                'postgres',
                '-d',
                database,
                '-c',
                "SELECT to_regclass('public.dag') IS NOT NULL, (SELECT count(*) FROM dag), to_regclass('public.alembic_version') IS NOT NULL, to_regclass('public.flyway_schema_history') IS NULL;",
            ]).trim();
            assert.equal(result, 't|0|t|t');
            docker(
                airflowDockerArguments({
                    profile,
                    container: postgres,
                    database,
                })
            );
            assert.equal(
                docker([
                    'exec',
                    postgres,
                    'psql',
                    '-X',
                    '-qAt',
                    '-U',
                    'postgres',
                    '-d',
                    database,
                    '-c',
                    'SELECT count(*) FROM dag;',
                ]).trim(),
                '0'
            );
        } finally {
            try {
                docker(['rm', '-f', postgres]);
            } catch {
                /* Best-effort cleanup for a disposable integration container. */
            }
        }
    }
);
