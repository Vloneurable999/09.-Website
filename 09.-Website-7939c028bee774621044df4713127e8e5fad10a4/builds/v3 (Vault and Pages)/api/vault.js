/**
 * ============================================================================
 * api/vault.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Members-Only Club Archive & Artist Studio Video Uploader
 * - GET /api/vault?memberId=...&email=...               -> List ready archive videos
 * - GET /api/vault?stream=<id>&memberId=...&email=...   -> Stream video (HTTP Range 206)
 * - POST /api/vault { action: "react" }                 -> Toggle emoji reaction (members)
 * - POST /api/vault { action: "init" | "chunk" | "complete" | "delete" } -> Artist only
 * ============================================================================
 */
import { MongoClient, ObjectId, Binary } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";

const ALLOWED_CATEGORIES = new Set(["demo", "snippet", "teaser"]);
const ALLOWED_EMOJIS = new Set(["🔥", "💜", "🤯", "😭", "✨", "🔁"]);
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB max video size
const MAX_RANGE_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB max per 206 stream response (Vercel safe)

/**
 * Reuse the MongoDB connection across warm Vercel serverless invocations.
 */
async function getDatabase() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set in Vercel.");
  }

  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    globalThis._mongoClientPromise = client.connect().catch((err) => {
      globalThis._mongoClientPromise = null;
      throw err;
    });
  }

  const client = await globalThis._mongoClientPromise;
  return client.db(MONGODB_DB);
}

/**
 * Looks up a verified club member by memberId or email.
 */
async function findMember(db, memberId, email) {
  const cleanMemberId = String(memberId || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  const clauses = [];
  if (cleanMemberId) clauses.push({ memberId: cleanMemberId });
  if (cleanEmail) clauses.push({ email: cleanEmail });
  if (clauses.length === 0) return null;

  return db.collection("members").findOne({ $or: clauses });
}

/**
 * Checks whether a member has Artist or Admin privileges to upload/delete archive videos.
 */
function isArtistMember(member) {
  if (!member) return false;

  const normalizedId = String(member.memberId || "").trim().toUpperCase();
  const lowerHandle = String(member.handle || "").trim().toLowerCase();
  const lowerRole = String(member.role || "").trim().toLowerCase();
  const badges = Array.isArray(member.badges)
    ? member.badges.map((b) => String(b || "").trim().toLowerCase())
    : [];

  return (
    normalizedId === "#RV-0001" ||
    lowerHandle === "@raveyn" ||
    lowerHandle === "@itsraveyn" ||
    lowerRole === "artist" ||
    lowerRole === "admin" ||
    badges.includes("artist") ||
    badges.includes("admin")
  );
}

/**
 * Formats a MongoDB archive document into a safe frontend payload with reaction counts.
 */
function formatVaultItem(doc, viewerMemberId) {
  const rawReactions = doc.reactions && typeof doc.reactions === "object" ? doc.reactions : {};
  const reactions = {};

  for (const emoji of ALLOWED_EMOJIS) {
    const voters = Array.isArray(rawReactions[emoji]) ? rawReactions[emoji] : [];
    reactions[emoji] = {
      count: voters.length,
      reacted: Boolean(viewerMemberId && voters.includes(viewerMemberId)),
    };
  }

  return {
    id: doc._id.toString(),
    title: doc.title || "Untitled",
    category: ALLOWED_CATEGORIES.has(doc.category) ? doc.category : "demo",
    caption: doc.caption || "",
    mimeType: doc.mimeType || "video/mp4",
    fileSize: doc.fileSize || 0,
    uploadedBy: doc.uploadedBy || "@raveyn",
    createdAt: doc.createdAt || new Date(),
    reactions,
  };
}

/**
 * Converts a MongoDB Binary or Buffer chunk into a Node.js Buffer.
 */
function toNodeBuffer(data) {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer) return Buffer.from(data.buffer);
  return Buffer.from(data);
}

