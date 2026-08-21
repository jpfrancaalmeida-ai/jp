import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const legacyEntry = await readFile(new URL('../louvor.html', import.meta.url), 'utf8');
const transposer = await readFile(new URL('../audio-transposer.js', import.meta.url), 'utf8');
const soundTouchNode = await readFile(new URL('../vendor/soundtouch/SoundTouchNode.js', import.meta.url), 'utf8');
const soundTouchProcessor = await readFile(new URL('../vendor/soundtouch/soundtouch-processor.js', import.meta.url), 'utf8');
const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

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

test('cada voz reproduzível oferece transposição de -6 a +6 semitons', () => {
  assert.match(index, /audio-transposer\.js/);
  assert.match(index, /class="transposer-range" type="range" min="-6" max="6" step="1"/);
  assert.match(index, /setVoicePitch\(/);
  assert.match(index, /Tom alterado sem mudar a velocidade/);
});

test('transpositor usa AudioWorklet local e não muda a velocidade do elemento', () => {
  assert.match(transposer, /new SoundTouchNode/);
  assert.match(transposer, /pitchSemitones\.setValueAtTime/);
  assert.doesNotMatch(transposer, /audio\.playbackRate\s*=/);
  assert.match(soundTouchNode, /class SoundTouchNode extends AudioWorkletNode/);
  assert.match(soundTouchProcessor, /registerProcessor/);
});

test('UX de vozes oferece filtro por classificação e indicador compacto de tom', () => {
  assert.match(index, /id="voz_filter"/);
  assert.match(index, /\['Todos',\.\.\.VOZ_TIPOS\]/);
  assert.match(index, /class="transposer-state/);
  assert.match(index, /class="transposer-state-dot"/);
  assert.match(index, /class="sr-only" aria-live="polite"/);
  assert.doesNotMatch(index, /class="transposer-reset"/);
  assert.doesNotMatch(index, /class="transposer-status"/);
});

test('líder pode editar nome e tipo com confirmação do servidor', () => {
  assert.match(index, /function startEditVoice/);
  assert.match(index, /function saveVoiceEdit/);
  assert.match(index, /getIdToken\(true\)/);
  assert.match(index, /ref\.update\(\{tipo,nome/);
  assert.match(index, /ref\.get\(\{source:'server'\}\)/);
  assert.match(index, /confirmed\.data\(\)\.tipo!==tipo/);
  assert.match(firestoreRules, /affectedKeys\(\)\.hasOnly\(\['tipo', 'nome', 'updatedAt', 'updatedBy'\]\)/);
});

test('edição de áudio legado salva apenas metadados pequenos', () => {
  assert.match(index, /voiceMeta: \{\}/);
  assert.match(index, /saveKey\('voiceMeta__v1',nextMeta\)/);
  assert.match(index, /loadKey\('voiceMeta__v1', \{\}\)/);
  assert.match(index, /Object\.assign\(voice,state\.voiceMeta\[voice\.id\]\)/);
  assert.doesNotMatch(index, /function migrateLegacyVoice/);
});

test('Apoio separa uploads seguros de materiais que aceitam somente link', () => {
  assert.match(index, /\['Áudio','PDF','Texto','Vídeo','Outro'\]/);
  assert.match(index, /tipo === 'Vídeo' \|\| tipo === 'Outro'/);
  assert.match(index, /type="url" inputmode="url"/);
  assert.match(index, /Não é possível enviar vídeos/);
  assert.match(index, /file\.type\.startsWith\('video\/'\)/);
  assert.doesNotMatch(index, /accept="\*\/\*"/);
});

test('regras permitem arquivo somente para Áudio ou PDF e exigem link para Vídeo ou Outro', () => {
  assert.match(firestoreRules, /request\.resource\.data\.tipo == 'Áudio' \|\| request\.resource\.data\.tipo == 'PDF'/);
  assert.match(firestoreRules, /request\.resource\.data\.tipo == 'Vídeo' \|\| request\.resource\.data\.tipo == 'Outro'/);
  assert.match(firestoreRules, /request\.resource\.data\.url is string/);
  assert.match(firestoreRules, /get\(\/databases\/\$\(database\)\/documents\/songMaterials\/\$\(materialId\)\)\.data\.tipo/);
});
