#!/usr/bin/env node
/**
 * Run docker compose with a platform that matches local infra builds.
 *
 * Many dev machines set DOCKER_DEFAULT_PLATFORM=linux/amd64 globally (e.g. in
 * ~/.zshrc for OCI/CI parity). Our custom images are built for the host CPU by
 * default, so compose then fails with:
 *   platform (linux/arm64) does not match the specified platform (linux/amd64)
 *
 * Override with XPERIQ_DOCKER_PLATFORM=linux/amd64 when you explicitly need
 * amd64 locally (then run npm run infra:reset once).
 */
import { execSync } from 'node:child_process';
import os from 'node:os';

const hostArch = os.arch();
const defaultPlatform = hostArch === 'arm64' ? 'linux/arm64' : 'linux/amd64';
const platform = process.env.XPERIQ_DOCKER_PLATFORM || defaultPlatform;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/docker-compose.mjs <docker compose args...>');
  process.exit(1);
}

// Only custom-built services read XPERIQ_DOCKER_PLATFORM (see docker-compose.yml).
// Do not set DOCKER_DEFAULT_PLATFORM — it forces every pull (redis, cadvisor, …)
// to that platform and fails when an amd64 image is already cached on Apple Silicon.
const env = {
  ...process.env,
  XPERIQ_DOCKER_PLATFORM: platform,
  DOCKER_BUILDKIT: '1',
  COMPOSE_DOCKER_CLI_BUILD: '1',
};
delete env.DOCKER_DEFAULT_PLATFORM;

execSync(`docker compose ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
  stdio: 'inherit',
  env,
});
