/**
 * ============================================================================
 * api/chat.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Handles GET /api/chat (fetch recent club messages) and POST /api/chat
 * (verify club member and save a new message to MongoDB).
 * ============================================================================
 */
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";
const MAX_MESSAGE_LENGTH = 400;
const FETCH_LIMIT = 50;
const CHAT_COOLDOWN_MS = 3000; // Minimum 3 seconds between messages per user
const CHAT_BURST_LIMIT = 6; // Max 6 messages per 60 seconds
const CHAT_BURST_WINDOW_MS = 60 * 1000;
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");
const BADGE_PRIORITY = ["artist", "admin", "mod", "vip", "og", "member"];

/**
 * Checks whether a member has Artist, Admin, or Mod privileges.
 */
function isStaffMember(member) {
  if (!member) return false;
  const badges = resolveMemberBadges(member);
  return badges.some((b) => b === "artist" || b === "admin" || b === "mod");
}

/**
 * Strips invisible/control Unicode characters & excessive whitespace to prevent
 * Zalgo/blank-message spam while keeping emojis and normal punctuation intact.
 */
function sanitizeChatText(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Detects common spam patterns (external URLs, repeated character floods).
 */
function detectChatSpam(text) {
  // Block external links / phishing domains for regular members
  if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|gg|xyz|co|me|tk|link|click)\b)/i.test(text)) {
    return "External links are blocked in Club Chat to keep members safe.";
  }
  // Block 12+ identical consecutive characters (e.g., "aaaaaaaaaaaa")
  if (/(.)\1{11,}/u.test(text)) {
    return "Please avoid spamming repeated characters.";
  }
  return null;
}

/**
 * Resolves all collected badges for a member document.
 */
