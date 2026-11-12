// main.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  let currentLang = localStorage.getItem('app_lang') || 'ja';

  // ★ スタッフ認証状態と備品データキャッシュ
  let isStaffUser = false;
  let currentMyUserId = '';
  let inventoryCache = {};
  let currentInvTab = 'LUONTO'; // 'SHORTAGE' | 'LUONTO' | 'kukka' | 'sch-sch' | 'ホッポッタ' | 'COMMON'
  let openSectionsMap = {}; // アコーディオン開閉状態の保持用

  // ★ 連打時の通信追い越し防止用（品目別デバウンスタイマー＆通信中カウンタ）
  const saveDebounceTimers = {};
  let inFlightSaveCount = 0;

  // ==========================================
  // ★ 備品マスタ定義（全50品目・場所優先6カテゴリ ＋ 施設共通2種7個体）
  // ==========================================
  const INVENTORY_SECTIONS = [
    {
      id: 'sec_linen_towel',
      title: '① 寝具・タオル・サウナ類',
      items: [
        { key: 'single_sheet_kake', name: 'シングルシーツ(掛け)', type: '4level', facilities: 'ALL' },
        { key: 'single_sheet_shiki', name: 'シングルシーツ(敷)', type: '4level', facilities: 'ALL' },
        { key: 'double_sheet_kake', name: 'ダブルシーツ(掛け)', type: '4level', facilities: ['LUONTO', 'ホッポッタ'] },
        { key: 'double_sheet_shiki', name: 'ダブルシーツ(敷)', type: '4level', facilities: ['LUONTO', 'ホッポッタ'] },
        { key: 'pillow_cover', name: '枕カバー', type: '4level', facilities: 'ALL' },
        { key: 'bath_towel', name: 'バスタオル', type: '4level', facilities: 'ALL' },
        { key: 'body_towel', name: 'ボディタオル', type: '4level', facilities: 'ALL' },
        { key: 'bath_mat', name: '足ふきマット', type: '4level', facilities: 'ALL' },
        { key: 'sauna_towel', name: 'サウナ用タオル', type: '4level', facilities: 'ALL' },
        { key: 'sauna_mat', name: 'サウナ用マット', type: '4level', facilities: 'ALL' },
        { key: 'sauna_pants', name: 'サウナ用パンツ', type: '4level', facilities: ['LUONTO', 'kukka'] }
      ]
    },
    {
      id: 'sec_wash_bath',
      title: '② 洗面所・バス・ランドリー',
      items: [
        { key: 'toothbrush', name: '歯ブラシ', type: '4level', facilities: 'ALL' },
        { key: 'body_sponge', name: 'ボディスポンジ', type: '4level', facilities: 'ALL' },
        { key: 'hair_brush', name: 'ヘアブラシ', type: '4level', facilities: ['LUONTO', 'kukka'] },
        { key: 'wash_handsoap', name: '洗面所用ハンドソープ', type: '2level', facilities: 'ALL' },
        { key: 'paper_towel_hard', name: '手拭き用ペーパータオル(硬)', type: '4level', facilities: ['LUONTO', 'kukka', 'sch-sch'] },
        { key: 'shampoo', name: 'シャンプー', type: '2level', facilities: 'ALL' },
        { key: 'conditioner', name: 'コンディショナー', type: '2level', facilities: 'ALL' },
        { key: 'body_soap', name: 'ボディソープ', type: '2level', facilities: 'ALL' },
        { key: 'cleansing', name: 'クレンジング', type: '2level', facilities: 'ALL' },
        { key: 'bath_detergent', name: '風呂用洗剤', type: '2level', facilities: 'ALL' },
        { key: 'laundry_detergent', name: '洗濯用洗剤', type: '2level', facilities: 'ALL' }
      ]
    },
    {
      id: 'sec_kitchen_cafe',
      title: '③ キッチン・カフェ・調味料',
      items: [
        { key: 'kitchen_hand_towel', name: 'キッチン用お手拭きタオル', type: '2level', facilities: 'ALL' },
        { key: 'kitchen_dish_cloth', name: 'キッチン用食器拭き', type: '2level', facilities: 'ALL' },
        { key: 'dish_dry_mat', name: '食器乾燥エリア用マット', type: '2level', facilities: 'ALL' },
        { key: 'dish_detergent', name: '食器洗い洗剤', type: '2level', facilities: 'ALL' },
        { key: 'kitchen_handsoap', name: 'キッチン用ハンドソープ', type: '2level', facilities: 'ALL' },
        { key: 'dish_sponge', name: '食器洗い用スポンジ', type: '4level', facilities: 'ALL' },
        { key: 'kitchen_net', name: 'キッチンネット', type: '4level', facilities: 'ALL' },
        { key: 'nonwoven_towel', name: '不織布タオル', type: '4level', facilities: 'ALL' },
        { key: 'kitchen_paper', name: 'キッチンペーパー', type: '4level', facilities: 'ALL' },
        { key: 'saran_wrap', name: 'サランラップ', type: '4level', facilities: 'ALL' },
        { key: 'aluminum_foil', name: 'アルミホイル', type: '2level', facilities: 'ALL' },
        { key: 'salt', name: '塩', type: '2level', facilities: 'ALL' },
        { key: 'pepper', name: '胡椒', type: '2level', facilities: 'ALL' },
        { key: 'coffee_beans', name: 'コーヒー豆', type: '2level', facilities: 'ALL' },
        { key: 'black_tea', name: '紅茶', type: '2level', facilities: 'ALL' }
      ]
    },
    {
      id: 'sec_toilet_room',
      title: '④ トイレ・室内・清掃用品',
      items: [
        { key: 'toilet_paper', name: 'トイレットペーパー', type: 'number', unit: '残りロール数', facilities: 'ALL' },
        { key: 'toilet_towel', name: 'トイレ用タオル', type: '2level', facilities: ['kukka', 'sch-sch'] },
        { key: 'toilet_floormat', name: 'トイレ用フロアマット', type: '2level', facilities: 'ALL' },
        { key: 'toilet_wiper', name: 'トイレ用掃除シート', type: 'number', unit: '残りパック数', facilities: 'ALL' },
        { key: 'toilet_detergent', name: '便器用洗剤(装着型ブラシ)', type: '2level', facilities: 'ALL' },
        { key: 'vinyl_gloves', name: 'ビニール手袋', type: '2level', facilities: 'ALL' },
        { key: 'tissue', name: 'ティッシュ', type: '4level', facilities: 'ALL' },
        { key: 'slippers', name: 'スリッパ', type: '2level', facilities: 'ALL' }
      ]
    },
    {
      id: 'sec_bags',
      title: '⑤ 袋類（ゴミ袋・ランドリー袋）',
      items: [
        { key: 'garbage_burn_xl', name: '指定ゴミ袋可燃特大', type: '4level', facilities: 'ALL' },
        { key: 'garbage_burn_l', name: '指定ゴミ袋可燃大', type: '4level', facilities: 'ALL' },
        { key: 'garbage_burn_s', name: '指定ゴミ袋可燃小', type: '4level', facilities: 'ALL' },
        { key: 'garbage_nonburn_l', name: '指定ゴミ袋ビンカン不燃大', type: '4level', facilities: 'ALL' },
        { key: 'garbage_nonburn_s', name: '指定ゴミ袋ビンカン不燃小', type: '4level', facilities: 'ALL' },
        { key: 'laundry_bag', name: 'クリーニング用45Lゴミ袋', type: '4level', facilities: 'ALL' },
        { key: 'washroom_bag_30l', name: '洗面所用ゴミ袋30L', type: '2level', facilities: 'ALL' }
      ]
    },
    {
      id: 'sec_bbq',
      title: '⑥ BBQ用品',
      items: [
        { key: 'bbq_igniter', name: 'BBQ着火剤', type: '2level', facilities: 'ALL' },
        { key: 'bbq_lighter', name: 'BBQ用チャッカマン', type: '2level', facilities: ['LUONTO', 'kukka', 'sch-sch'] },
        { key: 'bbq_charcoal', name: 'BBQ炭', type: 'number', unit: '箱数', facilities: ['LUONTO', 'kukka', 'sch-sch'] },
        { key: 'bbq_plate_l', name: 'BBQ紙皿大', type: '2level', facilities: 'ALL' },
        { key: 'bbq_plate_s', name: 'BBQ紙皿小', type: '2level', facilities: 'ALL' },
        { key: 'bbq_chopsticks', name: 'BBQ割りばし', type: '2level', facilities: 'ALL' },
        { key: 'bbq_mosquito', name: 'BBQ蚊取り線香', type: '2level', facilities: 'ALL' }
      ]
    }
  ];

  const COMMON_EQUIPMENT_SECTIONS = [
    {
      id: 'common_baby_chair',
      title: '🪑 ベビーチェア（計5台・所在施設）',
      items: [
        { key: 'chair_swing', name: '① スイング式' },
        { key: 'chair_disney1', name: '② ディズニー(1)' },
        { key: 'chair_disney2', name: '③ ディズニー(2)' },
        { key: 'chair_ikea1', name: '④ IKEA(1)' },
        { key: 'chair_ikea2', name: '⑤ IKEA(2)' }
      ]
    },
    {
      id: 'common_baby_bed',
      title: '🛏️ ベビーベッド（計2台・所在施設）',
      items: [
        { key: 'bed_easy', name: '① 茶' },
        { key: 'bed_hard', name: '② 白' }
      ]
    }
  ];

  const FACILITY_LIST = ['LUONTO', 'kukka', 'sch-sch', 'ホッポッタ'];

  function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

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

  function getLocalizedFacilityName(name) {
    let facId = null;
    for (const lang in APP_CONFIG.facilities) {
      const fac = APP_CONFIG.facilities[lang].find(f => f.name === name);
      if (fac) {
        facId = fac.id;
        break;
      }
    }
    if (facId) {
      const localizedFac = (APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja']).find(f => f.id === facId);
      if (localizedFac) return localizedFac.name;
    }
    return name;
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
    liff.closeWindow();
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
      if (st.screen === 'checkInOut') {
        renderCheckInOutAction(st.guestName, st.facilityName);
        return true;
      } else if (st.screen === 'guestContact') {
        renderGuestContactForm(st.guestName, st.facilityName, st.categoryName, st.draftText);
        return true;
      } else if (st.screen === 'returningBooking') {
        renderReturningBookingForm(st.draftData);
        return true;
      } else if (st.screen === 'firstTimeBooking') {
        renderBookingMenu();
        return true;
      } else if (st.screen === 'nonGuestInquiry') {
        renderNonGuestInquiryForm(st.draftName, st.draftText);
        return true;
      } else if (st.screen === 'staffInventory' && isStaffUser) {
        openStaffInventoryApp();
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
    currentMyUserId = result.myUserId || '';

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
  // メンテナンス専用画面
  // ==========================================
  function renderMaintenanceScreen() {
    appContent.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>🚧 ${t('maintTitle')} 🚧</h2>
        <p style="font-size: 15px; line-height: 1.6; margin-top: 20px;">${t('maintMsg')}</p>
        <button class="btn btn-danger" id="btn-close" style="margin-top: 30px;">${t('closeApp')}</button>
      </div>
    `;
    document.getElementById('btn-close').addEventListener('click', closeApp);
  }

  // ==========================================
  // 【階層①】TOPメニュー（スタッフのみ備品管理入口を表示）
  // ==========================================
  function renderTopMenu() {
    const staffBtnHtml = isStaffUser
      ? `<button class="btn btn-staff-entry" id="btn-staff-inv">🔧 スタッフ用メニュー (備品在庫管理)</button>`
      : '';

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2 id="top-menu-heading" style="user-select: none;">${t('selectMenu')}</h2>
      <button class="btn btn-primary" id="btn-guest">${t('guest')}<br><small>${t('guestSub')}</small></button>
      <button class="btn btn-secondary" id="btn-nonguest">${t('nonGuest')}<br><small>${t('nonGuestSub')}</small></button>
      ${staffBtnHtml}
    `;
    bindLangSelectorEvents(renderTopMenu);

    document.getElementById('btn-guest').addEventListener('click', renderGuestTopMenu);
    document.getElementById('btn-nonguest').addEventListener('click', renderNonGuestMenu);

    if (isStaffUser) {
      document.getElementById('btn-staff-inv').addEventListener('click', openStaffInventoryApp);
    }

    // 新規スタッフ追加用：見出しを5回連続タップすると自分のLINE userIdを表示（権限自体は付与されないため安全）
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
            prompt('【スタッフ登録用 LINE User ID】\n以下の文字列をコピーして管理者に共有してください：', currentMyUserId);
          }
        }
      });
    }
  }

  // ==========================================
  // ★ スタッフ専用：貸別荘備品管理アプリ機能群
  // ==========================================
  async function openStaffInventoryApp() {
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

    const tabsHtml = `
      <div class="inv-tabs">
        <button class="inv-tab-btn ${currentInvTab === 'LUONTO' ? 'active' : ''}" data-tab="LUONTO">LUONTO</button>
        <button class="inv-tab-btn ${currentInvTab === 'kukka' ? 'active' : ''}" data-tab="kukka">kukka</button>
        <button class="inv-tab-btn ${currentInvTab === 'sch-sch' ? 'active' : ''}" data-tab="sch-sch">sch-sch</button>
        <button class="inv-tab-btn ${currentInvTab === 'ホッポッタ' ? 'active' : ''}" data-tab="ホッポッタ">ホッポッタ</button>
        <button class="inv-tab-btn ${currentInvTab === 'COMMON' ? 'active' : ''}" data-tab="COMMON">施設共通</button>
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

  // 各施設（LUONTO / kukka / sch-sch / ホッポッタ）のサブセクション別HTML生成
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

  // 施設共通（ベビーチェア5台・ベビーベッド2台）のHTML生成
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
  // 【階層③〜】宿泊ゲスト向けフロー
  // ==========================================
  function renderGuestNameForm() {
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
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${escapeHtml(guestName)} 様<br>${t('selectFacility')}</h2>
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
    const locFacName = getLocalizedFacilityName(facilityName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${escapeHtml(locFacName)}】<br>${escapeHtml(guestName)} 様<br>----<br>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-checkinout">${t('checkinout')}</button>
      <button class="btn btn-primary" id="btn-survey">${t('survey')}</button>
      <button class="btn btn-primary" id="btn-contact">${t('contact')}</button>
      <button class="btn btn-danger" id="btn-close">${t('closeApp')}</button>
    `;
    bindLangSelectorEvents(renderGuestActionMenu, guestName, facilityName);

    document.getElementById('btn-checkinout').addEventListener('click', () => renderCheckInOutAction(guestName, facilityName));
    document.getElementById('btn-survey').addEventListener('click', () => {
      window.location.href = APP_CONFIG.surveyUrls[currentLang] || APP_CONFIG.surveyUrls['ja'];
    });
    document.getElementById('btn-contact').addEventListener('click', () => renderGuestContactCategory(guestName, facilityName));
    document.getElementById('btn-close').addEventListener('click', closeApp);
  }

  function renderCheckInOutAction(guestName, facilityName) {
    const locFacName = getLocalizedFacilityName(facilityName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${escapeHtml(locFacName)}】<br>${escapeHtml(guestName)} 様<br>${t('selectAction')}</h2>
      <button class="btn btn-primary" id="btn-in">${t('checkInBtn')}</button>
      <button class="btn btn-primary" id="btn-out">${t('checkOutBtn')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderCheckInOutAction, guestName, facilityName);

    const submitAction = async (actionText, actionLogText) => {
      const confirmMsg = `【${locFacName}】\n${guestName} 様\n\n「${actionText}」\n\n${t('confirmSend')}`;
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
          const schSchHoppotta = ["sch-sch", "ホッポッタ", "Hoppotta"];
          if (schSchHoppotta.includes(facilityName)) {
            let msgWelcome = t('ci_msg_welcome');
            msgWelcome = msgWelcome.replace('{facility}', () => locFacName).replace('{name}', () => guestName);
            const msgSupport = t('ci_msg_support');
            alert(`${msgWelcome}\n\n${msgSupport}`);
          } else {
            alert(`${t('ci_msg_staff_contact')}\n\n${t('ci_msg_wifi')}\n\n${t('ci_msg_contact_method')}`);
          }
        } else {
          alert(t('sendSuccess'));
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
      const messageToChat = `【${categoryName}】\n施設：${locFacName}\nお名前：${guestName} 様\n\n${text}`;
      const confirmMsg = `${t('confirmSend')}\n\n${messageToChat}`;
      if (!confirm(confirmMsg)) return;

      try {
        if (liff.isInClient()) {
          await liff.sendMessages([{ type: "text", text: messageToChat }]);
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

      const messageToChat = `【${categoryName}】\nお名前：${name} 様\n\n${text}`;
      const confirmMsg = `${t('confirmSend')}\n\n${messageToChat}`;
      if (!confirm(confirmMsg)) return;

      try {
        if (liff.isInClient()) {
          await liff.sendMessages([{ type: "text", text: messageToChat }]);
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