export default async function handler(req, res) {
  try {
    const db = await getDatabase();
    const vaultItems = db.collection("vault_items");
    const vaultChunks = db.collection("vault_chunks");

    // ------------------------------------------------------------------------
    // GET /api/vault — Stream a video OR list all ready Club Archive items
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const { memberId, email, stream } = req.query || {};
      const member = await findMember(db, memberId, email);

      if (!member) {
        return res.status(401).json({
          error: "Members only. Please sign in to access the Club Archive.",
        });
      }

      // 1. STREAM VIDEO BY ID (Supports HTTP Range 206 for smooth seeking)
      if (stream) {
        if (!ObjectId.isValid(stream)) {
          return res.status(400).json({ error: "Invalid archive video ID." });
        }

        const vaultObjectId = new ObjectId(stream);
        const item = await vaultItems.findOne({ _id: vaultObjectId, status: "ready" });
        if (!item) {
          return res.status(404).json({ error: "Archive video not found." });
        }

        const totalSize = Number(item.fileSize) || 0;
        const chunkSize = Number(item.chunkSize) || 1536 * 1024;
        const mimeType = item.mimeType || "video/mp4";

        if (totalSize <= 0) {
          return res.status(404).json({ error: "Video data is empty." });
        }

        const rangeHeader = req.headers.range;
        let start = 0;
        let end = Math.min(totalSize - 1, MAX_RANGE_CHUNK_BYTES - 1);
        let isPartial = false;

        if (rangeHeader) {
          const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
          if (match) {
            isPartial = true;
            start = match[1] ? parseInt(match[1], 10) : 0;
            const requestedEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1;
            end = Math.min(requestedEnd, totalSize - 1, start + MAX_RANGE_CHUNK_BYTES - 1);
          }
        } else if (totalSize <= MAX_RANGE_CHUNK_BYTES) {
          end = totalSize - 1;
        } else {
          // Cap un-ranged requests to stay under Vercel's response payload limit
          isPartial = true;
        }

        if (start >= totalSize || start > end || start < 0) {
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          return res.status(416).end();
        }

        const startChunk = Math.floor(start / chunkSize);
        const endChunk = Math.floor(end / chunkSize);

        const chunks = await vaultChunks
          .find({
            vaultId: vaultObjectId,
            index: { $gte: startChunk, $lte: endChunk },
          })
          .sort({ index: 1 })
          .toArray();

        if (!chunks.length) {
          return res.status(404).json({ error: "Video chunks not found." });
        }

        const combined = Buffer.concat(chunks.map((c) => toNodeBuffer(c.data)));
        const sliceStart = start - startChunk * chunkSize;
        const sliceEnd = end - startChunk * chunkSize + 1;
        const payload = combined.subarray(sliceStart, sliceEnd);

        res.setHeader("Content-Type", mimeType);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", payload.length);
        res.setHeader("Cache-Control", "private, max-age=3600");

        if (isPartial) {
          res.setHeader("Content-Range", `bytes ${start}-${start + payload.length - 1}/${totalSize}`);
          return res.status(206).send(payload);
        }

        return res.status(200).send(payload);
      }

      // 2. LIST ALL READY ARCHIVE VIDEOS
      const docs = await vaultItems
        .find({ status: "ready" })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        items: docs.map((doc) => formatVaultItem(doc, member.memberId)),
      });
    }

    // ------------------------------------------------------------------------
    // POST /api/vault — Emoji reactions (members) & Uploads/Deletes (artist)
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { action, memberId, email } = body;

      const member = await findMember(db, memberId, email);
      if (!member) {
        return res.status(401).json({
          error: "Members only. Please sign in to access the Club Archive.",
        });
      }

      // 1. EMOJI REACTION (Available to all signed-in members)
      if (action === "react") {
        const { vaultId, emoji } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid archive item ID." });
        }
        if (!ALLOWED_EMOJIS.has(emoji)) {
          return res.status(400).json({ error: "Unsupported emoji reaction." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        const item = await vaultItems.findOne({ _id: vaultObjectId, status: "ready" });
        if (!item) {
          return res.status(404).json({ error: "Archive item not found." });
        }

        const currentVoters = Array.isArray(item.reactions?.[emoji])
          ? item.reactions[emoji]
          : [];
        const hasReacted = currentVoters.includes(member.memberId);

        const updateOp = hasReacted
          ? { $pull: { [`reactions.${emoji}`]: member.memberId } }
          : { $addToSet: { [`reactions.${emoji}`]: member.memberId } };

        await vaultItems.updateOne({ _id: vaultObjectId }, updateOp);
        const updated = await vaultItems.findOne({ _id: vaultObjectId });

        return res.status(200).json({
          item: formatVaultItem(updated, member.memberId),
        });
      }

      // All remaining actions (init, chunk, complete, delete) are ARTIST / ADMIN ONLY
      if (!isArtistMember(member)) {
        return res.status(403).json({
          error: "Only raveyn can upload or manage archive videos.",
        });
      }

      // 2. INITIALIZE CHUNKED UPLOAD
      if (action === "init") {
        const cleanTitle = String(body.title || "").trim().slice(0, 100);
        const cleanCategory = String(body.category || "demo").trim().toLowerCase();
        const cleanCaption = String(body.caption || "").trim().slice(0, 280);
        const mimeType = String(body.mimeType || "video/mp4").trim();
        const fileSize = Number(body.fileSize) || 0;
        const chunkCount = Number(body.chunkCount) || 0;
        const chunkSize = Number(body.chunkSize) || 1536 * 1024;

        if (!cleanTitle) {
          return res.status(400).json({ error: "Please provide a title for the video." });
        }
        if (!ALLOWED_CATEGORIES.has(cleanCategory)) {
          return res.status(400).json({ error: "Invalid category. Use demo, snippet, or teaser." });
        }
        if (!mimeType.startsWith("video/")) {
          return res.status(400).json({ error: "Only video files are allowed." });
        }
        if (fileSize <= 0 || fileSize > MAX_VIDEO_BYTES) {
          return res.status(400).json({ error: "Video must be between 1 byte and 50 MB." });
        }
        if (chunkCount <= 0 || chunkCount > 100) {
          return res.status(400).json({ error: "Invalid chunk count." });
        }

        const insertRes = await vaultItems.insertOne({
          title: cleanTitle,
          category: cleanCategory,
          caption: cleanCaption,
          mimeType,
          fileSize,
          chunkCount,
          chunkSize,
          status: "uploading",
          uploadedBy: member.handle || "@raveyn",
          uploadedByMemberId: member.memberId,
          reactions: {},
          createdAt: new Date(),
        });

        return res.status(201).json({
          vaultId: insertRes.insertedId.toString(),
        });
      }

      // 3. UPLOAD INDIVIDUAL VIDEO CHUNK
      if (action === "chunk") {
        const { vaultId, index, dataBase64 } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid archive upload ID." });
        }
        const chunkIndex = Number(index);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
          return res.status(400).json({ error: "Invalid chunk index." });
        }
        if (typeof dataBase64 !== "string" || !dataBase64.length) {
          return res.status(400).json({ error: "Missing chunk data." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        const item = await vaultItems.findOne({ _id: vaultObjectId });
        if (!item) {
          return res.status(404).json({ error: "Upload session not found." });
        }

        const buffer = Buffer.from(dataBase64, "base64");
        await vaultChunks.updateOne(
          { vaultId: vaultObjectId, index: chunkIndex },
          {
            $set: {
              vaultId: vaultObjectId,
              index: chunkIndex,
              data: new Binary(buffer),
            },
          },
          { upsert: true }
        );

        return res.status(200).json({ ok: true, index: chunkIndex });
      }

      // 4. FINALIZE CHUNKED UPLOAD
      if (action === "complete") {
        const { vaultId } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid archive upload ID." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        const item = await vaultItems.findOne({ _id: vaultObjectId });
        if (!item) {
          return res.status(404).json({ error: "Upload session not found." });
        }

        const uploadedChunks = await vaultChunks.countDocuments({ vaultId: vaultObjectId });
        if (uploadedChunks < (item.chunkCount || 1)) {
          return res.status(400).json({
            error: "Some video chunks are missing. Please try uploading again.",
          });
        }

        await vaultItems.updateOne(
          { _id: vaultObjectId },
          { $set: { status: "ready", updatedAt: new Date() } }
        );

        const readyItem = await vaultItems.findOne({ _id: vaultObjectId });
        return res.status(200).json({
          item: formatVaultItem(readyItem, member.memberId),
        });
      }

      // 5. DELETE ARCHIVE VIDEO
      if (action === "delete") {
        const { vaultId } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid archive item ID." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        await vaultChunks.deleteMany({ vaultId: vaultObjectId });
        await vaultItems.deleteOne({ _id: vaultObjectId });

        return res.status(200).json({ ok: true, deletedId: vaultId });
      }

      return res.status(400).json({ error: "Unknown archive action." });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("MongoDB Club Archive Error:", error);
    return res.status(500).json({
      error: "Server error while accessing the Club Archive. Please try again.",
    });
  }
}