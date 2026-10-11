'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// JSON 文件存储: 原子写入 (tmp + rename), 写操作串行化。
// 单实例部署下足够可靠; 多实例/高并发时建议换成 RDS MySQL
// 等外部数据库 (见 docs/阿里云部署指南.md)。
// ============================================================

class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = { pets: {} };
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.pets) this.data = parsed;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.data = { pets: {} };
      } else if (err instanceof SyntaxError) {
        // 文件损坏: 备份后重建, 不让整个服务挂掉
        const bak = `${this.file}.bak-${Date.now()}`;
        try { await fs.promises.copyFile(this.file, bak); } catch (_) { /* ignore */ }
        this.data = { pets: {} };
      } else {
        throw err;
      }
    }
    return this;
  }

  // 所有写操作排队串行执行, 避免并发写坏文件
  _enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  _persist() {
    const tmp = `${this.file}.tmp`;
    return fs.promises.mkdir(path.dirname(this.file), { recursive: true })
      .then(() => fs.promises.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8'))
      .then(() => fs.promises.rename(tmp, this.file));
  }

  get(id) {
    return this.data.pets[id] || null;
  }

  list() {
    return Object.values(this.data.pets);
  }

  create(pet) {
    return this._enqueue(() => {
      this.data.pets[pet.id] = pet;
      return this._persist().then(() => pet);
    });
  }

  update(id, mutate) {
    return this._enqueue(() => {
      const pet = this.data.pets[id];
      if (!pet) return null;
      mutate(pet);
      return this._persist().then(() => pet);
    });
  }

  // 删除宠物, 返回是否删除成功
  remove(id) {
    return this._enqueue(() => {
      if (!this.data.pets[id]) return false;
      delete this.data.pets[id];
      return this._persist().then(() => true);
    });
  }

  // 直接覆盖保存 (用于读时结算衰减后的回写)
  save(pet) {
    return this._enqueue(() => {
      this.data.pets[pet.id] = pet;
      return this._persist().then(() => pet);
    });
  }
}

module.exports = { JsonStore };
