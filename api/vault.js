/**
 * ============================================================================
 * api/vault.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Members-only Club Vault for demos, snippets, and teasers.
 * - Artist/Admin only: chunked video uploads & deleting items
 * - Signed-in members only: listing vault items, HTTP Range video streaming,
 *   and toggling emoji reactions
 * ============================================================================
 */
import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";

const ALLOWED_CATEGORIES = new Set(["demo", "snippet", "teaser"]);
const ALLOWED_EMOJIS = new Set(["🔥", "💜", "🤯", "😭", "✨", "🔁"]);
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB max per video
const MAX_RANGE_BYTES = 2 * 1024 * 1024; // 2 MB per range response (stays under Vercel 4.5 MB limit)

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
 * Looks up a member in MongoDB using memberId and/or email.
 */
async function findVerifiedMember(db, memberId, email) {
  const cleanId = String(memberId || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanId && !cleanEmail) return null;

  const clauses = [];
  if (cleanId) clauses.push({ memberId: cleanId });
  if (cleanEmail) clauses.push({ email: cleanEmail });

  return db.collection("members").findOne({ $or: clauses });
}

/**
 * Checks whether a verified member has artist/admin upload privileges.
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
 * Normalizes a MongoDB Binary or Buffer chunk into a Node.js Buffer.
 */
function toNodeBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data && data.buffer) return Buffer.from(data.buffer);
  return Buffer.from(data || []);
}

/**
 * Formats a vault item document for safe JSON responses.
 */
function serializeVaultItem(doc, viewerMemberId) {
  const rawReactions = doc.reactions && typeof doc.reactions === "object" ? doc.reactions : {};
  const reactions = {};

  for (const emoji of ALLOWED_EMOJIS) {
    const list = Array.isArray(rawReactions[emoji]) ? rawReactions[emoji] : [];
    reactions[emoji] = {
      count: list.length,
      reacted: Boolean(viewerMemberId && list.includes(viewerMemberId)),
    };
  }

  return {
    id: doc._id.toString(),
    title: doc.title,
    category: doc.category || "demo",
    caption: doc.caption || "",
    mimeType: doc.mimeType || "video/mp4",
    fileSize: doc.fileSize || 0,
    uploadedBy: doc.uploadedBy || { memberId: "#RV-0001", handle: "@raveyn" },
    reactions,
    createdAt: doc.createdAt,
  };
}

