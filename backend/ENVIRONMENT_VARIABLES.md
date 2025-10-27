# Environment Variables - Droplin Backend

## Overview

All secrets and configuration are managed through environment variables for security and flexibility across different environments (local, production).

---

## Quick Start

### 1. Local Development Setup

```bash
cd backend

# Generate a secure JWT secret key
python generate_secret_key.py

# Create .env file from example
cp .env.example .env

# Edit .env and add your generated JWT_SECRET_KEY
# nano .env  (or use your preferred editor)
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Backend

```bash
python main.py
```

---

## Required Environment Variables

### JWT Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET_KEY` | ⚠️ **YES** | (insecure default) | Secret key for signing JWT tokens. **MUST be changed in production!** |
| `JWT_ALGORITHM` | No | `HS256` | Algorithm for JWT token signing |
| `ACCESS_TOKEN_EXPIRE_DAYS` | No | `30` | Number of days before JWT token expires |

**Generate secure key:**
```bash
python generate_secret_key.py
```

---

## Optional Environment Variables

### Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Production Only** | None (uses SQLite) | PostgreSQL connection string for Railway |

**Local:** Automatically uses SQLite (`droplink.db`) - no configuration needed  
**Railway:** Automatically set by Railway PostgreSQL service

**Example PostgreSQL URL:**
```
postgresql://user:password@host:port/database
```

### Email Configuration (SendGrid)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENDGRID_API_KEY` | No | Empty | SendGrid API key for sending verification emails |
| `FROM_EMAIL` | No | `noreply@droplinkconnect.com` | Email address for outgoing emails |

**Without SendGrid:** Verification codes are logged to console for testing

### Cloud Storage (Cloudinary)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUDINARY_CLOUD_NAME` | No | (default test account) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | (default test account) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | (default test account) | Cloudinary API secret |

**Without Cloudinary:** Profile photos work with default test account (not recommended for production)

---

## Setting Up Environment Variables

### Local Development (.env file)

1. **Copy example file:**
   ```bash
   cp .env.example .env
   ```

2. **Generate JWT secret:**
   ```bash
   python generate_secret_key.py
   ```

3. **Edit .env file:**
   ```bash
   # Required - CHANGE THIS!
   JWT_SECRET_KEY=your-generated-secret-key-here
   JWT_ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_DAYS=30

   # Optional - for email verification
   SENDGRID_API_KEY=your-sendgrid-api-key
   FROM_EMAIL=noreply@yourdomain.com

   # Optional - for profile photos
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

4. **Never commit .env file** (already in .gitignore)

### Production (Railway)

1. **Go to Railway Dashboard** → Your Project → Backend Service

2. **Click "Variables" tab**

3. **Add environment variables:**

   ```
   JWT_SECRET_KEY = <generate new secure key - DIFFERENT from development>
   JWT_ALGORITHM = HS256
   ACCESS_TOKEN_EXPIRE_DAYS = 30
   SENDGRID_API_KEY = <your SendGrid API key>
   FROM_EMAIL = noreply@yourdomain.com
   CLOUDINARY_CLOUD_NAME = <your cloud name>
   CLOUDINARY_API_KEY = <your API key>
   CLOUDINARY_API_SECRET = <your API secret>
   ```

4. **DATABASE_URL** is automatically set by Railway when you connect PostgreSQL

5. **Deploy** - Railway will restart with new environment variables

---

## Security Best Practices

### ✅ DO

- **Generate unique JWT secrets** for development and production
- **Use strong random keys** (256-bit recommended)
- **Store .env file locally** - never commit to Git
- **Use Railway environment variables** for production
- **Rotate secrets periodically** (every 90 days recommended)
- **Use different Cloudinary/SendGrid accounts** for dev and production

### ❌ DON'T

- **Never commit .env file** to Git
- **Never hardcode secrets** in source code
- **Never share JWT_SECRET_KEY** publicly
- **Never use the default JWT secret** in production
- **Never reuse secrets** across environments
- **Never log environment variables** in production

---

## Verifying Configuration

### Check JWT Secret Warning

When you start the backend, if using the default JWT secret:

```
⚠️  WARNING: Using default JWT_SECRET_KEY! Set JWT_SECRET_KEY environment variable in production.
```

**Fix:** Set a secure `JWT_SECRET_KEY` in your `.env` file or Railway environment variables.

### Check Database Connection

**Local:**
```
✓ Using SQLite database: droplink.db
```

**Railway:**
```
✓ Using PostgreSQL database (Railway)
```

### Check Email Configuration

**Without SendGrid:**
```
⚠️ SendGrid not configured. VERIFICATION CODE for user@example.com: 123456
```

**With SendGrid:**
```
✓ Verification code sent to user@example.com
```

---

## Troubleshooting

### Issue: "Using default JWT_SECRET_KEY" warning

**Cause:** `JWT_SECRET_KEY` not set in environment variables

**Fix:**
```bash
# Local
python generate_secret_key.py
# Add output to .env file

