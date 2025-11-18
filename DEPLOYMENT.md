# Persona Chatbot - 部署文檔

## 快速部署

### 一鍵部署到 EC2

```bash
./deploy.sh
```

這個腳本會自動執行以下步驟:
1. 構建 AMD64 平台的 Docker image
2. 保存 image 為 tar 檔案
3. 傳送到 EC2 伺服器
4. 在 EC2 上載入並啟動容器
5. 驗證部署是否成功
6. 清理本地臨時檔案

### 應用管理

使用 `manage.sh` 腳本管理應用:

```bash
# 查看即時日誌
./manage.sh logs

# 查看容器狀態
./manage.sh status

# 重啟應用
./manage.sh restart

# 停止應用
./manage.sh stop

# 啟動應用
./manage.sh start

# 檢查健康狀態
./manage.sh health

# SSH 連接到 EC2
./manage.sh ssh

# 進入容器 shell
./manage.sh shell
```

## 訪問應用

- **HTTPS:** https://43.212.238.36
- **HTTP:** http://43.212.238.36 (自動重導向到 HTTPS)

## 環境變數

環境變數檔案位於 EC2 上的 `~/.env.production`

若需更新環境變數:
1. SSH 到 EC2: `ssh bible-persona`
2. 編輯檔案: `nano ~/.env.production`
3. 重啟容器: `docker compose restart`

## 架構說明

```
[User] --HTTPS--> [Nginx:443] --HTTP--> [Docker Container:3000] ---> [Next.js App]
                       ↑
                  SSL (自簽名憑證)
```

## 手動部署步驟

如果需要手動部署:

```bash
# 1. 構建 image
docker build --platform linux/amd64 -t persona-chatbot:latest .

# 2. 保存 image
docker save -o persona-chatbot-amd64.tar persona-chatbot:latest

# 3. 傳送到 EC2
rsync -avz persona-chatbot-amd64.tar bible-persona:~/

# 4. SSH 到 EC2
ssh bible-persona

# 5. 載入並啟動
docker load -i persona-chatbot-amd64.tar
docker compose down
docker compose up -d

# 6. 查看日誌
docker compose logs -f
```

## 故障排除

### 查看容器日誌
```bash
ssh bible-persona "docker compose logs --tail=100"
```

### 檢查容器狀態
```bash
ssh bible-persona "docker compose ps"
```

### 檢查 Nginx 狀態
```bash
ssh bible-persona "sudo systemctl status nginx"
```

### 重啟 Nginx
```bash
ssh bible-persona "sudo systemctl restart nginx"
```

### 測試健康檢查
```bash
ssh bible-persona "curl http://localhost:3000/api/health"
```

## 更新應用

有程式碼更新時,只需執行:

```bash
./deploy.sh
```

腳本會自動構建新版本並部署到 EC2。

## 備份與回滾

### 保存當前版本
```bash
ssh bible-persona "docker save persona-chatbot:latest -o backup-$(date +%Y%m%d).tar"
```

### 回滾到舊版本
```bash
ssh bible-persona "docker load -i backup-YYYYMMDD.tar && docker compose up -d"
```

## SSL 憑證

目前使用自簽名憑證,位於:
- 憑證: `/etc/nginx/ssl/nginx-selfsigned.crt`
- 私鑰: `/etc/nginx/ssl/nginx-selfsigned.key`
- 有效期: 365 天

若要使用正式憑證(如 Let's Encrypt),需要:
1. 設定域名指向 EC2 IP
2. 使用 certbot 申請憑證
3. 更新 Nginx 設定

## Security Group 設定

確保 EC2 Security Group 有以下 Inbound rules:
- SSH: Port 22 (TCP)
- HTTP: Port 80 (TCP)
- HTTPS: Port 443 (TCP)
