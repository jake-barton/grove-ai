# Deployment Guide

## Option 1: Local Development (Recommended for Testing)

1. Follow SETUP.md to configure everything
2. Run the development server:
```bash
npm run dev
```
3. Open http://localhost:3000

**Pros:**
- Easy to test and iterate
- Ollama runs locally (free)
- Full debugging capabilities

**Cons:**
- Only accessible from your computer
- Ollama must be running

---

## Option 2: Deploy to Vercel (Free Hosting)

### Step 1: Prepare for Deployment

1. Push code to GitHub:
```bash
cd /Users/jakebarton/Desktop/TechBirmingham/sponsor-research-ai
git init
git add .
git commit -m "Initial commit: AI Sponsor Research Platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sponsor-research-ai.git
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "Import Project"
4. Select your `sponsor-research-ai` repository
5. Configure environment variables (copy from .env.local)
6. Click "Deploy"

### Step 3: Set Up Remote Ollama

**Problem**: Ollama runs locally, but Vercel is cloud-based.

**Solution A: Run Ollama on a Server**

Use Railway.app (has free tier):
```bash
# On Railway, deploy with this Dockerfile:
FROM ollama/ollama
RUN ollama pull llama3.1:8b
CMD ["ollama", "serve"]
```

Then update environment variable:
```
OLLAMA_API_URL=https://your-railway-app.railway.app
```

**Solution B: Use Office Computer**

If TechBirmingham has an always-on computer:
1. Install Ollama on that computer
2. Run `ollama serve`
3. Set up port forwarding or ngrok
4. Update `OLLAMA_API_URL` to point to that computer

**Solution C: Hybrid Approach**

Use local Ollama for development, cloud API (OpenAI) for production:

```typescript
// lib/ollama.ts - Add fallback
const AI_PROVIDER = process.env.NODE_ENV === 'production' ? 'openai' : 'ollama';

if (AI_PROVIDER === 'openai') {
  // Use OpenAI API (will cost ~$10-20/month)
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: messages,
  });
} else {
  // Use local Ollama (free)
  const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model,
    messages,
  });
}
```

---

## Option 3: Self-Host on Office Hardware

If TechBirmingham has a spare computer or server:

### Requirements
- Computer with 16GB+ RAM
- Ubuntu/macOS/Windows
- Always-on internet connection
- Static IP or domain name

### Setup

1. Install Ollama:
```bash
curl https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b
ollama serve
```

2. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. Clone and run the app:
```bash
git clone https://github.com/YOUR_REPO/sponsor-research-ai.git
cd sponsor-research-ai
npm install
npm run build
npm start
```

4. Set up as a service (systemd):
```bash
sudo nano /etc/systemd/system/sponsor-research.service
```

```ini
[Unit]
Description=TechBirmingham Sponsor Research Platform
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/sponsor-research-ai
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable sponsor-research
sudo systemctl start sponsor-research
```

5. Set up reverse proxy (nginx):
```nginx
server {
    listen 80;
    server_name sponsors.techbirmingham.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Recommended Deployment Strategy

### For Development & Testing (Now)
- **Local development** with `npm run dev`
- Ollama running on your laptop
- Test with 5-10 companies

### For Team Use (Week 2-4)
- **Deploy to Vercel** (frontend)
- **Ollama on office computer** (AI processing)
- Set up proper domain: `sponsors.techbirmingham.com`

### For Production (Month 2+)
- Evaluate usage and costs
- If high usage: Consider dedicated server
- If low usage: Keep current setup
- Optional: Switch to cloud AI if maintenance is too much

---

## Cost Comparison

| Option | Setup Cost | Monthly Cost | Pros | Cons |
|--------|-----------|--------------|------|------|
| **Local Dev** | $0 | $0 | Free, easy | Only on your computer |
| **Vercel + Office PC** | $0 | $0-15 (APIs only) | Free hosting, local AI | Requires always-on PC |
| **Vercel + Railway** | $0 | $5-20 | Fully cloud-based | Small monthly cost |
| **Vercel + OpenAI** | $0 | $20-50 | No local setup needed | Higher AI costs |
| **Self-hosted** | $0 | $0 | Full control | Requires maintenance |

---

## Environment Variables for Production

Make sure to set these in Vercel (or your hosting platform):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
OLLAMA_API_URL=http://your-ollama-server:11434
SERPER_API_KEY=xxx
HUNTER_API_KEY=xxx
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_SHEETS_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SHEETS_SPREADSHEET_ID=xxx
```

**Security Tips:**
- Never commit .env.local to git (it's already in .gitignore)
- Use Vercel's environment variable encryption
- Rotate API keys periodically
- Set up rate limiting if publicly accessible

---

## Monitoring & Maintenance

### Things to Monitor
1. **API Rate Limits**: Check Serper/Hunter usage
2. **Database Size**: Supabase free tier is 500MB
3. **Ollama Performance**: Ensure server has enough resources
4. **Error Logs**: Check Vercel logs for issues

### Regular Maintenance
- Weekly: Review API usage and costs
- Monthly: Clean up old/duplicate company data
- Quarterly: Update dependencies (`npm update`)
- As needed: Retrain AI with successful outreach examples

---

## Getting Help

- **Technical Issues**: Check SETUP.md troubleshooting
- **Feature Requests**: Open GitHub issue
- **Questions**: Email jake@techbirmingham.com (or your contact)

---

**Ready to deploy! Choose your path and let's get this running! 🚀**
