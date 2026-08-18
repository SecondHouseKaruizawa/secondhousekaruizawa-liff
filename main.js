// main.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

  // 現在の言語設定（初期値は日本語、保存されている場合はそれを維持）
  let currentLang = localStorage.getItem('app_lang') || 'ja';

  // 翻訳関数
  function t(key) {
    return APP_CONFIG.translations[currentLang][key] || APP_CONFIG.translations['ja'][key] || key;
  }

  // 言語切り替え関数
  function changeLang(lang) {
    currentLang = lang;
    localStorage.setItem('app_lang', lang);
    renderTopMenu();
  }

  // 言語切替セレクターのHTML生成
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

  // 言語切替ボタンのイベントバインド
  function bindLangSelectorEvents() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedLang = e.target.getAttribute('data-lang');
        changeLang(selectedLang);
      });
    });
  }

  try {
    // LIFFの初期化
    await liff.init({ liffId: APP_CONFIG.LIFF_ID });
    loading.classList.add('hidden');
    appContent.classList.remove('hidden');

    // 初期画面（TOP階層）の表示
    renderTopMenu();
  } catch (error) {
    loading.innerText = 'エラーが発生しました: ' + error.message;
  }

  // --- 画面描画関数 ---

  function renderTopMenu() {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectMenu')}</h2>
      <button class="btn btn-primary" id="btn-guest">${t('guest')}<br><small>${t('guestSub')}</small></button>
      <button class="btn btn-secondary" id="btn-nonguest">${t('nonGuest')}<br><small>${t('nonGuestSub')}</small></button>
    `;
    bindLangSelectorEvents();
    document.getElementById('btn-guest').addEventListener('click', renderGuestMenu);
    document.getElementById('btn-nonguest').addEventListener('click', renderNonGuestInquiry);
  }

  function renderGuestMenu() {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectGuestMenu')}</h2>
      <button class="btn btn-primary" id="btn-checkinout">${t('checkinout')}<br><small>${t('checkinoutSub')}</small></button>
      <button class="btn btn-primary" id="btn-survey">${t('survey')}<br><small>${t('surveySub')}</small></button>
      <button class="btn btn-primary" id="btn-contact">${t('contact')}<br><small>${t('contactSub')}</small></button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents();
    document.getElementById('btn-checkinout').addEventListener('click', () => renderFacilitySelect('checkinout'));
    document.getElementById('btn-survey').addEventListener('click', renderSurveyMenu);
    document.getElementById('btn-contact').addEventListener('click', () => renderContactCategory('guest'));
    document.getElementById('btn-back').addEventListener('click', renderTopMenu);
  }

  // 施設選択画面
  function renderFacilitySelect(nextAction) {
    let html = `
      ${renderLangSelectorHtml()}
      <h2>${t('selectFacility')}</h2>
    `;
    
    // 現在選択中の言語に応じた施設リストを安全に取得
    const currentFacilities = APP_CONFIG.facilities[currentLang] || APP_CONFIG.facilities['ja'];

    currentFacilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-facility" data-id="${facility.id}" data-name="${facility.name}">${facility.name}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">${t('back')}</button>`;
    appContent.innerHTML = html;

    bindLangSelectorEvents();
    document.querySelectorAll('.btn-facility').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fName = e.target.getAttribute('data-name');
        if (nextAction === 'checkinout') renderCheckInOutAction(fName);
      });
    });
    document.getElementById('btn-back').addEventListener('click', renderGuestMenu);
  }

  // チェックイン/アウト画面
  function renderCheckInOutAction(facilityName) {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>【${facilityName}】<br>${t('selectAction')}</h2>
      <input type="text" id="guest-name" class="input-field" placeholder="${t('namePlaceholder')}" required>
      <button class="btn btn-primary" id="btn-in">${t('checkInBtn')}</button>
      <button class="btn btn-primary" id="btn-out">${t('checkOutBtn')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents();
    
    const submitAction = async (actionText, actionLogText) => {
      const name = document.getElementById('guest-name').value;
      if (!name) return alert(t('nameAlert'));
      if (!confirm(`【${facilityName}】\n${name} 様\n「${actionText}」を送信しますか？`)) return;
      
      // GASへサイレント送信
      await sendToGAS("guest", facilityName, name, actionLogText, currentLang);
      alert(t('sendSuccess'));
      renderGuestMenu();
    };

    document.getElementById('btn-in').addEventListener('click', () => submitAction(t('checkInBtn'), '到着・チェックイン(Checked-In)'));
    document.getElementById('btn-out').addEventListener('click', () => submitAction(t('checkOutBtn'), '出発・チェックアウト(Checked-Out)'));
    document.getElementById('btn-back').addEventListener('click', () => renderFacilitySelect('checkinout'));
  }

  // 問い合わせカテゴリ選択（ゲスト用）
  function renderContactCategory(userType) {
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

    bindLangSelectorEvents();
    document.querySelectorAll('.btn-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        renderInquiryForm(userType, e.target.getAttribute('data-name'));
      });
    });
    document.getElementById('btn-back').addEventListener('click', userType === 'guest' ? renderGuestMenu : renderTopMenu);
  }

  // 非ゲスト用問い合わせ
  function renderNonGuestInquiry() {
    renderInquiryForm('non_guest', t('nonGuestInquiryName'));
  }

  // 問い合わせ入力フォーム
  function renderInquiryForm(userType, categoryName) {
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${categoryName}</h2>
      <input type="text" id="inquiry-name" class="input-field" placeholder="${t('yourName')}" required>
      <textarea id="inquiry-text" class="input-field" placeholder="${t('inquiryPlaceholder')}"></textarea>
      <button class="btn btn-primary" id="btn-send">${t('sendLine')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents();

    document.getElementById('btn-send').addEventListener('click', async () => {
      const name = document.getElementById('inquiry-name').value;
      const text = document.getElementById('inquiry-text').value;
      if (!name || !text) return alert(t('inquiryAlert'));
      
      const messageToChat = `【${categoryName}】\nお名前：${name} 様\n\n${text}`;
      if (!confirm("以下の内容をトークルームに送信します。\n\n" + messageToChat)) return;

      try {
        await liff.sendMessages([{ type: "text", text: messageToChat }]);
        alert(t('inquirySuccess'));
        liff.closeWindow();
      } catch (err) {
        alert('送信に失敗しました。' + err.message);
      }
    });

    document.getElementById('btn-back').addEventListener('click', () => {
      if(userType === 'guest') renderContactCategory('guest');
      else renderTopMenu();
    });
  }

  // アンケートメニュー
  function renderSurveyMenu() {
    const surveyUrl = APP_CONFIG.surveyUrls[currentLang] || APP_CONFIG.surveyUrls['ja'];
    appContent.innerHTML = `
      ${renderLangSelectorHtml()}
      <h2>${t('surveyPrompt')}</h2>
      <button class="btn btn-primary" onclick="window.location.href='${surveyUrl}'">${t('survey')}</button>
      <button class="btn btn-secondary" id="btn-back">${t('back')}</button>
    `;
    bindLangSelectorEvents();
    document.getElementById('btn-back').addEventListener('click', renderGuestMenu);
  }

  // --- GAS通信用ユーティリティ ---
  async function sendToGAS(type, facilityName, guestName, action, lang) {
    const idToken = liff.getIDToken();
    const payload = { idToken, type, facilityName, guestName, action, detail: lang };

    await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
});