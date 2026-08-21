import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const apiKey = html.match(/apiKey:\s*"([^"]+)"/)?.[1];
if (!apiKey) throw new Error('Configuração pública do Firebase não encontrada.');

const projectId = 'base-de-dados---louvor';
const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/store?pageSize=100&key=${encodeURIComponent(apiKey)}`;
const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Backup falhou: HTTP ${response.status}.`);

const payload = await response.json();
const documents = payload.documents || [];
const required = ['songs__v1','murals__v1','agenda__v1','voices__v1'];
const found = new Set(documents.map(document=>document.name.split('/').at(-1)));
const missing = required.filter(name=>!found.has(name));
if (missing.length) throw new Error(`Backup incompleto; documentos ausentes: ${missing.join(', ')}.`);

const outputDir = resolve(root, '.local-backups');
await mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(outputDir, `firestore-${stamp}.json`);
await writeFile(output, JSON.stringify({projectId,createdAt:new Date().toISOString(),documents}, null, 2), 'utf8');
console.log(`Backup confirmado: ${documents.length} documentos em ${output}`);
