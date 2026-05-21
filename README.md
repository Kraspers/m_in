# m_in

## Деплой на Cloudflare без изменения логики приложения

Этот проект уже работает как обычный Node.js сервер (`server.js`) и хранит данные в `data/db.json`.
Чтобы **не ломать текущую логику и интерфейсы**, самый безопасный путь через Cloudflare — оставить Node.js как есть и опубликовать его через **Cloudflare Tunnel**.

---

## Что уже подготовлено в репозитории

- Добавлен шаблон конфигурации туннеля: `cloudflared/config.yml.example`.
- Приложение не изменено: маршруты, API, UI и структура остаются прежними.

---

## 1) Что нажимать в Cloudflare (пошагово)

1. Зайди в Cloudflare Dashboard.
2. Слева нажми **Zero Trust**.
3. Открой **Networks → Tunnels**.
4. Нажми **Create a tunnel**.
5. Выбери **Cloudflared**.
6. В поле имени введи, например: `m-in-prod`.
7. Нажми **Save tunnel**.
8. На шаге установки скопируй команду входа (`cloudflared tunnel login`) и выполни на сервере (ниже команда есть).
9. После этого Cloudflare покажет token/credentials для туннеля.
10. В разделе **Public Hostname** нажми **Add a public hostname**:
    - **Subdomain**: `app`
    - **Domain**: твой домен (например `example.com`)
    - **Type**: `HTTP`
    - **URL**: `localhost:3000`
11. Нажми **Save hostname**.
12. Перейди в **DNS** и убедись, что запись создана автоматически (`app.example.com`, proxied).

Готово: Cloudflare начнет проксировать трафик на твой локальный Node.js процесс через защищенный туннель.

---

## 2) Что выполнить на сервере

> Ниже команды для Ubuntu/Debian Linux.

### 2.1 Установка зависимостей

```bash
sudo apt update
sudo apt install -y curl gnupg
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared nodejs npm
```

### 2.2 Запуск приложения

```bash
npm install --omit=dev
PORT=3000 npm start
```

### 2.3 Авторизация cloudflared

```bash
cloudflared tunnel login
```

Откроется ссылка — авторизуйся в Cloudflare и выбери нужный домен.

### 2.4 Создание/привязка туннеля

Если туннель уже создан в UI, просто получи его данные:

```bash
cloudflared tunnel list
```

Скопируй `Tunnel ID` и credentials-файл в `~/.cloudflared/`.

### 2.5 Конфиг туннеля

1. Скопируй шаблон:

```bash
cp cloudflared/config.yml.example ~/.cloudflared/config.yml
```

2. Открой файл и замени:
   - `YOUR_TUNNEL_UUID`
   - `YOUR_HOSTNAME` (например `app.example.com`)

### 2.6 Запуск туннеля

```bash
cloudflared tunnel run
```

Проверь в браузере: `https://YOUR_HOSTNAME`.

---

## 3) Рекомендуемый прод-запуск (systemd)

### Приложение

Создай `/etc/systemd/system/m-in.service`:

```ini
[Unit]
Description=m_in Node App
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/m_in
ExecStart=/usr/bin/npm start
Environment=PORT=3000
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

### Tunnel

Создай `/etc/systemd/system/cloudflared-m-in.service`:

```ini
[Unit]
Description=Cloudflare Tunnel for m_in
After=network.target m-in.service

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared --config /home/YOUR_USER/.cloudflared/config.yml tunnel run
Restart=always
RestartSec=5
User=YOUR_USER

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now m-in
sudo systemctl enable --now cloudflared-m-in
sudo systemctl status m-in
sudo systemctl status cloudflared-m-in
```

---

## 4) Важные замечания

- Не меняй `server.js`, если хочешь сохранить текущую логику 1-в-1.
- Данные хранятся локально в `data/db.json`, поэтому обязательно делай бэкап.
- Для стабильности используй отдельный VPS/сервер (24/7), а не локальный ноутбук.

