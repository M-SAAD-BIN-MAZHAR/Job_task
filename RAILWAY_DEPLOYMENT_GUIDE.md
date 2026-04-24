# Railway Deployment Guide
## Time-Off Microservice

This guide will help you deploy the Time-Off Microservice to Railway.

---

## 🚀 Quick Deployment Steps

### 1. Prerequisites

- GitHub account (already done ✅)
- Railway account (sign up at https://railway.app)
- Your repository: https://github.com/M-SAAD-BIN-MAZHAR/Job_task

### 2. Deploy to Railway

#### Option A: Deploy via Railway Dashboard (Recommended)

1. **Go to Railway:**
   - Visit https://railway.app
   - Click "Login" and sign in with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository: `M-SAAD-BIN-MAZHAR/Job_task`
   - Railway will automatically detect it's a Node.js project

3. **Configure Environment Variables:**
   Click on your service → Variables tab → Add the following:

   ```env
   # Application
   NODE_ENV=production
   PORT=3000
   LOG_LEVEL=info

   # Database (Railway will provide PostgreSQL, or use SQLite)
   DATABASE_PATH=/app/data/timeoff.db

   # JWT Authentication (IMPORTANT: Change these!)
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRATION=1h

   # HCM System Integration (Configure based on your HCM system)
   HCM_API_URL=https://your-hcm-system.com/api
   HCM_API_KEY=your-hcm-api-key
   HCM_TIMEOUT=5000
   HCM_WEBHOOK_SECRET=your-webhook-secret-change-this

   # Retry Configuration
   MAX_RETRIES=3
   RETRY_DELAY=1000
   ```

4. **Deploy:**
   - Railway will automatically build and deploy
   - Wait for deployment to complete (usually 2-5 minutes)
   - You'll get a URL like: `https://your-app.up.railway.app`

#### Option B: Deploy via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Link to your GitHub repo
railway link

# Add environment variables
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set JWT_SECRET=your-secret-key
# ... add all other variables

# Deploy
railway up
```

---

## 📦 What Railway Will Do

Railway will automatically:
1. ✅ Detect Node.js project
2. ✅ Install dependencies (`npm install`)
3. ✅ Build the application (`npm run build`)
4. ✅ Start the server (`npm run start:prod`)
5. ✅ Provide HTTPS URL
6. ✅ Auto-deploy on git push

---

## 🗄️ Database Options

### Option 1: SQLite (Simple, Good for Testing)

**Pros:**
- No additional setup required
- Included in the project
- Free

**Cons:**
- Not suitable for high traffic
- Data stored in container (ephemeral)

**Configuration:**
```env
DATABASE_PATH=/app/data/timeoff.db
```

### Option 2: PostgreSQL (Recommended for Production)

**Pros:**
- Better performance
- Persistent data
- Scalable
- Railway provides it easily

**Cons:**
- Requires code changes (minimal)

**Setup:**
1. In Railway dashboard, click "New" → "Database" → "PostgreSQL"
2. Railway will automatically provide `DATABASE_URL`
3. Update your code to use PostgreSQL (see below)

**Code Changes for PostgreSQL:**

Update `time-off-service/src/database/database.config.ts`:

```typescript
// Change from SQLite to PostgreSQL
export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres', // Changed from 'sqlite'
  url: process.env.DATABASE_URL, // Railway provides this
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};
```

Install PostgreSQL driver:
```bash
cd time-off-service
npm install pg
```

---

## 🔐 Important Security Notes

### 1. Change Default Secrets

**CRITICAL:** Change these before deploying:

```env
JWT_SECRET=generate-a-strong-random-secret-here
HCM_WEBHOOK_SECRET=generate-another-strong-secret-here
```

Generate strong secrets:
```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### 2. Environment Variables Checklist

Before deploying, ensure you have set:
- ✅ `JWT_SECRET` (strong random value)
- ✅ `HCM_WEBHOOK_SECRET` (strong random value)
- ✅ `HCM_API_URL` (your HCM system URL)
- ✅ `HCM_API_KEY` (your HCM API key)
- ✅ `NODE_ENV=production`

---

## 🧪 Testing Your Deployment

### 1. Check Health Endpoint

```bash
# Replace with your Railway URL
curl https://your-app.up.railway.app/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "database": {
    "status": "up",
    "latencyMs": 5
  },
  "hcm": {
    "status": "up",
    "latencyMs": 120
  },
  "timestamp": "2026-04-24T10:00:00.000Z"
}
```

