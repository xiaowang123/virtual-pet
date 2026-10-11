'use strict';

// ============================================================
// 云宠物 CloudPet —— 游戏核心逻辑 (纯函数, 不依赖 I/O)
// 规则: 投喂涨饱食/心情/经验, 玩耍涨心情/经验/金币,
//       经验攒满升级, 等级达到门槛进化, 状态随时间衰减。
// ============================================================

const MAX_LEVEL = 99;
const STAT_MAX = 100;

// 状态衰减速率 (每分钟)
const DECAY = {
  hunger: 0.3,
  happiness: 0.12,
  starvingHappiness: 0.5, // 饿肚子时心情掉得更快
};

// 玩耍冷却 (毫秒) 与效果
const PLAY_COOLDOWN_MS = 30 * 1000;
const PLAY_EFFECT = { hunger: -3, happiness: 15, xp: 5, coins: 3 };

// 升级奖励: 每升 1 级获得 level * 20 金币
const LEVELUP_COIN_PER_LEVEL = 20;

// 食物图鉴 (id 唯一, cost 金币, hunger/happiness 恢复量, xp 经验)
const FOODS = [
  { id: 'cookie',    name: '小饼干', emoji: '🍪', cost: 0,  hunger: 8,  happiness: 2,  xp: 2,  desc: '基础口粮, 不要钱' },
  { id: 'apple',     name: '苹果',   emoji: '🍎', cost: 2,  hunger: 12, happiness: 3,  xp: 3,  desc: '脆甜健康' },
  { id: 'fish',      name: '小鱼干', emoji: '🐟', cost: 5,  hunger: 16, happiness: 8,  xp: 6,  desc: '喵星人的最爱' },
  { id: 'cake',      name: '小蛋糕', emoji: '🍰', cost: 10, hunger: 22, happiness: 12, xp: 9,  desc: '甜到心里' },
  { id: 'steak',     name: '牛排',   emoji: '🥩', cost: 18, hunger: 30, happiness: 15, xp: 13, desc: '硬菜!' },
  { id: 'lobster',   name: '龙虾大餐', emoji: '🦞', cost: 30, hunger: 45, happiness: 25, xp: 20, desc: '豪华到发光' },
];

// 进化阶段: 等级达到 minLevel 即进化为该形态
const STAGES = [
  { key: 'egg',     name: '宠物蛋', minLevel: 1,  emoji: '🥚' },
  { key: 'kitten',  name: '幼猫',   minLevel: 5,  emoji: '🐣' },
  { key: 'cat',     name: '灵猫',   minLevel: 10, emoji: '🐱' },
  { key: 'legend',  name: '神兽',   minLevel: 20, emoji: '🦁' },
];

// 升到下一级所需经验: 随等级指数增长
function xpForLevel(level) {
  return Math.round(40 * Math.pow(level, 1.35));
}

function stageOf(level) {
  let s = STAGES[0];
  for (const st of STAGES) if (level >= st.minLevel) s = st;
  return s;
}

function statusOf(pet) {
  if (pet.hunger <= 0) return { key: 'starving', label: '饿晕了', emoji: '💫' };
  if (pet.hunger < 30) return { key: 'hungry', label: '好饿呀', emoji: '😿' };
  if (pet.happiness < 25) return { key: 'sad', label: '有点不开心', emoji: '🥺' };
  if (pet.happiness > 80) return { key: 'happy', label: '超开心', emoji: '😻' };
  return { key: 'fine', label: '心情不错', emoji: '😺' };
}

function createPet({ id, name }) {
  const now = Date.now();
  return {
    id,
    name,
    level: 1,
    xp: 0,
    hunger: 85,
    happiness: 80,
    coins: 50,
    bornAt: now,
    lastTickAt: now,
    lastPlayAt: 0,
    imageExt: null, // 自定义形象: 'png' | 'jpg' | 'gif' | 'webp', 为 null 时使用内置像素画
  };
}

