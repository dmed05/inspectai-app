/**
 * Firebase Admin SDK for Storage uploads.
 * Uploads inspection photos and returns signed public URLs.
 *
 * Required env vars (when using Storage):
 *   FIREBASE_SERVICE_ACCOUNT_PATH - path to service account JSON key
 *   FIREBASE_STORAGE_BUCKET - e.g. "your-project.appspot.com"
 */

import admin from "firebase-admin";
import path from "path";
import { readFileSync } from "fs";

let firebaseReady = false;

export function isFirebaseConfigured() {
  return (
    !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
    !!process.env.FIREBASE_STORAGE_BUCKET
  );
}

export function initFirebase() {
  if (firebaseReady) return;
  if (!isFirebaseConfigured()) return;

  try {
    const serviceAccountPath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    );
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName,
    });

    firebaseReady = true;
  } catch (err) {
    console.error("Firebase init error:", err.message);
  }
}

/**
 * Upload a file buffer to Firebase Storage and return a signed URL.
 * Do not log signed URLs (security).
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} mimeType - MIME type
 * @param {number} index - Photo index for unique path
 * @returns {Promise<string|null>} Signed URL or null
 */
export async function uploadPhotoAndGetUrl(buffer, filename, mimeType, index = 0) {
  initFirebase();
  if (!firebaseReady) return null;

  const bucket = admin.storage().bucket();
  const uniquePath = `inspection-photos/${Date.now()}-${index}-${filename}`;
  const file = bucket.file(uniquePath);

  await file.save(buffer, {
    metadata: { contentType: mimeType || "image/jpeg" },
    resumable: false,
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  return url;
}