function resolveMemberBadges(member) {
  const badgeSet = new Set();

  if (member.role) {
    badgeSet.add(String(member.role).trim().toLowerCase());
  }

  const normalizedId = String(member.memberId || "").trim().toUpperCase();
  const lowerHandle = String(member.handle || "").trim().toLowerCase();
  if (
    normalizedId === "#RV-0001" ||
    lowerHandle === "@raveyn" ||
    lowerHandle === "@itsraveyn"
  ) {
    badgeSet.add("artist");
  }

  // Old accounts created on or before Dec 1, 2026 (or without a timestamp) get OG
  const createdDate = member.createdAt ? new Date(member.createdAt) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime()) || createdDate <= OG_PROMO_CUTOFF) {
    badgeSet.add("og");
  }

  if (badgeSet.size > 1 && badgeSet.has("member")) {
    badgeSet.delete("member");
  }
  if (badgeSet.size === 0) {
    badgeSet.add("member");
  }

  return [...badgeSet].sort((a, b) => {
    const idxA = BADGE_PRIORITY.indexOf(a);
    const idxB = BADGE_PRIORITY.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

/**
 * Automatically upgrades old MongoDB member & chat documents that predate
 * the stacked badges array. Runs once per warm serverless instance.
 */
async function migrateLegacyData(db) {
  if (globalThis._raveynsMemberDataMigratedV2) return;

  const membersCol = db.collection("members");

  // Remove deprecated optInDrops field from all existing MongoDB member documents
  await membersCol.updateMany(
    { optInDrops: { $exists: true } },
    { $unset: { optInDrops: "" } }
  );

  const legacyMembers = await membersCol
    .find({
      $or: [
        { badges: { $exists: false } },
        { badges: { $not: { $type: "array" } } },
        { badges: { $size: 0 } },
        { role: { $exists: false } },
      ],
    })
    .toArray();

  if (legacyMembers.length > 0) {
    const bulkOps = legacyMembers.map((member) => {
      const badges = resolveMemberBadges(member);
      return {
        updateOne: {
          filter: { _id: member._id },
          update: {
            $set: {
              badges,
              role: badges[0],
            },
          },
        },
      };
    });
    await membersCol.bulkWrite(bulkOps);
  }

  // Also backfill any old chat_messages missing the badges array
  const chatCol = db.collection("chat_messages");
  const legacyMessages = await chatCol
    .find({
      $or: [
        { badges: { $exists: false } },
        { badges: { $not: { $type: "array" } } },
      ],
    })
    .limit(200)
    .toArray();

  if (legacyMessages.length > 0) {
    const memberIds = [...new Set(legacyMessages.map((m) => m.memberId).filter(Boolean))];
    const memberDocs = await membersCol
      .find({ memberId: { $in: memberIds } })
      .toArray();
    const memberMap = new Map(memberDocs.map((m) => [m.memberId, resolveMemberBadges(m)]));

    const msgBulkOps = legacyMessages.map((msg) => {
      const badges = memberMap.get(msg.memberId) || resolveMemberBadges(msg);
      return {
        updateOne: {
          filter: { _id: msg._id },
          update: {
            $set: {
              badges,
              role: badges[0],
            },
          },
        },
      };
    });
    await chatCol.bulkWrite(msgBulkOps);
  }

  globalThis._raveynsMemberDataMigratedV2 = true;
}

/**
 * Resolves all collected badges for a member document.
 */
function resolveMemberBadges(member) {
  const badgeSet = new Set();

  if (member.role) {
    badgeSet.add(String(member.role).trim().toLowerCase());
  }

  const normalizedId = String(member.memberId || "").trim().toUpperCase();
  const lowerHandle = String(member.handle || "").trim().toLowerCase();
  if (
    normalizedId === "#RV-0001" ||
    lowerHandle === "@raveyn" ||
    lowerHandle === "@itsraveyn"
  ) {
    badgeSet.add("artist");
  }

  const createdDate = member.createdAt ? new Date(member.createdAt) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime()) || createdDate <= OG_PROMO_CUTOFF) {
    badgeSet.add("og");
  }

  if (badgeSet.size > 1 && badgeSet.has("member")) {
    badgeSet.delete("member");
  }
  if (badgeSet.size === 0) {
    badgeSet.add("member");
  }

  return [...badgeSet].sort((a, b) => {
    const idxA = BADGE_PRIORITY.indexOf(a);
    const idxB = BADGE_PRIORITY.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}

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

export default async function handler(req, res) {
  try {
    const db = await getDatabase();
    const chatCollection = db.collection("chat_messages");

    // ------------------------------------------------------------------------
    // GET /api/chat — Return latest 50 messages in chronological order
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const docs = await chatCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(FETCH_LIMIT)
        .toArray();

      // Look up live roles & stacked badges from the members collection by memberId
      const uniqueMemberIds = [...new Set(docs.map((d) => d.memberId).filter(Boolean))];
      const memberMetaMap = new Map();
      if (uniqueMemberIds.length > 0) {
        try {
          const memberDocs = await db
            .collection("members")
            .find(
              { memberId: { $in: uniqueMemberIds } },
              { projection: { memberId: 1, handle: 1, role: 1, badges: 1, createdAt: 1 } }
            )
            .toArray();
          memberDocs.forEach((m) => {
            if (m.memberId) {
              const resolvedBadges = resolveMemberBadges(m);
              memberMetaMap.set(m.memberId, {
                role: resolvedBadges[0],
                badges: resolvedBadges,
              });
            }
          });
        } catch (lookupErr) {
          console.warn("Member metadata lookup warning:", lookupErr);
        }
      }

      const messages = docs.reverse().map((doc) => {
        const liveMeta = memberMetaMap.get(doc.memberId);
        const fallbackBadges = resolveMemberBadges(doc);
        return {
          id: doc._id.toString(),
          memberId: doc.memberId,
          role: liveMeta?.role || fallbackBadges[0],
          badges: liveMeta?.badges?.length ? liveMeta.badges : fallbackBadges,
          handle: doc.handle,
          text: doc.text,
          createdAt: doc.createdAt,
        };
      });

      let totalMembers = 1;
      try {
        totalMembers = await db.collection("members").countDocuments();
      } catch {
        // Fallback count
      }

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ messages, totalMembers });
    }

    // ------------------------------------------------------------------------
    // POST /api/chat — Verify member and store a new chat message
    // ------------------------------------------------------------------------
    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const cleanMemberId = String(body.memberId || "").trim();
      const cleanHandle = String(body.handle || "").trim();
      const cleanEmail = String(body.email || "").trim().toLowerCase();
      const cleanText = String(body.text || "").trim();

      if (!cleanHandle || (!cleanMemberId && !cleanEmail)) {
        return res.status(401).json({ error: "Please log in to post in the club chat." });
      }
      if (!cleanText) {
        return res.status(400).json({ error: "Message cannot be empty." });
      }
      if (cleanText.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: `Messages must be ${MAX_MESSAGE_LENGTH} characters or less.`,
        });
      }

      // Verify that this logged-in member exists in MongoDB (by memberId or email)
      const membersCollection = db.collection("members");
      const lookupClauses = [];
      if (cleanMemberId) lookupClauses.push({ memberId: cleanMemberId });
      if (cleanEmail) lookupClauses.push({ email: cleanEmail });

      const member = await membersCollection.findOne({ $or: lookupClauses });
      if (!member) {
        return res.status(401).json({
          error: "Member pass not found. Please log in again.",
        });
      }

      if (member.chatBanned) {
        return res.status(403).json({
          error: "Your account has been muted from Club Chat.",
        });
      }

      const staff = isStaffMember(member);

      // ----------------------------------------------------------------------
      // STAFF MODERATION ACTIONS (Delete message or Mute/Unmute spammer)
      // ----------------------------------------------------------------------
      if (body.action === "delete" || body.action === "mute") {
        if (!staff) {
          return res.status(403).json({ error: "Staff permissions required." });
        }

        if (body.action === "delete") {
          const { ObjectId } = await import("mongodb");
          const msgId = String(body.messageId || "").trim();
          if (!ObjectId.isValid(msgId)) {
            return res.status(400).json({ error: "Invalid message ID." });
          }
          await chatCollection.deleteOne({ _id: new ObjectId(msgId) });
          return res.status(200).json({ ok: true, deletedId: msgId });
        }

        if (body.action === "mute") {
          const targetId = String(body.targetMemberId || "").trim();
          if (!targetId || targetId === member.memberId) {
            return res.status(400).json({ error: "Invalid target member." });
          }
          const target = await membersCollection.findOne({ memberId: targetId });
          if (!target || isStaffMember(target)) {
            return res.status(400).json({ error: "Cannot mute this user." });
          }
          const nextBannedState = !target.chatBanned;
          await membersCollection.updateOne(
            { _id: target._id },
            { $set: { chatBanned: nextBannedState } }
          );
          if (nextBannedState) {
            await chatCollection.deleteMany({ memberId: targetId });
          }
          return res.status(200).json({
            ok: true,
            targetMemberId: targetId,
            chatBanned: nextBannedState,
          });
        }
      }

      // ----------------------------------------------------------------------
      // ANTI-SPAM VALIDATION (Rate limit, duplicate check, link/flood filter)
      // ----------------------------------------------------------------------
      const sanitizedText = sanitizeChatText(cleanText);
      if (!sanitizedText) {
        return res.status(400).json({ error: "Message cannot be empty." });
      }
      if (sanitizedText.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: `Messages must be ${MAX_MESSAGE_LENGTH} characters or less.`,
        });
      }

      if (!staff) {
        const spamReason = detectChatSpam(sanitizedText);
        if (spamReason) {
          return res.status(400).json({ error: spamReason });
        }

        const nowMs = Date.now();
        const recentByUser = await chatCollection
          .find({ memberId: member.memberId })
          .sort({ createdAt: -1 })
          .limit(CHAT_BURST_LIMIT)
          .toArray();

        if (recentByUser.length > 0) {
          const latestMsg = recentByUser[0];
          const latestTime = new Date(latestMsg.createdAt).getTime();

          // 1. Cooldown check (3 seconds between messages)
          if (!Number.isNaN(latestTime) && nowMs - latestTime < CHAT_COOLDOWN_MS) {
            const waitSec = Math.ceil((CHAT_COOLDOWN_MS - (nowMs - latestTime)) / 1000);
            return res.status(429).json({
              error: `Slow down! Wait ${waitSec}s before sending another message.`,
            });
          }

          // 2. Duplicate message spam check (last 2 messages identical within 2 mins)
          const normalizedNew = sanitizedText.toLowerCase();
          const isDuplicate = recentByUser.slice(0, 2).some((prev) => {
            const prevTime = new Date(prev.createdAt).getTime();
            return (
              String(prev.text || "").trim().toLowerCase() === normalizedNew &&
              nowMs - prevTime < 2 * 60 * 1000
            );
          });
          if (isDuplicate) {
            return res.status(429).json({
              error: "Duplicate message blocked. Say something new!",
            });
          }

          // 3. Burst rate limit (max 6 messages per minute)
          const oldestInWindow = recentByUser[recentByUser.length - 1];
          const oldestTime = new Date(oldestInWindow.createdAt).getTime();
          if (
            recentByUser.length >= CHAT_BURST_LIMIT &&
            !Number.isNaN(oldestTime) &&
            nowMs - oldestTime < CHAT_BURST_WINDOW_MS
          ) {
            return res.status(429).json({
              error: "You're sending messages too fast. Take a quick breather!",
            });
          }
        }
      }

      const memberBadges = resolveMemberBadges(member);

      const newMessage = {
        memberId: member.memberId,
        role: memberBadges[0],
        badges: memberBadges,
        handle: member.handle,
        text: sanitizedText,
        createdAt: new Date(),
      };

      const insertResult = await chatCollection.insertOne(newMessage);

      return res.status(201).json({
        message: {
          id: insertResult.insertedId.toString(),
          memberId: newMessage.memberId,
          role: newMessage.role,
          badges: newMessage.badges,
          handle: newMessage.handle,
          text: newMessage.text,
          createdAt: newMessage.createdAt,
        },
      });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("MongoDB Club Chat Error:", error);
    const errMessage = error instanceof Error ? error.message : "Server error loading club chat.";
    return res.status(500).json({
      error: errMessage,
    });
  }
}