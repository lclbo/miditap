#!/usr/bin/env node
/**
 * Audit lockfile: fail if any resolved dependency was published within MIN_DAYS.
 * Complements install-time enforcement (.npmrc min-release-age).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_DAYS = Number(process.env.MIN_RELEASE_AGE_DAYS ?? "14");
const MIN_MS = MIN_DAYS * 24 * 60 * 60 * 1000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function tooNew(name, version, publishedAt) {
  const age = Date.now() - publishedAt.getTime();
  if (age < MIN_MS) {
    const days = (age / (24 * 60 * 60 * 1000)).toFixed(1);
    return `${name}@${version} published ${days}d ago (${publishedAt.toISOString()})`;
  }
  return null;
}

function parseNpmLockPackages(lock) {
  const packages = new Map();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!entry.version || key === "") continue;
    let name = entry.name;
    if (!name) {
      const parts = key.replace(/^node_modules\//, "").split("/node_modules/");
      name = parts[parts.length - 1];
    }
    packages.set(`${name}@${entry.version}`, { name, version: entry.version });
  }
  return [...packages.values()];
}

const npmCache = new Map();
async function npmPublishedAt(name, version) {
  const cacheKey = `${name}@${version}`;
  if (npmCache.has(cacheKey)) return npmCache.get(cacheKey);

  const encoded = name.replace("/", "%2F");
  const res = await fetch(`https://registry.npmjs.org/${encoded}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    npmCache.set(cacheKey, null);
    return null;
  }
  const data = await res.json();
  const time = data.time?.[version];
  const date = time ? new Date(time) : null;
  npmCache.set(cacheKey, date);
  return date;
}

async function checkNpm() {
  const lockPath = join(ROOT, "package-lock.json");
  if (!existsSync(lockPath)) {
    console.log("npm: no package-lock.json — skip");
    return [];
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const packages = parseNpmLockPackages(lock);
  const violations = [];

  for (const { name, version } of packages) {
    const published = await npmPublishedAt(name, version);
    if (!published) continue;
    const v = tooNew(name, version, published);
    if (v) violations.push(`npm: ${v}`);
  }
  return violations;
}

function checkNpmPolicy() {
  const npmrc = join(ROOT, ".npmrc");
  if (!existsSync(npmrc)) {
    return ["missing .npmrc with min-release-age=14"];
  }
  const text = readFileSync(npmrc, "utf8");
  if (!/min-release-age\s*=\s*14/.test(text)) {
    return [".npmrc must set min-release-age=14"];
  }
  return [];
}

const violations = [...checkNpmPolicy()];
violations.push(...(await checkNpm()));

if (violations.length > 0) {
  console.error(`Supply-chain check failed (${MIN_DAYS}-day minimum release age):\n`);
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
}

console.log(`Supply-chain check passed — all audited packages are ≥ ${MIN_DAYS} days old.`);
