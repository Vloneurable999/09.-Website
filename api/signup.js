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

/**
 * Reuse the MongoDB connection across warm Vercel serverless invocations
 * to stay well within MongoDB Atlas free-tier connection limits.
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
    const { handle, email, password, optInDrops } = body;

    const cleanHandle = String(handle || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    // Server-side validation
    if (!cleanHandle) {
      return res.status(400).json({ error: "Please enter a username or handle." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const formattedHandle = cleanHandle.startsWith("@") ? cleanHandle : `@${cleanHandle}`;
    const rawUsername = formattedHandle.slice(1);

    const db = await getDatabase();
    const members = db.collection("members");

    // Prevent duplicate signups with the same email or username (case-insensitive, with or without @)
    const escapedUsername = rawUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingMember = await members.findOne({
      $or: [
        { email: cleanEmail },
        { handle: { $regex: `^@?${escapedUsername}$`, $options: "i" } },
      ],
    });
    if (existingMember) {
      const conflictMsg =
        existingMember.email === cleanEmail
          ? "An account with this email is already in the club."
          : "That username is already taken. Please choose another.";
      return res.status(409).json({ error: conflictMsg });
    }

    // Generate sequential club pass number (e.g., #RV-0001, #RV-0002)
    const memberCount = await members.countDocuments();
    const passNumber = memberCount + 1;
    const memberId = `#RV-${String(passNumber).padStart(4, "0")}`;

    // Assign default role based on handle or Member ID number
    const lowerHandle = formattedHandle.toLowerCase();
    let defaultRole = "member";
    if (passNumber === 1 || lowerHandle === "@raveyn" || lowerHandle === "@itsraveyn") {
      defaultRole = "artist";
    } else if (passNumber <= 25) {
      defaultRole = "og";
    }

    const newMember = {
      memberId,
      role: defaultRole,
      handle: formattedHandle,
      email: cleanEmail,
      passwordHash: hashPassword(cleanPassword),
      optInDrops: Boolean(optInDrops),
      createdAt: new Date(),
    };

    await members.insertOne(newMember);

    // Return safe member data (never return passwordHash)
    return res.status(201).json({
      member: {
        memberId: newMember.memberId,
        role: newMember.role,
        handle: newMember.handle,
        email: newMember.email,
        optInDrops: newMember.optInDrops,
      },
    });
  } catch (error) {
    console.error("MongoDB Signup Error:", error);
    return res.status(500).json({
      error: "Server error while creating your member pass. Please try again.",
    });
  }
}