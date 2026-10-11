'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const game = require('../src/game');

function newPet(overrides = {}) {
  return { ...game.createPet({ id: crypto.randomUUID(), name: '团子' }), ...overrides };
}

test('新宠物初始状态', () => {
  const p = newPet();
  assert.strictEqual(p.level, 1);
  assert.strictEqual(p.xp, 0);
  assert.strictEqual(p.hunger, 85);
  assert.strictEqual(p.happiness, 80);
  assert.strictEqual(p.coins, 50);
  assert.strictEqual(game.stageOf(p.level).key, 'egg');
});

test('升级经验曲线单调递增', () => {
  for (let lv = 1; lv < 60; lv++) {
    assert.ok(game.xpForLevel(lv + 1) > game.xpForLevel(lv), `xp(${lv + 1}) 应大于 xp(${lv})`);
  }
});

test('投喂: 涨饱食/心情, 扣金币, 加经验', () => {
  const p = newPet();
  const fish = game.FOODS.find((f) => f.id === 'fish');
  const res = game.feed(p, fish, p.lastTickAt);
  assert.ok(res.ok);
  assert.strictEqual(p.hunger, 100); // 85 + 16 = 101 -> 封顶 100
  assert.strictEqual(p.happiness, 88); // 80 + 8
  assert.strictEqual(p.coins, 45);
  assert.strictEqual(p.xp, 6);
});

test('投喂: 免费食物不扣金币', () => {
  const p = newPet();
  const cookie = game.FOODS.find((f) => f.id === 'cookie');
  const res = game.feed(p, cookie, p.lastTickAt);
  assert.ok(res.ok);
  assert.strictEqual(p.coins, 50);
});

test('投喂: 吃太饱会被拒绝', () => {
  const p = newPet({ hunger: 100 });
  const res = game.feed(p, game.FOODS[0], p.lastTickAt);
  assert.ok(!res.ok);
  assert.match(res.error, /饱/);
});

test('投喂: 金币不足被拒绝', () => {
  const p = newPet({ coins: 0 });
  const lobster = game.FOODS.find((f) => f.id === 'lobster');
  const res = game.feed(p, lobster, p.lastTickAt);
  assert.ok(!res.ok);
  assert.match(res.error, /金币/);
  assert.strictEqual(p.coins, 0);
  assert.strictEqual(p.xp, 0);
});

test('升级: 经验攒满自动升级并发金币奖励', () => {
  const p = newPet({ xp: game.xpForLevel(1) - 1 });
  const events = [];
  game.gainXp(p, 10, events);
  assert.strictEqual(p.level, 2);
  assert.strictEqual(p.coins, 50 + 2 * 20);
  assert.ok(events.some((e) => e.type === 'levelup'));
});

test('进化: 升到 5 级从蛋变成幼猫', () => {
  const p = newPet({ level: 4, xp: game.xpForLevel(4) - 5 });
  const events = [];
  game.gainXp(p, 100, events);
  assert.strictEqual(p.level, 5);
  assert.strictEqual(game.stageOf(p.level).key, 'kitten');
  assert.ok(events.some((e) => e.type === 'evolve' && e.stage === 'kitten'));
});

test('玩耍: 涨心情加金币, 有冷却', () => {
  const p = newPet();
  const res1 = game.play(p, p.lastTickAt);
  assert.ok(res1.ok);
  assert.strictEqual(p.coins, 53);
  assert.strictEqual(p.happiness, 95);
  assert.strictEqual(p.hunger, 82); // 85 - 3

  const res2 = game.play(p, p.lastPlayAt + 5000); // 冷却中
  assert.ok(!res2.ok);
  assert.match(res2.error, /秒/);
});

test('玩耍: 饿到没力气时拒绝', () => {
  const p = newPet({ hunger: 3 });
  const res = game.play(p, p.lastTickAt);
  assert.ok(!res.ok);
  assert.match(res.error, /饿/);
});

test('衰减: 随时间流失饱食与心情, 且不低于 0', () => {
  const p = newPet();
  const minutes = 60;
  game.applyDecay(p, p.lastTickAt + minutes * 60000);
  assert.strictEqual(p.hunger, Math.round(85 - 0.3 * minutes));
  assert.ok(p.happiness < 80);
  assert.ok(p.hunger >= 0 && p.happiness >= 0);

  game.applyDecay(p, p.lastTickAt + 10 * 24 * 3600000); // 很久不喂
  assert.strictEqual(p.hunger, 0);
  assert.strictEqual(p.happiness, 0);
});

test('衰减: 饿肚子时心情掉得更快', () => {
  const p1 = newPet({ hunger: 50 });
  game.applyDecay(p1, p1.lastTickAt + 60 * 60000);
  const p2 = newPet({ hunger: 50 });
  p2.hunger = 0; // 模拟饿晕状态
  p2.lastTickAt = p1.lastTickAt + 60 * 60000; // 已结算过一小时
  game.applyDecay(p2, p2.lastTickAt + 60 * 60000);
  assert.ok(p1.happiness - p2.happiness >= 0.5 * 60, '饿肚子时心情衰减更快');
});

test('状态标签: 饿晕/好饿/不开心/超开心', () => {
  assert.strictEqual(game.statusOf(newPet({ hunger: 0 })).key, 'starving');
  assert.strictEqual(game.statusOf(newPet({ hunger: 20 })).key, 'hungry');
  assert.strictEqual(game.statusOf(newPet({ happiness: 10 })).key, 'sad');
  assert.strictEqual(game.statusOf(newPet({ happiness: 90 })).key, 'happy');
});