export default async function handler(req, res) {
  try {
    const db = await getDatabase();
    const vaultItems = db.collection("vault_items");
    const vaultChunks = db.collection("vault_chunks");

    // ------------------------------------------------------------------------
    // GET /api/vault — Stream a video (?stream=ID) OR list all vault items
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const { stream, memberId, email } = req.query || {};
      const member = await findVerifiedMember(db, memberId, email);

      if (!member) {
        return res.status(401).json({
          error: "Members only. Please sign in to access the Club Vault.",
        });
      }

      // Stream video bytes with HTTP Range (206 Partial Content) support
      if (stream) {
        if (!ObjectId.isValid(stream)) {
          return res.status(400).json({ error: "Invalid video ID." });
        }

        const vaultObjectId = new ObjectId(stream);
        const item = await vaultItems.findOne({ _id: vaultObjectId, status: "ready" });
        if (!item) {
          return res.status(404).json({ error: "Video not found." });
        }

        const totalSize = Number(item.fileSize || 0);
        const chunkSize = Number(item.chunkSize || 1536 * 1024);
        const rangeHeader = req.headers.range;

        let start = 0;
        let end = Math.min(totalSize - 1, MAX_RANGE_BYTES - 1);

        if (rangeHeader && rangeHeader.startsWith("bytes=")) {
          const [rawStart, rawEnd] = rangeHeader.replace("bytes=", "").split("-");
          start = parseInt(rawStart, 10);
          if (Number.isNaN(start) || start < 0) start = 0;

          if (rawEnd) {
            end = parseInt(rawEnd, 10);
          } else {
            end = start + MAX_RANGE_BYTES - 1;
          }

          if (Number.isNaN(end) || end >= totalSize) {
            end = totalSize - 1;
          }
          // Cap each response slice to stay safely below Vercel's 4.5 MB limit
          if (end - start + 1 > MAX_RANGE_BYTES) {
            end = start + MAX_RANGE_BYTES - 1;
          }
        }

        if (start >= totalSize || start > end) {
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          return res.status(416).end();
        }

        const firstChunkIndex = Math.floor(start / chunkSize);
        const lastChunkIndex = Math.floor(end / chunkSize);

        const chunks = await vaultChunks
          .find({
            vaultId: vaultObjectId,
            index: { $gte: firstChunkIndex, $lte: lastChunkIndex },
          })
          .sort({ index: 1 })
          .toArray();

        if (!chunks.length) {
          return res.status(404).json({ error: "Video data not found." });
        }

        const combined = Buffer.concat(chunks.map((c) => toNodeBuffer(c.data)));
        const offsetInCombined = start - firstChunkIndex * chunkSize;
        const length = end - start + 1;
        const slice = combined.subarray(offsetInCombined, offsetInCombined + length);

        res.setHeader("Content-Type", item.mimeType || "video/mp4");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
        res.setHeader("Content-Length", slice.length);
        res.setHeader("Cache-Control", "private, max-age=3600");
        return res.status(206).send(slice);
      }

      // Otherwise return list of ready vault items
      const docs = await vaultItems
        .find({ status: "ready" })
        .sort({ createdAt: -1 })
        .limit(40)
        .toArray();

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        isArtist: isArtistMember(member),
        items: docs.map((doc) => serializeVaultItem(doc, member.memberId)),
      });
    }

    // ------------------------------------------------------------------------
    // POST /api/vault — init, chunk, complete, react, delete
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { action, memberId, email } = body;

      const member = await findVerifiedMember(db, memberId, email);
      if (!member) {
        return res.status(401).json({
          error: "Members only. Please sign in to continue.",
        });
      }

      // 1. EMOJI REACTION (Available to all signed-in members)
      if (action === "react") {
        const { vaultId, emoji } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid vault item ID." });
        }
        if (!ALLOWED_EMOJIS.has(emoji)) {
          return res.status(400).json({ error: "Unsupported emoji reaction." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        const item = await vaultItems.findOne({ _id: vaultObjectId, status: "ready" });
        if (!item) {
          return res.status(404).json({ error: "Vault item not found." });
        }

        const currentReactors = Array.isArray(item.reactions?.[emoji])
          ? item.reactions[emoji]
          : [];
        const hasReacted = currentReactors.includes(member.memberId);

        const updateOp = hasReacted
          ? { $pull: { [`reactions.${emoji}`]: member.memberId } }
          : { $addToSet: { [`reactions.${emoji}`]: member.memberId } };

        await vaultItems.updateOne({ _id: vaultObjectId }, updateOp);
        const updated = await vaultItems.findOne({ _id: vaultObjectId });

        return res.status(200).json({
          item: serializeVaultItem(updated, member.memberId),
        });
      }

      // All remaining actions (init, chunk, complete, delete) are ARTIST / ADMIN ONLY
      if (!isArtistMember(member)) {
        return res.status(403).json({
          error: "Only raveyn can upload or manage vault videos.",
        });
      }

      // 2. INIT CHUNKED UPLOAD
      if (action === "init") {
        const cleanTitle = String(body.title || "").trim();
        const cleanCategory = String(body.category || "demo").trim().toLowerCase();
        const cleanCaption = String(body.caption || "").trim().slice(0, 280);
        const cleanMime = String(body.mimeType || "video/mp4").trim().toLowerCase();
        const fileSize = Number(body.fileSize || 0);
        const chunkCount = Number(body.chunkCount || 0);
        const chunkSize = Number(body.chunkSize || 1536 * 1024);

        if (!cleanTitle || cleanTitle.length > 100) {
          return res.status(400).json({ error: "Please enter a title (max 100 characters)." });
        }
        if (!ALLOWED_CATEGORIES.has(cleanCategory)) {
          return res.status(400).json({ error: "Category must be demo, snippet, or teaser." });
        }
        if (!cleanMime.startsWith("video/")) {
          return res.status(400).json({ error: "Only video files (MP4, WebM, MOV) are supported." });
        }
        if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_VIDEO_BYTES) {
          return res.status(400).json({
            error: "Video file must be under 50 MB.",
          });
        }
        if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 60) {
          return res.status(400).json({ error: "Invalid video chunk count." });
        }

        const emptyReactions = {};
        for (const emoji of ALLOWED_EMOJIS) emptyReactions[emoji] = [];

        const insertResult = await vaultItems.insertOne({
          title: cleanTitle,
          category: cleanCategory,
          caption: cleanCaption,
          mimeType: cleanMime,
          fileSize,
          chunkCount,
          chunkSize,
          status: "uploading",
          uploadedBy: {
            memberId: member.memberId,
            handle: member.handle,
          },
          reactions: emptyReactions,
          createdAt: new Date(),
        });

        return res.status(201).json({
          vaultId: insertResult.insertedId.toString(),
        });
      }

      // 3. UPLOAD SINGLE VIDEO CHUNK
      if (action === "chunk") {
        const { vaultId, index, dataBase64 } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid upload session." });
        }
        if (!Number.isInteger(index) || index < 0 || !dataBase64) {
          return res.status(400).json({ error: "Missing video chunk data." });
        }

        const buffer = Buffer.from(dataBase64, "base64");
        const vaultObjectId = new ObjectId(vaultId);

        await vaultChunks.updateOne(
          { vaultId: vaultObjectId, index },
          { $set: { vaultId: vaultObjectId, index, data: buffer } },
          { upsert: true }
        );

        return res.status(200).json({ ok: true, index });
      }

      // 4. COMPLETE UPLOAD
      if (action === "complete") {
        const { vaultId } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid upload session." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        await vaultItems.updateOne(
          { _id: vaultObjectId },
          { $set: { status: "ready" } }
        );

        const readyDoc = await vaultItems.findOne({ _id: vaultObjectId });
        return res.status(200).json({
          ok: true,
          item: serializeVaultItem(readyDoc, member.memberId),
        });
      }

      // 5. DELETE VAULT VIDEO
      if (action === "delete") {
        const { vaultId } = body;
        if (!ObjectId.isValid(vaultId)) {
          return res.status(400).json({ error: "Invalid vault item ID." });
        }

        const vaultObjectId = new ObjectId(vaultId);
        await vaultChunks.deleteMany({ vaultId: vaultObjectId });
        await vaultItems.deleteOne({ _id: vaultObjectId });

        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Unknown vault action." });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("MongoDB Club Vault Error:", error);
    return res.status(500).json({
      error: "Server error while accessing the Club Vault. Please try again.",
    });
  }
}