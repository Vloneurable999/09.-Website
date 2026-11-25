/**
 * ============================================================================
 * api/signup.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Handles POST /api/signup requests, securely hashes passwords with Node's
 * built-in crypto module, prevents duplicate emails/usernames, and saves
 * members to MongoDB.
 * ============================================================================
 */
import { MongoClient } from "mongodb";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";
// Anyone who signs up on or before Dec 1, 2026 (11:59:59 PM CST) gets the OG badge
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");
const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const MAX_SIGNUPS_PER_IP = 5; // Max 5 accounts created per IP per hour
const RESERVED_HANDLES = new Set(["admin", "moderator", "mod", "staff", "support", "system", "official"]);

/**
 * Extracts client IP hash so we can rate-limit bot signups without storing raw IPs.
 */
function getClientIpHash(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 24);
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

/**
 * Securely hashes a password using a random 16-byte salt and scrypt.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { handle, password } = body;

    const cleanHandle = String(handle || "").trim();
    const cleanPassword = String(password || "");

    // Server-side validation
    if (!cleanHandle) {
      return res.status(400).json({ error: "Please enter a username." });
    }
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const formattedHandle = cleanHandle.startsWith("@") ? cleanHandle : `@${cleanHandle}`;
    const rawUsername = formattedHandle.slice(1);
    if (!rawUsername) {
      return res.status(400).json({ error: "Please enter a valid username." });
    }
    if (!/^[a-zA-Z0-9._]{2,24}$/.test(rawUsername)) {
      return res.status(400).json({
        error: "Username must be 2–24 characters (letters, numbers, dots, or underscores).",
      });
    }
    if (RESERVED_HANDLES.has(rawUsername.toLowerCase())) {
      return res.status(400).json({
        error: "That username is reserved. Please choose another.",
      });
    }
    if (cleanPassword.length > 128) {
      return res.status(400).json({ error: "Password must be 128 characters or less." });
    }

    const db = await getDatabase();
    const members = db.collection("members");
    const securityLogs = db.collection("security_events");

    // Rate limit signup spam per IP address
    const ipHash = getClientIpHash(req);
    const recentSignups = await securityLogs.countDocuments({
      type: "signup",
      ipHash,
      createdAt: { $gte: new Date(Date.now() - SIGNUP_WINDOW_MS) },
    });
    if (recentSignups >= MAX_SIGNUPS_PER_IP) {
      return res.status(429).json({
        error: "Too many accounts created recently. Please try again later.",
      });
    }

    // Prevent duplicate signups with the same username (case-insensitive, with or without @)
    const escapedUsername = rawUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingMember = await members.findOne({
      handle: { $regex: `^@?${escapedUsername}$`, $options: "i" },
    });
    if (existingMember) {
      return res.status(409).json({
        error: "That username is already taken. Please choose another.",
      });
    }

    // Generate sequential club member ID (e.g., #RV-0001, #RV-0002)
    const memberCount = await members.countDocuments();
    const passNumber = memberCount + 1;
    const memberId = `#RV-${String(passNumber).padStart(4, "0")}`;

    // Collect and stack starting badges (Artist for raveyn, OG for signups through Dec 1st)
    const now = new Date();
    const lowerHandle = formattedHandle.toLowerCase();
    const collectedBadges = [];
    if (passNumber === 1 || lowerHandle === "@raveyn" || lowerHandle === "@itsraveyn") {
      collectedBadges.push("artist");
    }
    if (now <= OG_PROMO_CUTOFF) {
      collectedBadges.push("og");
    }
    if (collectedBadges.length === 0) {
      collectedBadges.push("member");
    }

    const newMember = {
      memberId,
      role: collectedBadges[0],
      badges: collectedBadges,
      handle: formattedHandle,
      passwordHash: hashPassword(cleanPassword),
      createdAt: now,
    };

    await members.insertOne(newMember);
    await securityLogs.insertOne({
      type: "signup",
      ipHash,
      memberId,
      createdAt: now,
    });

    // Return safe member data (never return passwordHash)
    return res.status(201).json({
      totalMembers: passNumber,
      member: {
        memberId: newMember.memberId,
        role: newMember.role,
        badges: newMember.badges,
        handle: newMember.handle,
      },
    });
  } catch (error) {
    console.error("MongoDB Signup Error:", error);
    return res.status(500).json({
      error: "Server error while creating your member pass. Please try again.",
    });
  }
}