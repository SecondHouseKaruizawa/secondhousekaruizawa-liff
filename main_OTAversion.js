// main_OTAversion.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  let currentLang = localStorage.getItem('ota_app_lang') || 'ja';

  let clientId = localStorage.getItem('ota_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ota_client_id', clientId);
  }

  // 管理者バイパスURL（?admin_key=...）の受け取りとsessionStorageへの退避（URL欄からは即時消去）
  const urlParams = new URLSearchParams(window.location.search);
  const urlAdminKey = urlParams.get('admin_key');
  if (urlAdminKey) {
    sessionStorage.setItem('ota_admin_key', urlAdminKey);
    urlParams.delete('admin_key');
    const newSearch = urlParams.toString();
    const cleanUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  }
  const adminKey = sessionStorage.getItem('ota_admin_key') || '';

  // 旧バージョンのデバッグ用キーが残っている場合はクリーンアップ
  localStorage.removeItem('ota_debug_skip');

  // 署名付きセッショントークンの管理（チェックアウト翌日いっぱい有効・氏名は一切保存しない）
  let otaToken = localStorage.getItem('ota_auth_token') || '';

  function saveOtaToken(token) {
    otaToken = token || '';
    if (otaToken) {
      localStorage.setItem('ota_auth_token', otaToken);
    } else {
      localStorage.removeItem('ota_auth_token');
    }
  }

  // XSS・表示崩れ防止用HTMLエスケープ関数
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function t(key) {
    let val = APP_CONFIG.translations[currentLang]?.[key];
    if (val !== undefined) return val;
    val = APP_CONFIG.translations['ja'][key];
    if (val !== undefined) return val;
    return key;
  }

  // 選択中の言語に応じた敬称付き表示名を生成（生の文字列）
  function formatGuestDisplayName(rawName) {
    if (!rawName) return "";
    const formatStr = t('honorificFormat') || "{name}";
    return formatStr.replace('{name}', () => rawName);
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

  function getCanonicalFacilityName(localizedName) {
    if (!localizedName) return "";
    for (const lang in APP_CONFIG.facilities) {
      const found = APP_CONFIG.facilities[lang].find(f => f.name === localizedName);
      if (found) {
        const jaFac = APP_CONFIG.facilities['ja'].find(f => f.id === found.id);
        if (jaFac) return jaFac.name;
      }
    }
    return localizedName;
  }

  function getCanonicalChannelName(localizedName) {
    if (!localizedName) return "";
    for (const lang in APP_CONFIG.bookingChannels) {
      const found = APP_CONFIG.bookingChannels[lang].find(c => c.name === localizedName);
      if (found) {
        const jaChan = APP_CONFIG.bookingChannels['ja'].find(c => c.id === found.id);
        if (jaChan) return jaChan.name;
      }
    }
    return localizedName;
  }

  function renderLangSelectorHtml() {
    return '\
      <div class="lang-selector">\
        <button class="lang-btn ' + (currentLang === 'ja' ? 'active' : '') + '" data-lang="ja">日本語</button>\
        <button class="lang-btn ' + (currentLang === 'en' ? 'active' : '') + '" data-lang="en">EN</button>\
        <button class="lang-btn ' + (currentLang === 'zh-TW' ? 'active' : '') + '" data-lang="zh-TW">繁體</button>\
        <button class="lang-btn ' + (currentLang === 'zh-CN' ? 'active' : '') + '" data-lang="zh-CN">简体</button>\
      </div>\
    ';
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
    const response = await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        channel: "ota",
        type: 'check_status',
        clientId: clientId,
        otaToken: otaToken,
        adminKey: adminKey
      })
    });
    const result = await response.json();

    loading.classList.add('hidden');
    appContent.classList.remove('hidden');

    if (result.isLocked) {
      renderLockedScreen(result.message || result.lockMessage || t('authLocked'));
    } else if (result.isMaintenance) {
      renderMaintenanceScreen();
    } else if (result.authenticatedFacility) {
      // 有効な署名トークンを保持している場合は5項目選択をスキップして名前入力画面へ直行
      renderGuestNameInputStep(result.authenticatedFacility);
    } else {
      if (otaToken) saveOtaToken('');
      renderOtaAuthForm();
    }
  } catch (error) {
    loading.classList.add('hidden');
    appContent.classList.remove('hidden');
    appContent.innerHTML = '<p style="color:red; text-align:center;">初期化エラーが発生しました。<br>ページを再読み込みしてください。</p>';
  }

  function renderLockedScreen(msg) {
    appContent.innerHTML = '\
      <div style="text-align: center; padding: 20px;">\
        <h2>🔒 セキュリティ制限</h2>\
        <p style="font-size: 14px; line-height: 1.6; margin-top: 20px; color: #ff4d4f;">' + escapeHtml(msg) + '</p>\
        <button class="btn btn-secondary" id="btn-reload" style="margin-top: 30px;">再読み込み</button>\
      </div>\
    ';
    document.getElementById('btn-reload').addEventListener('click', () => location.reload());
  }

  function renderMaintenanceScreen() {
    appContent.innerHTML = '\
      <div style="text-align: center; padding: 20px;">\
        <h2>🚧 ' + t('maintTitle') + ' 🚧</h2>\
        <p style="font-size: 15px; line-height: 1.6; margin-top: 20px;">' + t('maintMsg') + '</p>\
        <button class="btn btn-danger" id="btn-close" style="margin-top: 30px;">' + t('closeApp') + '</button>\
      </div>\
    ';
    document.getElementById('btn-close').addEventListener('click', closeApp);
  }

  function renderOtaAuthForm() {
    const todayStr = new Date().toISOString().split('T')[0];

    let facilityOptions = '';
    const facilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    facilities.forEach(f => {
      facilityOptions += '<option value="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</option>';
    });

    let channelOptions = '';
    const channels = APP_CONFIG.bookingChannels[currentLang] || APP_CONFIG.bookingChannels['ja'];
    channels.forEach(c => {
      channelOptions += '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
    });

    let nightOptions = '';
    for (let i = 1; i <= 10; i++) {
      nightOptions += '<option value="' + i + '">' + i + ' ' + (currentLang === 'ja' ? '泊' : 'night(s)') + '</option>';
    }

    let adultOptions = '';
    for (let i = 1; i <= 10; i++) {
      adultOptions += '<option value="' + i + '">' + i + ' ' + (currentLang === 'ja' ? '名' : 'adult(s)') + '</option>';
    }

    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + t('authPrompt') + '</h2>\
      \
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">' + t('checkInDate') + '</label>\
      <input type="date" id="auth-date" class="input-field" value="' + todayStr + '" required>\
\
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">' + t('selectFacility') + '</label>\
      <select id="auth-facility" class="input-field">\
        <option value="" disabled selected>' + escapeHtml(t('selectPlaceholder')) + '</option>\
        ' + facilityOptions + '\
      </select>\
\
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">' + t('nights') + '</label>\
      <select id="auth-nights" class="input-field">\
        <option value="" disabled selected>' + escapeHtml(t('selectPlaceholder')) + '</option>\
        ' + nightOptions + '\
      </select>\
\
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">' + t('adults') + '</label>\
      <select id="auth-adults" class="input-field">\
        <option value="" disabled selected>' + escapeHtml(t('selectPlaceholder')) + '</option>\
        ' + adultOptions + '\
      </select>\
\
      <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:5px;">' + t('channel') + '</label>\
      <select id="auth-channel" class="input-field" title="' + escapeHtml(t('cotteNotice')) + '">\
        <option value="" disabled selected>' + escapeHtml(t('selectPlaceholder')) + '</option>\
        ' + channelOptions + '\
      </select>\
      <div id="cotte-notice-box" style="font-size: 12px; color: #d9534f; margin-top: -10px; margin-bottom: 15px; font-weight: bold; line-height: 1.4;">\
        ' + t('cotteNotice') + '\
      </div>\
\
      <button class="btn btn-primary" id="btn-auth" style="margin-top: 5px;">' + t('authSubmit') + '</button>\
      \
      <div style="font-size: 11px; color: #666; margin-top: 25px; line-height: 1.5; border-top: 1px solid #eee; padding-top: 15px; text-align: center;">\
        ' + t('privacyNotice') + '\
      </div>\
    ';

    bindLangSelectorEvents(renderOtaAuthForm);

    const channelSelect = document.getElementById('auth-channel');
    let hasAlertedOnFocus = false;
    channelSelect.addEventListener('focus', () => {
      if (!hasAlertedOnFocus) {
        alert(t('cotteNotice'));
        hasAlertedOnFocus = true;
      }
    });

    channelSelect.addEventListener('change', (e) => {
      if (e.target.value === "Cotte") {
        alert(t('cotteNotice'));
      }
    });

    document.getElementById('btn-auth').addEventListener('click', async () => {
      const checkinDate = document.getElementById('auth-date').value;
      const facility = document.getElementById('auth-facility').value;
      const nights = document.getElementById('auth-nights').value;
      const adults = document.getElementById('auth-adults').value;
      const channel = document.getElementById('auth-channel').value;

      if (!checkinDate || !facility || !nights || !adults || !channel) {
        return alert(t('validationAlert'));
      }

      const canonicalFacility = getCanonicalFacilityName(facility);
      const canonicalChannel = getCanonicalChannelName(channel);

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
            adminKey: adminKey,
            data: {
              checkinDate: checkinDate,
              facility: canonicalFacility,
              nights: nights,
              adults: adults,
              channel: canonicalChannel
            }
          })
        });
        const result = await response.json();

        loading.classList.add('hidden');
        appContent.classList.remove('hidden');

        if (result.status === "success") {
          saveOtaToken(result.otaToken || '');
          renderGuestNameInputStep(result.facility || canonicalFacility);
        } else if (result.status === "locked") {
          renderLockedScreen(result.message || t('authLocked'));
        } else if (result.status === "maintenance") {
          renderMaintenanceScreen();
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

  // ゲスト名（識別名）入力画面
  function renderGuestNameInputStep(facilityName) {
    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + t('guestNamePromptTitle') + '</h2>\
      <p style="font-size: 12px; color: #666; text-align: center; margin-bottom: 15px; line-height: 1.4;">' + t('guestNamePromptDesc') + '</p>\
      \
      <input type="text" id="input-guest-name" class="input-field" placeholder="' + escapeHtml(t('guestNamePlaceholder')) + '" maxlength="50">\
      \
      <div style="font-size: 11px; color: #d9534f; background: #fff8f8; border: 1px solid #ffeded; border-radius: 5px; padding: 10px; margin-bottom: 15px; line-height: 1.4;">\
        ' + t('guestNameNotice') + '\
      </div>\
      \
      <button class="btn btn-primary" id="btn-submit-name">' + t('next') + '</button>\
      <button class="btn btn-secondary" id="btn-back-auth">' + t('backToAuth') + '</button>\
    ';
    bindLangSelectorEvents(renderGuestNameInputStep, facilityName);

    document.getElementById('btn-submit-name').addEventListener('click', () => {
      const nameInput = document.getElementById('input-guest-name').value.trim();
      if (!nameInput) {
        return alert(t('nameAlert'));
      }
      renderGuestTopMenu(nameInput, facilityName);
    });

    // 「認証画面へ戻る」押下時は保持トークンを破棄して5項目選択からやり直せるようにする
    document.getElementById('btn-back-auth').addEventListener('click', () => {
      saveOtaToken('');
      renderOtaAuthForm();
    });
  }

  // ゲストTOPメニュー
  function renderGuestTopMenu(rawGuestName, facilityName) {
    const guestDisplayName = formatGuestDisplayName(rawGuestName);
    const locFacName = getLocalizedFacilityName(facilityName);

    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>【' + escapeHtml(locFacName) + '】<br>' + escapeHtml(guestDisplayName) + '<br>----<br>' + t('guestTopMenuPrompt') + '</h2>\
      <button class="btn btn-primary" id="btn-during-stay">' + t('duringStay') + '</button>\
      <button class="btn btn-primary" id="btn-route-access">' + t('routeAccess') + '</button>\
      <button class="btn btn-primary" id="btn-virtual-tour-guest">' + t('virtualTour') + '</button>\
      <button class="btn btn-secondary" id="btn-back">' + t('backToAuth') + '</button>\
      \
      <div style="font-size: 11px; color: #666; margin-top: 25px; line-height: 1.5; border-top: 1px solid #eee; padding-top: 15px; text-align: center;">\
        ' + t('privacyNotice') + '\
      </div>\
    ';
    bindLangSelectorEvents(renderGuestTopMenu, rawGuestName, facilityName);

    document.getElementById('btn-during-stay').addEventListener('click', () => renderGuestActionMenu(rawGuestName, facilityName));
    document.getElementById('btn-route-access').addEventListener('click', () => renderRouteAccessMenu(rawGuestName, facilityName));
    document.getElementById('btn-virtual-tour-guest').addEventListener('click', () => renderVirtualTourMenu(rawGuestName, facilityName));
    document.getElementById('btn-back').addEventListener('click', () => {
      saveOtaToken('');
      renderOtaAuthForm();
    });
  }

  function renderRouteAccessMenu(rawGuestName, facilityName) {
    let html = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + t('routeAccess') + '</h2>\
      <p style="font-size: 13px; color: #ff4d4f; text-align: center; margin-bottom: 15px; font-weight: bold;">' + t('locationWarning') + '</p>\
    ';

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      const prefix = t('accessPrefix');
      const suffix = t('accessSuffix');
      const btnText = prefix + escapeHtml(facility.name) + suffix;
      html += '<button class="btn btn-primary btn-map" data-id="' + escapeHtml(facility.id) + '">' + btnText + '</button>';
    });

    html += '<button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>';
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderRouteAccessMenu, rawGuestName, facilityName);

    document.querySelectorAll('.btn-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.currentTarget.getAttribute('data-id');
        const mapUrl = APP_CONFIG.mapUrls[facilityId];
        if (mapUrl) window.open(mapUrl, '_blank');
      });
    });

    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(rawGuestName, facilityName));
  }

  function renderVirtualTourMenu(rawGuestName, facilityName) {
    let html = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + t('virtualTour') + '</h2>\
    ';

    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      html += '<button class="btn btn-primary btn-vt" data-id="' + escapeHtml(facility.id) + '">' + escapeHtml(facility.name) + '</button>';
    });

    html += '<button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>';
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderVirtualTourMenu, rawGuestName, facilityName);

    document.querySelectorAll('.btn-vt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.currentTarget.getAttribute('data-id');
        const vtUrl = APP_CONFIG.virtualTourUrls[facilityId];
        if (vtUrl) window.open(vtUrl, '_blank');
      });
    });

    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(rawGuestName, facilityName));
  }

  function renderGuestActionMenu(rawGuestName, facilityName) {
    const locFacName = getLocalizedFacilityName(facilityName);
    const guestDisplayName = formatGuestDisplayName(rawGuestName);

    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>【' + escapeHtml(locFacName) + '】<br>' + escapeHtml(guestDisplayName) + '<br>----<br>' + t('selectGuestMenu') + '</h2>\
      <button class="btn btn-primary" id="btn-checkinout">' + t('checkinout') + '</button>\
      <button class="btn btn-primary" id="btn-survey">' + t('survey') + '</button>\
      <button class="btn btn-primary" id="btn-contact">' + t('contact') + '</button>\
      <button class="btn btn-danger" id="btn-close">' + t('closeApp') + '</button>\
      <button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>\
    ';
    bindLangSelectorEvents(renderGuestActionMenu, rawGuestName, facilityName);

    document.getElementById('btn-checkinout').addEventListener('click', () => renderCheckInOutAction(rawGuestName, facilityName));
    document.getElementById('btn-survey').addEventListener('click', () => {
      window.open(APP_CONFIG.surveyUrls[currentLang] || APP_CONFIG.surveyUrls['ja'], '_blank');
    });
    document.getElementById('btn-contact').addEventListener('click', () => renderGuestContactCategory(rawGuestName, facilityName));
    document.getElementById('btn-close').addEventListener('click', closeApp);
    document.getElementById('btn-back').addEventListener('click', () => renderGuestTopMenu(rawGuestName, facilityName));
  }

  // チェックイン・チェックアウト処理
  function renderCheckInOutAction(rawGuestName, facilityName) {
    const locFacName = getLocalizedFacilityName(facilityName);
    const guestDisplayName = formatGuestDisplayName(rawGuestName);

    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>【' + escapeHtml(locFacName) + '】<br>' + escapeHtml(guestDisplayName) + '<br>' + t('selectAction') + '</h2>\
      <button class="btn btn-primary" id="btn-in">' + t('checkInBtn') + '</button>\
      <button class="btn btn-primary" id="btn-out">' + t('checkOutBtn') + '</button>\
      <button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>\
    ';
    bindLangSelectorEvents(renderCheckInOutAction, rawGuestName, facilityName);

    const submitAction = async (actionText, actionLogText) => {
      const confirmMsg = '【' + locFacName + '】\n' + guestDisplayName + '\n\n「' + actionText + '」\n\n' + t('confirmSend');
      if (!confirm(confirmMsg)) return;

      loading.innerText = t('loading');
      loading.classList.remove('hidden');

      const res = await sendToGAS("guest", facilityName, rawGuestName, actionLogText, currentLang);

      loading.classList.add('hidden');
      if (res.ok) {
        if (actionLogText === '到着・チェックイン(Checked-In)') {
          const schSchHoppotta = ["sch-sch", "ホッポッタ", "Hoppotta"];
          if (schSchHoppotta.includes(facilityName)) {
            let msgWelcome = t('ci_msg_welcome');
            // 日本語辞書には「{name}様」と既に様が入っているため二重敬称（「様様」）を防止
            const welcomeName = (currentLang === 'ja') ? rawGuestName : guestDisplayName;
            msgWelcome = msgWelcome.replace('{facility}', () => locFacName).replace('{name}', () => welcomeName);
            const msgSupport = t('ci_msg_support');
            alert(msgWelcome + '\n\n' + msgSupport);
          } else {
            alert(t('ci_msg_contact_direct'));
          }
        } else {
          alert(t('co_msg_success'));
        }
        renderGuestActionMenu(rawGuestName, facilityName);
      } else if (res.status === "auth_expired") {
        saveOtaToken('');
        alert(res.message || t('sessionExpired'));
        renderOtaAuthForm();
      } else if (res.status === "maintenance") {
        renderMaintenanceScreen();
      } else {
        alert(t('sendFail') + (res.message || ""));
      }
    };

    document.getElementById('btn-in').addEventListener('click', () => submitAction(t('checkInBtn'), '到着・チェックイン(Checked-In)'));
    document.getElementById('btn-out').addEventListener('click', () => submitAction(t('checkOutBtn'), '出発・チェックアウト(Checked-Out)'));
    document.getElementById('btn-back').addEventListener('click', () => renderGuestActionMenu(rawGuestName, facilityName));
  }

  function renderGuestContactCategory(rawGuestName, facilityName) {
    let html = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + t('selectContactCat') + '</h2>\
    ';
    APP_CONFIG.contactCategories.forEach(cat => {
      const catName = t('cat_' + cat.key);
      html += '<button class="btn btn-primary btn-cat" data-name="' + escapeHtml(catName) + '">' + escapeHtml(catName) + '</button>';
    });
    html += '<button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>';

    appContent.innerHTML = html;
    bindLangSelectorEvents(renderGuestContactCategory, rawGuestName, facilityName);

    document.querySelectorAll('.btn-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const categoryName = e.currentTarget.getAttribute('data-name');
        renderGuestContactForm(rawGuestName, facilityName, categoryName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', () => renderGuestActionMenu(rawGuestName, facilityName));
  }

  function renderGuestContactForm(rawGuestName, facilityName, categoryName) {
    appContent.innerHTML = '\
      ' + renderLangSelectorHtml() + '\
      <h2>' + escapeHtml(categoryName) + '</h2>\
      <textarea id="inquiry-text" class="input-field" placeholder="' + escapeHtml(t('inquiryPlaceholder')) + '" maxlength="1000"></textarea>\
      <button class="btn btn-primary" id="btn-send">' + t('sendToStaff') + '</button>\
      <button class="btn btn-secondary" id="btn-back">' + t('back') + '</button>\
    ';
    bindLangSelectorEvents(renderGuestContactForm, rawGuestName, facilityName, categoryName);

    document.getElementById('btn-send').addEventListener('click', async () => {
      const text = document.getElementById('inquiry-text').value.trim();
      if (!text) return alert(t('inquiryAlert'));

      const locFacName = getLocalizedFacilityName(facilityName);
      const guestDisplayName = formatGuestDisplayName(rawGuestName);
      const confirmPreview = '【' + categoryName + '】\n' + locFacName + '\n' + guestDisplayName + '\n\n' + text;
      const confirmMsg = t('confirmSend') + '\n\n' + confirmPreview;
      if (!confirm(confirmMsg)) return;

      loading.innerText = t('loading');
      loading.classList.remove('hidden');
      const res = await notifyToGAS("pc_inquiry", { category: categoryName, facilityName: facilityName, guestName: rawGuestName, message: text });
      loading.classList.add('hidden');

      if (res.ok) {
        alert(t('pcFallbackSuccess'));
        renderGuestActionMenu(rawGuestName, facilityName);
      } else if (res.status === "auth_expired") {
        saveOtaToken('');
        alert(res.message || t('sessionExpired'));
        renderOtaAuthForm();
      } else if (res.status === "maintenance") {
        renderMaintenanceScreen();
      } else {
        alert(t('sendFail') + (res.message || ""));
      }
    });

    document.getElementById('btn-back').addEventListener('click', () => renderGuestContactCategory(rawGuestName, facilityName));
  }

  async function sendToGAS(type, facilityName, guestName, action, lang) {
    const payload = {
      channel: "ota",
      clientId: clientId,
      otaToken: otaToken,
      adminKey: adminKey,
      type: type,
      facilityName: facilityName,
      guestName: guestName,
      action: action,
      detail: lang
    };
    return await postOtaToGAS(payload);
  }

  async function notifyToGAS(type, dataObj) {
    const payload = {
      channel: "ota",
      clientId: clientId,
      otaToken: otaToken,
      adminKey: adminKey,
      type: type,
      data: dataObj
    };
    return await postOtaToGAS(payload);
  }

  async function postOtaToGAS(payload) {
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return { ok: false, status: "error" };
      const json = JSON.parse(text);
      return { ok: json.status === "success", status: json.status, message: json.message || "" };
    } catch (e) {
      return { ok: false, status: "network_error", message: e.message };
    }
  }
});