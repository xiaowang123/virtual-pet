'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const game = require('./game');
const { JsonStore } = require('./store');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

// 上传的自定义形象图片 (放 data/uploads, 随数据卷持久化)
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1d', etag: true }));

// 静态资源: index 不缓存 (发版立即生效), 其余 ETag 校验 (max-age 0, 避免新旧资源混用)
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.set('Cache-Control', 'no-cache');
  },
}));

const store = new JsonStore(path.join(DATA_DIR, 'pets.json'));

// 把内部状态序列化成前端可直接用的形状 (数值圆整到 1 位小数)
const r1 = (v) => Math.round(v * 10) / 10;
function toPublic(pet) {
  return {
    ...pet,
    hunger: r1(pet.hunger),
    happiness: r1(pet.happiness),
    stage: game.stageOf(pet.level),
    status: game.statusOf(pet),
    xpNeed: game.xpForLevel(pet.level),
    maxLevel: game.MAX_LEVEL,
    imageUrl: pet.imageExt ? `/uploads/${pet.id}.${pet.imageExt}` : null,
  };
}

function findPet(id) {
  return id && store.get(id);
}

app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 游戏配置: 食物图鉴、进化表等, 前端与后端共用同一份规则
app.get('/api/config', (req, res) => {
  res.json({
    foods: game.FOODS,
    stages: game.STAGES,
    decay: game.DECAY,
    playCooldownMs: game.PLAY_COOLDOWN_MS,
    maxLevel: game.MAX_LEVEL,
  });
});

// 宠物列表: 不带 ids 返回全部 —— 前端以此为准, 浏览器不负责"记住存在哪些宠物";
// 带 ?ids=a,b 时按 id 批量查询 (兼容旧版客户端)
app.get('/api/pets', async (req, res, next) => {
  try {
    const pets = typeof req.query.ids === 'string'
      ? req.query.ids.split(',').filter(Boolean).slice(0, 50).map(findPet).filter(Boolean)
      : store.list();
    for (const pet of pets) {
      const elapsed = Date.now() - pet.lastTickAt;
      game.applyDecay(pet, Date.now());
      if (elapsed > 60 * 1000) await store.save(pet);
    }
    res.json({ pets: pets.map(toPublic) });
  } catch (err) { next(err); }
});

// 读取宠物: 先结算离线衰减 (距今超过 1 分钟才回写, 减少磁盘写入)
app.get('/api/pets/:id', async (req, res, next) => {
  try {
    const pet = findPet(req.params.id);
    if (!pet) return res.status(404).json({ error: '宠物不存在' });
    const elapsed = Date.now() - pet.lastTickAt;
    game.applyDecay(pet, Date.now());
    if (elapsed > 60 * 1000) await store.save(pet);
    res.json(toPublic(pet));
  } catch (err) { next(err); }
});

// 领养新宠物
app.post('/api/pets', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 12) : '';
    if (!name) return res.status(400).json({ error: '给宠物起个名字吧 (1~12 个字符)' });
    const pet = game.createPet({ id: crypto.randomUUID(), name });
    await store.create(pet);
    res.status(201).json(toPublic(pet));
  } catch (err) { next(err); }
});

// 投喂
app.post('/api/pets/:id/feed', async (req, res, next) => {
  try {
    const pet = findPet(req.params.id);
    if (!pet) return res.status(404).json({ error: '宠物不存在' });
    const food = game.FOODS.find((f) => f.id === req.body?.foodId);
    if (!food) return res.status(400).json({ error: '没有这种食物' });
    const result = game.feed(pet, food, Date.now());
    if (!result.ok) return res.status(409).json({ error: result.error, pet: toPublic(pet), events: [] });
    await store.save(pet);
    res.json({ pet: toPublic(pet), events: result.events, food });
  } catch (err) { next(err); }
});

// 玩耍
app.post('/api/pets/:id/play', async (req, res, next) => {
  try {
    const pet = findPet(req.params.id);
    if (!pet) return res.status(404).json({ error: '宠物不存在' });
    const result = game.play(pet, Date.now());
    if (!result.ok) return res.status(409).json({ error: result.error, pet: toPublic(pet), events: [] });
    await store.save(pet);
    res.json({ pet: toPublic(pet), events: result.events });
  } catch (err) { next(err); }
});

// 改名
app.patch('/api/pets/:id', async (req, res, next) => {
  try {
    const pet = findPet(req.params.id);
    if (!pet) return res.status(404).json({ error: '宠物不存在' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 12) : '';
    if (!name) return res.status(400).json({ error: '名字不能为空 (1~12 个字符)' });
    await store.update(pet.id, (p) => { p.name = name; });
    res.json(toPublic(pet));
  } catch (err) { next(err); }
});

// 删除宠物 (连同自定义形象文件)
app.delete('/api/pets/:id', async (req, res, next) => {
  try {
    const pet = findPet(req.params.id);
    if (!pet) return res.status(404).json({ error: '宠物不存在' });
    if (pet.imageExt) {
      fs.promises.unlink(path.join(UPLOADS_DIR, `${pet.id}.${pet.imageExt}`)).catch(() => {});
    }
    await store.remove(pet.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// 上传自定义形象 (原始图片字节, 服务器按魔数识别格式)
function sniffImageExt(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
app.put('/api/pets/:id/image',
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '3mb' }),
  async (req, res, next) => {
    try {
      const pet = findPet(req.params.id);
      if (!pet) return res.status(404).json({ error: '宠物不存在' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: '没有收到图片数据' });
      }
      const ext = sniffImageExt(req.body);
      if (!ext) return res.status(400).json({ error: '只支持 PNG / JPG / GIF / WebP 格式的图片' });
      if (pet.imageExt && pet.imageExt !== ext) {
        fs.promises.unlink(path.join(UPLOADS_DIR, `${pet.id}.${pet.imageExt}`)).catch(() => {});
      }
      await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.promises.writeFile(path.join(UPLOADS_DIR, `${pet.id}.${ext}`), req.body);
      pet.imageExt = ext;
      await store.save(pet);
      res.json(toPublic(pet));
    } catch (err) { next(err); }
  });

// 404 / 统一错误处理
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开小差了, 稍后再试' });
});

store.load().then(() => {
  app.listen(PORT, () => {
    console.log(`🐾 CloudPet 已启动: http://localhost:${PORT}`);
  });
});
