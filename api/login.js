/**
 * ============================================================================
 * api/login.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Handles POST /api/login requests, verifies scrypt password hashes using
 * timing-safe comparison, and supports logging in by email or username/handle.
 * ============================================================================
 */
import { MongoClient } from "mongodb";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";

/**
 * Reuse the MongoDB connection across warm Vercel serverless invocations.
 */
async function getDatabase() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set in Vercel.");
  }

  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    globalThis._mongoClientPromise = client.connect();
  }

  const client = await globalThis._mongoClientPromise;
  return client.db(MONGODB_DB);
}

/**
 * Verifies a plaintext password against a stored "salt:derivedKey" scrypt hash.
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, keyHex] = storedHash.split(":");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedKey = Buffer.from(keyHex, "hex");

  if (derivedKey.length !== storedKey.length) return false;
  return crypto.timingSafeEqual(derivedKey, storedKey);
}

/**
 * Escapes special regex characters for safe case-insensitive handle lookup.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { identifier, email, handle, password } = req.body || {};

    const rawIdentifier = String(identifier || email || handle || "").trim();
    const cleanPassword = String(password || "");

    if (!rawIdentifier) {
      return res.status(400).json({ error: "Please enter your email or username." });
    }
    if (!cleanPassword) {
      return res.status(400).json({ error: "Please enter your password." });
    }

    const db = await getDatabase();
    const members = db.collection("members");

    // Check if the user entered an email address or a username/handle
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawIdentifier);
    let query;

    if (isEmail) {
      query = { email: rawIdentifier.toLowerCase() };
    } else {
      const normalizedHandle = rawIdentifier.startsWith("@")
        ? rawIdentifier
        : `@${rawIdentifier}`;
      query = { handle: { $regex: `^${escapeRegex(normalizedHandle)}$`, $options: "i" } };
    }

    const member = await members.findOne(query);
    if (!member || !verifyPassword(cleanPassword, member.passwordHash)) {
      return res.status(401).json({ error: "Invalid email/username or password." });
    }

    // Return safe member data (never return passwordHash)
    return res.status(200).json({
      member: {
        memberId: member.memberId,
        handle: member.handle,
        email: member.email,
        optInDrops: Boolean(member.optInDrops),
      },
    });
  } catch (error) {
    console.error("MongoDB Login Error:", error);
    return res.status(500).json({
      error: "Server error while logging in. Please try again.",
    });
  }
}