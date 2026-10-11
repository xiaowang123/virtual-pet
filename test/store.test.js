'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { JsonStore } = require('../src/store');
const game = require('../src/game');

test('存储: 创建 / 读取 / 更新 / 持久化重载', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpet-'));
  const file = path.join(dir, 'pets.json');
  const pet = game.createPet({ id: crypto.randomUUID(), name: '麻薯' });

  const s1 = new JsonStore(file);
  await s1.load();
  await s1.create(pet);
  assert.deepStrictEqual(s1.get(pet.id), pet);

  await s1.update(pet.id, (p) => { p.name = '大麻薯'; p.coins = 99; });
  assert.strictEqual(s1.get(pet.id).name, '大麻薯');

  // 新实例从磁盘重载, 数据仍在
  const s2 = new JsonStore(file);
  await s2.load();
  assert.strictEqual(s2.get(pet.id).name, '大麻薯');
  assert.strictEqual(s2.get(pet.id).coins, 99);

  // 不存在的宠物
  assert.strictEqual(s2.get('nope'), null);
  assert.strictEqual(await s2.update('nope', () => {}), null);
});

test('存储: 并发写不损坏数据 (串行化)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpet-'));
  const file = path.join(dir, 'pets.json');
  const s = new JsonStore(file);
  await s.load();

  const pets = Array.from({ length: 10 }, () =>
    game.createPet({ id: crypto.randomUUID(), name: 'p' }));
  await Promise.all(pets.map((p) => s.create(p)));

  await Promise.all(pets.map((p, i) => s.update(p.id, (x) => { x.coins = i; })));

  const reloaded = new JsonStore(file);
  await reloaded.load();
  assert.strictEqual(reloaded.list().length, 10);
  pets.forEach((p, i) => assert.strictEqual(reloaded.get(p.id).coins, i));
});

test('存储: 删除宠物并持久化', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpet-'));
  const file = path.join(dir, 'pets.json');
  const s = new JsonStore(file);
  await s.load();
  const pet = game.createPet({ id: crypto.randomUUID(), name: '要被放生' });
  await s.create(pet);

  assert.strictEqual(await s.remove(pet.id), true);
  assert.strictEqual(s.get(pet.id), null);
  assert.strictEqual(await s.remove(pet.id), false); // 再删一次返回 false

  const reloaded = new JsonStore(file);
  await reloaded.load();
  assert.strictEqual(reloaded.get(pet.id), null);
});

test('存储: 损坏文件自动备份重建, 不抛错', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpet-'));
  const file = path.join(dir, 'pets.json');
  fs.writeFileSync(file, '{{{ not json', 'utf8');

  const s = new JsonStore(file);
  await s.load(); // 不应抛错
  assert.deepStrictEqual(s.data.pets, {});
  const baks = fs.readdirSync(dir).filter((f) => f.includes('.bak-'));
  assert.strictEqual(baks.length, 1);
});
