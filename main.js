// main.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  let currentLang = localStorage.getItem('app_lang') || 'ja';

  // ★ 修正箇所：空文字("")を正しく処理できるよう、翻訳取得ロジックを厳格化
  function t(key) {
    let val = APP_CONFIG.translations[currentLang][key];
    if (val !== undefined) return val;
    val = APP_CONFIG.translations['ja'][key];
    if (val !== undefined) return val;
    return key;
  }

  function changeLang(lang) {
    currentLang = lang;
    localStorage.setItem('app_lang', lang);
    renderTopMenu();
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

  try {
    await liff.init({ liffId: APP_CONFIG.LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ scopes: ['openid', 'profile', 'chat_message.write'] });
      return;
    }

    loading.classList.add('hidden');
    appContent.classList.remove('hidden');

    renderTopMenu();
  } catch (error) {
    loading.innerText = 'エラーが発生しました: ' + error.message;
  }

  // ==========================================
  // 【階層①】TOPメニュー
  // ==========================================
  function renderTopMenu() {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectMenu')}</h2>
      <button class="btn btn-primary" id="btn-guest">${t('guest')}<br><small>${t('guestSub')}</small></button>
      <button class="btn btn-secondary" id="btn-nonguest">${t('nonGuest')}<br><small>${t('nonGuestSub')}</small></button>
    `;
    bindLangSelectorEvents(renderTopMenu);
    
    document.getElementById('btn-guest').addEventListener('click', renderGuestTopMenu);
    document.getElementById('btn-nonguest').addEventListener('click', renderNonGuestMenu);
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
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestTopMenu);

    document.getElementById('btn-during-stay').addEventListener('click', renderGuestNameForm);
    document.getElementById('btn-route-access').addEventListener('click', renderRouteAccessMenu);
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
      const prefix = t('accessPrefix'); // デフォルト引数削除（関数内で処理）
      const suffix = t('accessSuffix'); 
      const btnText = `${prefix}${facility.name}${suffix}`;
      html += `<button class="btn btn-primary btn-map" data-id="${facility.id}">${btnText}</button>`;
    });
    
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderRouteAccessMenu);

    document.querySelectorAll('.btn-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityId = e.target.getAttribute('data-id');
        const mapUrl = APP_CONFIG.mapUrls[facilityId];
        if(mapUrl) {
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
  // 【階層③〜】既存の宿泊ゲスト向けフロー（影響なし）
  // ==========================================
  function renderGuestNameForm() {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('namePrompt')}</h2>
      <input type="text" id="guest-name-input" class="input-field" placeholder="${t('namePlaceholder')}" required>
      <button class="btn btn-primary" id="btn-next">${t('next')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderGuestNameForm);
    
    document.getElementById('btn-next').addEventListener('click', () => {
      const name = document.getElementById('guest-name-input').value.trim();
      if (!name) return alert(t('nameAlert'));
      renderGuestFacilitySelect(name);
    });
    
    document.getElementById('btn-back').addEventListener('click', renderGuestTopMenu);
  }

  function renderGuestFacilitySelect(guestName) {
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${guestName} 様<br>${t('selectFacility')}</h2>
    `;
    
    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    currentFacilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-facility" data-name="${facility.name}">${facility.name}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    
    appContent.innerHTML = html;
    bindLangSelectorEvents(renderGuestFacilitySelect, guestName);

    document.querySelectorAll('.btn-facility').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const facilityName = e.target.getAttribute('data-name');
        renderGuestActionMenu(guestName, facilityName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', renderGuestNameForm);
  }

  function renderGuestActionMenu(guestName, facilityName) {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${facilityName}】<br>${guestName} 様<br>----<br>${t('selectGuestMenu')}</h2>
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
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${facilityName}】<br>${guestName} 様<br>${t('selectAction')}</h2>
      <button class="btn btn-primary" id="btn-in">${t('checkInBtn')}</button>
      <button class="btn btn-primary" id="btn-out">${t('checkOutBtn')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderCheckInOutAction, guestName, facilityName);
    
    const submitAction = async (actionText, actionLogText) => {
      const confirmMsg = `【${facilityName}】\n${guestName} 様\n\n「${actionText}」\n\n${t('confirmSend')}`;
      if (!confirm(confirmMsg)) return;
      
      loading.innerText = t('loading');
      loading.classList.remove('hidden');

      const success = await sendToGAS("guest", facilityName, guestName, actionLogText, currentLang);
      
      loading.classList.add('hidden');
      if (success) {
        alert(t('sendSuccess'));
        renderGuestActionMenu(guestName, facilityName);
      } else {
        alert(t('sendFail') + "(Auth Error)");
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
      
      const messageToChat = `【${categoryName}】\n施設：${facilityName}\nお名前：${guestName} 様\n\n${text}`;
      const confirmMsg = `${t('confirmSend')}\n\n${messageToChat}`;
      if (!confirm(confirmMsg)) return;

      try {
        if (liff.isInClient()) {
          await liff.sendMessages([{ type: "text", text: messageToChat }]);
          alert(t('inquirySuccess'));
        } else {
          loading.innerText = t('loading');
          loading.classList.remove('hidden');
          const success = await notifyToGAS("pc_inquiry", { category: categoryName, facilityName: facilityName, guestName: guestName, message: text });
          loading.classList.add('hidden');
          
          if (success) {
            alert(t('pcFallbackSuccess'));
          } else {
            return alert(t('sendFail') + "(Auth Error)");
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
  // 【階層②〜】予約・宿泊でないお客様向けフロー（影響なし）
  // ==========================================
  function renderNonGuestMenu() {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-book">${t('bookMenu')}</button>
      <button class="btn btn-primary" id="btn-inquiry">${t('inquiryMenu')}</button>
      <button class="btn btn-danger" id="btn-close">${t('closeApp')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderNonGuestMenu);

    document.getElementById('btn-book').addEventListener('click', renderBookingMenu);
    document.getElementById('btn-inquiry').addEventListener('click', renderNonGuestInquiryForm);
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

    document.getElementById('btn-ret-guest').addEventListener('click', renderReturningBookingForm);
    document.getElementById('btn-first-guest').addEventListener('click', async () => {
      
      loading.innerText = t('loading');
      loading.classList.remove('hidden');
      
      const success = await notifyToGAS("push_notify", { category: "first_time_booking", lang: currentLang });
      
      loading.classList.add('hidden');
      if (success) {
        window.location.href = APP_CONFIG.HP_BOOKING_URL;
      } else {
        alert(t('sendFail') + "(Auth Error)");
      }
    });

    document.getElementById('btn-back').addEventListener('click', renderNonGuestMenu);
  }

  function renderReturningBookingForm() {
    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];
    let optionsHtml = '';
    currentFacilities.forEach(f => { optionsHtml += `<option value="${f.name}">${f.name}</option>`; });

    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('lastStayDetail')}</h2>
      <input type="number" id="stay-year" class="input-field" placeholder="${t('stayYear')}">
      <input type="number" id="stay-month" class="input-field" placeholder="${t('stayMonth')}">
      <select id="stay-facility" class="input-field">
        <option value="" disabled selected>${t('selectFacility')}</option>
        ${optionsHtml}
      </select>
      <input type="text" id="stay-name" class="input-field" placeholder="${t('pastName')}">
      <input type="text" id="coupon-code" class="input-field" placeholder="${t('couponCode')}">
      <button class="btn btn-primary" id="btn-proceed">${t('proceedHp')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderReturningBookingForm);

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

      const success = await notifyToGAS("push_notify", { 
        category: "returning_booking", 
        year, month, facility, pastName, coupon, lang: currentLang
      });
      
      loading.classList.add('hidden');
      if (success) {
        window.location.href = APP_CONFIG.HP_BOOKING_URL;
      } else {
        alert(t('sendFail') + "(Auth Error)");
      }
    });

    document.getElementById('btn-back').addEventListener('click', renderBookingMenu);
  }

  function renderNonGuestInquiryForm() {
    const categoryName = t('nonGuestInquiryName');
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${categoryName}</h2>
      <input type="text" id="inquiry-name" class="input-field" placeholder="${t('yourName')}" required>
      <textarea id="inquiry-text" class="input-field" placeholder="${t('inquiryPlaceholder')}"></textarea>
      <button class="btn btn-primary" id="btn-send">${t('sendLine')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents(renderNonGuestInquiryForm);

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
          const success = await notifyToGAS("pc_inquiry", { category: categoryName, facilityName: "一般", guestName: name, message: text });
          loading.classList.add('hidden');

          if (success) {
            alert(t('pcFallbackSuccess'));
          } else {
            return alert(t('sendFail') + "(Auth Error)");
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
  // 【共通】GAS通信用ユーティリティ
  // ==========================================
  
  async function sendToGAS(type, facilityName, guestName, action, lang) {
    const idToken = liff.getIDToken();
    if (!idToken) {
      alert(t('sessionExpired'));
      liff.logout();
      liff.login({ scopes: ['openid', 'profile', 'chat_message.write'] });
      return false;
    }
    const payload = { idToken, type, facilityName, guestName, action, detail: lang };
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return false;
      return true;
    } catch (e) {
      console.error("GAS send error", e);
      return false;
    }
  }

  async function notifyToGAS(type, dataObj) {
    const idToken = liff.getIDToken();
    if (!idToken) return false;
    const payload = { idToken, type: type, data: dataObj };
    try {
      const response = await fetch(APP_CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      const text = await response.text();
      if (text === "Error") return false;
      return true;
    } catch (e) {
      console.error("GAS notify error", e);
      return false;
    }
  }
});