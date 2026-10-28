#!/usr/bin/env node
// Calls the local 02-image-generation Cloudflare Worker's /rpc endpoint directly,
// bypassing the MCP stdio bridge so large base64 payloads (prompt, reference images,
// output image) never have to pass through a model's context window.
//
// Usage:
//   node gen-image.mjs --method generateImageFast --prompt "..." \
//     --ref path/to/ref1.jpg [--ref path/to/ref2.jpg] \
//     --out path/to/output.jpg [--steps 4] [--width 1024] [--height 1024]

import fs from 'node:fs';
import path from 'node:path';

const WORKER_URL = 'https://02-image-generation.samfarkhooi.workers.dev';
const SECRET_PATH = 'C:\\Users\\SamFarkhooi\\mcp-servers\\workers-ai-image-gen\\.dev.vars';

function parseArgs(argv) {
  const out = { refs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--method') out.method = argv[++i];
    else if (a === '--prompt') out.prompt = argv[++i];
    else if (a === '--ref') out.refs.push(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--steps') out.steps = Number(argv[++i]);
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--height') out.height = Number(argv[++i]);
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (!out.method || !out.prompt || !out.out) {
    throw new Error('Required: --method <generateImageFast|generateImageHero> --prompt "..." --out path');
  }
  return out;
}

function readSecret() {
  const text = fs.readFileSync(SECRET_PATH, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^SHARED_SECRET=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error('SHARED_SECRET not found in ' + SECRET_PATH);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = readSecret();

  const refsB64 = args.refs.map((p) => fs.readFileSync(p).toString('base64'));
  const rpcArgs = [
    args.prompt,
    refsB64[0],
    refsB64[1],
    args.steps,
    args.width,
    args.height,
  ];

  const res = await fetch(`${WORKER_URL}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ method: args.method, args: rpcArgs }),
  });

  if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
    const text = await res.text();
    throw new Error(`Worker call failed (${res.status}): ${text.slice(0, 2000)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, buf);
  console.log(`Saved ${buf.length} bytes -> ${args.out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
