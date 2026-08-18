// main.js
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const appContent = document.getElementById('app-content');

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
      <h2>メニューを選択してください</h2>
      <button class="btn btn-primary" id="btn-guest">宿泊(予定)者<br><small>(Guests with reservation)</small></button>
      <button class="btn btn-secondary" id="btn-nonguest">その他のお客様<br><small>(Non-Guests)</small></button>
    `;
    document.getElementById('btn-guest').addEventListener('click', renderGuestMenu);
    document.getElementById('btn-nonguest').addEventListener('click', renderNonGuestInquiry);
  }

  function renderGuestMenu() {
    appContent.innerHTML = `
      <h2>ご希望のメニューをご選択ください</h2>
      <button class="btn btn-primary" id="btn-checkinout">チェックイン・チェックアウト<br><small>(Check-In/Out)</small></button>
      <button class="btn btn-primary" id="btn-survey">アンケート回答<br><small>(Guest Feedback)</small></button>
      <button class="btn btn-primary" id="btn-contact">その他/担当者へ連絡<br><small>(Other/Contact)</small></button>
      <button class="btn btn-secondary" id="btn-back">戻る</button>
    `;
    document.getElementById('btn-checkinout').addEventListener('click', () => renderFacilitySelect('checkinout'));
    document.getElementById('btn-survey').addEventListener('click', renderSurveyMenu);
    document.getElementById('btn-contact').addEventListener('click', () => renderContactCategory('guest'));
    document.getElementById('btn-back').addEventListener('click', renderTopMenu);
  }

  // 施設選択画面
  function renderFacilitySelect(nextAction) {
    let html = `<h2>ご滞在の施設を選択してください</h2>`;
    APP_CONFIG.facilities.forEach(facility => {
      html += `<button class="btn btn-primary btn-facility" data-id="${facility.id}" data-name="${facility.name}">${facility.name}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">戻る</button>`;
    appContent.innerHTML = html;

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
      <h2>【${facilityName}】<br>アクションを選択してください</h2>
      <input type="text" id="guest-name" class="input-field" placeholder="代表者名 (例: 山田太郎)" required>
      <button class="btn btn-primary" id="btn-in">到着・チェックイン</button>
      <button class="btn btn-primary" id="btn-out">出発・チェックアウト</button>
      <button class="btn btn-secondary" id="btn-back">戻る</button>
    `;
    
    const submitAction = async (actionText) => {
      const name = document.getElementById('guest-name').value;
      if (!name) return alert('お名前を入力してください');
      if (!confirm(`【${facilityName}】\n${name} 様\n「${actionText}」を送信しますか？`)) return;
      
      // GASへサイレント送信（トーク画面は汚さない）
      await sendToGAS("guest", facilityName, name, actionText, "");
      alert('送信が完了しました。');
      renderGuestMenu();
    };

    document.getElementById('btn-in').addEventListener('click', () => submitAction('到着・チェックイン(Checked-In)'));
    document.getElementById('btn-out').addEventListener('click', () => submitAction('出発・チェックアウト(Checked-Out)'));
    document.getElementById('btn-back').addEventListener('click', () => renderFacilitySelect('checkinout'));
  }

  // 問い合わせカテゴリ選択（ゲスト用）
  function renderContactCategory(userType) {
    let html = `<h2>お問い合わせ内容を選択してください</h2>`;
    APP_CONFIG.contactCategories.forEach(cat => {
      html += `<button class="btn btn-primary btn-cat" data-name="${cat.name}">${cat.name}</button>`;
    });
    html += `<button class="btn btn-secondary" id="btn-back">戻る</button>`;
    appContent.innerHTML = html;

    document.querySelectorAll('.btn-cat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        renderInquiryForm(userType, e.target.getAttribute('data-name'));
      });
    });
    document.getElementById('btn-back').addEventListener('click', userType === 'guest' ? renderGuestMenu : renderTopMenu);
  }

  // 非ゲスト用問い合わせ
  function renderNonGuestInquiry() {
    renderInquiryForm('non_guest', '一般のお問い合わせ(Inquiry)');
  }

  // 問い合わせ入力フォーム
  function renderInquiryForm(userType, categoryName) {
    appContent.innerHTML = `
      <h2>${categoryName}</h2>
      <input type="text" id="inquiry-name" class="input-field" placeholder="お名前 (Your Name)" required>
      <textarea id="inquiry-text" class="input-field" placeholder="ご質問内容を入力してください..."></textarea>
      <button class="btn btn-primary" id="btn-send">LINEで送信する</button>
      <button class="btn btn-secondary" id="btn-back">戻る</button>
    `;

    document.getElementById('btn-send').addEventListener('click', async () => {
      const name = document.getElementById('inquiry-name').value;
      const text = document.getElementById('inquiry-text').value;
      if (!name || !text) return alert('お名前と内容を入力してください');
      
      const messageToChat = `【${categoryName}】\nお名前：${name} 様\n\n${text}`;
      if (!confirm("以下の内容をトークルームに送信します。\n\n" + messageToChat)) return;

      // 公式アカウントのトーク画面に強制発言させる（Push通知枠を使わず、直接応対可能にする）
      try {
        await liff.sendMessages([{ type: "text", text: messageToChat }]);
        alert('送信しました。スタッフからの返信をお待ちください。');
        liff.closeWindow(); // LIFFを閉じてチャット画面を見せる
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
    appContent.innerHTML = `
      <h2>アンケートにご協力ください</h2>
      <button class="btn btn-primary" onclick="window.location.href='${APP_CONFIG.surveyUrls.ja}'">日本語 (Japanese)</button>
      <button class="btn btn-primary" onclick="window.location.href='${APP_CONFIG.surveyUrls.en}'">英語 (English)</button>
      <button class="btn btn-primary" onclick="window.location.href='${APP_CONFIG.surveyUrls.zh}'">繁体・簡体中文 (Mandarin)</button>
      <button class="btn btn-secondary" id="btn-back">戻る</button>
    `;
    document.getElementById('btn-back').addEventListener('click', renderGuestMenu);
  }

  // --- GAS通信用ユーティリティ ---
  async function sendToGAS(type, facilityName, guestName, action, detail) {
    const idToken = liff.getIDToken(); // 安全な認証トークンを取得
    const payload = { idToken, type, facilityName, guestName, action, detail };

    await fetch(APP_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
});