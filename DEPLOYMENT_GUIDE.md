# 部署設定指南

## 1. MongoDB Atlas 設定 (免費)

1. 前往 [MongoDB Atlas](https://www.mongodb.com/atlas/database)
2. 註冊免費帳號
3. 創建新專案 → 創建新集群 (選擇免費層級 M0)
4. 設定資料庫使用者 (記下使用者名稱和密碼)
5. 設定網路存取 (加入 0.0.0.0/0 允許所有IP)
6. 複製連接字串，格式如下：
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
   ```

## 2. Hugging Face API 設定 (免費)

1. 前往 [Hugging Face](https://huggingface.co/)
2. 註冊帳號
3. 前往 [API Tokens](https://huggingface.co/settings/tokens)
4. 創建新的API Token
5. 複製API Key

## 3. Vercel 部署步驟

1. 推送程式碼到GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/persona-chatbot.git
   git push -u origin main
   ```

2. 前往 [Vercel](https://vercel.com)
3. 連結GitHub帳號並導入專案
4. 設定環境變數:
   - `MONGODB_URI`: MongoDB連接字串
   - `MONGODB_DB`: 資料庫名稱 (例如: persona_chatbot)
   - `HUGGINGFACE_API_KEY`: Hugging Face API金鑰
   - `HF_CHAT_MODEL`: microsoft/DialoGPT-medium (或其他免費模型)
   - `EMBEDDING_MODEL`: sentence-transformers/all-MiniLM-L6-v2
   - `EMBEDDING_DIM`: 384

## 4. 推薦的免費Hugging Face模型

- `microsoft/DialoGPT-medium` - 對話生成
- `facebook/blenderbot-400M-distill` - 聊天機器人
- `microsoft/DialoGPT-small` - 更小的模型，回應更快

## 5. 部署後測試

部署完成後，訪問你的Vercel網址測試功能。