### 2. Check Liveness

```bash
curl https://your-app.up.railway.app/api/v1/health/live
```

### 3. Check Readiness

```bash
curl https://your-app.up.railway.app/api/v1/health/ready
```

### 4. Test API Endpoint (requires JWT)

```bash
# Get a JWT token first (you'll need to implement auth endpoint or use a test token)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://your-app.up.railway.app/api/v1/requests
```

---

## 📊 Monitoring Your Application

### Railway Dashboard

1. **Logs:**
   - Click on your service
   - Go to "Deployments" tab
   - Click on latest deployment
   - View real-time logs

2. **Metrics:**
   - CPU usage
   - Memory usage
   - Network traffic
   - Request count

3. **Custom Metrics:**
   Access your metrics endpoint:
   ```
   https://your-app.up.railway.app/api/v1/health/metrics
   ```

---

## 🔄 Continuous Deployment

Railway automatically deploys when you push to GitHub:

```bash
# Make changes to your code
git add .
git commit -m "Update feature"
git push origin main

# Railway will automatically:
# 1. Detect the push
# 2. Build the new version
# 3. Deploy it
# 4. Switch traffic to new version
```

---

## 🐛 Troubleshooting

### Issue: Build Fails

**Solution:**
1. Check Railway logs for error messages
2. Verify `package.json` scripts are correct
3. Ensure all dependencies are in `package.json`

### Issue: Application Crashes on Start

**Solution:**
1. Check environment variables are set correctly
2. Verify `DATABASE_PATH` is writable
3. Check logs for specific error messages

### Issue: Database Connection Fails

**Solution:**
1. If using SQLite: Ensure `/app/data` directory exists
2. If using PostgreSQL: Verify `DATABASE_URL` is set by Railway
3. Check database configuration in code

### Issue: HCM Integration Not Working

**Solution:**
1. Verify `HCM_API_URL` is correct and accessible
2. Check `HCM_API_KEY` is valid
3. Ensure HCM system can reach your Railway URL for webhooks
4. Check webhook signature validation

### Issue: 502 Bad Gateway

**Solution:**
1. Application might be crashing on startup
2. Check logs for errors
3. Verify `PORT` environment variable is set to 3000
4. Ensure application is listening on `0.0.0.0` not `localhost`

---

## 💰 Railway Pricing

### Free Tier (Hobby Plan)
- $5 free credit per month
- Enough for development and testing
- Automatic sleep after inactivity

### Paid Plans
- **Developer Plan:** $5/month + usage
- **Team Plan:** $20/month + usage
- Pay only for what you use

**Estimated Cost for This App:**
- Small traffic: ~$5-10/month
- Medium traffic: ~$15-25/month
- Includes database, compute, and bandwidth

---

## 🔗 Useful Links

- **Railway Dashboard:** https://railway.app/dashboard
- **Railway Docs:** https://docs.railway.app
- **Your Repository:** https://github.com/M-SAAD-BIN-MAZHAR/Job_task
- **Railway Status:** https://status.railway.app

---

## 📝 Post-Deployment Checklist

After successful deployment:

- [ ] Health endpoint returns "ok"
- [ ] All environment variables are set
- [ ] JWT_SECRET is changed from default
- [ ] HCM_WEBHOOK_SECRET is changed from default
- [ ] Database is accessible
- [ ] HCM integration is configured
- [ ] Logs show no errors
- [ ] Test API endpoints work
- [ ] Webhook endpoint is accessible
- [ ] Monitoring is set up

---

## 🎉 Success!

Once deployed, your Time-Off Microservice will be available at:
```
https://your-app-name.up.railway.app
```

### API Base URL:
```
https://your-app-name.up.railway.app/api/v1
```

### Health Check:
```
https://your-app-name.up.railway.app/api/v1/health
```

---

## 🆘 Need Help?

1. **Railway Discord:** https://discord.gg/railway
2. **Railway Support:** support@railway.app
3. **Check Logs:** Railway Dashboard → Your Service → Deployments → Logs

---

## 📚 Next Steps

1. ✅ Deploy to Railway
2. ✅ Configure environment variables
3. ✅ Test all endpoints
4. ✅ Set up monitoring
5. ✅ Configure HCM integration
6. ✅ Set up custom domain (optional)
7. ✅ Enable auto-scaling (if needed)

**Happy Deploying! 🚀**
