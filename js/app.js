(function (root) {
  'use strict';
  const App = root.App;

  // 降级持久化：用 IndexedDB 作工作副本，支持导出/导入文件
  function createDegradePersistence() {
    const KEY = 'degradeData';
    let cache = null;
    return {
      kind: 'degrade',
      isDegrade: true,
      read: async () => {
        if (cache) return cache;
        try { cache = await App.db.getIdbJson(KEY); } catch (e) { cache = null; }
        return cache || App.fsio.defaultData();
      },
      write: async (obj) => { cache = obj; try { await App.db.putIdbJson(KEY, obj); } catch (e) {} },
      exportFile: async () => {
        const data = cache || App.fsio.defaultData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'data-backup-' + App.util.formatDate(new Date()) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
      },
      importFile: async (file) => {
        const text = await file.text();
        cache = App.fsio.parseData(text);
        await App.db.putIdbJson(KEY, cache);
        return cache;
      }
    };
  }

  async function boot() {
    if (typeof document === 'undefined') return;
    const content = document.getElementById('content');

    let persistence;
    if (App.fsio.isFsSupported()) {
      persistence = await App.fsio.createFsPersistence();
    } else {
      persistence = createDegradePersistence();
    }
    let store = App.store.createStore(persistence);
    // 安全上下文下若 read 因任何原因失败（如取消了文件选择），降级到 IndexedDB，保证 App 一定能打开
    try {
      await store.load();
    } catch (e) {
      if (persistence.kind === 'fs') {
        persistence = createDegradePersistence();
        store = App.store.createStore(persistence);
        await store.load();
      } else {
        throw e;
      }
    }
    App.store.instance = store;
    App.app.persistence = persistence;

    // 句柄是持久化的，但浏览器重启后授权可能被收回：先把权限状态查准，再决定提示
    if (persistence.refreshPerm) { try { await persistence.refreshPerm(); } catch (e) {} }
    // 上次写盘失败留下的"浏览器新、文件旧"：权限还在就顺手补写一次，
    // 免得用户每次开机都看到「浏览器数据较新」的提示。
    if (persistence.stale && persistence.perm === 'granted') {
      try { await store.save(); } catch (e) {}
    }
    // 老数据补国家：早期导入的渠道常常只写了城市/仓号（「Bolingbrook」「ONT8」），
    // 而快捷测算只按国家名搜，这些渠道会搜不到。按货代分组补一次（幂等），补了就落盘。
    let countryFilled = 0;
    try { countryFilled = App.calc.fillMissingCountries(store.getState().channels || []); } catch (e) { countryFilled = 0; }
    if (countryFilled) { try { await store.save(); } catch (e) {} }
    updateConnUi();
    // 不再强制弹出“选择数据文件”横幅：未选文件时数据自动落在浏览器本地存储，
    // 点顶栏的「data.json 未绑定」或到「数据与设置」即可绑定项目目录里的 data.json。

    document.getElementById('nav').addEventListener('click', (e) => {
      const a = e.target.closest('.nav-item');
      if (!a) return;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      a.classList.add('active');
      App.router.show(a.dataset.page);
    });

    App.router.init(content);
    App.router.show('home');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
  async function exportData() {
    const state = App.store.instance.getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data-backup-' + App.util.formatDate(new Date()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    App.util.toast('已导出备份');
  }

  // 就地替换当前状态（保留 state 对象引用，页面里已经拿到的引用不会失效）
  function applyInPlace(data) {
    const st = App.store.instance.getState();
    Object.assign(st, data || {});
    st.settings = Object.assign({}, App.store.DEFAULT_SETTINGS, st.settings || {});
    if (!Array.isArray(st.channels)) st.channels = [];
    if (!Array.isArray(st.records)) st.records = [];
    return st;
  }

  async function importData(file) {
    const text = await file.text();
    const data = App.fsio.parseData(text);
    applyInPlace(data);
    await App.store.instance.save();
    App.util.toast('已从备份恢复');
    App.router.show(App.router.current || 'home');
  }

  // 侧栏/顶栏的连接状态：与设置页共用 fsio.dataFileVm，避免三处文案各说各的
  function updateConnUi() {
    if (typeof document === 'undefined') return;
    const connDot = document.getElementById('conn-dot');
    const connText = document.getElementById('conn-text');
    const dataPath = document.getElementById('data-path');
    const dv = App.fsio.dataFileVm(App.app.persistence);
    if (connDot) {
      connDot.classList.remove('ok');
      connDot.classList.remove('warn');
      connDot.classList.add((dv.needsBind || dv.needsPerm || dv.isDegrade || dv.writeFailed || dv.stale) ? 'warn' : 'ok');
    }
    if (connText) {
      connText.textContent = dv.isDegrade ? '本地存储（浏览器）'
        : dv.needsBind ? '未绑定 data.json'
          : dv.needsPerm ? '需授权 data.json'
            : dv.writeFailed ? '未写入 data.json'
              : dv.stale ? '浏览器数据较新'
                : '已连接 data.json';
    }
    if (dataPath) {
      dataPath.textContent = dv.isDegrade ? ''
        : dv.needsBind ? 'data.json 未绑定 · 点此绑定'
          : ('data.json' + (dv.needsPerm ? '（需授权）' : dv.writeFailed ? '（未写入）' : dv.stale ? '（文件较旧）' : ''));
      dataPath.title = dv.hint;
      dataPath.style.cursor = dv.isDegrade ? '' : 'pointer';
      dataPath.onclick = dv.isDegrade ? null : () => App.app.changeDataFile(!dv.needsBind);
    }
  }

  // 绑定项目目录里的 data.json（create=false）或另存一个新的（create=true）。
  // 关键：绑定时不能拿浏览器里的旧副本盖掉文件里已有的数据——
  // 用户往往是「文件里有几千条、浏览器里只有几百条」时来重新绑定，
  // 一盖就等于把文件里的渠道清空（看起来就是"重开变几百条"）。
  async function changeDataFile(create) {
    const p = App.app.persistence;
    const wantCreate = create === true;
    let info = null;
    try {
      if (p && p.chooseFile) info = await p.chooseFile(wantCreate);
      else if (p && p.changeFile) info = await p.changeFile(wantCreate);
      else { App.util.toast('当前模式不支持绑定文件'); return; }
    } catch (e) {
      App.util.toast('未选择文件');
      return;
    }
    const memCount = ((App.store.instance.getState() || {}).channels || []).length;
    const fileCount = (info && typeof info.fileCount === 'number') ? info.fileCount : 0;
    if (info && info.fileData && fileCount > memCount) {
      // 文件里的数据更多：采用文件，绝不拿浏览器里的旧副本盖掉它
      applyInPlace(info.fileData);
      App.util.toast('已绑定 data.json，采用文件里的 ' + fileCount + ' 条渠道（未覆盖）');
    } else {
      await App.store.instance.save();
      App.util.toast(wantCreate
        ? ('已新建 data.json，写入 ' + memCount + ' 条渠道')
        : ('已绑定 data.json，写入 ' + memCount + ' 条渠道'));
    }
    if (info && info.writable === false) {
      App.util.toast('文件是只读授权的，数据暂时只存在浏览器里');
    }
    updateConnUi();
    App.router.show('settings');
  }

  // 把浏览器里的较新数据补写回 data.json（设置页「写回 data.json」）
  async function writeBackFile() {
    if (!App.store.instance) return;
    let r = null;
    try { r = await App.store.instance.save(); } catch (e) {}
    updateConnUi();
    App.util.toast(r && r.target === 'file' ? '已写回 data.json' : '还是没写进去：点「重新授权」允许读写后再试');
    App.router.show('settings');
  }

  // 浏览器重启后重新拿回读写权限（必须由用户点击触发）
  async function requestDataPerm() {
    const p = App.app.persistence;
    if (!p || !p.requestPerm) { App.util.toast('当前模式不支持授权'); return; }
    const st = await p.requestPerm();
    if (App.store.instance) { try { await App.store.instance.save(); } catch (e) {} }
    updateConnUi();
    App.util.toast(st === 'granted' ? '已授权，数据会写回 data.json' : '未获得授权，数据暂存浏览器');
    App.router.show('settings');
  }

  const api = { boot, createDegradePersistence, exportData, importData, changeDataFile, requestDataPerm, writeBackFile, applyInPlace, updateConnUi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.App = root.App || {};
  root.App.app = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
