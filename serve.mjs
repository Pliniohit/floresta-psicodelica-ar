#!/usr/bin/env node
/**
 * Servidor HTTPS estático para desenvolvimento.
 *
 * WebXR só roda em contexto seguro. `http://localhost` conta como seguro,
 * mas o Quest acessa a máquina por IP da rede local — e aí http NÃO conta.
 * Por isso geramos um certificado autoassinado e servimos por https.
 */
import { createServer as createHttps } from 'node:https';
import { createServer as createHttp } from 'node:http';
import { readFile, stat, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { networkInterfaces } from 'node:os';
import { join, extname, normalize, resolve } from 'node:path';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname);
const CERT_DIR = join(ROOT, 'certs');
const KEY = join(CERT_DIR, 'key.pem');
const CRT = join(CERT_DIR, 'cert.pem');
const PLAIN = process.argv.includes('--http') || process.env.PROTOCOL === 'http';
const PORT = Number(process.env.PORT) || (PLAIN ? 8080 : 8443);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/** IPv4 de todas as interfaces não-internas — é por um destes que o Quest entra. */
function lanAddresses() {
  return Object.values(networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** Certificado autoassinado com SAN cobrindo localhost e os IPs da LAN. */
async function ensureCert() {
  if (await exists(KEY) && await exists(CRT)) return;

  await mkdir(CERT_DIR, { recursive: true });
  const ips = lanAddresses();
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((i) => `IP:${i}`)].join(',');

  console.log('Gerando certificado autoassinado para', san);
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', KEY, '-out', CRT,
    '-days', '825', '-subj', '/CN=floresta-psicodelica-ar',
    '-addext', `subjectAltName=${san}`,
  ]);
}

/** Resolve a URL para um caminho dentro de ROOT, barrando path traversal. */
function safePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]));
  const full = resolve(join(ROOT, clean));
  if (full !== ROOT && !full.startsWith(ROOT + '/')) return null;
  return full;
}

async function handler(req, res) {
  let file = safePath(req.url === '/' ? '/index.html' : req.url);
  if (!file) { res.writeHead(403).end('403'); return; }

  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',   // durante o desenvolvimento, sempre a versão nova
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — não encontrado: ' + req.url);
  }
}

// --http serve sem TLS: serve para testar em http://localhost (que o navegador
// já considera contexto seguro) e para rodar atrás de um túnel que termina o
// TLS por fora, como ngrok ou cloudflared. NÃO serve para acessar por IP da LAN.
let server;
if (PLAIN) {
  server = createHttp(handler);
} else {
  await ensureCert();
  const [key, cert] = await Promise.all([readFile(KEY), readFile(CRT)]);
  server = createHttps({ key, cert }, handler);
}

const scheme = PLAIN ? 'http' : 'https';
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('\n  🦋  Universo Encantado\n');
  console.log(`      neste Mac   ${scheme}://localhost:${PORT}`);
  for (const ip of ips) console.log(`      no Quest 3  ${scheme}://${ip}:${PORT}`);
  if (PLAIN) {
    console.log('\n  Modo --http: o Quest NÃO consegue entrar em AR por IP sem TLS.');
    console.log('  Use este modo só para testar localmente ou atrás de um túnel https.\n');
  } else {
    console.log('\n  O certificado é autoassinado: o navegador do Quest vai avisar.');
    console.log('  Toque em "Advanced" / "Avançado" e depois em "Proceed" para continuar.\n');
  }
});
