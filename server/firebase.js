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

// ----- Firestore: Report history (30-day retention) -----
const REPORTS_COLLECTION = "inspection_reports";
const RETENTION_DAYS = 30;

export async function saveReport(reportData) {
  initFirebase();
  if (!firebaseReady) return null;

  const db = admin.firestore();
  const doc = {
    ...reportData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(REPORTS_COLLECTION).add(doc);
  return ref.id;
}

function normalizeReportDoc(snap) {
  const data = typeof snap.data === "function" ? snap.data() : snap;
  const id = snap.id || data.id;
  const created = data.createdAt;
  const createdAt =
    created?.toDate?.()?.toISOString?.() ??
    (typeof created === "string" ? created : new Date().toISOString());
  const photos = data.photos || data.photoAnalysis || [];
  return { ...data, id, createdAt, photoAnalysis: photos, photos };
}

export async function getReportById(id) {
  initFirebase();
  if (!firebaseReady) return null;

  const db = admin.firestore();
  const snap = await db.collection(REPORTS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return normalizeReportDoc(snap);
}

/**
 * Update an existing report (e.g. after user edits and saves).
 * Only provided fields are updated; createdAt is preserved.
 */
export async function updateReport(id, updates) {
  initFirebase();
  if (!firebaseReady) return null;

  const db = admin.firestore();
  const ref = db.collection(REPORTS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const allowed = [
    "reportText",
    "summary",
    "photoAnalysis",
    "photos",
    "restaurantName",
    "address",
    "notes",
  ];
  const payload = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  }
  if (Object.keys(payload).length === 0) return id;

  await ref.update({
    ...payload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return id;
}

export async function listReports(limit = 50) {
  initFirebase();
  if (!firebaseReady) return [];

  const db = admin.firestore();
  const snap = await db
    .collection(REPORTS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => normalizeReportDoc(d));
}

export async function deleteReportsOlderThan(days = RETENTION_DAYS) {
  initFirebase();
  if (!firebaseReady) return 0;

  const db = admin.firestore();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const snap = await db
    .collection(REPORTS_COLLECTION)
    .where("createdAt", "<", cutoff)
    .limit(500)
    .get();

  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
