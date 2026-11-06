import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const { AssetReader } = createRequire(import.meta.url)('../asset-reader.js');
class TestAssetReader extends AssetReader {
  constructor(options) { super({ ...options, fetcher: async () => { throw new Error('REST indisponível no teste; usar SDK'); } }); }
}

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(script => script.trim());

const collections = new Map();
const elementStub = () => ({
  addEventListener() {},
  classList: { add() {}, remove() {}, toggle() {} },
  style: {},
  value: '',
});

function makeCollection(path) {
  if (!collections.has(path)) collections.set(path, new Map());
  const values = collections.get(path);
  const api = {
    doc(id) {
      const ref = {
        id,
        async set(data) { values.set(id, data); },
        async get() { return { id, ref, exists: values.has(id), data: () => values.get(id) }; },
        async delete() { values.delete(id); },
        collection(name) { return makeCollection(`${path}/${id}/${name}`); },
      };
      return ref;
    },
    async get() {
      return {
        forEach(callback) {
          for (const [id, data] of values) {
            const ref = api.doc(id);
            callback({ id, ref, data: () => data });
          }
        },
      };
    },
    orderBy(field) {
      return {
        async get() {
          const ordered = [...values.entries()].sort(([,a],[,b]) => a[field] - b[field]);
          return {
            forEach(callback) {
              for (const [id, data] of ordered) callback({ id, ref: api.doc(id), data: () => data });
            },
          };
        },
      };
    },
  };
  return api;
}

const db = {
  batch() {
    const operations = [];
    return {
      set(ref, data) { operations.push(() => ref.set(data)); },
      delete(ref) { operations.push(() => ref.delete()); },
      async commit() { await Promise.all(operations.map(operation => operation())); },
    };
  },
  collection(name) { return makeCollection(name); },
};

const context = vm.createContext({
  auth: { currentUser: { uid: 'leader-test', getIdToken: async () => 'test-token' } },
  firebaseConfig: { projectId: 'test-project' },
  console,
  confirm: () => true,
  db,
  document: { getElementById: elementStub, querySelectorAll: () => [] },
  firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } } },
  atob,
  btoa,
  Blob,
  Uint8Array,
  URL,
  setTimeout,
  clearTimeout,
  window: { PibuAssetReader: TestAssetReader },
});

const application = scripts.at(-1).replace(/init\(\);\s*$/, `
globalThis.__persistenceTest = { uploadAsset, loadAssetCollection, saveKey, assetObjectUrl, state };
`);
new vm.Script(application, { filename: 'application-under-test.js' }).runInContext(context);

test('upload confirmado continua disponível depois de uma nova leitura', async () => {
  const bytes = new Uint8Array(500000);
  bytes.fill(65);
  const file = { name: 'Áudio ensaio.mp3', size: bytes.length, type: 'audio/mpeg', arrayBuffer: async () => bytes.buffer };
  const saved = await context.__persistenceTest.uploadAsset(
    'songVoices',
    'voices',
    'song-1',
    file,
    { tipo: 'Tenor', nome: 'Ensaio' },
  );

  assert.equal(saved.songId, 'song-1');
  assert.equal(saved.documentBacked, true);
  assert.equal(saved.chunkCount, 2);
  assert.equal(collections.get('songVoices').has(saved.id), true);
  assert.equal(collections.get(`songVoices/${saved.id}/chunks`).size, 2);

  const stateAfterReload = {};
  await context.__persistenceTest.loadAssetCollection('songVoices', stateAfterReload);

  assert.equal(stateAfterReload['song-1'].length, 1);
  assert.equal(stateAfterReload['song-1'][0].id, saved.id);
  const objectUrl = await context.__persistenceTest.assetObjectUrl('songVoices', stateAfterReload['song-1'][0]);
  assert.match(objectUrl, /^blob:/);
});

test('arquivo acima de 10 MB é recusado antes do upload', async () => {
  const oversized = { name: 'grande.mp3', size: 10 * 1024 * 1024 + 1, type: 'audio/mpeg' };
  await assert.rejects(
    context.__persistenceTest.uploadAsset('songVoices', 'voices', 'song-1', oversized, {}),
    /10 MB/,
  );
});

test('falha na consulta retorna erro e preserva áudios já carregados', async () => {
  const originalCollection = db.collection;
  const target = { 'song-1': [{ id: 'existing', songId: 'song-1', documentBacked: true }] };
  db.collection = () => ({ get: async () => { throw new Error('Sem conexão'); } });
  try {
    assert.equal(await context.__persistenceTest.loadAssetCollection('songVoices', target), false);
    assert.equal(context.__persistenceTest.state.assetLoadStatus.songVoices, 'error');
    assert.equal(target['song-1'][0].id, 'existing');
  } finally { db.collection = originalCollection; }
});

test('edição textual só termina depois da releitura do servidor', async () => {
  await context.__persistenceTest.saveKey('agenda__test', [{ id: 'evento-1', date: '2026-08-23' }]);
  const stored = collections.get('store').get('agenda__test');
  assert.deepEqual(JSON.parse(stored.value), [{ id: 'evento-1', date: '2026-08-23' }]);
  assert.equal(stored.updatedBy, 'leader-test');
});
