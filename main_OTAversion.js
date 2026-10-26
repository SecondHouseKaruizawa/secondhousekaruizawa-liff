// main_OTAversion.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  let currentLang = localStorage.getItem('ota_app_lang') || 'ja';
  
  // 端末ごとの一意のクライアントID（3回失敗ロック用）を生成・保持
  let clientId = localStorage.getItem('ota_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ota_client_id', clientId);
  }

  function t(key) {
    let val = APP_CONFIG.translations[currentLang]?.[key];
    if (val !== undefined) return val;
    val = APP_CONFIG.translations['ja'][key];
    if (val !== undefined) return val;
    return key;
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
        localStorage.setItem('ota_app_lang', currentLang);
        if (reRenderFunc) reRenderFunc(...args);
        else renderOtaAuthForm();
      });
    });
  }

  function closeApp() {
    alert(currentLang === 'ja' ? 'ブラウザのタブを閉じて画面を終了してください。' : 'Please close this browser tab to exit.');
  }

  try {
    // 起動時のメンテナンス確認およびロック状態の確認
    const response = await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ channel: "ota", type: 'check_status', clientId: clientId })
    });
    const result = await response.json();

    loading.classList.add('hidden');
    appContent.classList.remove('hidden');

    if (result.isLocked) {
      renderLockedScreen(result.lockMessage || t('authLocked'));
    } else if (result.isMaintenance) {
      renderMaintenanceScreen();
    } else {
      renderOtaAuthForm();
    }
  } catch (error) {
    loading.classList.add('hidden');
    appContent.classList.remove('hidden');
    appContent.innerHTML = `<p style="color:red; text-align:center;">初期化エラーが発生しました。<br>ページを再読み込みしてください。</p>`;
  }

  // ==========================================
  // 【新設】ロック専用画面（3回連続失敗時）
  // ==========================================
  function renderLockedScreen(msg) {
    appContent.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h2>🔒 セキュリティ制限</h2>
        <p style="font-size: 14px; line-height: 1.6; margin-top: 20px; color: #ff4d4f;">${msg}</p>
        <button class="btn btn-secondary" id="btn-reload" style="margin-top: 30px;">再読み込み</button>
      </div>
    `;
    document.getElementById('btn-reload').addEventListener('click', () => location.reload());
  }

  // ==========================================
  // 【新設】メンテナンス専用画面
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
  // 【新設】完全選択式5項目 認証フォーム
  // ==========================================
  function renderOtaAuthForm() {
    const todayStr = new Date().toISOString().split('T')[0];

    // 施設マスタ
    let facilityOptions = '';
    const facilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    facilities.forEach(f => {
      facilityOptions += `<option value="${f.name}">${f.name}</option>`;
    });

    // 予約経路マスタ
    let channelOptions = '';
    const channels = APP_CONFIG.bookingChannels[currentLang] || APP_CONFIG.bookingChannels['ja'];
    channels.forEach(c => {
      channelOptions += `<option value="${c.name}">${c.name}</option>`;
    });

    // 宿泊日数 (1〜10泊)
    let nightOptions = '';
    for (let i = 1; i <= 10; i++) {
      nightOptions += `<option value="${i}">${i} ${currentLang === 'ja' ? '泊' : 'night(s)'}</option>`;
    }

    // 大人人数 (1〜10名)
    let adultOptions = '';
    for (let i = 1; i <= 10; i++) {
      adultOptions += `<option value="${i}">${i} ${currentLang === 'ja' ? '名' : 'adult(s)'}</option>`;
    }

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('authPrompt')}</h2>
      
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">${t('checkInDate')}</label>
      <input type="date" id="auth-date" class="input-field" value="${todayStr}" required>

      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">${t('selectFacility')}</label>
      <select id="auth-facility" class="input-field">
        <option value="" disabled selected>-- 選択してください --</option>
        ${facilityOptions}
      </select>

      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">${t('nights')}</label>
      <select id="auth-nights" class="input-field">
        <option value="" disabled selected>-- 選択してください --</option>
        ${nightOptions}
      </select>

      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">${t('adults')}</label>
      <select id="auth-adults" class="input-field">
        <option value="" disabled selected>-- 選択してください --</option>
        ${adultOptions}
      </select>

      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">${t('channel')}</label>
      <select id="auth-channel" class="input-field">
        <option value="" disabled selected>-- 選択してください --</option>
        ${channelOptions}
      </select>

      <button class="btn btn-primary" id="btn-auth" style="margin-top: 15px;">${t('authSubmit')}</button>
    `;

    bindLangSelectorEvents(renderOtaAuthForm);

    document.getElementById('btn-auth').addEventListener('click', async () => {
      const checkinDate = document.getElementById('auth-date').value;
      const facility = document.getElementById('auth-facility').value;
      const nights = document.getElementById('auth-nights').value;
      const adults = document.getElementById('auth-adults').value;
      const channel = document.getElementById('auth-channel').value;

      if (!checkinDate || !facility || !nights || !adults || !channel) {
        return alert(t('validationAlert'));
      }

      loading.innerText = t('loading');
      loading.classList.remove('hidden');
      appContent.classList.add('hidden');

      try {
        const response = await fetch(APP_CONFIG.GAS_URL, {
          method: 'POST',
          body: JSON.stringify({
            channel: "ota",
            type: "authenticate",
            clientId: clientId,
            data: { checkinDate, facility, nights, adults, channel }
          })
        });
        const result = await response.json();

        loading.classList.add('hidden');
        appContent.classList.remove('hidden');

        if (result.status === "success" && result.guestName) {
          // 認証成功：ゲスト名（代表者名）を保持してTOPメニューへ
          renderGuestTopMenu(result.guestName, facility);
        } else if (result.status === "locked") {
          renderLockedScreen(result.message || t('authLocked'));
        } else {
          alert(t('authError'));
        }
      } catch (err) {
        loading.classList.add('hidden');
        appContent.classList.remove('hidden');
        alert(t('sendFail') + err.message);
      }
    });
  }

  // ==========================================
  // 【階層①】宿泊ゲスト向け TOPメニュー
  // ==========================================
  function renderGuestTopMenu(guestName, facilityName) {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${getLocalizedFacilityName(facilityName)}】<br>${guestName} 様<br>----<br>${t('guestTopMenuPrompt')}</h2>
      <button class="btn btn-primary" id="btn-during-stay">${t('duringStay')}</button>
      <button class="btn btn-primary" id="btn-route-access">${t('routeAccess')}</button>
      <button class="btn btn-primary" id="btn-virtual-tour-guest">${t('virtualTour')}</button>
      <button class="btn btn-secondary" id="btn-back">認証画面へ戻る</button>
    `;
    bindLangSelectorEvents(renderGuestTopMenu, guestName, facilityName);

    document.getElementById('btn-during-stay').addEventListener('click', () => renderGuestActionMenu(guestName, facilityName));
    document.getElementById('btn-route-access').addEventListener('click', () => renderRouteAccessMenu(guestName, facilityName));
    document.getElementById('btn-virtual-tour-guest').addEventListener('click', () => renderVirtualTourMenu(guestName, facilityName));
    document.getElementById('btn-back').addEventListener('click', renderOtaAuthForm);
  }

  // ==========================================
  // 【階層②】施設までの道案内メニュー
  // ==========================================
  function renderRouteAccessMenu(guestName, facilityName) {
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('routeAccess')}</h2>
      <p style="font-size: 13px; color: #ff4d4f; text-align: center; margin-bottom: 15px; font-weight: bold;">${t('locationWarning')}</p>
    `;
    
    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      const prefix = t('accessPrefix');
      const suffix = t('accessSuffix'); 
      const btnText = `${prefix}${facility.name}${suffix}`;
      html += `<button class="btn btn-primary btn-map" data-id="${facility.id}">${btnText}</button>`;
    });
    
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderRouteAccessMenu, guestName, facilityName);

    document.querySelectorAll('.btn-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.target.getAttribute('data-id');
        const mapUrl = APP_CONFIG.mapUrls[facilityId];
        if(mapUrl) {
          window.open(mapUrl, '_blank');
        }
      });
    });
    
    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(guestName, facilityName));
  }

  // ==========================================
  // バーチャルツアー施設選択メニュー
  // ==========================================
  function renderVirtualTourMenu(guestName, facilityName) {
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('virtualTour')}</h2>
    `;
    
    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-vt" data-id="${facility.id}">${facility.name}</button>`;
    });
    
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderVirtualTourMenu, guestName, facilityName);

    document.querySelectorAll('.btn-vt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.target.getAttribute('data-id');
        const vtUrl = APP_CONFIG.virtualTourUrls[facilityId];
        if(vtUrl) {
          window.open(vtUrl, '_blank');
        }
      });
    });
    
    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(guestName, facilityName));
  }

  // ==========================================
  // 【階層③】アクションメニュー（チェックイン・アウト・アンケート等）
  // ==========================================
  function renderGuestActionMenu(guestName, facilityName) {
    const locFacName = getLocalizedFacilityName(facilityName);
    
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${locFacName}】<br>${guestName} 様<br>----<br>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-checkinout">${t('checkinout')}</button>
      <button class="btn btn-primary" id="btn-survey">${t('survey')}</button>
      <button class="btn btn-primary" id="btn-contact">${t('contact')}</button>
      <button class="btn btn-danger" id="btn-close">${t('closeApp')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestActionMenu, guestName, facilityName);

    document.getElementById('btn-checkinout').addEventListener('click', () => renderCheckInOutAction(guestName, facilityName));
    document.getElementById('btn-survey').addEventListener('click', () => {
      window.open(APP_CONFIG.surveyUrls[currentLang] || APP_CONFIG.surveyUrls['ja'], '_blank');
    });
    document.getElementById('btn-contact').addEventListener('click', () => renderGuestContactCategory(guestName, facilityName));
    document.getElementById('btn-close').addEventListener('click', closeApp);
    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(guestName, facilityName));
  }

  function renderCheckInOutAction(guestName, facilityName) {
    const locFacName = getLocalizedFacilityName(facilityName);

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${locFacName}】<br>${guestName} 様<br>${t('selectAction')}</h2>
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

      const success = await sendToGAS("guest", facilityName, guestName, actionLogText, currentLang);
      
      loading.classList.add('hidden');
      if (success) {
        if (actionLogText === '到着・チェックイン(Checked-In)') {
          const schSchHoppotta = ["sch-sch", "ホッポッタ", "Hoppotta"];
          if (schSchHoppotta.includes(facilityName)) {
            let msgWelcome = t('ci_msg_welcome');
            msgWelcome = msgWelcome.replace('{facility}', locFacName).replace('{name}', guestName);
            const msgSupport = t('ci_msg_support');
            alert(`${msgWelcome}\n\n${msgSupport}`);
          } else {
            alert(`ご登録の連絡先（OTAメッセージまたはお電話）にてスタッフからご案内いたします。`);
          }
        } else {
          alert(t('sendSuccess'));
        }
        renderGuestActionMenu(guestName, facilityName);
      } else {
        alert(t('sendFail'));
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
      html += `<button class="btn btn-primary btn-cat" data-name="${catName}">${catName}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderGuestContactCategory, guestName, facilityName);

    document.querySelectorAll('.btn-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const categoryName = e.target.getAttribute('data-name');
        renderGuestContactForm(guestName, facilityName, categoryName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', () => renderGuestActionMenu(guestName, facilityName));
  }

  function renderGuestContactForm(guestName, facilityName, categoryName) {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${categoryName}</h2>
      <textarea id="inquiry-text" class="input-field" placeholder="${t('inquiryPlaceholder')}"></textarea>
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

      loading.innerText = t('loading');
      loading.classList.remove('hidden');
      const success = await notifyToGAS("pc_inquiry", { category: categoryName, facilityName: facilityName, guestName: guestName, message: text });
      loading.classList.add('hidden');

      if (success) {
        alert(t('pcFallbackSuccess'));
        renderGuestActionMenu(guestName, facilityName);
      } else {
        alert(t('sendFail'));
      }
    });

    document.getElementById('btn-back').addEventListener('click', () => renderGuestContactCategory(guestName, facilityName));
  }

  // ==========================================
  // 【共通】GAS通信用ユーティリティ
  // ==========================================
  async function sendToGAS(type, facilityName, guestName, action, lang) {
    const payload = { channel: "ota", clientId: clientId, type, facilityName, guestName, action, detail: lang };
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function notifyToGAS(type, dataObj) {
    const payload = { channel: "ota", clientId: clientId, type: type, data: dataObj };
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return false;
      return true;
    } catch (e) {
      return false;
    }
  }
});