// 根据距上次结算的时长, 结算状态衰减 (幂等: 结算后刷新 lastTickAt)
function applyDecay(pet, now = Date.now()) {
  const minutes = Math.max(0, (now - pet.lastTickAt) / 60000);
  if (minutes === 0) return pet;
  const starving = pet.hunger <= 0;
  pet.hunger = clamp(pet.hunger - DECAY.hunger * minutes, 0, STAT_MAX);
  const moodDrop = (DECAY.happiness + (starving ? DECAY.starvingHappiness : 0)) * minutes;
  pet.happiness = clamp(pet.happiness - moodDrop, 0, STAT_MAX);
  pet.lastTickAt = now;
  return pet;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// 结算经验与升级, 返回升级/进化事件
function gainXp(pet, amount, events) {
  pet.xp += amount;
  while (pet.level < MAX_LEVEL && pet.xp >= xpForLevel(pet.level)) {
    pet.xp -= xpForLevel(pet.level);
    pet.level += 1;
    pet.coins += pet.level * LEVELUP_COIN_PER_LEVEL;
    const stage = stageOf(pet.level);
    const prevStage = stageOf(pet.level - 1);
    events.push({ type: 'levelup', text: `升级啦! 达到 Lv.${pet.level}, 获得 ${pet.level * LEVELUP_COIN_PER_LEVEL} 金币`, level: pet.level });
    if (stage.key !== prevStage.key) {
      events.push({ type: 'evolve', text: `✨ 进化! ${pet.name} 进化成了「${stage.name}」!`, stage: stage.key, level: pet.level });
    }
  }
}

function feed(pet, food, now = Date.now()) {
  applyDecay(pet, now);
  const events = [];
  if (pet.hunger >= STAT_MAX) {
    return { ok: false, error: `${pet.name} 已经吃得饱饱的, 再喂要撑坏啦`, pet, events };
  }
  if (pet.coins < food.cost) {
    return { ok: false, error: `金币不够啦! 需要 ${food.cost} 金币 (当前 ${pet.coins})`, pet, events };
  }
  pet.coins -= food.cost;
  pet.hunger = clamp(pet.hunger + food.hunger, 0, STAT_MAX);
  pet.happiness = clamp(pet.happiness + food.happiness, 0, STAT_MAX);
  events.push({ type: 'feed', text: `投喂了${food.name} ${food.emoji}, 饱食度 +${food.hunger}` });
  gainXp(pet, food.xp, events);
  return { ok: true, pet, events };
}

function play(pet, now = Date.now()) {
  applyDecay(pet, now);
  const events = [];
  if (pet.hunger <= 5) {
    return { ok: false, error: `${pet.name} 饿得没力气玩了, 先喂点吃的吧`, pet, events };
  }
  const elapsed = now - pet.lastPlayAt;
  if (elapsed < PLAY_COOLDOWN_MS) {
    const secs = Math.ceil((PLAY_COOLDOWN_MS - elapsed) / 1000);
    return { ok: false, error: `${pet.name} 玩累了, ${secs} 秒后再来`, pet, events };
  }
  pet.lastPlayAt = now;
  pet.hunger = clamp(pet.hunger + PLAY_EFFECT.hunger, 0, STAT_MAX);
  pet.happiness = clamp(pet.happiness + PLAY_EFFECT.happiness, 0, STAT_MAX);
  pet.coins += PLAY_EFFECT.coins;
  events.push({ type: 'play', text: `和 ${pet.name} 愉快地玩耍, 心情 +${PLAY_EFFECT.happiness}, 金币 +${PLAY_EFFECT.coins}` });
  gainXp(pet, PLAY_EFFECT.xp, events);
  return { ok: true, pet, events };
}

module.exports = {
  MAX_LEVEL,
  STAT_MAX,
  DECAY,
  PLAY_COOLDOWN_MS,
  FOODS,
  STAGES,
  xpForLevel,
  stageOf,
  statusOf,
  createPet,
  applyDecay,
  gainXp,
  feed,
  play,
  clamp,
};
