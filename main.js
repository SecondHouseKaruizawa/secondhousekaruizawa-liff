// main.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  // ページタイトルを設定マスタから反映
  if (APP_CONFIG.pageTitles && APP_CONFIG.pageTitles.liff) {
    document.title = APP_CONFIG.pageTitles.liff;
  }

  // 契約モジュール制御フラグ（未定義時は既存互換で全機能ON）
  const MODULES = Object.assign({
    lineGuest: true,
    nonGuestBooking: true,
    otaPortal: true,
    inventory: true,
    analytics: true
  }, APP_CONFIG.modules || {});

  // ★ 備品マスタ定義（config.js の APP_CONFIG から取得）
  const INVENTORY_SECTIONS = Array.isArray(APP_CONFIG.inventorySections) ? APP_CONFIG.inventorySections : [];
  const COMMON_EQUIPMENT_SECTIONS = Array.isArray(APP_CONFIG.commonEquipments) ? APP_CONFIG.commonEquipments : [];
  const FACILITY_LIST = Array.isArray(APP_CONFIG.inventoryFacilities) ? APP_CONFIG.inventoryFacilities : [];

  let currentLang = localStorage.getItem('app_lang') || 'ja';

  // ★ スタッフ・管理者（オーナー）認証状態とキャッシュ
  let isStaffUser = false;
  let isAdminUser = false;
  let currentMyUserId = '';
  let inventoryCache = {};
  let currentInvTab = FACILITY_LIST[0] || 'SHORTAGE';
  let openSectionsMap = {}; // アコーディオン開閉状態の保持用

  // ★ 管理者メニュー用ステートキャッシュ
  let adminStateCache = null;
  let currentAdminSubView = 'TOP'; // 'TOP' | 'MAINT' | 'ANALYTICS' | 'CO_BLOCK'
  let selectedBlockDate = ''; // YYYY-MM-DD

  // ★ 連打時の通信追い越し防止用（品目別デバウンスタイマー＆通信中カウンタ）
  const saveDebounceTimers = {};
  let inFlightSaveCount = 0;

  // ==========================================
  // ★ 匿名行動分析（トレーサー）用 状態管理＆非同期バッファ
  // ==========================================
  let traceLevel = 0; // check_status でサーバー側の TRACE_LEVEL を受け取る
  let currentTrackedFacility = 'UNSELECTED';
  let lastTrackedStepCode = '';
  let traceQueue = [];
  let traceFlushTimer = null;

  function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // セッションID（30分無操作で新規発行）と日跨ぎリピート判定メタデータの取得
  function getTraceSessionAndMeta() {
    const nowMs = Date.now();
    const todayStr = getTodayDateString();
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

    let sessionId = localStorage.getItem('sh_liff_trace_sid') || '';
    const lastActiveMs = parseInt(localStorage.getItem('sh_liff_trace_last_ms') || '0', 10);
    let seqNo = parseInt(localStorage.getItem('sh_liff_trace_seq') || '0', 10);

    let firstDate = localStorage.getItem('sh_liff_first_date') || '';
    let lastDate = localStorage.getItem('sh_liff_last_date') || '';
    let userSegment = localStorage.getItem('sh_liff_user_seg') || 'FIRST';

    if (!firstDate) {
      firstDate = todayStr;
      localStorage.setItem('sh_liff_first_date', firstDate);
    }

    if (!sessionId || (nowMs - lastActiveMs) > SESSION_TIMEOUT_MS) {
      sessionId = 's_' + nowMs.toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      seqNo = 0;
      if (!lastDate) {
        userSegment = 'FIRST';
      } else if (lastDate === todayStr) {
        userSegment = (firstDate !== todayStr) ? 'MULTI_DAY_REPEAT' : 'SAME_DAY_REPEAT';
      } else {
        userSegment = 'MULTI_DAY_REPEAT';
      }
      localStorage.setItem('sh_liff_trace_sid', sessionId);
      localStorage.setItem('sh_liff_user_seg', userSegment);
      localStorage.setItem('sh_liff_last_date', todayStr);
    }

    seqNo += 1;
    localStorage.setItem('sh_liff_trace_seq', String(seqNo));
    localStorage.setItem('sh_liff_trace_last_ms', String(nowMs));

    let daysSinceFirst = 0;
    try {
      const fParts = firstDate.split('-');
      const tParts = todayStr.split('-');
      const fDt = new Date(parseInt(fParts[0], 10), parseInt(fParts[1], 10) - 1, parseInt(fParts[2], 10));
      const tDt = new Date(parseInt(tParts[0], 10), parseInt(tParts[1], 10) - 1, parseInt(tParts[2], 10));
      daysSinceFirst = Math.max(0, Math.round((tDt.getTime() - fDt.getTime()) / (1000 * 60 * 60 * 24)));
    } catch (e) {}

    return {
      sessionId: sessionId,
      seqNo: seqNo,
      userSegment: userSegment,
      daysSinceFirst: daysSinceFirst
    };
  }

  // 画面表示（VIEW_...）および完遂アクション（GOAL_...）の記録フック
  function trackStep(stepCode, isGoal = 0, facilityOverride = null) {
    try {
      if (!MODULES.analytics || isStaffUser || isAdminUser || traceLevel <= 0) return;
      if (facilityOverride) {
        currentTrackedFacility = getCanonicalFacilityName(facilityOverride) || facilityOverride;
      }

      // TRACE_LEVEL === 1（軽量KPIモード）時はゴールイベントのみ送信
      if (traceLevel === 1 && !isGoal) return;

      // 同一画面での言語切替等による連続重複VIEWを抑制
      if (!isGoal && stepCode === lastTrackedStepCode) return;
      lastTrackedStepCode = stepCode;

      const meta = getTraceSessionAndMeta();
      traceQueue.push({
        ts: Date.now(),
        seq: meta.seqNo,
        step: stepCode,
        goal: isGoal ? 1 : 0,
        fac: currentTrackedFacility || 'UNSELECTED',
        lang: currentLang
      });

      if (isGoal) {
        flushTraceQueue(true);
      } else {
        if (traceFlushTimer) clearTimeout(traceFlushTimer);
        traceFlushTimer = setTimeout(() => flushTraceQueue(false), 3000);
      }
    } catch (e) {}
  }

  // バッファされた行動イベントを非同期でGASへ一括送信（UX非干渉・Fire-and-Forget）
  function flushTraceQueue(useKeepAlive = false) {
    try {
      if (traceFlushTimer) {
        clearTimeout(traceFlushTimer);
        traceFlushTimer = null;
      }
      if (!MODULES.analytics || isStaffUser || isAdminUser || traceLevel <= 0 || traceQueue.length === 0) return;

      const idToken = (typeof liff !== 'undefined' && liff.isLoggedIn()) ? liff.getIDToken() : null;
      if (!idToken) return;

      const eventsToSend = traceQueue.slice();
      traceQueue = [];

      const sessionId = localStorage.getItem('sh_liff_trace_sid') || '';
      const userSegment = localStorage.getItem('sh_liff_user_seg') || 'FIRST';
      const firstDate = localStorage.getItem('sh_liff_first_date') || getTodayDateString();
      const todayStr = getTodayDateString();
      let daysSinceFirst = 0;
      try {
        const fParts = firstDate.split('-');
        const tParts = todayStr.split('-');
        const fDt = new Date(parseInt(fParts[0], 10), parseInt(fParts[1], 10) - 1, parseInt(fParts[2], 10));
        const tDt = new Date(parseInt(tParts[0], 10), parseInt(tParts[1], 10) - 1, parseInt(tParts[2], 10));
        daysSinceFirst = Math.max(0, Math.round((tDt.getTime() - fDt.getTime()) / (1000 * 60 * 60 * 24)));
      } catch (e) {}

      let tz = 'unknown';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; } catch (e) {}
      const osLang = navigator.language || 'unknown';

      const payloadStr = JSON.stringify({
        type: 'trace_events',
        idToken: idToken,
        sessionId: sessionId,
        userSegment: userSegment,
        daysSinceFirst: daysSinceFirst,
        facility: currentTrackedFacility,
        appLang: currentLang,
        osLang: osLang,
        timezone: tz,
        events: eventsToSend
      });

      fetch(APP_CONFIG.GAS_URL, {
        method: 'POST',
        body: payloadStr,
        keepalive: Boolean(useKeepAlive)
      }).catch(() => {});
    } catch (e) {}
  }

  // 画面を閉じた・別アプリに切り替えた瞬間に未送信イベントを確実にフラッシュ
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushTraceQueue(true);
    }
  });
  window.addEventListener('pagehide', () => {
    flushTraceQueue(true);
  });

  // ==========================================
  // ★ 基本ユーティリティ・施設マスタ参照ヘルパー群
  // ==========================================
  function t(key) {
    let val = APP_CONFIG.translations[currentLang]?.[key];
    if (val !== undefined) return val;
    val = APP_CONFIG.translations['ja'][key];
    if (val !== undefined) return val;
    return key;
  }

  // XSS・表示崩れ防止用HTMLエスケープ関数（ユーザー入力値・動的表示用）
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 選択中の言語に応じた敬称付き表示名を生成（Webアプリ版と完全統一）
  function formatGuestDisplayName(rawName) {
    if (!rawName) return '';
    const formatStr = t('honorificFormat') || '{name}';
    return formatStr.replace('{name}', () => rawName);
  }

  // 任意の言語の施設名からマスタ定義オブジェクト（guideType等を含む）を取得
  function getFacilityDefByName(name) {
    if (!name || !APP_CONFIG.facilities) return null;
    for (const lang in APP_CONFIG.facilities) {
      const list = APP_CONFIG.facilities[lang] || [];
      const found = list.find(f => f.name === name);
      if (found) {
        const jaDef = (APP_CONFIG.facilities['ja'] || []).find(f => f.id === found.id);
        return Object.assign({}, jaDef || {}, found);
      }
    }
    return null;
  }

  // 任意の言語の施設名を日本語の基準施設名（canonical名）へ変換
  function getCanonicalFacilityName(name) {
    const def = getFacilityDefByName(name);
    if (def && def.id) {
      const jaDef = (APP_CONFIG.facilities['ja'] || []).find(f => f.id === def.id);
      if (jaDef) return jaDef.name;
    }
    return name || '';
  }

  function getLocalizedFacilityName(name) {
    const def = getFacilityDefByName(name);
    if (def && def.id) {
      const localizedFac = (APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja']).find(f => f.id === def.id);
      if (localizedFac) return localizedFac.name;
    }
    return name;
  }

  function getFacilityNameById(facId) {
    const jaList = APP_CONFIG.facilities['ja'] || [];
    const found = jaList.find(f => f.id === facId);
    return found ? found.name : facId;
  }

  // チェックイン完了時の案内種別判定（manual: ようこそ案内のみ / call: スタッフ連絡・WiFi待機案内）
  function isManualGuideFacility(name) {
    const def = getFacilityDefByName(name);
    return Boolean(def && def.guideType === 'manual');
  }

  function renderLangSelectorHtml() {
    return `
      <div class="lang-selector">
        <button class="lang-btn ${currentLang === 'ja' ? 'active' : ''}" data-lang="ja">日本語</button>
        <button class="lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        <button class="lang-btn ${currentLang === 'zh-TW' ? 'active' : ''}" data-lang="zh-TW">繁體</button>
        <button class="lang-btn ${currentLang === 'zh-CN' ? 'active' : ''}" data-lang="zh-CN">简体</button>
      </div>
    `;
  }

  function bindLangSelectorEvents(reRenderFunc, ...args) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentLang = e.target.getAttribute('data-lang');
        localStorage.setItem('app_lang', currentLang);
        if (reRenderFunc) reRenderFunc(...args);
        else renderTopMenu();
      });
    });
  }

  function closeApp() {
    flushTraceQueue(true);
    liff.closeWindow();
  }

  // クリップボードコピー＆無料トーク控え送信ヘルパー（Push API枠を一切消費しない）
  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        alert('📋 クリップボードにコピーしました。');
        return;
      }
    } catch (e) {}
    prompt('以下のテキストをコピーしてください：', text);
  }

  async function sendFreeMemoToMyChat(memoText) {
    try {
      if (typeof liff !== 'undefined' && liff.isInClient()) {
        await liff.sendMessages([{ type: 'text', text: memoText }]);
        alert('💬 トーク画面に控えメッセージを送信しました（API無料枠は消費しません）。');
      } else {
        await copyTextToClipboard(memoText);
      }
    } catch (e) {
      await copyTextToClipboard(memoText);
    }
  }

  // トークン期限切れによる再認証時に、直前の画面と入力値を一時退避・復元するヘルパー
  function triggerReauthWithState(stateObj) {
    try {
      sessionStorage.setItem('liff_reauth_state', JSON.stringify(stateObj));
    } catch (e) {}
    alert(t('sessionExpired'));
    if (liff.isInClient()) {
      location.reload();
    } else {
      liff.logout();
      liff.login({ scopes: ['openid', 'profile', 'chat_message.write'] });
    }
  }

  function restoreAfterReauthIfNeeded() {
    const raw = sessionStorage.getItem('liff_reauth_state');
    if (!raw) return false;
    sessionStorage.removeItem('liff_reauth_state');
    try {
      const st = JSON.parse(raw);
      if (st.screen === 'checkInOut' && MODULES.lineGuest) {
        renderCheckInOutAction(st.guestName, st.facilityName);
        return true;
      } else if (st.screen === 'guestContact' && MODULES.lineGuest) {
        renderGuestContactForm(st.guestName, st.facilityName, st.categoryName, st.draftText);
        return true;
      } else if (st.screen === 'returningBooking' && MODULES.nonGuestBooking) {
        renderReturningBookingForm(st.draftData);
        return true;
      } else if (st.screen === 'firstTimeBooking' && MODULES.nonGuestBooking) {
        renderBookingMenu();
        return true;
      } else if (st.screen === 'nonGuestInquiry' && MODULES.nonGuestBooking) {
        renderNonGuestInquiryForm(st.draftName, st.draftText);
        return true;
      } else if (st.screen === 'staffInventory' && isStaffUser && MODULES.inventory) {
        openStaffInventoryApp();
        return true;
      } else if (st.screen === 'adminConsole' && isAdminUser) {
        openAdminConsoleApp(st.subView || 'TOP');
        return true;
      }
    } catch (e) {}
    return false;
  }

  try {
    await liff.init({ liffId: APP_CONFIG.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ scopes: ['openid', 'profile', 'chat_message.write'] });
      return;
    }

    const idToken = liff.getIDToken();
    const response = await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'check_status', idToken: idToken })
    });
    const result = await response.json();

    if (result.status === 'error' && (result.code === 'TOKEN_EXPIRED' || result.code === 'AUTH_ERROR')) {
      if (!sessionStorage.getItem('liff_init_retried')) {
        sessionStorage.setItem('liff_init_retried', '1');
        if (liff.isInClient()) {
          location.reload();
        } else {
          liff.logout();
          liff.login({ scopes: ['openid', 'profile', 'chat_message.write'] });
        }
        return;
      }
    }
    sessionStorage.removeItem('liff_init_retried');

    isStaffUser = Boolean(result.isStaff);
    isAdminUser = Boolean(result.isAdmin);
    currentMyUserId = result.myUserId || '';
    traceLevel = (MODULES.analytics && !isStaffUser && !isAdminUser && typeof result.traceLevel === 'number')
      ? result.traceLevel
      : 0;

    loading.classList.add('hidden');
    appContent.classList.remove('hidden');

    if (result.isMaintenance) {
      renderMaintenanceScreen();
    } else {
      if (!restoreAfterReauthIfNeeded()) {
        renderTopMenu();
      }
    }
  } catch (error) {
    loading.innerText = 'エラーが発生しました: ' + error.message;
  }

  // ==========================================
  // メンテナンス専用画面（管理者はここからでも管理メニューを開ける安全設計）
  // ==========================================
  function renderMaintenanceScreen() {
    const adminEscapeBtnHtml = isAdminUser
      ? `<button class="btn btn-admin-entry" id="btn-maint-admin" style="margin-top: 15px;">👑 管理者メニューを開く（メンテ解除・設定）</button>`
      : '';

    appContent.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>🚧 ${t('maintTitle')} 🚧</h2>
        <p style="font-size: 15px; line-height: 1.6; margin-top: 20px;">${t('maintMsg')}</p>
        ${adminEscapeBtnHtml}
        <button class="btn btn-danger" id="btn-close" style="margin-top: 20px;">${t('closeApp')}</button>
      </div>
    `;
    document.getElementById('btn-close').addEventListener('click', closeApp);
    const adminBtn = document.getElementById('btn-maint-admin');
    if (adminBtn) {
      adminBtn.addEventListener('click', () => openAdminConsoleApp('MAINT'));
    }
  }

  // ==========================================
  // 【階層①】TOPメニュー（契約モジュール＆スタッフ・管理者権限に応じて表示）
  // ==========================================
  function renderTopMenu() {
    trackStep('VIEW_TOP', 0);

    const guestBtnHtml = MODULES.lineGuest
      ? `<button class="btn btn-primary" id="btn-guest">${t('guest')}<br><small>${t('guestSub')}</small></button>`
      : '';

    const nonGuestBtnHtml = MODULES.nonGuestBooking
      ? `<button class="btn btn-secondary" id="btn-nonguest">${t('nonGuest')}<br><small>${t('nonGuestSub')}</small></button>`
      : '';

    const staffBtnHtml = (isStaffUser && MODULES.inventory)
      ? `<button class="btn btn-staff-entry" id="btn-staff-inv">🔧 スタッフ用メニュー (備品在庫管理)</button>`
      : '';

    const adminBtnHtml = isAdminUser
      ? `<button class="btn btn-admin-entry" id="btn-admin-console">👑 管理者メニュー (システム設定・状況確認)</button>`
      : '';

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2 id="top-menu-heading" style="user-select: none;">${t('selectMenu')}</h2>
      ${guestBtnHtml}
      ${nonGuestBtnHtml}
      ${staffBtnHtml}
      ${adminBtnHtml}
    `;
    bindLangSelectorEvents(renderTopMenu);

    const btnGuestEl = document.getElementById('btn-guest');
    if (btnGuestEl) btnGuestEl.addEventListener('click', renderGuestTopMenu);

    const btnNonGuestEl = document.getElementById('btn-nonguest');
    if (btnNonGuestEl) btnNonGuestEl.addEventListener('click', renderNonGuestMenu);

    const btnStaffInvEl = document.getElementById('btn-staff-inv');
    if (btnStaffInvEl) btnStaffInvEl.addEventListener('click', openStaffInventoryApp);

    const btnAdminEl = document.getElementById('btn-admin-console');
    if (btnAdminEl) btnAdminEl.addEventListener('click', () => openAdminConsoleApp('TOP'));

    // 新規スタッフ・管理者追加用：見出しを5回連続タップすると自分のLINE userIdを表示
    let tapCount = 0;
    let tapTimer = null;
    const headingEl = document.getElementById('top-menu-heading');
    if (headingEl) {
      headingEl.addEventListener('click', () => {
        tapCount++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 1200);
        if (tapCount >= 5) {
          tapCount = 0;
          if (currentMyUserId) {
            prompt('【登録用 LINE User ID】\n以下の文字列をコピーしてスクリプトプロパティに登録してください：', currentMyUserId);
          }
        }
      });
    }
  }

  // ==========================================
  // ★ 管理者（オーナー）専用メニュー（LINE Push枠 完全ゼロ消費設計）
  // ==========================================
  async function callAdminPanelApi(action, params = {}, subViewForReauth = 'TOP') {
    const idToken = liff.getIDToken();
    if (!idToken) {
      triggerReauthWithState({ screen: 'adminConsole', subView: subViewForReauth });
      return null;
    }

    loading.innerText = '設定情報を通信しています...';
    loading.classList.remove('hidden');
    appContent.classList.add('hidden');

    try {
      const response = await fetch(APP_CONFIG.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(Object.assign({
          type: 'admin_panel',
          idToken: idToken,
          action: action
        }, params))
      });
      const json = await response.json();
      loading.classList.add('hidden');
      appContent.classList.remove('hidden');

      if (json.status === 'success') {
        if (json.adminState) {
          adminStateCache = json.adminState;
        }
        return json;
      } else if (json.code === 'TOKEN_EXPIRED' || json.code === 'AUTH_ERROR') {
        triggerReauthWithState({ screen: 'adminConsole', subView: subViewForReauth });
        return null;
      } else {
        alert('エラー: ' + (json.message || json.code || '権限がありません'));
        return null;
      }
    } catch (e) {
      loading.classList.add('hidden');
      appContent.classList.remove('hidden');
      alert('通信エラーが発生しました: ' + e.message);
      return null;
    }
  }

  async function openAdminConsoleApp(initialSubView = 'TOP') {
    if (!isAdminUser) return;
    currentAdminSubView = initialSubView || 'TOP';
    if (!selectedBlockDate) selectedBlockDate = getTodayDateString();

    const res = await callAdminPanelApi('get_overview', { blockDate: selectedBlockDate }, currentAdminSubView);
    if (!res) {
      renderTopMenu();
      return;
    }
    renderAdminConsoleScreen();
  }

  function renderAdminConsoleScreen() {
    if (currentAdminSubView === 'MAINT') {
      renderAdminMaintSubScreen();
    } else if (currentAdminSubView === 'ANALYTICS') {
      renderAdminAnalyticsSubScreen();
    } else if (currentAdminSubView === 'CO_BLOCK') {
      renderAdminCoBlockSubScreen();
    } else {
      renderAdminTopSubScreen();
    }
  }

  // 管理者メニュー：トップ階層
  function renderAdminTopSubScreen() {
    const st = adminStateCache || {};
    const isMaintOn = Boolean(st.maintenanceMode);
    const maintBadge = isMaintOn
      ? `<span class="admin-status-pill pill-on">🚧 メンテナンス中</span>`
      : `<span class="admin-status-pill pill-off">🟢 通常稼働中</span>`;

    const lv = (st.traceLevel !== undefined) ? st.traceLevel : 2;
    const lvLabels = {
      0: 'レベル0 (停止)',
      1: 'レベル1 (簡易)',
      2: 'レベル2 (標準)',
      3: 'レベル3 (標準+日次メール)'
    };

    const blockedCount = st.coBlockMap
      ? Object.values(st.coBlockMap).filter(Boolean).length
      : 0;
    const blockBadge = blockedCount > 0
      ? `<span class="admin-status-pill pill-on">🔴 ${blockedCount}施設 停止中</span>`
      : `<span class="admin-status-pill pill-off">🟢 全施設 通常送信</span>`;

    const analyticsCardHtml = MODULES.analytics ? `
      <div class="admin-card">
        <div class="admin-card-title">
          <span>📊 アプリ利用状況・記録設定</span>
          <span class="admin-status-pill pill-info">${escapeHtml(lvLabels[lv] || ('レベル' + lv))}</span>
        </div>
        <div class="admin-desc">
          今月の予約数に対するアプリ利用率の確認や、記録する細かさ（確認粒度）の変更を行います。
        </div>
        <button class="btn btn-primary" id="btn-adm-go-analytics" style="margin-bottom:0; padding:12px;">利用状況・確認粒度の設定へ</button>
      </div>
    ` : '';

    appContent.innerHTML = `
      <div class="staff-header-bar">
        <h3 class="staff-title">👑 管理者メニュー</h3>
        <span class="save-status-badge">LINE枠消費ゼロ</span>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>🔧 メンテナンス・動作テスト</span>
          ${maintBadge}
        </div>
        <div class="admin-desc">
          メンテナンス画面への切り替え（管理者用バイパスURLの自動発行）や、OTAポータル認証テスト用のダミー予約発行を行います。
        </div>
        <button class="btn btn-primary" id="btn-adm-go-maint" style="margin-bottom:0; padding:12px;">メンテナンス・テスト設定へ</button>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>🔕 チェックアウト自動連絡制御</span>
          ${blockBadge}
        </div>
        <div class="admin-desc">
          チェックアウト5分後に自動送信されるお礼メッセージを、日付・施設ごとにワンタップで停止・解除できます（対象日: ${escapeHtml(st.blockDate || selectedBlockDate)}）。
        </div>
        <button class="btn btn-primary" id="btn-adm-go-coblock" style="margin-bottom:0; padding:12px;">施設別の停止・解除設定へ</button>
      </div>

      ${analyticsCardHtml}

      <div style="margin-top: 16px; display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="btn-adm-refresh" style="margin-bottom:0; padding:12px;">🔄 最新状態に更新</button>
        <button class="btn btn-secondary" id="btn-adm-back-top" style="margin-bottom:0; padding:12px;">TOPメニューへ戻る</button>
      </div>
    `;

    document.getElementById('btn-adm-go-maint').addEventListener('click', () => {
      currentAdminSubView = 'MAINT';
      renderAdminConsoleScreen();
    });
    document.getElementById('btn-adm-go-coblock').addEventListener('click', () => {
      currentAdminSubView = 'CO_BLOCK';
      renderAdminConsoleScreen();
    });
    const btnAnalytics = document.getElementById('btn-adm-go-analytics');
    if (btnAnalytics) {
      btnAnalytics.addEventListener('click', () => {
        currentAdminSubView = 'ANALYTICS';
        renderAdminConsoleScreen();
      });
    }
    document.getElementById('btn-adm-refresh').addEventListener('click', () => openAdminConsoleApp('TOP'));
    document.getElementById('btn-adm-back-top').addEventListener('click', renderTopMenu);
  }

  // 管理者メニュー①：メンテナンスモード設定 ＆ OTA認証テスト発行
  function renderAdminMaintSubScreen() {
    const st = adminStateCache || {};
    const isMaintOn = Boolean(st.maintenanceMode);
    const isBypassOn = Boolean(st.adminBypassMode);

    const statusBadge = isMaintOn
      ? `<span class="admin-status-pill pill-on">🚧 現在：メンテナンス中</span>`
      : `<span class="admin-status-pill pill-off">🟢 現在：通常稼働中</span>`;

    let bypassBoxHtml = '';
    if (isBypassOn && st.bypassUrlInfo) {
      bypassBoxHtml = `
        <div class="admin-info-box">
          <strong>🔓 管理者除外（バイパス）モード有効中</strong><br>
          ・LINE版：管理者はそのまま全画面を操作できます。<br>
          ・Web(OTA)版バイパスURL：<br>
          <span style="color:#1565c0; font-weight:bold;">${escapeHtml(st.bypassUrlInfo)}</span>
          <div class="admin-sub-actions">
            <button type="button" class="btn-mini" id="btn-copy-bypass">📋 URLをコピー</button>
            <button type="button" class="btn-mini" id="btn-memo-bypass">💬 トークにメモ送信</button>
          </div>
        </div>
      `;
    }

    let otaTestCardHtml = '';
    if (MODULES.otaPortal) {
      const tb = st.otaTestBooking;
      let tbBoxHtml = '';
      if (tb && tb.ci) {
        tbBoxHtml = `
          <div class="admin-info-box">
            <strong>🧪 現在有効なOTAテスト予約条件（全施設共通）</strong><br>
            ・チェックイン日：<strong>${escapeHtml(tb.ci)}</strong><br>
            ・施設：<strong>全施設どれでも選択可</strong><br>
            ・宿泊日数：<strong>${escapeHtml(tb.n)} 泊</strong><br>
            ・大人人数：<strong>${escapeHtml(tb.a)} 名</strong><br>
            ・予約経路：<strong>${escapeHtml(tb.ch)}</strong>
            <div class="admin-sub-actions">
              <button type="button" class="btn-mini" id="btn-copy-otatest">📋 条件をコピー</button>
              <button type="button" class="btn-mini" id="btn-memo-otatest">💬 トークにメモ送信</button>
            </div>
          </div>
          <button class="btn btn-danger" id="btn-stop-otatest" style="padding:11px; font-size:14px; margin-top:8px; margin-bottom:0;">🧹 OTAテスト予約を終了（無効化）する</button>
        `;
      } else {
        tbBoxHtml = `<p style="font-size:12px; color:#666; margin:6px 0 10px 0;">現在、有効なテスト条件は発行されていません。</p>`;
      }

      otaTestCardHtml = `
        <div class="admin-card">
          <div class="admin-card-title">
            <span>🧪 OTAポータル 5項目認証テスト</span>
          </div>
          <div class="admin-desc">
            実際の予約データと衝突しない「30分間限定のテスト用5項目条件」を発行します。Webポータル画面のログイン確認に使えます。
          </div>
          <button class="btn btn-primary" id="btn-start-otatest" style="padding:12px; font-size:14px;">🧪 テスト用予約条件を新しく発行する (30分間有効)</button>
          ${tbBoxHtml}
        </div>
      `;
    }

    appContent.innerHTML = `
      <div class="staff-header-bar">
        <h3 class="staff-title">🔧 メンテナンス・動作テスト</h3>
        <span class="save-status-badge">LINE枠消費ゼロ</span>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>🚧 メンテナンスモード設定</span>
          ${statusBadge}
        </div>
        <div class="admin-desc">
          開始すると一般ゲストの画面を「メンテナンス中」に切り替え、同時に<strong>オーナー確認用のバイパスURLを自動発行</strong>します。終了すると通常稼働に戻り、バイパスURLも自動失効します。
        </div>
        ${bypassBoxHtml}
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn ${isMaintOn ? 'btn-secondary' : 'btn-danger'}" id="btn-maint-start" style="flex:1; margin-bottom:0; padding:12px; font-size:14px;">
            ${isMaintOn ? '🔄 バイパスURL再発行' : '🚧 メンテナンス開始'}
          </button>
          <button class="btn ${isMaintOn ? 'btn-primary' : 'btn-secondary'}" id="btn-maint-end" style="flex:1; margin-bottom:0; padding:12px; font-size:14px;" ${!isMaintOn && !isBypassOn ? 'disabled' : ''}>
            ✅ メンテナンス終了
          </button>
        </div>
      </div>

      ${otaTestCardHtml}

      <button class="btn btn-secondary" id="btn-back-adm-top" style="margin-top:10px;">管理者メニューへ戻る</button>
    `;

    // メンテナンス開始（管理者バイパスもセットで自動ON）
    document.getElementById('btn-maint-start').addEventListener('click', async () => {
      if (!confirm('メンテナンスモードを開始し、管理者確認用のバイパスURLを発行しますか？')) return;
      const res = await callAdminPanelApi('set_maintenance', { enable: true, withBypass: true, blockDate: selectedBlockDate }, 'MAINT');
      if (res) {
        const infoUrl = (res.adminState && res.adminState.bypassUrlInfo) ? res.adminState.bypassUrlInfo : '';
        alert('🔧 メンテナンスモードを開始しました。\n\n【OTA版バイパスURL】\n' + infoUrl);
        renderAdminMaintSubScreen();
      }
    });

    // メンテナンス終了（バイパスも同時失効）
    document.getElementById('btn-maint-end').addEventListener('click', async () => {
      if (!confirm('メンテナンスモードを終了し、通常稼働に戻しますか？（バイパスURLも失効します）')) return;
      const res = await callAdminPanelApi('set_maintenance', { enable: false, withBypass: false, blockDate: selectedBlockDate }, 'MAINT');
      if (res) {
        alert('✅ メンテナンスモードを終了しました。');
        renderAdminMaintSubScreen();
      }
    });

    const btnCopyBypass = document.getElementById('btn-copy-bypass');
    if (btnCopyBypass && st.bypassUrlInfo) {
      btnCopyBypass.addEventListener('click', () => copyTextToClipboard(st.bypassUrlInfo));
    }
    const btnMemoBypass = document.getElementById('btn-memo-bypass');
    if (btnMemoBypass && st.bypassUrlInfo) {
      btnMemoBypass.addEventListener('click', () => {
        sendFreeMemoToMyChat(`🔓【管理者バイパスURL控え】\n${st.bypassUrlInfo}`);
      });
    }

    // OTAテスト条件の発行・終了
    const btnStartOtaTest = document.getElementById('btn-start-otatest');
    if (btnStartOtaTest) {
      btnStartOtaTest.addEventListener('click', async () => {
        const res = await callAdminPanelApi('start_ota_test', { blockDate: selectedBlockDate }, 'MAINT');
        if (res && res.adminState && res.adminState.otaTestBooking) {
          const tb = res.adminState.otaTestBooking;
          const summary =
            `🧪【OTAテスト予約（30分間有効）】\n` +
            `・チェックイン日：${tb.ci}\n` +
            `・施設：全施設どれでも選択可\n` +
            `・宿泊日数：${tb.n} 泊\n` +
            `・大人人数：${tb.a} 名\n` +
            `・予約経路：${tb.ch}`;
          alert(summary);
          renderAdminMaintSubScreen();
        }
      });
    }

    const btnStopOtaTest = document.getElementById('btn-stop-otatest');
    if (btnStopOtaTest) {
      btnStopOtaTest.addEventListener('click', async () => {
        const res = await callAdminPanelApi('stop_ota_test', { blockDate: selectedBlockDate }, 'MAINT');
        if (res) {
          alert('🧹 OTAテスト予約を無効化しました。');
          renderAdminMaintSubScreen();
        }
      });
    }

    const btnCopyOtaTest = document.getElementById('btn-copy-otatest');
    if (btnCopyOtaTest && st.otaTestBooking) {
      const tb = st.otaTestBooking;
      const text = `チェックイン日: ${tb.ci} / 宿泊日数: ${tb.n}泊 / 大人人数: ${tb.a}名 / 予約経路: ${tb.ch}`;
      btnCopyOtaTest.addEventListener('click', () => copyTextToClipboard(text));
    }
    const btnMemoOtaTest = document.getElementById('btn-memo-otatest');
    if (btnMemoOtaTest && st.otaTestBooking) {
      const tb = st.otaTestBooking;
      const text = `🧪【OTAテスト予約控え（30分間有効）】\n・チェックイン日：${tb.ci}\n・施設：全施設選択可\n・宿泊日数：${tb.n} 泊\n・大人人数：${tb.a} 名\n・予約経路：${tb.ch}`;
      btnMemoOtaTest.addEventListener('click', () => sendFreeMemoToMyChat(text));
    }

    document.getElementById('btn-back-adm-top').addEventListener('click', () => {
      currentAdminSubView = 'TOP';
      renderAdminConsoleScreen();
    });
  }

  // 管理者メニュー②：チェックアウト自動お礼メッセージの日付・施設別停止制御
  function renderAdminCoBlockSubScreen() {
    const st = adminStateCache || {};
    const curDate = st.blockDate || selectedBlockDate || getTodayDateString();
    selectedBlockDate = curDate;
    const blockMap = st.coBlockMap || {};

    const facilities = (APP_CONFIG.facilities['ja'] || []).map(f => f.name);
    let rowsHtml = '';
    facilities.forEach(facName => {
      const isBlocked = Boolean(blockMap[facName]);
      const btnCls = isBlocked ? 'co-toggle-btn co-toggle-blocked' : 'co-toggle-btn co-toggle-normal';
      const btnText = isBlocked ? '🔴 停止中 (解除する)' : '🟢 通常送信 (停止する)';
      rowsHtml += `
        <div class="co-block-row">
          <span class="co-fac-name">🏠 ${escapeHtml(facName)}</span>
          <button type="button" class="${btnCls}" data-fac="${escapeHtml(facName)}" data-blocked="${isBlocked ? '1' : '0'}">
            ${btnText}
          </button>
        </div>
      `;
    });

    appContent.innerHTML = `
      <div class="staff-header-bar">
        <h3 class="staff-title">🔕 チェックアウト自動連絡制御</h3>
        <span class="save-status-badge">ワンタップ切替</span>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>📅 対象日の選択</span>
          <button type="button" class="inv-today-btn" id="btn-coblock-today">今日に戻す</button>
        </div>
        <div class="admin-desc">
          ゲストがチェックアウトボタンを押した5分後に自動送信されるお礼LINEを、特定の日・施設だけ一時的にストップできます。
        </div>
        <input type="date" id="adm-coblock-date" class="input-field" value="${escapeHtml(curDate)}" style="margin-bottom:8px;">
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>🏠 施設別の送信ステータス (${escapeHtml(curDate)})</span>
        </div>
        <div class="admin-desc">ボタンをタップすると「通常送信」と「停止中」が即座に切り替わります。</div>
        ${rowsHtml}
      </div>

      <button class="btn btn-secondary" id="btn-back-adm-top">管理者メニューへ戻る</button>
    `;

    document.getElementById('adm-coblock-date').addEventListener('change', async (e) => {
      const newDate = e.target.value;
      if (!newDate) return;
      selectedBlockDate = newDate;
      const res = await callAdminPanelApi('get_overview', { blockDate: selectedBlockDate }, 'CO_BLOCK');
      if (res) renderAdminCoBlockSubScreen();
    });

    document.getElementById('btn-coblock-today').addEventListener('click', async () => {
      selectedBlockDate = getTodayDateString();
      const res = await callAdminPanelApi('get_overview', { blockDate: selectedBlockDate }, 'CO_BLOCK');
      if (res) renderAdminCoBlockSubScreen();
    });

    document.querySelectorAll('.co-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const currentlyBlocked = e.currentTarget.getAttribute('data-blocked') === '1';
        const nextBlockState = !currentlyBlocked;
        const res = await callAdminPanelApi('set_co_block', {
          blockDate: selectedBlockDate,
          facility: fac,
          block: nextBlockState
        }, 'CO_BLOCK');
        if (res) renderAdminCoBlockSubScreen();
      });
    });

    document.getElementById('btn-back-adm-top').addEventListener('click', () => {
      currentAdminSubView = 'TOP';
      renderAdminConsoleScreen();
    });
  }

  // 管理者メニュー③：アプリ利用状況サマリー ＆ 確認粒度（記録レベル）変更
  function renderAdminAnalyticsSubScreen() {
    const st = adminStateCache || {};
    const curLevel = (st.traceLevel !== undefined) ? Number(st.traceLevel) : 2;
    const summaryText = st.analyticsSummaryText || '（「最新データで再集計する」を押すと当月の利用サマリーが表示されます）';
    const sheetUrl = st.analyticsSheetUrl || '';

    const levelDefs = [
      {
        lv: 0,
        title: 'レベル0：記録停止（OFF）',
        desc: 'アプリの利用状況やアクセスログを一切記録しません。'
      },
      {
        lv: 1,
        title: 'レベル1：簡易記録（完了アクションのみ）',
        desc: 'チェックイン・アウト完了、道案内起動、OTA認証成否など「最終ゴール」のみを軽量に記録します。'
      },
      {
        lv: 2,
        title: 'レベル2：標準記録（推奨・全画面分析）',
        desc: 'どの画面で迷って離脱したか、滞在中の日跨ぎリピート、海外ゲスト利用（渡航前／来日後）まで全て記録します。'
      },
      {
        lv: 3,
        title: 'レベル3：標準記録 ＋ 毎日メールレポート',
        desc: 'レベル2の全記録に加え、1日1回（20時間以上経過時）指定メールアドレスへ利用サマリーを自動送信します。'
      }
    ];

    const levelBtnsHtml = levelDefs.map(d => {
      const isSel = (curLevel === d.lv);
      const badge = isSel
        ? `<span class="admin-status-pill pill-off">✓ 選択中</span>`
        : `<span style="font-size:11px; color:#888;">タップで切替</span>`;
      return `
        <button type="button" class="level-option-btn ${isSel ? 'active' : ''}" data-lv="${d.lv}">
          <div class="level-opt-header">
            <span>${escapeHtml(d.title)}</span>
            ${badge}
          </div>
          <div class="level-opt-desc">${escapeHtml(d.desc)}</div>
        </button>
      `;
    }).join('');

    const sheetLinkBtnHtml = sheetUrl
      ? `<button type="button" class="btn-mini" id="btn-open-analytics-sheet">📊 分析スプレッドシートを開く</button>`
      : '';

    appContent.innerHTML = `
      <div class="staff-header-bar">
        <h3 class="staff-title">📊 アプリ利用状況・確認粒度</h3>
        <span class="save-status-badge">LINE枠消費ゼロ</span>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>📈 当月の利用状況サマリー</span>
        </div>
        <div class="admin-info-box" style="white-space: pre-wrap; font-size:12px;">${escapeHtml(summaryText)}</div>
        <div class="admin-sub-actions">
          <button type="button" class="btn-mini" id="btn-refresh-kpi">🔄 最新データで再集計する</button>
          ${sheetLinkBtnHtml}
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>⚙️ 確認粒度（記録レベル）の変更</span>
        </div>
        <div class="admin-desc">
          ご希望の記録方法のボタンをタップすると即座に切り替わります（ゲストやスタッフの操作感はどのレベルでも変わりません）。
        </div>
        ${levelBtnsHtml}
      </div>

      <button class="btn btn-secondary" id="btn-back-adm-top">管理者メニューへ戻る</button>
    `;

    document.getElementById('btn-refresh-kpi').addEventListener('click', async () => {
      const res = await callAdminPanelApi('refresh_analytics', { blockDate: selectedBlockDate }, 'ANALYTICS');
      if (res) {
        alert('📊 月次KPIシートを最新状態に再集計しました。');
        renderAdminAnalyticsSubScreen();
      }
    });

    const btnOpenSheet = document.getElementById('btn-open-analytics-sheet');
    if (btnOpenSheet && sheetUrl) {
      btnOpenSheet.addEventListener('click', () => {
        if (liff.isInClient()) {
          liff.openWindow({ url: sheetUrl, external: true });
        } else {
          window.open(sheetUrl, '_blank');
        }
      });
    }

    document.querySelectorAll('.level-option-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const targetLv = parseInt(e.currentTarget.getAttribute('data-lv'), 10);
        if (targetLv === curLevel) return;
        const res = await callAdminPanelApi('set_trace_level', { level: targetLv, blockDate: selectedBlockDate }, 'ANALYTICS');
        if (res) {
          alert(`⚙️ 確認粒度（TRACE_LEVEL）を「レベル${targetLv}」に変更しました。`);
          renderAdminAnalyticsSubScreen();
        }
      });
    });

    document.getElementById('btn-back-adm-top').addEventListener('click', () => {
      currentAdminSubView = 'TOP';
      renderAdminConsoleScreen();
    });
  }

  // ==========================================
  // ★ スタッフ専用：貸別荘備品管理アプリ機能群
  // ==========================================
  async function openStaffInventoryApp() {
    if (!MODULES.inventory) return;

    loading.innerText = '備品在庫データを読み込んでいます...';
    loading.classList.remove('hidden');
    appContent.classList.add('hidden');

    const idToken = liff.getIDToken();
    if (!idToken) {
      triggerReauthWithState({ screen: 'staffInventory' });
      return;
    }

    try {
      const response = await fetch(APP_CONFIG.GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ type: 'inv_get', idToken: idToken })
      });
      const json = await response.json();
      loading.classList.add('hidden');
      appContent.classList.remove('hidden');

      if (json.status === 'success') {
        inventoryCache = json.inventory || {};
        renderStaffInventoryScreen();
      } else if (json.code === 'TOKEN_EXPIRED' || json.code === 'AUTH_ERROR') {
        triggerReauthWithState({ screen: 'staffInventory' });
      } else {
        alert('データ取得エラー: ' + (json.message || json.code || '権限がありません'));
        renderTopMenu();
      }
    } catch (e) {
      loading.classList.add('hidden');
      appContent.classList.remove('hidden');
      alert('通信エラーが発生しました: ' + e.message);
      renderTopMenu();
    }
  }

  // 品目が「要補充（少・極小 または 数値が1以下）」かどうか判定するヘルパー
  function isItemShortage(itemDef, entry) {
    if (!entry || entry.v === undefined || entry.v === null || entry.v === '') return false;
    if (itemDef.type === 'number') {
      const num = parseInt(entry.v, 10);
      return !isNaN(num) && num <= 1;
    }
    return entry.v === '少' || entry.v === '極小';
  }

  // 特定施設・特定セクションの対象品目リストを返す
  function getFacilityItemsForSection(section, facilityName) {
    return section.items.filter(item => {
      if (item.facilities === 'ALL') return true;
      return Array.isArray(item.facilities) && item.facilities.includes(facilityName);
    });
  }

  // 保存ステータスバッジの表示を更新するヘルパー
  function updateSaveStatusBadge(state, text) {
    const badgeEl = document.getElementById('inv-save-badge');
    if (!badgeEl) return;
    if (state === 'saving') {
      badgeEl.className = 'save-status-badge saving';
      badgeEl.innerText = text || '⏳ 保存中...';
    } else if (state === 'error') {
      badgeEl.className = 'save-status-badge error';
      badgeEl.innerText = text || '⚠️ 保存失敗';
    } else {
      badgeEl.className = 'save-status-badge';
      badgeEl.innerText = text || '✓ 自動保存済';
    }
  }

  // サーバーへ1品目の更新を非同期オートセーブする関数（450msデバウンスで連打時の通信追い越しを防止）
  function autoSaveInventoryItem(facilityKey, itemKey, newVal, newDate) {
    if (!inventoryCache[facilityKey]) inventoryCache[facilityKey] = {};
    inventoryCache[facilityKey][itemKey] = { v: newVal, d: newDate };

    updateSaveStatusBadge('saving', '⏳ 保存中...');

    const timerKey = `${facilityKey}__${itemKey}`;
    if (saveDebounceTimers[timerKey]) {
      clearTimeout(saveDebounceTimers[timerKey]);
    }

    saveDebounceTimers[timerKey] = setTimeout(async () => {
      delete saveDebounceTimers[timerKey];

      const idToken = liff.getIDToken();
      if (!idToken) {
        triggerReauthWithState({ screen: 'staffInventory' });
        return;
      }

      const latestEntry = (inventoryCache[facilityKey] && inventoryCache[facilityKey][itemKey])
        ? inventoryCache[facilityKey][itemKey]
        : { v: newVal, d: newDate };

      inFlightSaveCount++;
      updateSaveStatusBadge('saving', '⏳ 保存中...');

      try {
        const response = await fetch(APP_CONFIG.GAS_URL, {
          method: 'POST',
          body: JSON.stringify({
            type: 'inv_update',
            idToken: idToken,
            facility: facilityKey,
            itemKey: itemKey,
            value: latestEntry.v,
            date: latestEntry.d
          })
        });
        const json = await response.json();
        inFlightSaveCount = Math.max(0, inFlightSaveCount - 1);

        if (json.status === 'success') {
          if (inFlightSaveCount === 0 && Object.keys(saveDebounceTimers).length === 0) {
            updateSaveStatusBadge('ok', '✓ 自動保存済');
          }
        } else if (json.code === 'TOKEN_EXPIRED' || json.code === 'AUTH_ERROR') {
          triggerReauthWithState({ screen: 'staffInventory' });
        } else {
          updateSaveStatusBadge('error', '⚠️ 保存失敗');
          alert('保存に失敗しました: ' + (json.message || ''));
        }
      } catch (e) {
        inFlightSaveCount = Math.max(0, inFlightSaveCount - 1);
        updateSaveStatusBadge('error', '⚠️ 通信エラー');
      }
    }, 450);
  }

  function renderStaffInventoryScreen() {
    // 全施設の要補充件数をカウント
    let totalShortageCount = 0;
    FACILITY_LIST.forEach(fac => {
      const facData = inventoryCache[fac] || {};
      INVENTORY_SECTIONS.forEach(sec => {
        getFacilityItemsForSection(sec, fac).forEach(item => {
          if (isItemShortage(item, facData[item.key])) totalShortageCount++;
        });
      });
    });

    const isSavingNow = inFlightSaveCount > 0 || Object.keys(saveDebounceTimers).length > 0;
    const badgeClass = isSavingNow ? 'save-status-badge saving' : 'save-status-badge';
    const badgeText = isSavingNow ? '⏳ 保存中...' : '✓ 自動保存ON';

    // 施設タブ＋共通備品タブ＋要補充タブをマスタから動的生成
    const facilityTabBtnsHtml = FACILITY_LIST.map(facName => {
      const activeCls = (currentInvTab === facName) ? 'active' : '';
      return `<button class="inv-tab-btn ${activeCls}" data-tab="${escapeHtml(facName)}">${escapeHtml(facName)}</button>`;
    }).join('');

    const commonTabBtnHtml = COMMON_EQUIPMENT_SECTIONS.length > 0
      ? `<button class="inv-tab-btn ${currentInvTab === 'COMMON' ? 'active' : ''}" data-tab="COMMON">施設共通</button>`
      : '';

    const tabsHtml = `
      <div class="inv-tabs">
        ${facilityTabBtnsHtml}
        ${commonTabBtnHtml}
        <button class="inv-tab-btn shortage-tab ${currentInvTab === 'SHORTAGE' ? 'active' : ''}" data-tab="SHORTAGE">
          🛒要補充(${totalShortageCount})
        </button>
      </div>
    `;

    let bodyHtml = '';
    if (currentInvTab === 'SHORTAGE') {
      bodyHtml = renderShortageSummaryHtml();
    } else if (currentInvTab === 'COMMON') {
      bodyHtml = renderCommonEquipmentHtml();
    } else {
      bodyHtml = renderFacilityInventoryHtml(currentInvTab);
    }

    appContent.innerHTML = `
      <div class="staff-header-bar">
        <h3 class="staff-title">🔧 貸別荘 備品在庫管理</h3>
        <span id="inv-save-badge" class="${badgeClass}">${badgeText}</span>
      </div>
      ${tabsHtml}
      <div id="inv-main-body">${bodyHtml}</div>
      <div style="margin-top: 18px; display: flex; gap: 8px;">
        <button class="btn btn-secondary" id="btn-inv-reload" style="margin-bottom:0; padding:12px;">🔄 最新再取得</button>
        <button class="btn btn-secondary" id="btn-inv-back" style="margin-bottom:0; padding:12px;">ゲスト画面へ戻る</button>
      </div>
    `;

    // タブ切替イベント
    document.querySelectorAll('.inv-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        currentInvTab = e.currentTarget.getAttribute('data-tab');
        renderStaffInventoryScreen();
      });
    });

    // アコーディオン開閉イベント
    document.querySelectorAll('.inv-sec-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const secId = e.currentTarget.getAttribute('data-sec-id');
        if (!secId) return;
        const mapKey = `${currentInvTab}_${secId}`;
        openSectionsMap[mapKey] = !openSectionsMap[mapKey];
        renderStaffInventoryScreen();
      });
    });

    // タイル型ラジオボタン（多/中/少/極小、および共通備品の所在施設）クリックイベント
    document.querySelectorAll('.inv-seg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const key = e.currentTarget.getAttribute('data-key');
        const val = e.currentTarget.getAttribute('data-val');
        const today = getTodayDateString();
        autoSaveInventoryItem(fac, key, val, today);
        renderStaffInventoryScreen();
      });
    });

    // 実数ステッパー（－ / ＋）クリックイベント
    document.querySelectorAll('.inv-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const key = e.currentTarget.getAttribute('data-key');
        const delta = parseInt(e.currentTarget.getAttribute('data-delta'), 10);
        const curEntry = (inventoryCache[fac] && inventoryCache[fac][key]) ? inventoryCache[fac][key] : { v: 0 };
        const curNum = parseInt(curEntry.v, 10) || 0;
        const nextNum = Math.max(0, Math.min(9999, curNum + delta));
        const today = getTodayDateString();
        autoSaveInventoryItem(fac, key, nextNum, today);
        renderStaffInventoryScreen();
      });
    });

    // 実数直接入力イベント
    document.querySelectorAll('.inv-num-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const key = e.currentTarget.getAttribute('data-key');
        const nextNum = Math.max(0, Math.min(9999, parseInt(e.currentTarget.value, 10) || 0));
        const today = getTodayDateString();
        autoSaveInventoryItem(fac, key, nextNum, today);
        renderStaffInventoryScreen();
      });
    });

    // 「本日」ボタン（値は変えずに確認日だけを今日に更新）
    document.querySelectorAll('.inv-today-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const key = e.currentTarget.getAttribute('data-key');
        const curEntry = (inventoryCache[fac] && inventoryCache[fac][key]) ? inventoryCache[fac][key] : { v: '' };
        const today = getTodayDateString();
        autoSaveInventoryItem(fac, key, curEntry.v, today);
        renderStaffInventoryScreen();
      });
    });

    // 日付の手入力カレンダー変更イベント
    document.querySelectorAll('.inv-date-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const fac = e.currentTarget.getAttribute('data-fac');
        const key = e.currentTarget.getAttribute('data-key');
        const newDate = e.currentTarget.value;
        if (!newDate) return;
        const curEntry = (inventoryCache[fac] && inventoryCache[fac][key]) ? inventoryCache[fac][key] : { v: '' };
        autoSaveInventoryItem(fac, key, curEntry.v, newDate);
        renderStaffInventoryScreen();
      });
    });

    document.getElementById('btn-inv-reload').addEventListener('click', openStaffInventoryApp);
    document.getElementById('btn-inv-back').addEventListener('click', renderTopMenu);
  }

  // 各施設のサブセクション別HTML生成
  function renderFacilityInventoryHtml(facilityName) {
    const facData = inventoryCache[facilityName] || {};
    let html = '';

    INVENTORY_SECTIONS.forEach(sec => {
      const items = getFacilityItemsForSection(sec, facilityName);
      if (items.length === 0) return;

      let shortageCount = 0;
      items.forEach(item => {
        if (isItemShortage(item, facData[item.key])) shortageCount++;
      });

      const mapKey = `${facilityName}_${sec.id}`;
      const isOpen = Boolean(openSectionsMap[mapKey]);
      const arrow = isOpen ? '▼' : '▶';
      const badgeHtml = shortageCount > 0
        ? `<span class="badge-warn">⚠️ 要補充 ${shortageCount}</span>`
        : `<span class="badge-ok">${items.length}品目</span>`;

      let itemsHtml = '';
      if (isOpen) {
        items.forEach(item => {
          itemsHtml += renderSingleInventoryItemHtml(facilityName, item, facData[item.key]);
        });
      }

      html += `
        <div class="inv-section">
          <button type="button" class="inv-sec-header" data-sec-id="${sec.id}">
            <span>${arrow} ${escapeHtml(sec.title)}</span>
            <div class="inv-sec-badges">${badgeHtml}</div>
          </button>
          <div class="inv-sec-body ${isOpen ? '' : 'hidden'}">
            ${itemsHtml}
          </div>
        </div>
      `;
    });

    return html;
  }

  // 個別備品1行分のHTML生成（4段階・2段階・実数 ＋ 最終確認日＆本日ボタン）
  function renderSingleInventoryItemHtml(facilityName, item, entry) {
    const curVal = (entry && entry.v !== undefined) ? entry.v : '';
    const curDate = (entry && entry.d) ? entry.d : '';
    const unitLabel = item.unit ? `<span class="inv-item-unit">（単位：${escapeHtml(item.unit)}）</span>` : '';

    let controlHtml = '';
    if (item.type === '4level') {
      const opts = [
        { label: '多', cls: 'sel-good' },
        { label: '中', cls: 'sel-mid' },
        { label: '少', cls: 'sel-low' },
        { label: '極小', cls: 'sel-crit' }
      ];
      controlHtml = `<div class="inv-seg-group">` + opts.map(o => {
        const activeCls = (curVal === o.label) ? o.cls : '';
        return `<button type="button" class="inv-seg-btn ${activeCls}" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" data-val="${o.label}">${o.label}</button>`;
      }).join('') + `</div>`;
    } else if (item.type === '2level') {
      const opts = [
        { label: '多', cls: 'sel-good' },
        { label: '少', cls: 'sel-low' }
      ];
      controlHtml = `<div class="inv-seg-group">` + opts.map(o => {
        const activeCls = (curVal === o.label) ? o.cls : '';
        return `<button type="button" class="inv-seg-btn ${activeCls}" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" data-val="${o.label}">${o.label}</button>`;
      }).join('') + `</div>`;
    } else if (item.type === 'number') {
      const numVal = (curVal !== '' && !isNaN(parseInt(curVal, 10))) ? parseInt(curVal, 10) : 0;
      controlHtml = `
        <div class="inv-num-group">
          <button type="button" class="inv-step-btn" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" data-delta="-1">－</button>
          <input type="number" class="inv-num-input" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" value="${numVal}" min="0" max="9999">
          <button type="button" class="inv-step-btn" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" data-delta="1">＋</button>
          <span style="font-size:12px; color:#555;">${escapeHtml(item.unit || '')}</span>
        </div>
      `;
    }

    return `
      <div class="inv-item">
        <div class="inv-item-top">
          <span class="inv-item-name">${escapeHtml(item.name)}${unitLabel}</span>
        </div>
        ${controlHtml}
        <div class="inv-date-row">
          <span>最終確認:</span>
          <input type="date" class="inv-date-input" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}" value="${escapeHtml(curDate)}">
          <button type="button" class="inv-today-btn" data-fac="${escapeHtml(facilityName)}" data-key="${item.key}">本日</button>
        </div>
      </div>
    `;
  }

  // 施設共通備品のHTML生成
  function renderCommonEquipmentHtml() {
    const commonData = inventoryCache['COMMON'] || {};
    let html = '';

    COMMON_EQUIPMENT_SECTIONS.forEach(sec => {
      let itemsHtml = '';
      sec.items.forEach(item => {
        const entry = commonData[item.key] || {};
        const curFac = entry.v || '';
        const curDate = entry.d || '';

        const locBtns = FACILITY_LIST.map(facName => {
          const activeCls = (curFac === facName) ? 'sel-loc' : '';
          return `<button type="button" class="inv-seg-btn ${activeCls}" data-fac="COMMON" data-key="${item.key}" data-val="${escapeHtml(facName)}" style="font-size:11px;">${escapeHtml(facName)}</button>`;
        }).join('');

        itemsHtml += `
          <div class="inv-item">
            <div class="inv-item-top">
              <span class="inv-item-name">${escapeHtml(item.name)}</span>
            </div>
            <div class="inv-seg-group">${locBtns}</div>
            <div class="inv-date-row">
              <span>最終確認:</span>
              <input type="date" class="inv-date-input" data-fac="COMMON" data-key="${item.key}" value="${escapeHtml(curDate)}">
              <button type="button" class="inv-today-btn" data-fac="COMMON" data-key="${item.key}">本日</button>
            </div>
          </div>
        `;
      });

      html += `
        <div class="inv-section">
          <div class="inv-sec-header" style="cursor:default;">
            <span>${escapeHtml(sec.title)}</span>
          </div>
          <div class="inv-sec-body">
            ${itemsHtml}
          </div>
        </div>
      `;
    });

    return html;
  }

  // 🛒 要補充まとめ（全施設横断リスト・その場で更新も可能）
  function renderShortageSummaryHtml() {
    let html = '';
    let anyShortage = false;

    FACILITY_LIST.forEach(fac => {
      const facData = inventoryCache[fac] || {};
      const shortageItems = [];

      INVENTORY_SECTIONS.forEach(sec => {
        getFacilityItemsForSection(sec, fac).forEach(item => {
          if (isItemShortage(item, facData[item.key])) {
            shortageItems.push(item);
          }
        });
      });

      if (shortageItems.length > 0) {
        anyShortage = true;
        html += `<div class="shortage-fac-title">🏠 ${escapeHtml(fac)} （要補充: ${shortageItems.length}件）</div>`;
        shortageItems.forEach(item => {
          html += `<div class="shortage-card">${renderSingleInventoryItemHtml(fac, item, facData[item.key])}</div>`;
        });
      }
    });

    if (!anyShortage) {
      html = `
        <div style="text-align:center; padding:25px 10px; color:#2e7d32; background:#f1f8e9; border-radius:8px; font-size:14px;">
          ✅ 現在「少」「極小」（または残り1以下）になっている要補充品目はありません。
        </div>
      `;
    }

    return html;
  }

  // ==========================================
  // 【階層②】宿泊ゲスト向け分岐メニュー
  // ==========================================
  function renderGuestTopMenu() {
    trackStep('VIEW_GUEST_TOP', 0);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('guestTopMenuPrompt')}</h2>
      <button class="btn btn-primary" id="btn-during-stay">${t('duringStay')}</button>
      <button class="btn btn-primary" id="btn-route-access">${t('routeAccess')}</button>
      <button class="btn btn-primary" id="btn-virtual-tour-guest">${t('virtualTour')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestTopMenu);

    document.getElementById('btn-during-stay').addEventListener('click', renderGuestNameForm);
    document.getElementById('btn-route-access').addEventListener('click', renderRouteAccessMenu);
    document.getElementById('btn-virtual-tour-guest').addEventListener('click', () => renderVirtualTourMenu('guest'));
    document.getElementById('btn-back').addEventListener('click', renderTopMenu);
  }

  // ==========================================
  // 【階層③】施設までの道案内メニュー
  // ==========================================
  function renderRouteAccessMenu() {
    trackStep('VIEW_ROUTE_MENU', 0);

    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('routeAccess')}</h2>
      <p style="font-size: 13px; color: #ff4d4f; text-align: center; margin-bottom: 15px; font-weight: bold;">${t('locationWarning')}</p>
    `;

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      const prefix = t('accessPrefix');
      const suffix = t('accessSuffix');
      const btnText = `${prefix}${escapeHtml(facility.name)}${suffix}`;
      html += `<button class="btn btn-primary btn-map" data-id="${escapeHtml(facility.id)}">${btnText}</button>`;
    });

    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;

    appContent.innerHTML = html;
    bindLangSelectorEvents(renderRouteAccessMenu);

    document.querySelectorAll('.btn-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.currentTarget.getAttribute('data-id');
        const mapUrl = APP_CONFIG.mapUrls[facilityId];
        const facCanonical = getFacilityNameById(facilityId);
        trackStep('GOAL_MAP', 1, facCanonical);

        if (mapUrl) {
          if (liff.isInClient()) {
            liff.openWindow({ url: mapUrl, external: true });
          } else {
            window.open(mapUrl, '_blank');
          }
        }
      });
    });

    document.getElementById('btn-back').addEventListener('click', renderGuestTopMenu);
  }

  // ==========================================
  // バーチャルツアー施設選択メニュー
  // ==========================================
  function renderVirtualTourMenu(source) {
    trackStep('VIEW_VT_MENU', 0);

    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('virtualTour')}</h2>
    `;

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-vt" data-id="${escapeHtml(facility.id)}">${escapeHtml(facility.name)}</button>`;
    });

    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;

    appContent.innerHTML = html;
    bindLangSelectorEvents(renderVirtualTourMenu, source);

    document.querySelectorAll('.btn-vt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.currentTarget.getAttribute('data-id');
        const vtUrl = APP_CONFIG.virtualTourUrls[facilityId];
        const facCanonical = getFacilityNameById(facilityId);
        trackStep('GOAL_VIRTUAL_TOUR', 1, facCanonical);

        if (vtUrl) {
          if (liff.isInClient()) {
            liff.openWindow({ url: vtUrl, external: true });
          } else {
            window.open(vtUrl, '_blank');
          }
        }
      });
    });

    document.getElementById('btn-back').addEventListener('click', () => {
      if (source === 'guest') {
        renderGuestTopMenu();
      } else {
        renderNonGuestMenu();
      }
    });
  }

  // ==========================================
  // 【階層③〜】宿泊ゲスト向けフロー（多言語敬称・設定マスタ参照統一済）
  // ==========================================
  function renderGuestNameForm() {
    trackStep('VIEW_NAME_INPUT', 0);

    const savedName = localStorage.getItem('guest_name') || '';

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('namePrompt')}</h2>
      <input type="text" id="guest-name-input" class="input-field" placeholder="${escapeHtml(t('namePlaceholder'))}" value="${escapeHtml(savedName)}" maxlength="50" required>
      <button class="btn btn-primary" id="btn-next">${t('next')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestNameForm);

    document.getElementById('btn-next').addEventListener('click', () => {
      const name = document.getElementById('guest-name-input').value.trim();
      if (!name) return alert(t('nameAlert'));

      localStorage.setItem('guest_name', name);
      renderGuestFacilitySelect(name);
    });

    document.getElementById('btn-back').addEventListener('click', renderGuestTopMenu);
  }

  function renderGuestFacilitySelect(guestName) {
    trackStep('VIEW_FACILITY_SELECT', 0);

    const guestDisplayName = formatGuestDisplayName(guestName);
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${escapeHtml(guestDisplayName)}<br>${t('selectFacility')}</h2>
    `;

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-facility" data-name="${escapeHtml(facility.name)}">${escapeHtml(facility.name)}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;

    appContent.innerHTML = html;
    bindLangSelectorEvents(renderGuestFacilitySelect, guestName);

    document.querySelectorAll('.btn-facility').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityName = e.currentTarget.getAttribute('data-name');
        renderGuestActionMenu(guestName, facilityName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', renderGuestNameForm);
  }

  function renderGuestActionMenu(guestName, facilityName) {
    trackStep('VIEW_GUEST_ACTION', 0, facilityName);

    const locFacName = getLocalizedFacilityName(facilityName);
    const guestDisplayName = formatGuestDisplayName(guestName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${escapeHtml(locFacName)}】<br>${escapeHtml(guestDisplayName)}<br>----<br>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-checkinout">${t('checkinout')}</button>
      <button class="btn btn-primary" id="btn-survey">${t('survey')}</button>
      <button class="btn btn-primary" id="btn-contact">${t('contact')}</button>
      <button class="btn btn-danger" id="btn-close">${t('closeApp')}</button>
    `;
    bindLangSelectorEvents(renderGuestActionMenu, guestName, facilityName);

    document.getElementById('btn-checkinout').addEventListener('click', () => renderCheckInOutAction(guestName, facilityName));
    document.getElementById('btn-survey').addEventListener('click', () => {
      trackStep('GOAL_SURVEY', 1, facilityName);
      window.location.href = APP_CONFIG.surveyUrls[currentLang] || APP_CONFIG.surveyUrls['ja'];
    });
    document.getElementById('btn-contact').addEventListener('click', () => renderGuestContactCategory(guestName, facilityName));
    document.getElementById('btn-close').addEventListener('click', closeApp);
  }

  function renderCheckInOutAction(guestName, facilityName) {
    trackStep('VIEW_CHECKINOUT_SELECT', 0, facilityName);

    const locFacName = getLocalizedFacilityName(facilityName);
    const guestDisplayName = formatGuestDisplayName(guestName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${escapeHtml(locFacName)}】<br>${escapeHtml(guestDisplayName)}<br>${t('selectAction')}</h2>
      <button class="btn btn-primary" id="btn-in">${t('checkInBtn')}</button>
      <button class="btn btn-primary" id="btn-out">${t('checkOutBtn')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderCheckInOutAction, guestName, facilityName);

    const submitAction = async (actionText, actionLogText) => {
      const confirmMsg = `【${locFacName}】\n${guestDisplayName}\n\n「${actionText}」\n\n${t('confirmSend')}`;
      if (!confirm(confirmMsg)) return;

      loading.innerText = t('loading');
      loading.classList.remove('hidden');

      const res = await sendToGAS("guest", facilityName, guestName, actionLogText, currentLang, {
        screen: 'checkInOut',
        guestName,
        facilityName
      });

      loading.classList.add('hidden');
      if (!res || res.reauthing) return;

      if (res.ok) {
        if (actionLogText === '到着・チェックイン(Checked-In)') {
          trackStep('GOAL_CHECKIN', 1, facilityName);
          if (isManualGuideFacility(facilityName)) {
            let msgWelcome = t('ci_msg_welcome');
            // 日本語辞書には「{name}様」と既に様が入っているため二重敬称を防止し、他言語では敬称付き名を差し込む
            const welcomeName = (currentLang === 'ja') ? guestName : guestDisplayName;
            msgWelcome = msgWelcome.replace('{facility}', () => locFacName).replace('{name}', () => welcomeName);
            const msgSupport = t('ci_msg_support');
            alert(`${msgWelcome}\n\n${msgSupport}`);
          } else {
            alert(`${t('ci_msg_staff_contact')}\n\n${t('ci_msg_wifi')}\n\n${t('ci_msg_contact_method')}`);
          }
        } else {
          trackStep('GOAL_CHECKOUT', 1, facilityName);
          // チェックアウト完了時もWebアプリ版と同じ多言語メッセージを出力
          alert(t('co_msg_success'));
        }
        renderGuestActionMenu(guestName, facilityName);
      } else if (res.code === 'MAINTENANCE') {
        renderMaintenanceScreen();
      } else {
        alert(t('sendFail') + (res.message || "(Error)"));
      }
    };

    document.getElementById('btn-in').addEventListener('click', () => submitAction(t('checkInBtn'), '到着・チェックイン(Checked-In)'));
    document.getElementById('btn-out').addEventListener('click', () => submitAction(t('checkOutBtn'), '出発・チェックアウト(Checked-Out)'));
    document.getElementById('btn-back').addEventListener('click', () => renderGuestActionMenu(guestName, facilityName));
  }

  function renderGuestContactCategory(guestName, facilityName) {
    trackStep('VIEW_CONTACT_CAT', 0, facilityName);

    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectContactCat')}</h2>
    `;
    APP_CONFIG.contactCategories.forEach(cat => {
      const catName = t('cat_' + cat.key);
      html += `<button class="btn btn-primary btn-cat" data-name="${escapeHtml(catName)}">${escapeHtml(catName)}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;

    appContent.innerHTML = html;
    bindLangSelectorEvents(renderGuestContactCategory, guestName, facilityName);

    document.querySelectorAll('.btn-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const categoryName = e.currentTarget.getAttribute('data-name');
        renderGuestContactForm(guestName, facilityName, categoryName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', () => renderGuestActionMenu(guestName, facilityName));
  }

  function renderGuestContactForm(guestName, facilityName, categoryName, restoredText = '') {
    trackStep('VIEW_CONTACT_FORM', 0, facilityName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${escapeHtml(categoryName)}</h2>
      <textarea id="inquiry-text" class="input-field" placeholder="${escapeHtml(t('inquiryPlaceholder'))}" maxlength="1000">${escapeHtml(restoredText)}</textarea>
      <button class="btn btn-primary" id="btn-send">${t('sendLine')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestContactForm, guestName, facilityName, categoryName);

    document.getElementById('btn-send').addEventListener('click', async () => {
      const text = document.getElementById('inquiry-text').value.trim();
      if (!text) return alert(t('inquiryAlert'));

      const locFacName = getLocalizedFacilityName(facilityName);
      const guestDisplayName = formatGuestDisplayName(guestName);
      const messageToChat = `【${categoryName}】\n施設：${locFacName}\nお名前：${guestName} 様\n\n${text}`;
      const confirmPreview = `【${categoryName}】\n${locFacName}\n${guestDisplayName}\n\n${text}`;
      const confirmMsg = `${t('confirmSend')}\n\n${confirmPreview}`;
      if (!confirm(confirmMsg)) return;

      try {
        if (liff.isInClient()) {
          await liff.sendMessages([{ type: "text", text: messageToChat }]);
          trackStep('GOAL_INQUIRY_GUEST', 1, facilityName);
          alert(t('inquirySuccess'));
        } else {
          loading.innerText = t('loading');
          loading.classList.remove('hidden');
          const res = await notifyToGAS(
            "pc_inquiry",
            { category: categoryName, facilityName: facilityName, guestName: guestName, message: text },
            { screen: 'guestContact', guestName, facilityName, categoryName, draftText: text }
          );
          loading.classList.add('hidden');
          if (!res || res.reauthing) return;

          if (res.ok) {
            trackStep('GOAL_INQUIRY_GUEST', 1, facilityName);
            alert(t('pcFallbackSuccess'));
          } else if (res.code === 'MAINTENANCE') {
            return renderMaintenanceScreen();
          } else {
            return alert(t('sendFail') + (res.message || "(Error)"));
          }
        }
        renderGuestActionMenu(guestName, facilityName);
      } catch (err) {
        alert(`${t('sendFail')}${err.message}`);
      }
    });

    document.getElementById('btn-back').addEventListener('click', () => renderGuestContactCategory(guestName, facilityName));
  }

  // ==========================================
  // 【階層②〜】予約・宿泊でないお客様向けフロー
  // ==========================================
  function renderNonGuestMenu() {
    trackStep('VIEW_NONGUEST_TOP', 0);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-book">${t('bookMenu')}</button>
      <button class="btn btn-primary" id="btn-virtual-tour-nonguest">${t('virtualTour')}</button>
      <button class="btn btn-primary" id="btn-inquiry">${t('inquiryMenu')}</button>
      <button class="btn btn-danger" id="btn-close">${t('closeApp')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderNonGuestMenu);

    document.getElementById('btn-book').addEventListener('click', renderBookingMenu);
    document.getElementById('btn-virtual-tour-nonguest').addEventListener('click', () => renderVirtualTourMenu('nonguest'));
    document.getElementById('btn-inquiry').addEventListener('click', () => renderNonGuestInquiryForm());
    document.getElementById('btn-close').addEventListener('click', closeApp);
    document.getElementById('btn-back').addEventListener('click', renderTopMenu);
  }

  function renderBookingMenu() {
    trackStep('VIEW_BOOK_MENU', 0);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('bookMenu')}</h2>
      <button class="btn btn-primary" id="btn-ret-guest">${t('bookReturning')}</button>
      <button class="btn btn-primary" id="btn-first-guest">${t('bookFirstTime')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderBookingMenu);

    document.getElementById('btn-ret-guest').addEventListener('click', () => renderReturningBookingForm());
    document.getElementById('btn-first-guest').addEventListener('click', async () => {
      loading.innerText = t('loading');
      loading.classList.remove('hidden');

      const res = await notifyToGAS(
        "push_notify",
        { category: "first_time_booking", lang: currentLang },
        { screen: 'firstTimeBooking' }
      );

      loading.classList.add('hidden');
      if (!res || res.reauthing) return;

      if (res.ok) {
        trackStep('GOAL_BOOK_HP', 1);
        window.location.href = APP_CONFIG.HP_BOOKING_URL;
      } else if (res.code === 'MAINTENANCE') {
        renderMaintenanceScreen();
      } else {
        alert(t('sendFail') + (res.message || "(Error)"));
      }
    });

    document.getElementById('btn-back').addEventListener('click', renderNonGuestMenu);
  }

  function renderReturningBookingForm(restoredData = null) {
    trackStep('VIEW_BOOK_RETURNING_FORM', 0);

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    let optionsHtml = '';
    currentFacilities.forEach(f => {
      const sel = (restoredData && restoredData.facility === f.name) ? 'selected' : '';
      optionsHtml += `<option value="${escapeHtml(f.name)}" ${sel}>${escapeHtml(f.name)}</option>`;
    });

    const valYear = restoredData ? escapeHtml(restoredData.year) : '';
    const valMonth = restoredData ? escapeHtml(restoredData.month) : '';
    const valName = restoredData ? escapeHtml(restoredData.pastName) : '';
    const valCoupon = restoredData ? escapeHtml(restoredData.coupon) : '';

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('lastStayDetail')}</h2>
      <input type="number" id="stay-year" class="input-field" placeholder="${escapeHtml(t('stayYear'))}" value="${valYear}">
      <input type="number" id="stay-month" class="input-field" placeholder="${escapeHtml(t('stayMonth'))}" value="${valMonth}">
      <select id="stay-facility" class="input-field">
        <option value="" disabled ${!restoredData ? 'selected' : ''}>${escapeHtml(t('selectFacility'))}</option>
        ${optionsHtml}
      </select>
      <input type="text" id="stay-name" class="input-field" placeholder="${escapeHtml(t('pastName'))}" value="${valName}" maxlength="50">
      <input type="text" id="coupon-code" class="input-field" placeholder="${escapeHtml(t('couponCode'))}" value="${valCoupon}" maxlength="50">
      <button class="btn btn-primary" id="btn-proceed">${t('proceedHp')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderReturningBookingForm, restoredData);

    document.getElementById('btn-proceed').addEventListener('click', async () => {
      const year = document.getElementById('stay-year').value.trim();
      const month = document.getElementById('stay-month').value.trim();
      const facility = document.getElementById('stay-facility').value;
      const pastName = document.getElementById('stay-name').value.trim();
      const coupon = document.getElementById('coupon-code').value.trim();

      if (!year || !month || !facility || !pastName) {
        return alert(t('validationAlert'));
      }

      loading.innerText = t('loading');
      loading.classList.remove('hidden');

      const payloadData = { category: "returning_booking", year, month, facility, pastName, coupon, lang: currentLang };
      const res = await notifyToGAS("push_notify", payloadData, {
        screen: 'returningBooking',
        draftData: { year, month, facility, pastName, coupon }
      });

      loading.classList.add('hidden');
      if (!res || res.reauthing) return;

      if (res.ok) {
        trackStep('GOAL_BOOK_HP', 1, facility);
        window.location.href = APP_CONFIG.HP_BOOKING_URL;
      } else if (res.code === 'MAINTENANCE') {
        renderMaintenanceScreen();
      } else {
        alert(t('sendFail') + (res.message || "(Error)"));
      }
    });

    document.getElementById('btn-back').addEventListener('click', renderBookingMenu);
  }

  function renderNonGuestInquiryForm(restoredName = '', restoredText = '') {
    trackStep('VIEW_NONGUEST_INQUIRY_FORM', 0);

    const categoryName = t('nonGuestInquiryName');
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${escapeHtml(categoryName)}</h2>
      <input type="text" id="inquiry-name" class="input-field" placeholder="${escapeHtml(t('yourName'))}" value="${escapeHtml(restoredName)}" maxlength="50" required>
      <textarea id="inquiry-text" class="input-field" placeholder="${escapeHtml(t('inquiryPlaceholder'))}" maxlength="1000">${escapeHtml(restoredText)}</textarea>
      <button class="btn btn-primary" id="btn-send">${t('sendLine')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderNonGuestInquiryForm, restoredName, restoredText);

    document.getElementById('btn-send').addEventListener('click', async () => {
      const name = document.getElementById('inquiry-name').value.trim();
      const text = document.getElementById('inquiry-text').value.trim();
      if (!name || !text) return alert(t('inquiryAlert'));

      const guestDisplayName = formatGuestDisplayName(name);
      const messageToChat = `【${categoryName}】\nお名前：${name} 様\n\n${text}`;
      const confirmPreview = `【${categoryName}】\n${guestDisplayName}\n\n${text}`;
      const confirmMsg = `${t('confirmSend')}\n\n${confirmPreview}`;
      if (!confirm(confirmMsg)) return;

      try {
        if (liff.isInClient()) {
          await liff.sendMessages([{ type: "text", text: messageToChat }]);
          trackStep('GOAL_INQUIRY_NONGUEST', 1);
          alert(t('inquirySuccess'));
        } else {
          loading.innerText = t('loading');
          loading.classList.remove('hidden');
          const res = await notifyToGAS(
            "pc_inquiry",
            { category: categoryName, facilityName: "一般", guestName: name, message: text },
            { screen: 'nonGuestInquiry', draftName: name, draftText: text }
          );
          loading.classList.add('hidden');
          if (!res || res.reauthing) return;

          if (res.ok) {
            trackStep('GOAL_INQUIRY_NONGUEST', 1);
            alert(t('pcFallbackSuccess'));
          } else if (res.code === 'MAINTENANCE') {
            return renderMaintenanceScreen();
          } else {
            return alert(t('sendFail') + (res.message || "(Error)"));
          }
        }
        renderNonGuestMenu();
      } catch (err) {
        alert(`${t('sendFail')}${err.message}`);
      }
    });

    document.getElementById('btn-back').addEventListener('click', renderNonGuestMenu);
  }

  // ==========================================
  // 【共通】GAS通信用ユーティリティ（期限切れ自動復元対応）
  // ==========================================
  async function postPayloadToGAS(payload, stateForReauth) {
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return { ok: false, code: "ERROR" };

      let json = {};
      try { json = JSON.parse(text); } catch (e) {}

      if (json.status === "success") {
        return { ok: true };
      }

      if (json.code === "TOKEN_EXPIRED" || json.code === "AUTH_ERROR") {
        triggerReauthWithState(stateForReauth);
        return { ok: false, reauthing: true };
      }

      if (json.code === "RATE_LIMIT") {
        return { ok: false, code: "RATE_LIMIT", message: "短時間に送信が集中しています。数分後にお試しください。" };
      }

      return { ok: false, code: json.code || "ERROR", message: json.message || "" };
    } catch (e) {
      console.error("GAS communication error", e);
      return { ok: false, code: "NETWORK_ERROR" };
    }
  }

  async function sendToGAS(type, facilityName, guestName, action, lang, stateForReauth) {
    const idToken = liff.getIDToken();
    if (!idToken) {
      triggerReauthWithState(stateForReauth);
      return { ok: false, reauthing: true };
    }
    const payload = { idToken, type, facilityName, guestName, action, detail: lang };
    return await postPayloadToGAS(payload, stateForReauth);
  }

  async function notifyToGAS(type, dataObj, stateForReauth) {
    const idToken = liff.getIDToken();
    if (!idToken) {
      triggerReauthWithState(stateForReauth);
      return { ok: false, reauthing: true };
    }
    const payload = { idToken, type: type, data: dataObj };
    return await postPayloadToGAS(payload, stateForReauth);
  }
});