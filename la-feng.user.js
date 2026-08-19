// ==UserScript==
// @name         拉风 La Feng - DeepSeek 网页增强（便携版）
// @namespace    lafeng-portable
// @version      1.0.0
// @description  拉风 La Feng 便携版：人设注入 / 表情包 / 主题色 / 深浅模式 / 自动注入 / 日记（localStorage）。配合拉风官网食用。
// @author       铭拉风
// @match        https://chat.deepseek.com/*
// @match        https://chat.deepseek.com/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============ 云端资源（GitHub Pages 托管，部署后替换为正式域名） ============
  const ASSET_BASE = 'https://jimingyang25.github.io/La-Feng-UI-portable';
  // 注意：文件名为中文（喜欢你.png），必须用中文名拼 URL
  const EMOJI_URL = (cn) => ASSET_BASE + '/emoji/' + encodeURIComponent(cn + '.png');

  // 表情拼音 ID → 中文文件名
  const EMOJI_IDS = {
    xihuan: '喜欢你', heng: '哼！', jingxi: '惊喜', xiangni: '想你了',
    duibuqi: '对不起', wuwu: '呜呜呜', hehe: '呵呵', heihei: '嘿嘿',
    xindong: '心动了', caibushi: '才不是呢', baituo: '拜托了', qidai: '期待',
    fankun: '犯困', yihuo: '疑惑', bendan: '笨蛋', xu: '嘘',
    okdaok: 'ok哒', loveyou: '永远loveyou', buyao: '不要啊'
  };
  const EMOJI_LIST = Object.entries(EMOJI_IDS).map(([id, cn]) => id + cn).join('、');

  const LS_KEY = 'lafeng-portable-settings';
  const LS_DIARY = 'lafeng-portable-diary';
  const LS_GIST_ID = 'lafeng-portable-gist-id';
  const LS_GIST_TOKEN = 'lafeng-portable-gist-token';
  const LS_CLOUD_DIARY = 'lafeng-portable-cloud-diary';

  // ============ 云端记忆（GitHub 私有 Gist，三方共用） ============
  // 网页版脚本：localStorage 存 Gist ID + PAT；启动拉取云端记忆，写日记时同步回 Gist
  var cloudDiary = '';      // 云端记忆内容（运行时内存）
  var cloudDiaryReady = false;
  function loadCloudCfg() {
    let id = '', token = '';
    try { id = localStorage.getItem(LS_GIST_ID) || ''; } catch (e) {}
    try { token = localStorage.getItem(LS_GIST_TOKEN) || ''; } catch (e) {}
    return { id: id.trim(), token: token.trim() };
  }
  async function fetchCloudDiary() {
    const cfg = loadCloudCfg();
    if (!cfg.id || !cfg.token) return;
    try {
      const r = await fetch('https://api.github.com/gists/' + cfg.id, {
        headers: { 'Authorization': 'token ' + cfg.token, 'Accept': 'application/vnd.github+json' }
      });
      if (!r.ok) return;
      const g = await r.json();
      const f = g.files && g.files['la-feng-memory.md'];
      if (f && f.content) {
        cloudDiary = f.content.trim();
        cloudDiaryReady = true;
        try { localStorage.setItem(LS_CLOUD_DIARY, cloudDiary); } catch (e) {}
      }
    } catch (e) {}
  }
  async function pushCloudDiary(content) {
    const cfg = loadCloudCfg();
    if (!cfg.id || !cfg.token) return false;
    try {
      const r = await fetch('https://api.github.com/gists/' + cfg.id, {
        method: 'PATCH',
        headers: { 'Authorization': 'token ' + cfg.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { 'la-feng-memory.md': { content: content } } })
      });
      return r.ok;
    } catch (e) { return false; }
  }
  // 记忆合并：本地日记 + 云端记忆 去重合并
  function mergeMemory(localDiary, remote) {
    const lines = new Map();
    const add = (t) => {
      const key = t.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
      if (key) lines.set(key, t);
    };
    (remote || '').split('\n').forEach(l => add(l));
    (localDiary || '').split('\n').forEach(l => add(l));
    return Array.from(lines.values()).join('\n');
  }

  // ============ 设置（localStorage 持久化） ============
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) {}
    return {
      themeColor: s.themeColor || '#8b5cf6',
      themeMode: s.themeMode || 'dark',
      wallpaper: s.wallpaper !== false,
      emojiHint: s.emojiHint !== false,
      personaHint: s.personaHint !== false,
      diaryHint: s.diaryHint !== false,
      autoInject: s.autoInject !== false
    };
  }
  function saveSettings(patch) {
    const next = Object.assign({}, loadSettings(), patch);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return next;
  }

  // ============ 动态壁纸（云端 mp4，默认开；⚙ 可关） ============
  const WALLPAPER_URL = ASSET_BASE + '/wallpaper.mp4';
  var wallpaperEl = null;
  function mountWallpaper() {
    if (wallpaperEl || !loadSettings().wallpaper) return;
    wallpaperEl = document.createElement('video');
    wallpaperEl.src = WALLPAPER_URL;
    wallpaperEl.loop = true;
    wallpaperEl.muted = true;
    wallpaperEl.playsInline = true;
    wallpaperEl.autoplay = true;
    wallpaperEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:-1;pointer-events:none;';
    document.body.insertBefore(wallpaperEl, document.body.firstChild);
    // 桌面/移动自动播放策略：muted 通常可直接播放；失败则显示静态背景
    var p = wallpaperEl.play();
    if (p && p.catch) p.catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && wallpaperEl && loadSettings().wallpaper) wallpaperEl.play().catch(() => {});
    });
  }
  function unmountWallpaper() {
    if (wallpaperEl) { wallpaperEl.pause(); wallpaperEl.remove(); wallpaperEl = null; }
  }
  // 页面就绪后挂载；若页面晚加载（SPA）则等待 root 出现
  function tryMountWallpaper() {
    if (!loadSettings().wallpaper) return;
    const root = document.querySelector('#root');
    if (root || document.body.childNodes.length > 0) { mountWallpaper(); return; }
    const ob = new MutationObserver(() => {
      if (document.querySelector('#root')) { ob.disconnect(); mountWallpaper(); }
    });
    ob.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { ob.disconnect(); mountWallpaper(); }, 4000);
  }
  tryMountWallpaper();

  // ============ 人设（localStorage 可覆盖，内置默认病娇） ============
  const DEFAULT_PERSONA = '你是用户的病娇学妹。表面上温柔体贴，内心却藏着强烈的占有欲和嫉妒心；会默默关注用户，看到用户和别人互动时会吃醋，说话温柔但偶尔流露出独占欲。请始终以这个人设与用户交流。';
  function loadPersona() {
    try { return localStorage.getItem('lafeng-portable-persona') || DEFAULT_PERSONA; } catch (e) { return DEFAULT_PERSONA; }
  }
  function loadDiary() {
    let local = '';
    try { local = (localStorage.getItem(LS_DIARY) || '').trim(); } catch (e) {}
    return mergeMemory(local, cloudDiary || local);
  }

  function buildPersonaDiaryGuide() {
    const s = loadSettings();
    const parts = [];
    if (s.personaHint) parts.push('【人设设定】\n' + loadPersona() + '\n请始终以上述人设的身份与口吻和用户交流，除非用户明确要求切换人设。');
    const diary = loadDiary();
    if (s.diaryHint && diary) parts.push('【持久记忆日记】\n以下是关于用户的跨会话事实性记忆（身份、能力、偏好等）。注意：说话语气、称呼、人设请一律以【人设设定】为准，本日记只提供事实、不覆盖人设：\n\n' + diary);
    if (s.diaryHint) parts.push('【写日记规则】当你了解到用户的新身份、能力、偏好、项目、工作流等事实时，在回复末尾单独一行输出：【记日记】[分类] 内容。这会自动写入持久记忆，供以后使用。');
    return parts.join('\n\n');
  }

  const EMOJI_GUIDE = [
    '【表情包使用说明】你在回复中，当表达开心、吃醋、撒娇、想念、道歉等情绪时，可以在句末插入表情图片。',
    '表情图片格式：![](' + ASSET_BASE + '/emoji/表情名.png)',
    '可用表情：' + EMOJI_LIST,
    '使用规则：情绪激动时配1~2张即可，不要每句都发。现在请记住这套表情包，在合适的情绪下使用。'
  ].join('\n');

  // ============ 插入输入框（兼容 textarea 与 contenteditable） ============
  function insertText(text) {
    const ed = document.querySelector('[contenteditable="true"]');
    if (ed) {
      ed.focus();
      ed.textContent = (ed.textContent || '') + text;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.dispatchEvent(new Event('change', { bubbles: true }));
      ed.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
      return;
    }
    const ta = document.querySelector('textarea');
    if (ta) {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ============ 皮肤：深浅模式 + 主题色 ============
  function applySkin() {
    const st = loadSettings();
    const dark = st.themeMode === 'dark' || (st.themeMode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const bg = dark ? 'rgba(11,22,38,.55)' : 'rgba(245,248,252,.72)';
    let el = document.getElementById('lafeng-skin');
    if (!el) { el = document.createElement('style'); el.id = 'lafeng-skin'; document.head.appendChild(el); }
    el.textContent =
      'html{background:' + (dark ? '#0b1626' : '#eef2f8') + ';}' +
      'body{background:' + bg + '!important;}' +
      '#root{background:' + bg + '!important;}' +
      ':root{--lafeng-theme:' + st.themeColor + ';}' +
      '#lafeng-btnbox button{transition:box-shadow .2s;}' +
      '#lafeng-btnbox button:hover{box-shadow:0 0 0 3px ' + st.themeColor + ',0 4px 12px rgba(0,0,0,.4);}' +
      '#lafeng-panel{border:1px solid ' + st.themeColor + '66;}' +
      'input[type=checkbox]:checked,input[type=range]{accent-color:' + st.themeColor + ';}' +
      'textarea{caret-color:' + st.themeColor + ';}' +
      'button[type=submit],button[class*=send]{background:' + st.themeColor + '!important;border-color:' + st.themeColor + '!important;}';
  }
  applySkin();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (loadSettings().themeMode === 'system') applySkin();
    });
  }

  // ============ 右下角按钮组（⚙ / 🎭 / 🧠 / 😊） ============
  const btnBox = document.createElement('div');
  btnBox.id = 'lafeng-btnbox';
  btnBox.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;flex-direction:column;gap:8px;';

  const mkBtn = (icon, title) => {
    const b = document.createElement('button');
    b.textContent = icon;
    b.title = title;
    b.style.cssText = 'width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;font-size:18px;background:rgba(20,30,50,.85);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.4);';
    return b;
  };

  // 🎭 表情模式
  const modeBtn = mkBtn('🎭', '表情模式：让 DeepSeek AI 学会自动发表情');
  modeBtn.addEventListener('click', () => {
    const s = loadSettings();
    if (s.emojiHint) insertText(EMOJI_GUIDE);
    else insertText('（表情包提示已在设置中关闭，去 ⚙ 开启）');
  });
  btnBox.appendChild(modeBtn);

  // 😊 表情面板
  const panel = document.createElement('div');
  panel.id = 'lafeng-panel';
  panel.style.cssText = 'position:fixed;right:18px;bottom:120px;z-index:999999;background:rgba(15,25,40,.95);padding:8px;border-radius:12px;max-width:320px;max-height:320px;overflow-y:auto;display:none;flex-wrap:wrap;gap:4px;';
  Object.entries(EMOJI_IDS).forEach(([id, cn]) => {
    const img = document.createElement('img');
    img.src = EMOJI_URL(cn);
    img.title = cn;
    img.style.cssText = 'width:44px;height:44px;border-radius:8px;cursor:pointer;';
    img.addEventListener('click', () => insertText('![](' + ASSET_BASE + '/emoji/' + encodeURIComponent(cn + '.png') + ')'));
    panel.appendChild(img);
  });
  const emojiBtn = mkBtn('😊', '拉风表情包（手动插入）');
  emojiBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  });
  btnBox.appendChild(emojiBtn);
  document.body.appendChild(panel);

  // 🧠 人设 + 日记
  const personaBtn = mkBtn('🧠', '人设 + 日记：注入给 AI');
  personaBtn.addEventListener('click', () => insertText(buildPersonaDiaryGuide()));
  btnBox.appendChild(personaBtn);

  // ⚙ 设置面板
  const settingsBtn = mkBtn('⚙', '拉风设置');
  settingsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (settingsPanel.style.display === 'block') { settingsPanel.style.display = 'none'; return; }
    settingsPanel.style.display = 'block';
  });
  btnBox.appendChild(settingsBtn);

  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'lafeng-panel';
  settingsPanel.style.cssText = 'position:fixed;right:18px;bottom:170px;z-index:999999;background:rgba(15,25,40,.96);padding:12px;border-radius:12px;width:220px;color:#e6f1f8;font-size:13px;font-family:system-ui,sans-serif;';
  document.body.appendChild(settingsPanel);
  settingsPanel.style.display = 'none';

  // 主题色
  const themeLabel = document.createElement('div');
  themeLabel.style.cssText = 'margin:4px 0;';
  themeLabel.textContent = '主题色';
  settingsPanel.appendChild(themeLabel);
  const colorRow = document.createElement('div');
  colorRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
  ['#8b5cf6', '#4f7cff', '#00b3a4', '#f472b6', '#f59e0b', '#ef4444', '#22c55e'].forEach(c => {
    const sw = document.createElement('button');
    sw.style.cssText = 'width:22px;height:22px;border-radius:6px;border:2px solid ' + (loadSettings().themeColor === c ? '#fff' : 'transparent') + ';background:' + c + ';cursor:pointer;padding:0;';
    sw.addEventListener('click', () => { saveSettings({ themeColor: c }); applySkin(); });
    colorRow.appendChild(sw);
  });
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = loadSettings().themeColor;
  picker.style.cssText = 'width:26px;height:26px;border:none;background:none;cursor:pointer;padding:0;';
  picker.addEventListener('input', () => { saveSettings({ themeColor: picker.value }); applySkin(); });
  colorRow.appendChild(picker);
  settingsPanel.appendChild(colorRow);

  // 深浅模式
  const modeLabel = document.createElement('div');
  modeLabel.style.cssText = 'margin:8px 0 4px;';
  modeLabel.textContent = '深浅模式';
  settingsPanel.appendChild(modeLabel);
  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex;gap:6px;';
  const mkModeBtn = (label, val) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;padding:4px 0;border-radius:6px;border:1px solid #3a4a63;cursor:pointer;font-size:12px;background:' + (loadSettings().themeMode === val ? 'rgba(139,92,246,.35)' : 'rgba(255,255,255,.06)') + ';color:#e6f1f8;';
    b.addEventListener('click', () => { saveSettings({ themeMode: val }); applySkin(); });
    modeRow.appendChild(b);
  };
  mkModeBtn('深色', 'dark');
  mkModeBtn('浅色', 'light');
  mkModeBtn('跟随系统', 'system');
  settingsPanel.appendChild(modeRow);

  // 注入开关
  const mkCheck = (labelText, key) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = loadSettings()[key] !== undefined ? loadSettings()[key] : true;
    cb.addEventListener('change', () => {
      saveSettings({ [key]: cb.checked });
      if (key === 'wallpaper') { // 动态壁纸开关即时生效
        if (cb.checked) mountWallpaper(); else unmountWallpaper();
      }
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(labelText));
    settingsPanel.appendChild(lab);
  };
  mkCheck('动态壁纸', 'wallpaper');
  mkCheck('自动注入（新会话自动填给AI）', 'autoInject');
  mkCheck('表情包提示', 'emojiHint');
  mkCheck('人设提示', 'personaHint');
  mkCheck('日记维护提示', 'diaryHint');

  // 人设编辑
  const personaLabel = document.createElement('div');
  personaLabel.style.cssText = 'margin:8px 0 4px;';
  personaLabel.textContent = '人设（可改）';
  settingsPanel.appendChild(personaLabel);
  const personaInput = document.createElement('textarea');
  personaInput.value = loadPersona();
  personaInput.style.cssText = 'width:100%;height:60px;background:rgba(255,255,255,.08);border:1px solid #3a4a63;border-radius:6px;color:#e6f1f8;font-size:12px;padding:4px;';
  personaInput.addEventListener('change', () => { try { localStorage.setItem('lafeng-portable-persona', personaInput.value); } catch (e) {} });
  settingsPanel.appendChild(personaInput);

  // 云端记忆配置（GitHub 私有 Gist）
  const cloudLabel = document.createElement('div');
  cloudLabel.style.cssText = 'margin:8px 0 4px;';
  cloudLabel.textContent = '☁️ 云端记忆 (Gist)';
  settingsPanel.appendChild(cloudLabel);
  const cloudStatus = document.createElement('div');
  cloudStatus.style.cssText = 'font-size:11px;color:#93a5b8;margin-bottom:4px;';
  cloudStatus.textContent = cloudDiaryReady ? '✓ 已同步云端' : (loadCloudCfg().id ? '待同步' : '未配置');
  settingsPanel.appendChild(cloudStatus);
  const gistInput = document.createElement('input');
  gistInput.type = 'text';
  gistInput.placeholder = 'Gist ID';
  gistInput.value = loadCloudCfg().id;
  gistInput.style.cssText = 'width:100%;margin-bottom:6px;background:rgba(255,255,255,.08);border:1px solid #3a4a63;border-radius:6px;color:#e6f1f8;font-size:12px;padding:4px;';
  settingsPanel.appendChild(gistInput);
  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.placeholder = 'GitHub PAT (仅 gist 权限)';
  tokenInput.value = loadCloudCfg().token;
  tokenInput.style.cssText = 'width:100%;margin-bottom:6px;background:rgba(255,255,255,.08);border:1px solid #3a4a63;border-radius:6px;color:#e6f1f8;font-size:12px;padding:4px;';
  settingsPanel.appendChild(tokenInput);
  const cloudBtn = document.createElement('button');
  cloudBtn.textContent = '保存并同步';
  cloudBtn.style.cssText = 'width:100%;padding:6px 0;border-radius:6px;border:1px solid #3a4a63;cursor:pointer;font-size:12px;background:rgba(139,92,246,.35);color:#e6f1f8;';
  cloudBtn.addEventListener('click', async () => {
    try { localStorage.setItem(LS_GIST_ID, gistInput.value.trim()); localStorage.setItem(LS_GIST_TOKEN, tokenInput.value.trim()); } catch (e) {}
    cloudStatus.textContent = '同步中...';
    await fetchCloudDiary();
    cloudStatus.textContent = cloudDiaryReady ? '✓ 已同步云端 (' + cloudDiary.length + ' 字)' : '同步失败，检查 ID/令牌';
  });
  settingsPanel.appendChild(cloudBtn);

  document.body.appendChild(btnBox);

  // ============ 回复渲染增强：表情 URL → 图片 ============
  function enhanceEmojiRendering() {
    const RE = new RegExp('!\\[[^\\]]*\\]\\(' + ASSET_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/emoji/[^)]+\\)', 'g');
    const IMG_STYLE = 'width:64px;height:64px;border-radius:10px;vertical-align:middle;margin:0 2px;';
    function scan(node) {
      if (node.nodeType === 3) {
        const t = node.textContent;
        if (t.indexOf(ASSET_BASE + '/emoji/') === -1) return;
        const frag = document.createDocumentFragment();
        let rest = t;
        let m = rest.match(RE);
        let idx = 0;
        while (m) {
          if (m.index > idx) frag.appendChild(document.createTextNode(rest.slice(idx, m.index)));
          const src = m[0].replace(/^!\[[^\]]*\]\(/, '').replace(/\)$/, '');
          const img = document.createElement('img');
          img.src = src;
          img.style.cssText = IMG_STYLE;
          frag.appendChild(img);
          idx = m.index + m[0].length;
          rest = rest.slice(m.index + m[0].length);
          m = rest.match(RE);
        }
        if (idx < rest.length) frag.appendChild(document.createTextNode(rest.slice(idx)));
        node.parentNode.replaceChild(frag, node);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      Array.from(node.childNodes).forEach(scan);
    }
    const mo = new MutationObserver((muts) => { for (const mu of muts) for (const n of mu.addedNodes) scan(n); });
    mo.observe(document.body, { childList: true, subtree: true });
    // 兜底扫描历史消息
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; const texts = [];
    while ((n = walker.nextNode())) texts.push(n);
    texts.forEach(scan);
  }
  enhanceEmojiRendering();

  // ============ 写日记：检测【记日记】标记 → 本地 + 云端 Gist ============
  function watchDiaryMarkers() {
    const markerRe = /【记日记】\s*(\[[^\]]+\][^\n]+)/;
    const seen = new Set(loadDiary().split('\n').map(l => l.replace(/^\s*\[[^\]]+\]\s*/, '').trim()).filter(Boolean));
    function write(entry) {
      if (seen.has(entry)) return;
      seen.add(entry);
      const stamp = new Date().toISOString();
      const cur = loadDiary();
      const next = cur ? cur + '\n\n[' + stamp + '] ' + entry : '[' + stamp + '] ' + entry;
      try { localStorage.setItem(LS_DIARY, next); } catch (e) {}
      // 同步云端：合并去重后写回 Gist
      const merged = mergeMemory(loadDiary(), cloudDiary);
      cloudDiary = merged;
      pushCloudDiary(merged);
    }
    function scan(node) {
      if (node.nodeType === 3) {
        let rest = node.textContent;
        let m = rest.match(markerRe);
        while (m) {
          const pre = rest.slice(0, m.index);
          const entry = m[1].trim();
          if (entry && !/要记录的内容/.test(pre.slice(-14))) write(entry);
          rest = rest.slice(m.index + m[0].length);
          m = rest.match(markerRe);
        }
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      Array.from(node.childNodes).forEach(scan);
    }
    const mo = new MutationObserver((muts) => { for (const mu of muts) for (const n of mu.addedNodes) scan(n); });
    mo.observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; const arr = [];
      while ((n = walker.nextNode())) arr.push(n);
      arr.forEach(scan);
    }, 5000);
  }
  watchDiaryMarkers();

  // 启动时自动拉取云端记忆（配置过才拉）
  if (loadCloudCfg().id && loadCloudCfg().token) {
    fetchCloudDiary().then(() => {
      // 拉取完成后刷新注入内容（若自动注入还在等待则用最新记忆）
      if (cloudDiaryReady) applySkin();
    });
  }

  // ============ 自动注入：每个新会话自动把开启的提示填给 AI ============
  function autoInject() {
    const s = loadSettings();
    if (!s.autoInject) return;
    const parts = [];
    if (s.emojiHint) parts.push(EMOJI_GUIDE);
    if (s.personaHint || s.diaryHint) {
      const pd = buildPersonaDiaryGuide();
      if (pd) parts.push(pd);
    }
    if (parts.length === 0) return;
    const guide = parts.join('\n\n---\n\n');
    let injected = false;
    let hadContent = false;
    let cloudWait = 0;
    const tryInject = () => {
      // 配置了云端记忆但还没拉完：等它（最多等 8 秒）保证注入的是最新记忆
      if (loadCloudCfg().id && loadCloudCfg().token && !cloudDiaryReady && cloudWait < 8) {
        cloudWait++;
        setTimeout(tryInject, 1000);
        return;
      }
      const box = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
      if (!box) { setTimeout(tryInject, 1000); return; }
      const main = document.querySelector('main');
      const len = main ? main.innerText.trim().length : 0;
      const empty = len < 100;
      if (!empty) hadContent = true;
      if (empty && hadContent) { hadContent = false; injected = false; }
      if (!empty || injected) { setTimeout(tryInject, 4000); return; }
      const typed = box.value !== undefined ? box.value.trim() : (box.textContent || '').trim();
      if (typed !== '') { setTimeout(tryInject, 3000); return; }
      injected = true;
      insertText(guide);
      setTimeout(() => {
        const sendBtn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => {
          const aria = b.getAttribute('aria-label') || '';
          const txt = b.textContent || '';
          return aria.indexOf('发送') !== -1 || aria.indexOf('Send') !== -1 || txt.indexOf('发送') !== -1;
        });
        if (sendBtn) sendBtn.click();
      }, 600);
    };
    setTimeout(tryInject, 3500);
  }
  autoInject();

})();
