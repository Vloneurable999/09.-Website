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
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");
const BADGE_PRIORITY = ["artist", "admin", "mod", "vip", "og", "member"];

/**
 * Resolves a member's full stacked badges array from legacy or new records.
 */
function resolveMemberBadges(member) {
  const badgeSet = new Set();

  if (Array.isArray(member.badges)) {
    member.badges.forEach((b) => {
      if (b) badgeSet.add(String(b).trim().toLowerCase());
    });
  }

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
    try {
      await migrateLegacyData(db);
    } catch (migrationError) {
      console.error("Legacy badge migration skipped:", migrationError);
    }
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

      const totalMembers = await db.collection("members").countDocuments();

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

      const memberBadges = resolveMemberBadges(member);

      // Persist upgraded badges onto old member documents if missing
      if (!Array.isArray(member.badges) || member.badges.length === 0) {
        await membersCollection.updateOne(
          { _id: member._id },
          { $set: { badges: memberBadges, role: memberBadges[0] } }
        );
      }

      const newMessage = {
        memberId: member.memberId,
        role: memberBadges[0],
        badges: memberBadges,
        handle: member.handle,
        text: cleanText,
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
    return res.status(500).json({
      error: "Server error loading club chat. Please try again.",
    });
  }
}