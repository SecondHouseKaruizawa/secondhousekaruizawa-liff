// config.js
const APP_CONFIG = {
  // ▼ 連携キーとURL（ご自身のものに書き換えてください）
  "LIFF_ID": "2011150909-rbXdgDNt", 
  "GAS_URL": "https://script.google.com/macros/s/AKfycbwMfBZIxZFhA8KFYR3JF044xyGi0cJaEwojsCYkviXoUFpL3IVf_XfuT9NYcbs0HgwtQg/exec", 

  // ▼ 施設一覧マスタ
  "facilities": [
    { "id": "sc", "name": "sch-sch" },
    { "id": "Hp", "name": "Hoppotta" },
    { "id": "ku", "name": "kukka" },
    { "id": "LU", "name": "LUONTO" }
  ],

  // ▼ 言語別アンケートURLマスタ
  "surveyUrls": {
    "ja": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNFlQN0QyQlQxOE5QOVNETkpXM0dYMjdOVi4u",
    "en": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNFlQN0QyQlQxOE5QOVNETkpXM0dYMjdOVi4u",
    "zh": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAO__dEP6D5UNlVHWDFIUlZFQVFZWTdLMDk2NUlVQlFSSi4u"
  },

  // ▼ 問い合わせカテゴリマスタ
  "contactCategories": [
    { "id": "equip", "name": "施設・備品について(About the facilities/equipments)" },
    { "id": "stay", "name": "滞在について(About your stay)" },
    { "id": "others", "name": "その他(Others)" }
  ]
};