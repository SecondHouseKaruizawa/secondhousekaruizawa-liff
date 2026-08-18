// config.js
const APP_CONFIG = {
  // ▼ 連携キーとURL
  "LIFF_ID": "2011150909-rbXdgDNt", 
  "GAS_URL": "https://script.google.com/macros/s/AKfycbwMfBZIxZFhA8KFYR3JF044xyGi0cJaEwojsCYkviXoUFpL3IVf_XfuT9NYcbs0HgwtQg/exec", 

  // ▼ 施設一覧マスタ（言語別に設定）
  "facilities": {
    "ja": [
      { "id": "sc", "name": "sch-sch" },
      { "id": "Hp", "name": "ホッポッタ" },
      { "id": "ku", "name": "kukka" },
      { "id": "LU", "name": "LUONTO" }
    ],
    "en": [
      { "id": "sc", "name": "sch-sch" },
      { "id": "Hp", "name": "Hoppotta" },
      { "id": "ku", "name": "kukka" },
      { "id": "LU", "name": "LUONTO" }
    ],
    "zh-TW": [
      { "id": "sc", "name": "sch-sch" },
      { "id": "Hp", "name": "Hoppotta" },
      { "id": "ku", "name": "kukka" },
      { "id": "LU", "name": "LUONTO" }
    ],
    "zh-CN": [
      { "id": "sc", "name": "sch-sch" },
      { "id": "Hp", "name": "Hoppotta" },
      { "id": "ku", "name": "kukka" },
      { "id": "LU", "name": "LUONTO" }
    ]
  },

  // ▼ 言語別アンケートURLマスタ
  "surveyUrls": {
    "ja": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNFlQN0QyQlQxOE5QOVNETkpXM0dYMjdOVi4u",
    "en": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNFlQN0QyQlQxOE5QOVNETkpXM0dYMjdOVi4u",
    "zh-TW": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNlVHWDFIUlZFQVFZWTdLMDk2NUlVQlFSSi4u",
    "zh-CN": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNlVHWDFIUlZFQVFZWTdLMDk2NUlVQlFSSi4u"
  },

  // ▼ 問い合わせカテゴリマスタ
  "contactCategories": [
    { "id": "equip", "key": "equip" },
    { "id": "stay", "key": "stay" },
    { "id": "others", "key": "others" }
  ],

  // ▼ 4言語対応の辞書データ
  "translations": {
    "ja": {
      "loading": "システムを読み込んでいます...",
      "selectMenu": "メニューを選択してください",
      "guest": "宿泊(予定)者",
      "guestSub": "(Guests with reservation)",
      "nonGuest": "その他のお客様",
      "nonGuestSub": "(Non-Guests)",
      "selectGuestMenu": "ご希望のメニューをご選択ください",
      "checkinout": "チェックイン・チェックアウト",
      "checkinoutSub": "(Check-In/Out)",
      "survey": "アンケート回答",
      "surveySub": "(Guest Feedback)",
      "contact": "その他/担当者へ連絡",
      "contactSub": "(Other/Contact)",
      "back": "戻る",
      "selectFacility": "ご滞在の施設を選択してください",
      "selectAction": "アクションを選択してください",
      "namePlaceholder": "代表者名 (例: 山田太郎)",
      "checkInBtn": "到着・チェックイン",
      "checkOutBtn": "出発・チェックアウト",
      "sendSuccess": "送信が完了しました。",
      "nameAlert": "お名前を入力してください",
      "selectContactCat": "お問い合わせ内容を選択してください",
      "yourName": "お名前 (Your Name)",
      "inquiryPlaceholder": "ご質問内容を入力してください...",
      "sendLine": "LINEで送信する",
      "inquirySuccess": "送信しました。スタッフからの返信をお待ちください。",
      "inquiryAlert": "お名前と内容を入力してください",
      "surveyPrompt": "アンケートにご協力ください",
      "nonGuestInquiryName": "一般のお問い合わせ(Inquiry)",
      "cat_equip": "施設・備品について",
      "cat_stay": "滞在について",
      "cat_others": "その他"
    },
    "en": {
      "loading": "Loading system...",
      "selectMenu": "Please select a menu",
      "guest": "Guests with reservation",
      "guestSub": "",
      "nonGuest": "Non-Guests",
      "nonGuestSub": "",
      "selectGuestMenu": "Please select your desired menu",
      "checkinout": "Check-In / Check-Out",
      "checkinoutSub": "",
      "survey": "Guest Feedback",
      "surveySub": "",
      "contact": "Other / Contact Staff",
      "contactSub": "",
      "back": "Back",
      "selectFacility": "Please select your facility",
      "selectAction": "Please select an action",
      "namePlaceholder": "Representative Name (e.g., Taro Yamada)",
      "checkInBtn": "Checked-In",
      "checkOutBtn": "Checked-Out",
      "sendSuccess": "Transmission completed.",
      "nameAlert": "Please enter your name.",
      "selectContactCat": "Please select an inquiry category",
      "yourName": "Your Name",
      "inquiryPlaceholder": "Please enter your question...",
      "sendLine": "Send via LINE",
      "inquirySuccess": "Sent. Please wait for a reply from our staff.",
      "inquiryAlert": "Please enter your name and message.",
      "surveyPrompt": "Please cooperate with our survey",
      "nonGuestInquiryName": "General Inquiry",
      "cat_equip": "About the facilities/equipments",
      "cat_stay": "About your stay",
      "cat_others": "Others"
    },
    "zh-TW": {
      "loading": "系統載入中...",
      "selectMenu": "請選擇選單",
      "guest": "已預訂住宿貴賓",
      "guestSub": "(Guests with reservation)",
      "nonGuest": "一般訪客 / 其他訪客",
      "nonGuestSub": "(Non-Guests)",
      "selectGuestMenu": "請選擇您需要的服務項目",
      "checkinout": "入住登記・退房手續",
      "checkinoutSub": "(Check-In/Out)",
      "survey": "填寫問卷",
      "surveySub": "(Guest Feedback)",
      "contact": "其他事項 / 聯絡專員",
      "contactSub": "(Other/Contact)",
      "back": "返回上一頁",
      "selectFacility": "請選擇您入住的館別設施",
      "selectAction": "請選擇您要辦理的項目",
      "namePlaceholder": "代表人姓名 (例: 王小明)",
      "checkInBtn": "抵達・辦理入住",
      "checkOutBtn": "離開・辦理退房",
      "sendSuccess": "資料已成功送出。",
      "nameAlert": "請輸入您的姓名。",
      "selectContactCat": "請選擇您的諮詢類別",
      "yourName": "您的姓名 (Your Name)",
      "inquiryPlaceholder": "請在此輸入您的問題或需求...",
      "sendLine": "透過 LINE 送出",
      "inquirySuccess": "已成功送出，請靜候服務人員回覆。",
      "inquiryAlert": "請完整填寫姓名與內容。",
      "surveyPrompt": "誠摯邀請您填寫意見回饋表單",
      "nonGuestInquiryName": "一般諮詢(Inquiry)",
      "cat_equip": "關於設施與備品",
      "cat_stay": "關於住宿體驗",
      "cat_others": "其他事項"
    },
    "zh-CN": {
      "loading": "系统加载中...",
      "selectMenu": "请选择菜单",
      "guest": "预订住宿宾客",
      "guestSub": "(Guests with reservation)",
      "nonGuest": "其他访客",
      "nonGuestSub": "(Non-Guests)",
      "selectGuestMenu": "请选择您需要的服务项目",
      "checkinout": "入住登记・退房手续",
      "checkinoutSub": "(Check-In/Out)",
      "survey": "填写问卷",
      "surveySub": "(Guest Feedback)",
      "contact": "其他事项 / 联系专员",
      "contactSub": "(Other/Contact)",
      "back": "返回",
      "selectFacility": "请选择您入住的设施",
      "selectAction": "请选择您要办理的项目",
      "namePlaceholder": "代表者姓名 (例: 王小明)",
      "checkInBtn": "抵达・办理入住",
      "checkOutBtn": "离开・办理退房",
      "sendSuccess": "发送成功。",
      "nameAlert": "请输入您的姓名。",
      "selectContactCat": "请选择您的咨询类别",
      "yourName": "您的姓名 (Your Name)",
      "inquiryPlaceholder": "请输入您的问题...",
      "sendLine": "通过 LINE 发送",
      "inquirySuccess": "已发送，请等待工作人员回复。",
      "inquiryAlert": "请输入姓名和内容。",
      "surveyPrompt": "请配合填写问卷",
      "nonGuestInquiryName": "一般咨询(Inquiry)",
      "cat_equip": "关于设施与备品",
      "cat_stay": "关于住宿",
      "cat_others": "其他"
    }
  }
};