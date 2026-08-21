import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const legacyEntry = await readFile(new URL('../louvor.html', import.meta.url), 'utf8');

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());
}

test('as duas entradas publicadas permanecem equivalentes', () => {
  assert.equal(legacyEntry, index);
});

test('todo JavaScript inline tem sintaxe válida', () => {
  inlineScripts(index).forEach((script, position) => {
    assert.doesNotThrow(() => new vm.Script(script, { filename: `inline-${position + 1}.js` }));
  });
});

test('autenticação é carregada sem dependência do Storage pago', () => {
  assert.match(index, /firebase-auth-compat\.js/);
  assert.doesNotMatch(index, /firebase-storage-compat\.js/);
  assert.match(index, /signInWithEmailAndPassword/);
});

test('upload fragmenta Base64 em documentos menores que 1 MiB', () => {
  assert.doesNotMatch(index, /new FileReader\(/);
  assert.doesNotMatch(index, /readAsDataURL\(/);
  assert.match(index, /FIRESTORE_CHUNK_CHARS = 600000/);
  assert.match(index, /collection\('chunks'\)/);
  assert.match(index, /encoding:'base64-chunks'/);
});

test('salvamentos esperam confirmação do servidor', () => {
  assert.match(index, /get\(\{source:'server'\}\)/);
  assert.match(index, /O servidor não confirmou/);
});

test('a inicialização não grava nem importa automaticamente', () => {
  const init = index.slice(index.indexOf('async function init()'));
  assert.doesNotMatch(init, /await saveKey\(/);
  assert.doesNotMatch(init, /importDriveBatch\(/);
});

test('credencial administrativa antiga não está no HTML', () => {
  assert.doesNotMatch(index, /u\s*===\s*['"]lider['"]/);
  assert.doesNotMatch(index, /p\s*===\s*['"]1234['"]/);
});
