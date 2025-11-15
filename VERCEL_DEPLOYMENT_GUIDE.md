# 🚀 Vercel 部署完整指南

## ✅ 已完成步驟
- ✅ 程式碼推送到 GitHub: https://github.com/leonrlr4/persona-chatbod
- ✅ Vercel 配置文件 (`vercel.json`) 已創建
- ✅ Hugging Face API 整合完成

## 🔧 步驟 1: 設定第三方服務

### 1. MongoDB Atlas (免費)
1. 前往 [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. 註冊帳號 → 創建免費集群 (M0)
3. 創建資料庫使用者 (記下使用者名稱/密碼)
4. 網路設定 → 加入 IP: `0.0.0.0/0`
5. 複製連接字串格式：
   ```
   mongodb+srv://使用者名稱:密碼@集群.mongodb.net/資料庫名稱?retryWrites=true&w=majority
   ```

### 2. Hugging Face API (免費)
1. 前往 [Hugging Face](https://huggingface.co/)
2. 註冊 → 前往 [API Tokens](https://huggingface.co/settings/tokens)
3. 創建新 Token → 複製 API Key

## 🚀 步驟 2: Vercel 部署

### 方法一：使用 Vercel Dashboard (推薦)
1. 登入 [Vercel](https://vercel.com)
2. 點擊 "New Project"
3. 連結 GitHub 帳號 → 選擇 `leonrlr4/persona-chatbod`
4. 設定環境變數：

```bash
# 必填項目
MONGODB_URI=mongodb+srv://使用者名稱:密碼@集群.mongodb.net/資料庫名稱?retryWrites=true&w=majority
MONGODB_DB=persona_chatbot
HUGGINGFACE_API_KEY=你的_hf_api_key
HF_CHAT_MODEL=microsoft/DialoGPT-medium

# 選填項目 (使用預設值)
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIM=384
```

5. 點擊 "Deploy" 等待完成！

### 方法二：使用 Vercel CLI
```bash
npm i -g vercel
vercel --prod
```

## 🎯 推薦免費模型

### 對話模型
- `microsoft/DialoGPT-medium` (預設，平衡效能)
- `microsoft/DialoGPT-small` (更快回應)
- `facebook/blenderbot-400M-distill` (多功能)

### 嵌入模型 (用於RAG)
- `sentence-transformers/all-MiniLM-L6-v2` (預設)
- `sentence-transformers/all-MiniLM-L12-v2` (更高品質)

## 🔍 部署後測試

1. 訪問 Vercel 提供的網址
2. 創建人物角色 (Persona)
3. 開始對話測試
4. 檢查 Vercel Functions 日誌確認正常運作

## ⚠️ 注意事項

- **免費層級限制**：
  - MongoDB Atlas: 512MB 儲存空間
  - Hugging Face: 每小時 30 次 API 請求
  - Vercel: 每月 500 GB-hours

- **如果遇到 API 限制**：考慮升級到付費方案或使用多個 API Key

- **資料庫安全**：生產環境建議限制 IP 存取，不要開放 `0.0.0.0/0`

## 🆘 常見問題

**Q: API 請求失敗？**
A: 檢查 Hugging Face API Token 是否正確，模型名稱是否有效

**Q: 資料庫連接失敗？**
A: 確認 MongoDB Atlas 的網路設定，IP 白名單是否包含 Vercel IP

**Q: 部署失敗？**
A: 檢查 Vercel 建置日誌，確認所有環境變數都已設定

---

🎉 **準備就緒！** 按照以上步驟即可完成部署。需要幫助隨時告訴我！