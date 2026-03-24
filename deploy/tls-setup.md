# TLS Reverse Proxy Setup for api.wethepeopleforus.com

The API currently runs over plain HTTP on port 8006. Traffic between
Vercel's edge network and the GCP VM is unencrypted. This guide sets up
a TLS reverse proxy using **Caddy** (recommended) or **nginx**.

## Option A: Caddy (Recommended)

Caddy handles TLS certificates automatically via Let's Encrypt.

### 1. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 2. Create Caddyfile

```bash
sudo tee /etc/caddy/Caddyfile <<'EOF'
api.wethepeopleforus.com {
    reverse_proxy localhost:8006
}
EOF
```

### 3. Open port 443 on GCP firewall

```bash
gcloud compute firewall-rules create allow-https \
    --allow tcp:443 \
    --target-tags wethepeople \
    --description "Allow HTTPS traffic"
```

### 4. Start Caddy

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

Caddy will automatically obtain and renew a Let's Encrypt certificate
for `api.wethepeopleforus.com`.

### 5. Verify

```bash
curl -I https://api.wethepeopleforus.com/health
```

## Option B: nginx + certbot

### 1. Install

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. nginx config

```bash
sudo tee /etc/nginx/sites-available/wtp-api <<'EOF'
server {
    listen 80;
    server_name api.wethepeopleforus.com;

    location / {
        proxy_pass http://127.0.0.1:8006;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/wtp-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Obtain certificate

```bash
sudo certbot --nginx -d api.wethepeopleforus.com
```

### 4. Auto-renewal

certbot installs a systemd timer by default. Verify:

```bash
sudo systemctl list-timers | grep certbot
```

## After TLS is running

Update `frontend/vercel.json` to use HTTPS:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://api.wethepeopleforus.com:443/:path*" }
  ]
}
```

**Do not change vercel.json until the TLS proxy is confirmed working.**
The API port (8006) can then optionally be restricted to localhost-only
access via GCP firewall rules, since all external traffic will flow
through the TLS proxy on port 443.
