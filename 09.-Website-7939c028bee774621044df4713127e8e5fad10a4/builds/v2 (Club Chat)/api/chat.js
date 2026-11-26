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
    // GET /api/chat — Return the latest 50 messages in chronological order
    // ------------------------------------------------------------------------
    if (req.method === "GET") {
      const docs = await chatCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(FETCH_LIMIT)
        .toArray();

      const messages = docs.reverse().map((doc) => ({
        id: doc._id.toString(),
        memberId: doc.memberId,
        handle: doc.handle,
        text: doc.text,
        createdAt: doc.createdAt,
      }));

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ messages });
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
          error: "Invalid member pass. Please sign out and log back in.",
        });
      }

      const newMessage = {
        memberId: member.memberId,
        handle: member.handle,
        text: cleanText,
        createdAt: new Date(),
      };

      const insertResult = await chatCollection.insertOne(newMessage);

      return res.status(201).json({
        message: {
          id: insertResult.insertedId.toString(),
          memberId: newMessage.memberId,
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