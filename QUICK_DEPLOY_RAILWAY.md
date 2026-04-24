# 🚀 Quick Deploy to Railway - 5 Minutes

## Step 1: Sign Up to Railway
1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway

## Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose: `M-SAAD-BIN-MAZHAR/Job_task`
4. Railway will start building automatically

## Step 3: Add Environment Variables
Click on your service → "Variables" tab → Add these:

### Required Variables (Copy & Paste):
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_PATH=/app/data/timeoff.db
JWT_SECRET=CHANGE_THIS_TO_RANDOM_STRING_32_CHARS
JWT_EXPIRATION=1h
HCM_API_URL=http://localhost:4000
HCM_API_KEY=test-api-key
HCM_TIMEOUT=5000
HCM_WEBHOOK_SECRET=CHANGE_THIS_TO_RANDOM_STRING_32_CHARS
MAX_RETRIES=3
RETRY_DELAY=1000
```

### ⚠️ IMPORTANT: Change These Secrets!
Generate random secrets:
```bash
# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Replace:
- `JWT_SECRET` with generated value
- `HCM_WEBHOOK_SECRET` with generated value

## Step 4: Deploy
1. Click "Deploy"
2. Wait 2-5 minutes
3. You'll get a URL like: `https://job-task-production.up.railway.app`

## Step 5: Test
```bash
# Replace with your Railway URL
curl https://your-app.up.railway.app/api/v1/health
```

Expected: `{"status":"ok",...}`

## ✅ Done!

Your API is live at:
```
https://your-app.up.railway.app/api/v1
```

### Endpoints:
- Health: `/api/v1/health`
- Requests: `/api/v1/requests`
- Balances: `/api/v1/balances/:employeeId`

---

## 🔄 Auto-Deploy on Git Push

Every time you push to GitHub, Railway will automatically:
1. Pull latest code
2. Build
3. Deploy

```bash
git add .
git commit -m "Update"
git push origin main
# Railway deploys automatically!
```

---

## 📊 Monitor Your App

Railway Dashboard → Your Service:
- **Logs**: Real-time application logs
- **Metrics**: CPU, Memory, Network
- **Deployments**: History of all deployments

---

## 🆘 Troubleshooting

### App not starting?
1. Check logs in Railway dashboard
2. Verify all environment variables are set
3. Ensure `JWT_SECRET` and `HCM_WEBHOOK_SECRET` are set

### 502 Error?
- App might be crashing
- Check logs for errors
- Verify `PORT=3000` is set

### Database errors?
- Using SQLite by default
- For production, add PostgreSQL database in Railway

---

## 💡 Pro Tips

1. **Add PostgreSQL** (Recommended for production):
   - Railway Dashboard → "New" → "Database" → "PostgreSQL"
   - Railway auto-provides `DATABASE_URL`

2. **Custom Domain**:
   - Settings → Domains → Add custom domain

3. **View Logs**:
   - Deployments → Latest → View Logs

4. **Rollback**:
   - Deployments → Previous version → Redeploy

---

## 📚 Full Guide

For detailed instructions, see: [RAILWAY_DEPLOYMENT_GUIDE.md](RAILWAY_DEPLOYMENT_GUIDE.md)

---

**That's it! Your app is deployed! 🎉**
