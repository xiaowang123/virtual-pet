/* ============ 云宠物 CloudPet 前端交互 ============ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const els = {
    pet: $('#pet'), petWrap: $('#pet-wrap'), speech: $('#speech'), fx: $('#fx'),
    confetti: $('#confetti'),
    name: $('#pet-name'), stageBadge: $('#stage-badge'), status: $('#pet-status'), age: $('#pet-age'),
    level: $('#stat-level'), xpText: $('#stat-xp-text'), barXp: $('#bar-xp'),
    hungerText: $('#stat-hunger-text'), barHunger: $('#bar-hunger'),
    happyText: $('#stat-happy-text'), barHappy: $('#bar-happy'),
    coins: $('#stat-coins'), evoTip: $('#evo-tip'),
    btnFeed: $('#btn-feed'), btnPlay: $('#btn-play'), btnSound: $('#btn-sound'), btnPets: $('#btn-pets'),
    log: $('#log'),
    petImg: $('#pet-img'),
    foodTray: $('#food-tray'), foodGrid: $('#food-grid'), foodCoins: $('#food-coins'), foodClose: $('#food-close'),
    adoptOverlay: $('#adopt-overlay'), adoptName: $('#adopt-name'), adoptOk: $('#btn-adopt-ok'), adoptHint: $('#adopt-hint'),
    adoptImgBtn: $('#btn-adopt-img'), adoptImgInput: $('#adopt-img-input'),
    adoptImgPreview: $('#adopt-img-preview'), adoptImgThumb: $('#adopt-img-thumb'),
    adoptImgRemove: $('#adopt-img-remove'), adoptImgNote: $('#adopt-img-note'),
    petsOverlay: $('#pets-overlay'), petsList: $('#pets-list'), petsCount: $('#pets-count'),
    petsClose: $('#pets-close'), petsAdd: $('#btn-pets-add'),
    confirmOverlay: $('#confirm-overlay'), confirmText: $('#confirm-text'), confirmYes: $('#confirm-yes'), confirmNo: $('#confirm-no'),
    levelup: $('#levelup'), levelupText: $('#levelup-text'),
    evolve: $('#evolve'), evolveName: $('#evolve-name'), evolveStage: $('#evolve-stage'),
  };

  const S = {
    pet: null,
    petIds: [],
    config: null,
    soundOn: localStorage.getItem('cloudpet.sound') !== '0',
    eatingUntil: 0,
    display: { hunger: 0, happiness: 0 },
    lastStageKey: null,
    adoptImageBlob: null,
    pollTimer: null, tickTimer: null, blinkTimer: null, bubbleTimer: null,
    bubbleUntil: 0,
  };

  // ---------------- API ----------------
  async function api(path, opts = {}) {
    const raw = opts.body instanceof Blob || opts.body instanceof ArrayBuffer;
    const res = await fetch(path, {
      ...opts,
      headers: {
        ...(raw || opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(opts.headers || {}),
      },
      body: raw || opts.body === undefined ? opts.body : JSON.stringify(opts.body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `请求失败 (${res.status})`);
      err.payload = data;
      throw err;
    }
    return data;
  }

  // ---------------- 音效 (WebAudio, 无音频文件) ----------------
  let actx = null;
  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    return actx;
  }
  function tone(freq, dur, delay = 0, type = 'sine', vol = 0.09) {
    if (!S.soundOn) return;
    const ac = ctx();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  const sfx = {
    click() { tone(660, 0.08, 0, 'triangle', 0.05); },
    feed() { tone(523, 0.1); tone(784, 0.14, 0.1); },
    play() { tone(880, 0.09, 0, 'triangle'); tone(659, 0.12, 0.09, 'triangle'); },
    levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, i * 0.09, 'triangle', 0.08)); },
    evolve() { [392, 523, 659, 784, 988, 1319].forEach((f, i) => tone(f, 0.22, i * 0.1, 'triangle', 0.08)); },
    error() { tone(200, 0.18, 0, 'sawtooth', 0.05); tone(160, 0.2, 0.12, 'sawtooth', 0.05); },
  };

  // ---------------- 宠物渲染 ----------------
  function faceState() {
    const p = S.pet;
    if (!p) return {};
    return {
      blink: false,
      eat: Date.now() < S.eatingUntil,
      sad: p.hunger < 30 || p.happiness < 25,
      happy: p.happiness > 80,
    };
  }
  function renderPet() {
    if (!S.pet) return;
    if (S.pet.imageUrl) {
      // 自定义形象: 显示上传的图片, 不参与像素形态切换
      els.pet.hidden = true;
      els.petImg.hidden = false;
      els.petImg.src = S.pet.imageUrl;
      els.petWrap.classList.remove('is-sad');
    } else {
      els.petImg.hidden = true;
      els.pet.hidden = false;
      const st = faceState();
      if (st.sad) els.petWrap.classList.add('is-sad'); else els.petWrap.classList.remove('is-sad');
      PET_ART.renderInto(S.pet.stage.key, st, els.pet);
    }
    fitPet();
  }
  function fitPet() {
    const stage = $('#stage');
    const useImg = S.pet && S.pet.imageUrl;
    const w = useImg ? (els.petImg.offsetWidth || 300) : (parseFloat(els.pet.style.width) || 256);
    const avail = Math.min(stage.clientWidth * 0.56, stage.clientHeight * 0.62);
    const scale = Math.max(0.4, Math.min(1.6, avail / w));
    $('#pet-scale').style.transform = `translateX(-50%) scale(${scale})`;
    $('#pet-scale').style.transformOrigin = 'bottom center';
  }
  function doBlink() {
    if (!S.pet || S.pet.imageUrl) return;
    const st = faceState();
    if (st.eat || st.sad) return;
    PET_ART.renderInto(S.pet.stage.key, { ...st, blink: true }, els.pet);
    setTimeout(() => { if (!faceState().eat && !faceState().sad) renderPet(); }, 160);
  }

  // ---------------- 状态面板 ----------------
  function fmtAge(bornAt) {
    const h = (Date.now() - bornAt) / 3600000;
    if (h < 1) return '刚刚出生 🐣';
    if (h < 24) return `出生 ${Math.floor(h)} 小时`;
    if (h < 24 * 7) return `出生 ${Math.floor(h / 24)} 天`;
    return `陪伴你 ${Math.floor(h / 24)} 天了`;
  }
  function setBar(el, textEl, val, text) {
    el.style.width = `${Math.max(0, Math.min(100, val))}%`;
    el.classList.toggle('low', val < 50);
    el.classList.toggle('crit', val < 25);
    textEl.textContent = text;
  }
  function renderPanel() {
    const p = S.pet;
    if (!p) return;
    S.display.hunger = p.hunger;
    S.display.happiness = p.happiness;
    els.name.textContent = p.name;
    els.stageBadge.textContent = p.stage.name;
    els.status.textContent = `${p.status.emoji} ${p.status.label}`;
    els.age.textContent = fmtAge(p.bornAt);
    els.level.textContent = p.level;
    els.xpText.textContent = p.level >= p.maxLevel ? 'MAX' : `${p.xp} / ${p.xpNeed}`;
    els.barXp.style.width = p.level >= p.maxLevel ? '100%' : `${(p.xp / p.xpNeed) * 100}%`;
    setBar(els.barHunger, els.hungerText, p.hunger, Math.round(p.hunger));
    setBar(els.barHappy, els.happyText, p.happiness, Math.round(p.happiness));
    els.coins.textContent = p.coins;
    // 进化提示
    const next = S.config.stages.find((s) => s.minLevel > p.level);
    els.evoTip.textContent = next
      ? `再升 ${next.minLevel - p.level} 级进化「${next.name}」`
      : '已是最终形态 🌟';
    renderFoodAfford();
  }

  // ---------------- 气泡台词 ----------------
  const LINES = {
    idle: ['今天也要元气满满!', '陪我玩一会儿嘛~', '在想晚饭吃什么…', '外面的云好软呀', '你什么时候再来看我?', '喵~ 我在哦'],
    hungry: ['肚子咕咕叫了…', '好饿呀, 想吃小鱼干!', '投喂时间到了吗?'],
    starving: ['要饿晕了… 救命…', '眼前有好多星星在转…'],
    sad: ['有点无聊… 想要抱抱', '陪我玩一会儿嘛~'],
    fed: ['好吃! 还有吗?', '嗝~ 满足!', '再来一口!', '谢谢你!'],
    played: ['好玩! 再来一次!', '嘻嘻, 好开心!', '我最喜欢和你玩啦!'],
    error: ['呜呜, 不可以这样…'],
  };
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function bubble(msg, ms = 2800) {
    els.speech.textContent = msg;
    els.speech.hidden = false;
    els.speech.classList.remove('fade');
    S.bubbleUntil = Date.now() + ms;
    clearTimeout(S._bubbleT);
    S._bubbleT = setTimeout(() => {
      els.speech.classList.add('fade');
      setTimeout(() => { els.speech.hidden = true; }, 420);
    }, ms);
  }
  function idleBubble() {
    if (!S.pet || els.speech.hidden === false || document.hidden) return;
    const p = S.pet;
    const pool = p.hunger <= 0 ? LINES.starving : p.hunger < 30 ? LINES.hungry : p.happiness < 25 ? LINES.sad : LINES.idle;
    bubble(pick(pool));
  }

  // ---------------- 特效 ----------------
  function fx(emoji, cls, xPct, yPct, size = 26) {
    const el = document.createElement('div');
    el.className = `fx-item ${cls}`;
    el.textContent = emoji;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    el.style.fontSize = `${size}px`;
    els.fx.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
  function fxHearts() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => fx(pick(['💖', '💕', '✨', '🎉']), 'fx-item', 44 + Math.random() * 12, 52 + Math.random() * 8, 22 + Math.random() * 10), i * 140);
    }
  }
  function fxFood(emoji) {
    fx(emoji, 'fx-food', 50, 58, 34);
  }

  // 彩带
  let confettiParts = [];
  function confetti(n = 90, big = false) {
    const cv = els.confetti;
    const stage = $('#stage');
    cv.width = stage.clientWidth;
    cv.height = stage.clientHeight;
    const cx = cv.width / 2, cy = cv.height * 0.55;
    const colors = ['#ff9d3c', '#f2549d', '#9a5cff', '#4aa8ec', '#63bd7f', '#ffd45e'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (big ? 4.5 : 3) + Math.random() * 4;
      confettiParts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3,
        size: 4 + Math.random() * (big ? 8 : 5),
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }
    if (!S._confettiRaf) {
      const g = cv.getContext('2d');
      const step = () => {
        g.clearRect(0, 0, cv.width, cv.height);
        confettiParts.forEach((p) => {
          p.x += p.vx; p.y += p.vy;
          p.vy += 0.16; p.rot += p.vr; p.life -= 0.012;
          if (p.life <= 0) return;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.globalAlpha = Math.max(0, p.life);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          g.restore();
        });
        confettiParts = confettiParts.filter((p) => p.life > 0 && p.y < cv.height + 40);
        if (confettiParts.length) S._confettiRaf = requestAnimationFrame(step);
        else { S._confettiRaf = null; g.clearRect(0, 0, cv.width, cv.height); }
      };
      S._confettiRaf = requestAnimationFrame(step);
    }
  }

  // ---------------- 日志 ----------------
  function log(text, cls = '') {
    const li = document.createElement('li');
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    li.innerHTML = `<span class="log-time">${hh}:${mm}</span><span class="${cls}"></span>`;
    li.lastElementChild.textContent = text;
    els.log.prepend(li);
    while (els.log.children.length > 60) els.log.lastChild.remove();
  }

  // ---------------- 升级 / 进化 ----------------
  function showLevelup(events) {
    let lvlText = null, evolveStage = null;
    for (const ev of events) {
      if (ev.type === 'levelup') lvlText = `🎉 升级啦! Lv.${ev.level}`;
      if (ev.type === 'evolve') evolveStage = ev.stage;
    }
    if (lvlText) {
      els.levelupText.textContent = lvlText;
      els.levelup.hidden = false;
      sfx.levelup();
      confetti(110, false);
      setTimeout(() => { els.levelup.hidden = true; }, 1100);
    }
    if (evolveStage) {
      const st = S.config.stages.find((s) => s.key === evolveStage);
      els.evolveName.textContent = `✨ ${S.pet.name} 进化了!`;
      els.evolveStage.textContent = st ? st.name : '进化';
      els.evolve.hidden = false;
      sfx.evolve();
      confetti(200, true);
      setTimeout(() => { els.evolve.hidden = true; }, 1900);
    }
  }
  function handleEvents(events) {
    for (const ev of events) {
      const cls = ev.type === 'levelup' ? 'log-levelup' : ev.type === 'evolve' ? 'log-evolve' : '';
      log(ev.text, cls);
    }
    showLevelup(events);
  }

  // ---------------- 投喂 (食物托盘在面板内, 不遮挡宠物) ----------------
  function renderFood() {
    const p = S.pet;
    els.foodCoins.textContent = `🪙 ${p ? p.coins : 0}`;
    els.foodGrid.innerHTML = '';
    for (const f of S.config.foods) {
      const item = document.createElement('div');
      item.className = 'food-item';
      item.innerHTML = `
        <span class="food-emoji">${f.emoji}</span>
        <span class="food-info">
          <span class="food-name">${f.name}</span>
          <span class="food-desc">${f.desc} · 饱食+${f.hunger} 心情+${f.happiness} 经验+${f.xp}</span>
          <span class="food-cost">🪙 ${f.cost === 0 ? '免费' : f.cost}</span>
        </span>`;
      item.addEventListener('click', () => doFeed(f));
      els.foodGrid.appendChild(item);
    }
    renderFoodAfford();
  }
  function renderFoodAfford() {
    if (!S.pet || !els.foodGrid.children.length) return;
    $$('.food-item').forEach((el, i) => {
      const f = S.config.foods[i];
      el.classList.toggle('poor', S.pet.coins < f.cost);
    });
  }
  async function doFeed(food) {
    if (S.pet.coins < food.cost) { sfx.error(); bubble('金币不够啦, 先去玩耍赚点金币吧~'); return; }
    try {
      const res = await api(`/api/pets/${S.pet.id}/feed`, { method: 'POST', body: { foodId: food.id } });
      S.pet = res.pet;
      renderPanel();
      renderFoodAfford();
      handleEvents(res.events);
      S.eatingUntil = Date.now() + 1150;
      els.petWrap.classList.add('is-eat');
      setTimeout(() => els.petWrap.classList.remove('is-eat'), 1150);
      renderPet();
      sfx.feed();
      fxFood(food.emoji);
      bubble(pick(LINES.fed));
      log(`投喂 ${food.name} ${food.emoji}`);
    } catch (err) {
      S.pet = err.payload?.pet || S.pet;
      renderPanel();
      bubble(err.message, 3200);
      log(err.message, 'log-err');
      sfx.error();
    }
  }

  // ---------------- 玩耍 ----------------
  async function doPlay() {
    try {
      const res = await api(`/api/pets/${S.pet.id}/play`, { method: 'POST' });
      S.pet = res.pet;
      renderPanel();
      tickPlayButton();
      handleEvents(res.events);
      els.petWrap.classList.add('is-jump');
      setTimeout(() => els.petWrap.classList.remove('is-jump'), 650);
      sfx.play();
      fxHearts();
      bubble(pick(LINES.played));
    } catch (err) {
      S.pet = err.payload?.pet || S.pet;
      renderPanel();
      bubble(err.message, 3200);
      log(err.message, 'log-err');
      sfx.error();
    }
  }
  function playCooldownLeft() {
    if (!S.pet) return 0;
    return Math.max(0, S.pet.lastPlayAt + S.config.playCooldownMs - Date.now());
  }
  function tickPlayButton() {
    const left = playCooldownLeft();
    if (left > 0) {
      els.btnPlay.disabled = true;
      els.btnPlay.textContent = `🎾 ${Math.ceil(left / 1000)}s`;
    } else {
      els.btnPlay.disabled = false;
      els.btnPlay.textContent = '🎾 玩耍';
    }
  }

  // ---------------- 领养 ----------------
  function clearAdoptImageUI() {
    S.adoptImageBlob = null;
    els.adoptImgInput.value = '';
    els.adoptImgPreview.hidden = true;
    els.adoptImgNote.hidden = true;
  }
  function showAdopt() {
    els.adoptHint.hidden = true;
    els.adoptName.value = '';
    clearAdoptImageUI();
    els.adoptOverlay.hidden = false;
    els.adoptName.placeholder = pick(['团子', '年糕', '糯米', '泡芙', '汤圆', '麻薯', '布丁', '曲奇']);
    setTimeout(() => els.adoptName.focus(), 60);
  }
  // 页面内确认弹窗 (原生 confirm 在部分应用内浏览器里会被吞掉或自动放行)
  function askConfirm(text) {
    return new Promise((resolve) => {
      els.confirmText.textContent = text;
      els.confirmOverlay.hidden = false;
      const done = (val) => {
        els.confirmOverlay.hidden = true;
        els.confirmYes.onclick = null;
        els.confirmNo.onclick = null;
        resolve(val);
      };
      els.confirmYes.onclick = () => done(true);
      els.confirmNo.onclick = () => done(false);
    });
  }
  function showAdoptError(msg) {
    els.adoptHint.textContent = msg;
    els.adoptHint.hidden = false;
    els.adoptName.classList.remove('shake');
    void els.adoptName.offsetWidth; // 重启动画
    els.adoptName.classList.add('shake');
  }

  // 自定义形象: 读取文件 → 压缩到最长边 512px → 返回 PNG blob
  function preparePetImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('图片太大了 (最大 8MB)'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 512;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('图片处理失败'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取, 换一张试试')); };
      img.src = url;
    });
  }

  async function adopt(name) {
    const res = await api('/api/pets', { method: 'POST', body: { name } });
    let pet = res;
    if (S.adoptImageBlob) {
      pet = await api(`/api/pets/${res.id}/image`, { method: 'PUT', body: S.adoptImageBlob });
    }
    clearAdoptImageUI();
    S.petIds.push(pet.id);
    localStorage.setItem('cloudpet.pets', JSON.stringify(S.petIds));
    localStorage.setItem('cloudpet.petId', pet.id);
    els.adoptOverlay.hidden = true;
    els.adoptHint.hidden = true;
    await loadPet(pet.id);
    bubble(`你好呀! 我是 ${pet.name}, 请多关照~`, 3200);
    log(`领养了 ${pet.name} ${pet.imageUrl ? '📷' : '🥚'}`);
    sfx.evolve();
  }

  // ---------------- 我的宠物列表 ----------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  async function fetchPets(ids) {
    if (!ids.length) return [];
    const res = await api(`/api/pets?ids=${ids.map(encodeURIComponent).join(',')}`);
    return res.pets;
  }
  function renderPetThumb(el, p) {
    if (p.imageUrl) {
      el.innerHTML = `<img class="pet-thumb-img" src="${escapeHtml(p.imageUrl)}" alt="">`;
      return;
    }
    const box = document.createElement('div');
    box.className = 'pet-box thumb-box';
    box.innerHTML = '<i class="px-core"></i>';
    el.appendChild(box);
    PET_ART.renderInto(p.stage.key, {}, box);
    box.style.transform = `scale(${56 / parseFloat(box.style.width)})`;
    box.style.transformOrigin = 'top left';
  }
  async function openPetList() {
    els.petsOverlay.hidden = false;
    els.petsList.innerHTML = '';
    els.petsCount.textContent = '加载中…';
    try {
      const pets = await fetchPets(S.petIds);
      renderPetList(pets);
    } catch (err) {
      els.petsCount.textContent = err.message;
    }
  }
  function renderPetList(pets) {
    els.petsCount.textContent = `共 ${pets.length} 只 · 点击切换`;
    els.petsList.innerHTML = '';
    for (const p of pets) {
      const li = document.createElement('li');
      const isCurrent = S.pet && S.pet.id === p.id;
      li.className = 'pet-item' + (isCurrent ? ' current' : '');
      li.innerHTML = `
        <span class="pet-thumb"></span>
        <span class="pet-info">
          <span class="pet-item-name">${escapeHtml(p.name)}${isCurrent ? '<em class="cur-tag">当前</em>' : ''}</span>
          <span class="pet-item-sub">Lv.${p.level} · ${escapeHtml(p.stage.name)}${p.imageUrl ? ' · 📷自定义' : ''}</span>
        </span>
        <span class="pet-actions"><button class="del-btn" title="放生这只宠物">🗑</button></span>`;
      renderPetThumb(li.querySelector('.pet-thumb'), p);
      li.addEventListener('click', async (e) => {
        if (e.target.closest('.del-btn')) return;
        if (isCurrent) return;
        sfx.click();
        localStorage.setItem('cloudpet.petId', p.id);
        els.petsOverlay.hidden = true;
        try {
          await loadPet(p.id);
          bubble(`切换到了 ${p.name}~`);
        } catch (err) {
          bubble(err.message, 3200);
        }
      });
      li.querySelector('.del-btn').addEventListener('click', async () => {
        sfx.click();
        const ok = await askConfirm(`确定要放生「${p.name}」吗? 它会离开这个家, 无法恢复。`);
        if (!ok) return;
        try {
          await api(`/api/pets/${p.id}`, { method: 'DELETE' });
          S.petIds = S.petIds.filter((x) => x !== p.id);
          localStorage.setItem('cloudpet.pets', JSON.stringify(S.petIds));
          log(`放生了 ${p.name} 💨`, 'log-err');
          sfx.error();
          if (S.pet && S.pet.id === p.id) {
            if (S.petIds.length) {
              localStorage.setItem('cloudpet.petId', S.petIds[0]);
              await loadPet(S.petIds[0]);
              bubble(`${S.pet.name} 现在陪着你~`);
            } else {
              localStorage.removeItem('cloudpet.petId');
              S.pet = null;
              S.lastStageKey = null;
              els.petsOverlay.hidden = true;
              showAdopt();
            }
          }
          const pets = await fetchPets(S.petIds).catch(() => []);
          renderPetList(pets);
        } catch (err) {
          bubble(err.message, 3200);
          log(err.message, 'log-err');
        }
      });
      els.petsList.appendChild(li);
    }
  }

  // ---------------- 加载 / 轮询 ----------------
  async function loadPet(id) {
    const p = await api(`/api/pets/${id}`);
    const levelBefore = S.pet?.level ?? p.level;
    const stageBefore = S.pet?.stage?.key ?? p.stage.key;
    const idChanged = !S.pet || S.pet.id !== p.id;
    S.pet = p;
    renderPanel();
    if (idChanged) S.lastStageKey = null;
    if (idChanged || S.lastStageKey !== p.stage.key) {
      S.lastStageKey = p.stage.key;
      renderPet();
    }
    // 离开期间升了级/进化了 (例如别的设备喂的)
    if (S._loadedOnce) {
      if (p.level > levelBefore) showLevelup([{ type: 'levelup', text: '', level: p.level }]);
      if (p.stage.key !== stageBefore) showLevelup([{ type: 'evolve', text: '', stage: p.stage.key }]);
    }
    S._loadedOnce = true;
  }
  function startPolling() {
    stopPolling();
    S.pollTimer = setInterval(async () => {
      if (!S.pet || document.hidden) return;
      try { await loadPet(S.pet.id); } catch (_) { /* 网络抖动, 下一轮再试 */ }
    }, 5000);
    // 本地插值: 让数值条在两次轮询之间平滑变化
    S.tickTimer = setInterval(() => {
      if (!S.pet || !S.config) return;
      const d = S.config.decay;
      const starveExtra = S.display.hunger <= 0 ? d.starvingHappiness : 0;
      S.display.hunger = Math.max(0, S.display.hunger - d.hunger / 60);
      S.display.happiness = Math.max(0, S.display.happiness - (d.happiness + starveExtra) / 60);
      setBar(els.barHunger, els.hungerText, S.display.hunger, Math.round(S.display.hunger));
      setBar(els.barHappy, els.happyText, S.display.happiness, Math.round(S.display.happiness));
      tickPlayButton();
    }, 1000);
    S.blinkTimer = setInterval(doBlink, 3600);
    S.bubbleTimer = setInterval(idleBubble, 16000);
  }
  function stopPolling() {
    clearInterval(S.pollTimer);
    clearInterval(S.tickTimer);
    clearInterval(S.blinkTimer);
    clearInterval(S.bubbleTimer);
  }

  // ---------------- 启动 ----------------
  async function init() {
    els.btnSound.textContent = S.soundOn ? '🔊' : '🔇';
    els.btnSound.addEventListener('click', () => {
      S.soundOn = !S.soundOn;
      localStorage.setItem('cloudpet.sound', S.soundOn ? '1' : '0');
      els.btnSound.textContent = S.soundOn ? '🔊' : '🔇';
      if (S.soundOn) sfx.click();
    });
    els.btnPets.addEventListener('click', () => { sfx.click(); openPetList(); });
    els.petsClose.addEventListener('click', () => { els.petsOverlay.hidden = true; });
    els.petsOverlay.addEventListener('click', (e) => { if (e.target === els.petsOverlay) els.petsOverlay.hidden = true; });
    els.petsAdd.addEventListener('click', () => { els.petsOverlay.hidden = true; showAdopt(); });

    // 自定义形象上传
    els.adoptImgBtn.addEventListener('click', () => els.adoptImgInput.click());
    els.adoptImgInput.addEventListener('change', async () => {
      const file = els.adoptImgInput.files && els.adoptImgInput.files[0];
      if (!file) return;
      try {
        const blob = await preparePetImage(file);
        S.adoptImageBlob = blob;
        els.adoptImgThumb.src = URL.createObjectURL(blob);
        els.adoptImgPreview.hidden = false;
        els.adoptImgNote.hidden = false;
        els.adoptHint.hidden = true;
        sfx.click();
      } catch (err) {
        els.adoptImgInput.value = '';
        showAdoptError(err.message);
      }
    });
    els.adoptImgRemove.addEventListener('click', () => clearAdoptImageUI());
    els.adoptOk.addEventListener('click', async () => {
      const name = els.adoptName.value.trim();
      if (!name) {
        showAdoptError('先给它起个名字吧~');
        els.adoptName.focus();
        return;
      }
      sfx.click();
      els.adoptOk.disabled = true;
      try {
        await adopt(name);
      } catch (err) {
        showAdoptError(err.message);
      }
      els.adoptOk.disabled = false;
    });
    els.adoptName.addEventListener('input', () => { els.adoptHint.hidden = true; });
    els.adoptName.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.adoptOk.click(); });
    els.btnFeed.addEventListener('click', () => {
      sfx.click();
      if (els.foodTray.hidden) {
        renderFood();
        els.foodTray.hidden = false;
      } else {
        els.foodTray.hidden = true;
      }
    });
    els.foodClose.addEventListener('click', () => { els.foodTray.hidden = true; });
    els.btnPlay.addEventListener('click', doPlay);
    window.addEventListener('resize', fitPet);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.pet) loadPet(S.pet.id).catch(() => {}); });
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'f' || e.key === 'F') els.btnFeed.click();
      if (e.key === 'p' || e.key === 'P') els.btnPlay.click();
    });
    // 改名
    els.name.nextElementSibling.addEventListener('click', () => {
      sfx.click();
      const input = document.createElement('input');
      input.value = S.pet.name;
      input.maxLength = 12;
      els.name.replaceWith(input);
      input.focus();
      input.select();
      const done = async (save) => {
        const newName = input.value.trim() || S.pet.name;
        input.replaceWith(els.name);
        if (save && newName !== S.pet.name) {
          try {
            const res = await api(`/api/pets/${S.pet.id}`, { method: 'PATCH', body: { name: newName } });
            S.pet = res;
            renderPanel();
            log(`改名为 ${newName}`);
          } catch (err) { bubble(err.message, 3200); }
        }
      };
      input.addEventListener('blur', () => done(true));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    });

    try {
      S.config = await api('/api/config');
      // 我的宠物列表 (兼容旧版本的单宠物存储)
      try {
        S.petIds = JSON.parse(localStorage.getItem('cloudpet.pets') || '[]');
        if (!Array.isArray(S.petIds)) S.petIds = [];
      } catch (_) { S.petIds = []; }
      const petId = localStorage.getItem('cloudpet.petId');
      if (petId && !S.petIds.includes(petId)) S.petIds.unshift(petId);
      S.petIds = S.petIds.filter((x, i) => x && S.petIds.indexOf(x) === i);
      localStorage.setItem('cloudpet.pets', JSON.stringify(S.petIds));

      if (S.petIds.length) {
        const targetId = petId || S.petIds[0];
        try {
          await loadPet(targetId);
          startPolling();
          bubble(`欢迎回来! 我是 ${S.pet.name}~`);
          return;
        } catch (err) {
          if (err.payload && err.payload.error !== '宠物不存在') throw err;
          S.petIds = S.petIds.filter((x) => x !== targetId); // 已不存在, 换下一只或走领养
          localStorage.setItem('cloudpet.pets', JSON.stringify(S.petIds));
          if (S.petIds.length) { await loadPet(S.petIds[0]); startPolling(); return; }
          localStorage.removeItem('cloudpet.petId');
        }
      }
      showAdopt();
      startPolling();
    } catch (err) {
      bubble(`连接服务器失败: ${err.message}`, 6000);
      els.speech.hidden = false;
      setTimeout(init, 5000); // 自动重试
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
