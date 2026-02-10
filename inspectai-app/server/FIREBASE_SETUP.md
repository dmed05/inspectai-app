# Firebase Storage Setup

Firebase Storage is optional. When configured, inspection photos are uploaded and each photo gets a public download URL in the report response (`photoAnalysis[].publicUrl`).

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable **Authentication** (optional, but often required for new projects)
4. Go to **Build → Storage** and click **Get started**
5. Choose **Production mode** (or Test mode for development) and create the bucket
6. Note your storage bucket name: `your-project-id.appspot.com`

## 2. Generate a service account key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **IAM & Admin → Service accounts**
4. Click **Create service account** (or use the default)
5. Give it a name (e.g. `inspectai-server`)
6. Grant role: **Cloud Storage Admin** (or at least **Storage Object Creator**)
7. Click **Create key** → JSON → Download
8. Open the JSON file and copy its **entire contents** (as a single line for .env)

## 3. Configure server/.env

Add these variables:

**Option A – Service account file (recommended)**

1. Place the downloaded JSON key in `server/` (e.g. `serviceAccountKey.json`)
2. Add to `.env`:

```
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

**Option B – Inline JSON**

Paste the full JSON as one line (escape quotes if needed):

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

**Option C – Standard env var**

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
```

## 4. Firestore (report history & share links)

Report history and shareable links are stored in **Firestore** for 30 days. The same Firebase project and service account are used.

1. In [Firebase Console](https://console.firebase.google.com/) → your project → **Build → Firestore Database**
2. Click **Create database** (if not already created) and choose **Start in production mode**
3. No extra env vars needed — the server uses the same `FIREBASE_SERVICE_ACCOUNT_PATH` and `FIREBASE_STORAGE_BUCKET` config
4. Reports older than 30 days are deleted automatically on server startup

## 5. Verify

Restart the server and hit `GET /health`. The response should include `"firebaseStorage": true`. Generated reports will include `publicUrl` for each photo in `photoAnalysis` and `reportId` for shareable links.
