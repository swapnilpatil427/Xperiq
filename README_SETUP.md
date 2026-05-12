# Experient — Production Setup Guide

## Architecture

- **Frontend**: React + Vite + Tailwind (`app/`)
- **Backend**: Google Cloud Functions 2nd gen, Node.js 20 (`functions/`)
- **Auth**: Clerk (JWT-verified in Cloud Functions, ClerkProvider in frontend)
- **Database**: Firestore (real-time subscriptions in frontend, admin SDK in functions)
- **AI**: OpenRouter (server-side only — key never exposed to browser)
- **Storage**: Firebase Storage (signed URL pattern, not yet implemented)
- **Hosting**: Firebase Hosting

---

## Prerequisites

- Node.js 20+ (functions) and Node.js 22 (local dev)
- Firebase CLI: `npm install -g firebase-tools`
- A Google account

---

## Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click "Create a project" → name it `experient-prod`
3. Enable Firestore (Native mode, region `us-central1`)
4. Enable Firebase Storage
5. Enable Firebase Hosting

---

## Step 2 — Get Firebase Config for Frontend

1. In Firebase Console → Project Settings → General → Your apps → Add web app
2. Register the app (name it "Experient Web")
3. Copy the config values into `app/.env`:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=experient-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=experient-prod
VITE_FIREBASE_STORAGE_BUCKET=experient-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

## Step 3 — Create Clerk Account & Application

1. Go to https://clerk.com → sign up (free tier is sufficient)
2. Create a new application → name it "Experient"
3. Enable Email/Password and any social providers you want
4. In Clerk Dashboard → API Keys:
   - Copy **Publishable Key** (`pk_live_...`)
   - Copy **Secret Key** (`sk_live_...`)
5. Add to `app/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

6. Add to `functions/.env`:

```env
CLERK_SECRET_KEY=sk_live_...
```

---

## Step 4 — Get OpenRouter API Key (free)

1. Go to https://openrouter.ai → sign up
2. Dashboard → API Keys → Create key
3. Free tier includes `meta-llama/llama-3.1-8b-instruct:free` — no credit card needed
4. Add to `functions/.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

---

## Step 5 — Set Cloud Function Environment Variables

Before deploying, set runtime env vars for the functions:

```bash
firebase functions:secrets:set CLERK_SECRET_KEY
firebase functions:secrets:set OPENROUTER_API_KEY
```

Or use `.env` files in the `functions/` directory (read by `dotenv` at startup). For production, Firebase Functions v2 supports env vars via the Firebase console under Functions → Configuration.

---

## Step 6 — Deploy

```bash
# From project root (/Users/spatil/Documents/Projects/Experient/)

# Log in to Firebase
firebase login

# Set the project
firebase use experient-prod

# Deploy everything
firebase deploy

# Or deploy only functions
firebase deploy --only functions

# Or deploy only hosting
firebase deploy --only hosting
```

---

## Step 7 — Set VITE_API_URL for Production

After deploying functions, set the API URL in your hosting environment:

```env
VITE_API_URL=https://us-central1-experient-prod.cloudfunctions.net/api
```

Rebuild the frontend with this value:

```bash
cd app
npm run build
firebase deploy --only hosting
```

---

## Local Development (Firebase Emulator)

1. Install emulators:

```bash
firebase setup:emulators:firestore
firebase setup:emulators:functions
```

2. Start emulators:

```bash
firebase emulators:start --only functions,firestore
```

3. In `app/.env`, set:

```env
VITE_USE_EMULATOR=true
VITE_API_URL=http://localhost:5001/experient-prod/us-central1/api
```

4. In a separate terminal:

```bash
cd app
npm run dev
```

---

## Environment Variable Summary

### `app/.env`

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`) |
| `VITE_API_URL` | Cloud Functions base URL (default: local emulator) |
| `VITE_USE_EMULATOR` | Set to `true` to connect Firestore to local emulator |

### `functions/.env`

| Variable | Description |
|---|---|
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_live_...`) for JWT verification |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI generation |

---

## Data Model

```
/orgs/{orgId}/
  surveys/{surveyId}
    title, status, questions[], publishToken, createdBy, orgId, createdAt, updatedAt
    responses/{responseId}
      answers[], npsScore, submittedAt, orgId, surveyId
    insights/{insightId}
      summary, npsScore, topics[], sentimentBreakdown, topPhrases, generatedAt, responseCount
  workflows/{workflowId}
    name, condition, action, status, triggerCount, createdBy, orgId, createdAt
```

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Health check |
| GET | `/api/surveys` | JWT | List surveys for org |
| POST | `/api/surveys` | JWT | Create survey |
| GET | `/api/surveys/:id` | JWT | Get survey |
| PUT | `/api/surveys/:id` | JWT | Update survey |
| DELETE | `/api/surveys/:id` | JWT | Delete survey |
| POST | `/api/surveys/:id/publish` | JWT | Publish survey |
| POST | `/api/surveys/:id/responses` | None | Submit response (public) |
| GET | `/api/surveys/:id/responses` | JWT | Get responses |
| GET | `/api/surveys/:id/insights` | JWT | Get latest insights |
| POST | `/api/ai/generate-survey` | JWT | Generate survey from intent |
| POST | `/api/ai/analyze-insights` | JWT | Analyze survey responses |
| GET | `/api/workflows` | JWT | List workflows |
| POST | `/api/workflows` | JWT | Create workflow |
| PUT | `/api/workflows/:id` | JWT | Update workflow |
| DELETE | `/api/workflows/:id` | JWT | Delete workflow |
| POST | `/api/workflows/:id/toggle` | JWT | Toggle workflow status |
