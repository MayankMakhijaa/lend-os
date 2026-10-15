# Deploying LoanOS on Hostinger

LoanOS is a Next.js 15 (Node.js) app with a MySQL database. It runs on either:

- **Hostinger Node.js Web Apps** (Business / Cloud hosting plans). This is the easiest option and needs no server admin.
- **A Hostinger VPS** (KVM plans). This gives you full control and suits many customers at scale.

Shared "Single/Premium" PHP-only plans **cannot** run it, because it needs Node.js.

---

## 1. Create the MySQL database (both options)

1. In hPanel, go to **Databases → MySQL Databases** and create a database and a user. Note the database name, user and password.
2. Your connection string is:
   `mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME`
   - URL-encode special characters in the password, e.g. `@` → `%40` and `#` → `%23`.
   - On a VPS with MySQL elsewhere, use that host instead of `localhost`.

The tables are created automatically the first time the app starts, because `npm start` runs `prisma migrate deploy`.

## 2. Environment variables (both options)

| Variable | Value |
|---|---|
| `DATABASE_URL` | the MySQL URL from step 1 |
| `SESSION_SECRET` | a long random string (64+ characters) |
| `FILE_ENCRYPTION_KEY` | exactly 64 hex characters. Generate it with `openssl rand -hex 32`, or with any online "random hex 32 bytes" tool. **Never change it after go-live**, or uploaded files can't be decrypted. |
| `UPLOAD_DIR` | an absolute folder **outside** the app folder, e.g. `/home/<your-user>/loanos-storage`, so redeploys never delete documents |
| `APP_URL` | your public URL, e.g. `https://app.yourdomain.com` |
| `APP_NAME` | the product name shown in the UI (default `LoanOS`) |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | your owner login for `/platform` (8+ characters). It is created on your first sign-in. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional. Hostinger email works: `smtp.hostinger.com`, port `465`. |
| `WHATSAPP_WEBHOOK_URL`, `WHATSAPP_API_TOKEN` | optional, for your WhatsApp Business provider |
| `SESSION_TIMEOUT_MINUTES` | optional, default `30` |

---

## Option A: Hostinger Node.js Web App

1. In hPanel, add a website and choose **Node.js Apps**. Then either:
   - **import from GitHub** (connect GitHub and pick `loan-os`, branch `main`), or
   - upload the repository as a zip.
2. Use these build settings:
   - Framework: **Next.js**
   - Node version: **20.x or 22.x**
   - Install: `npm install`
   - Build command: `npm run build`
   - Start command: `npm start`
3. Add all the environment variables from step 2 in the app's **Environment variables** section.
4. Deploy. On the first start the app creates the database tables.
5. Open `https://your-domain/platform/login` and sign in with `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`. Then you can:
   - click **Load demo workspace** for a ready-made demo (workspace `provik`, password `Demo@1234`), or
   - create a real workspace for each customer.
6. Connect your domain and enable SSL in hPanel. **HTTPS is required**, because login cookies are marked secure in production.

Redeploys from GitHub pick up new code. Database migrations run automatically on start.

## Option B: Hostinger VPS (Ubuntu)

```bash
# as root on the VPS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs mysql-server nginx
npm i -g pm2
mysql -e "CREATE DATABASE loanos; CREATE USER 'loanos'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD'; GRANT ALL ON loanos.* TO 'loanos'@'localhost';"

git clone https://github.com/MayankMakhijaa/loan-os.git /var/www/loan-os && cd /var/www/loan-os
cp .env.example .env && nano .env        # fill in the variables from step 2
mkdir -p /var/lib/loanos-storage          # and set UPLOAD_DIR=/var/lib/loanos-storage
npm ci && npm run build
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

nginx site (`/etc/nginx/sites-available/loanos`), then `ln -s` it into `sites-enabled` and run `nginx -s reload`:

```nginx
server {
  server_name app.yourdomain.com;
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

SSL: `apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d app.yourdomain.com`

Update later with:

```bash
cd /var/www/loan-os && git pull && npm ci && npm run build && pm2 restart loan-os
```

---

## Backups

Back up **both** of these:

- the MySQL database (hPanel → Databases → Backups, or `mysqldump`)
- the `UPLOAD_DIR` folder

Keep `FILE_ENCRYPTION_KEY` somewhere safe. Without it, the backed-up files are unreadable.
