# DropLink Backend API

FastAPI backend for the DropLink mobile app with SQLite database.

## Features

- **FastAPI** REST API
- **SQLite** database for device storage
- **CORS** enabled for mobile app
- **Pydantic** validation
- Auto-generated API docs at `/docs`

## API Endpoints

- `GET /` - API info
- `GET /health` - Health check
- `POST /devices` - Save scanned device
- `GET /devices` - Get all devices for user
- `GET /devices/{id}` - Get specific device
- `DELETE /devices/{id}` - Delete device

## Local Development

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Run Server
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server runs at: `http://localhost:8000`  
API docs at: `http://localhost:8000/docs`

## Deploy to Railway

### Method 1: Railway CLI (Recommended)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize Project** (from backend folder)
   ```bash
   cd backend
   railway init
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Get Your URL**
   ```bash
   railway domain
   ```

### Method 2: GitHub Integration

1. **Push code to GitHub**
   ```bash
   git add backend/
   git commit -m "Add backend API"
   git push origin albert/full-integration
   ```

2. **Go to Railway** → https://railway.app/
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Select the `backend` folder as root directory
   - Railway will auto-detect Python and deploy!

3. **Generate Domain**
   - Go to Settings → Networking
   - Click "Generate Domain"
   - Copy your URL (e.g., `https://droplink-api.railway.app`)

## Environment Variables

Railway automatically sets:
- `PORT` - Server port (don't change)

## Database

- SQLite database file: `droplink.db`
- Auto-creates on first run
- Persists on Railway's disk storage

## After Deployment

1. Copy your Railway URL (e.g., `https://droplink-api.railway.app`)
2. Update mobile app's `mobile/src/services/api.ts`:
   ```typescript
   export const BASE_URL = "https://your-railway-url.railway.app";
   const USE_STUB = false;
   ```

## Testing API

Visit `https://your-url.railway.app/docs` for interactive API documentation.

## Troubleshooting

- **Build fails**: Check `requirements.txt` has correct versions
- **App crashes**: Check Railway logs with `railway logs`
- **Can't connect**: Ensure CORS is enabled and URL is correct in mobile app