# Railway
# Add JWT_SECRET_KEY in Railway dashboard Variables tab
```

### Issue: "KeyError: JWT_SECRET_KEY"

**Cause:** Environment variable not loaded

**Fix:**
1. Ensure `.env` file exists in `backend/` directory
2. Ensure `python-dotenv` is installed: `pip install python-dotenv`
3. Restart backend server

### Issue: Database connection errors on Railway

**Cause:** `DATABASE_URL` not set

**Fix:**
1. Go to Railway dashboard
2. Add PostgreSQL service
3. Connect it to backend service
4. Railway automatically sets `DATABASE_URL`
5. Redeploy

### Issue: SendGrid emails not sending

**Cause:** `SENDGRID_API_KEY` not configured or invalid

**Fix:**
1. Sign up for SendGrid account
2. Create API key in SendGrid dashboard
3. Add to `.env` (local) or Railway variables (production)
4. Verification codes will be logged if SendGrid is not configured

---

## Environment Variable Priority

1. **Railway environment variables** (production)
2. **.env file** (local development)
3. **Default values** (fallback - may be insecure)

---

## Example Configurations

### Minimal Local Development

```env
# .env (minimal for local testing)
JWT_SECRET_KEY=dev-secret-key-abc123xyz789-change-this
```

All other variables use defaults. Verification codes logged to console.

### Full Local Development

```env
# .env (full setup with all services)
JWT_SECRET_KEY=dev-secret-key-abc123xyz789-change-this
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=30

SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=dev@droplinkconnect.com

CLOUDINARY_CLOUD_NAME=my-dev-cloud
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
```

### Production (Railway)

```env
# Railway Variables (production - NEVER commit these!)
JWT_SECRET_KEY=prod-super-secure-random-key-DIFFERENT-from-dev
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=30

DATABASE_URL=postgresql://... (auto-set by Railway)

SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@droplinkconnect.com

CLOUDINARY_CLOUD_NAME=my-prod-cloud
CLOUDINARY_API_KEY=987654321098765
CLOUDINARY_API_SECRET=zyxwvutsrqponmlkjihgfedcba
```

---

## Migration from Hardcoded Secrets

**Before (insecure):**
```python
SECRET_KEY = "your-secret-key-change-in-production-12345"
```

**After (secure):**
```python
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production-12345")
```

**Changes Required:**
1. ✅ Added `python-dotenv` to `requirements.txt`
2. ✅ Created `.env.example` template
3. ✅ Updated `main.py` to load from environment
4. ✅ Added warning for default JWT secret

**Action Required:**
- Generate secure JWT secret key
- Create `.env` file locally
- Add environment variables to Railway

---

## Support

For issues with environment configuration:

1. Check this documentation
2. Verify `.env` file syntax (no quotes around values)
3. Ensure `python-dotenv` is installed
4. Check Railway logs for configuration errors
5. Verify all required variables are set

---

**Last Updated:** 2025-10-27  
**Status:** ✅ Production-Ready with Environment Variables

