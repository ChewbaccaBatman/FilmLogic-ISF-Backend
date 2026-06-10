# Film Logic ISF Backend

Playwright + Express backend that logs into the ACE portal and files ISFs automatically.

---

## Deploy to Railway (10 minutes)

### 1. Install prerequisites
- [Node.js 18+](https://nodejs.org)
- [Git](https://git-scm.com)
- A free [Railway account](https://railway.app)
- The [Railway CLI](https://docs.railway.app/develop/cli): `npm install -g @railway/cli`

### 2. Push to GitHub
Create a new repo at github.com, then:
```bash
git init
git add .
git commit -m "Initial ISF backend"
git remote add origin https://github.com/YOUR_USERNAME/filmlogic-isf-backend.git
git push -u origin main
```

### 3. Deploy on Railway
```bash
railway login
railway init        # Select "Empty project", name it filmlogic-isf
railway up          # Deploys and gives you a public URL
```

Or connect via the Railway dashboard:
1. Go to railway.app → New Project → Deploy from GitHub repo
2. Select your repo
3. Railway auto-detects the config and deploys

### 4. Get your backend URL
In the Railway dashboard → your service → Settings → Networking → Generate Domain.
It will look like: `https://filmlogic-isf-backend-production.up.railway.app`

### 5. Connect the frontend
In the Film Logic ISF Platform app, update the backend URL field with your Railway URL.
The frontend will call `POST /file-isf` on your backend instead of simulating.

---

## Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

Server runs on http://localhost:3001

Test it:
```bash
curl http://localhost:3001/health
```

---

## API

### POST /file-isf
Streams filing progress as Server-Sent Events.

**Request body:**
```json
{
  "credentials": {
    "username": "your_ace_username",
    "password": "your_ace_password"
  },
  "isf": {
    "seller": "ACME Exports Ltd, Shanghai",
    "buyer": "Film Logic Inc, Los Angeles",
    "importer_of_record": "12-3456789",
    "consignee": "Film Logic Inc",
    "manufacturer": "ACME Manufacturing Co",
    "ship_to_party": "Film Logic Warehouse, 123 Main St, LA",
    "country_of_origin": "CN",
    "hts_codes": "9801.00.1097",
    "container_stuffing_location": "Shanghai Port, China",
    "consolidator": "Pacific Freight Consolidators",
    "vessel_voyage": "EVER GIVEN / 0123W",
    "bill_of_lading": "EGLV123456789"
  }
}
```

**Streaming response (SSE):**
```
data: {"type":"step","message":"Launching secure browser session..."}
data: {"type":"step","message":"Logging in with ACE credentials..."}
data: {"type":"step","message":"Filling ISF 10+2 fields..."}
data: {"type":"done","message":"ISF filed successfully","confirmation":"ISF-9823771"}
```

---

## Notes on ACE selectors

The file `src/ace-filer.js` contains CSS selectors for ACE portal fields in `ACE_FIELD_MAP`.
CBP occasionally updates the ACE UI — if filing breaks, inspect the ACE portal and update
the selectors in that map. Each selector maps our ISF field key to the ACE form input ID.

---

## Security

- Never commit ACE credentials to git
- Credentials are passed per-request from the frontend and never stored on the server
- For production, add HTTPS (Railway provides this automatically) and consider
  adding a `BACKEND_SECRET` env var to authenticate requests from your frontend only
