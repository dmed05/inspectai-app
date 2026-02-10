import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import {
  uploadPhotoAndGetUrl,
  isFirebaseConfigured,
} from "./firebase.js";

/**
 * Server (Express)
 * - POST /api/generate  (multipart/form-data: fields + photos[])
 * - GET  /health
 *
 * Requires env vars:
 *   OPENAI_API_KEY
 *   PHOTO_VISION_PROMPT_ID
 *   INSPECTION_SUMMARY_PROMPT_ID
 *
 * Optional (for public photo URLs):
 *   FIREBASE_SERVICE_ACCOUNT - JSON string of service account key
 *   FIREBASE_STORAGE_BUCKET - e.g. "your-project.appspot.com"
 *
 * Optional (tuning):
 *   MAX_PHOTOS - max photos to analyze (default 8)
 *   CONCURRENCY_LIMIT - parallel vision calls (default 4)
 */

const MAX_PHOTOS = Number(process.env.MAX_PHOTOS || 8);
const CONCURRENCY_LIMIT = Number(process.env.CONCURRENCY_LIMIT || 4);

const app = express();

// Dev-friendly CORS
app.use(cors());
app.use(express.json());

// For multipart/form-data (photos)
const upload = multer({ storage: multer.memoryStorage() });

// ----- Helpers -----
function assertEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing ${name}`);
  return val;
}

function fileToDataUrl(file) {
  const mime = file.mimetype || "application/octet-stream";
  const b64 = file.buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}

/**
 * Run tasks in parallel with a concurrency limit. Preserves input order.
 */
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) break;

      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => runner()
  );

  await Promise.all(runners);
  return results;
}

/**
 * Retry an async fn on 429 / transient errors.
 */
async function withRetry(fn, { maxAttempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const code = err?.code;
      const isRetryable =
        status === 429 ||
        (status >= 500 && status < 600) ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT";

      if (!isRetryable || attempt === maxAttempts) throw err;

      const delay = Math.min(1000 * 2 ** attempt, 10000);
      console.warn(`Retry ${attempt}/${maxAttempts} after ${delay}ms:`, err?.message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// OpenAI client (expects OPENAI_API_KEY in server/.env)
// Note: we validate env vars before the first request too.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Run a saved Prompt by ID using the Responses API.
 *
 * - prompt.id: your saved prompt id
 * - prompt.variables: your variables used inside the prompt (e.g. {{restaurantName}})
 * - input: the actual user input (including images)
 */
async function runPromptId({ promptId, variables, input, timeoutMs = 60000 }) {
  if (!promptId) throw new Error("Missing promptId");
  if (!input) throw new Error("Missing input");

  const body = {
    prompt: { id: promptId },
    input,
  };

  if (variables && Object.keys(variables).length > 0) {
    body.prompt.variables = variables;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await openai.responses.create(body, {
      signal: controller.signal,
    });

    if (resp.output_text && resp.output_text.trim())
      return resp.output_text.trim();

    const fallback = JSON.stringify(resp.output ?? resp, null, 2);
    return fallback.length > 8000
      ? fallback.slice(0, 8000) + "\n…(truncated)"
      : fallback;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "Server connected ✅",
    firebaseStorage: isFirebaseConfigured(),
  });
});

// ✅ This is what your frontend calls: POST /api/generate
app.post("/api/generate", upload.array("photos", 20), async (req, res) => {
  const t0 = Date.now();

  try {
    // Fail fast on env vars (per request so errors are obvious)
    assertEnv("OPENAI_API_KEY");
    const PHOTO_VISION_PROMPT_ID = assertEnv("PHOTO_VISION_PROMPT_ID");
    const INSPECTION_SUMMARY_PROMPT_ID = assertEnv(
      "INSPECTION_SUMMARY_PROMPT_ID"
    );

    const {
      restaurantName = "",
      address = "",
      hoods = "0",
      fans = "0",
      filters = "0",
      notes = "",
      analyzeAll = "",
    } = req.body;

    const analyzeAllPhotos = analyzeAll === "true" || analyzeAll === true;

    if (!restaurantName.trim()) {
      return res.status(400).json({ ok: false, error: "restaurantName is required" });
    }

    const allFiles = Array.isArray(req.files) ? req.files : [];
    const maxToAnalyze = analyzeAllPhotos ? allFiles.length : MAX_PHOTOS;
    const firebaseEnabled = isFirebaseConfigured();

    if (allFiles.length > maxToAnalyze && !analyzeAllPhotos) {
      console.log(`Fast mode: analyzing first ${maxToAnalyze} of ${allFiles.length} photos (pass analyzeAll=true to analyze all)`);
    }

    // 1) PHOTO VISION (concurrent) + FIREBASE UPLOAD (all photos)
    // Analyze first N; upload ALL to Firebase for gallery
    const photoResults = await runWithConcurrency(
      allFiles,
      CONCURRENCY_LIMIT,
      async (f, index) => {
        const shouldAnalyze = index < maxToAnalyze;
        let analysis = "";

        if (shouldAnalyze) {
          const dataUrl = fileToDataUrl(f);
          const input = [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Analyze this kitchen exhaust photo for grease buildup and notable conditions. Return concise bullet findings.",
                },
                {
                  type: "input_image",
                  image_url: dataUrl,
                  detail: "low",
                },
              ],
            },
          ];

          try {
            analysis = await withRetry(() =>
              runPromptId({
                promptId: PHOTO_VISION_PROMPT_ID,
                variables: {},
                input,
              })
            );
          } catch (err) {
            console.warn(`Photo ${index + 1} (${f.originalname}) failed:`, err?.message);
            analysis = `[Analysis failed: ${err?.message || "Unknown error"}]`;
          }
        } else {
          analysis = "(Not analyzed - fast mode)";
        }

        let publicUrl = null;
        if (firebaseEnabled) {
          try {
            publicUrl = await uploadPhotoAndGetUrl(
              f.buffer,
              f.originalname,
              f.mimetype,
              index
            );
          } catch (err) {
            console.warn(`Firebase upload failed for ${f.originalname}:`, err?.message);
          }
        }

        return {
          filename: f.originalname,
          analysis,
          publicUrl: publicUrl || undefined,
        };
      }
    );

    const tPhotos = Date.now();
    const photoAnalysisTimeMs = tPhotos - t0;

    // 2) INSPECTION SUMMARY (after all photo analyses)
    const analyzedForSummary = photoResults.filter(
      (p) =>
        p.analysis &&
        !p.analysis.startsWith("(Not analyzed") &&
        !p.analysis.startsWith("[Analysis failed")
    );

    const analyzedForSummaryLean = analyzedForSummary.map((p) => ({
      filename: p.filename,
      analysis: p.analysis,
    }));

    const inspectionSummary = await runPromptId({
      promptId: INSPECTION_SUMMARY_PROMPT_ID,
      variables: { restaurantName, address },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Restaurant: ${restaurantName}\n` +
                `Address: ${address}\n\n` +
                `Hoods: ${String(hoods)}\n` +
                `Fans: ${String(fans)}\n` +
                `Filters: ${String(filters)}\n\n` +
                `Notes:\n${notes}\n\n` +
                `Photo Analysis (JSON):\n${JSON.stringify(analyzedForSummaryLean, null, 2)}`,
            },
          ],
        },
      ],
    });

    const tSummary = Date.now();
    const summaryTimeMs = tSummary - tPhotos;
    const totalTimeMs = tSummary - t0;

    console.log("photos ms:", photoAnalysisTimeMs);
    console.log("summary ms:", summaryTimeMs);
    console.log("total ms:", totalTimeMs);

    function toCaption(analysis) {
      if (!analysis) return "";
      if (analysis.startsWith("(Not analyzed")) return "Not analyzed (fast mode)";
      if (analysis.startsWith("[Analysis failed")) return "Analysis failed";
      return String(analysis).split("\n").find(Boolean)?.slice(0, 80) || "Photo analysis";
    }

    const photoAnalysis = photoResults.map((p) => ({
      filename: p.filename,
      analysis: p.analysis,
      caption: toCaption(p.analysis),
      publicUrl: p.publicUrl ?? null,
    }));

    res.json({
      ok: true,
      reportText: inspectionSummary,
      summary: inspectionSummary,
      photoAnalysis,
      inspectionSummary,
      _timing: { photoAnalysisTimeMs, summaryTimeMs, totalTimeMs },
    });
  } catch (err) {
    console.error("/api/generate error:", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Server error in /api/generate",
    });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
