/**
 * ============================================================================
 * api/login.js — VERCEL SERVERLESS FUNCTION (MONGODB ATLAS)
 * Handles POST /api/login requests, verifies scrypt password hashes using
 * timing-safe comparison, and authenticates by username/handle.
 * ============================================================================
 */
import { MongoClient } from "mongodb";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "raveyns_club";
const OG_PROMO_CUTOFF = new Date("2026-12-01T23:59:59-06:00");
const BADGE_PRIORITY = ["artist", "admin", "mod", "vip", "og", "member"];
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_LOGINS = 8; // Lock out brute-force attempts after 8 failures in 15 mins

/**
 * Hashes client IP for brute-force rate limiting without storing raw IP addresses.
 */
function getClientIpHash(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(rawIp).digest("hex").slice(0, 24);
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
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { identifier, handle, password } = body;

    const rawIdentifier = String(identifier || handle || "").trim();
    const cleanPassword = String(password || "");

    if (!rawIdentifier) {
      return res.status(400).json({ error: "Please enter your username." });
    }
    if (!cleanPassword) {
      return res.status(400).json({ error: "Please enter your password." });
    }

    const db = await getDatabase();
    const members = db.collection("members");
    const securityLogs = db.collection("security_events");

    const ipHash = getClientIpHash(req);
    const bareUsername = rawIdentifier.replace(/^@+/, "");
    const attemptKey = `${ipHash}:${bareUsername.toLowerCase()}`;

    const recentFailures = await securityLogs.countDocuments({
      type: "login_fail",
      attemptKey,
      createdAt: { $gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
    });
    if (recentFailures >= MAX_FAILED_LOGINS) {
      return res.status(429).json({
        error: "Too many failed login attempts. Please wait 15 minutes and try again.",
      });
    }

    // Look up member by username/handle (case-insensitive, with or without @)
    const escapedUsername = escapeRegex(bareUsername);
    const member = await members.findOne({
      handle: { $regex: `^@?${escapedUsername}$`, $options: "i" },
    });

    if (!member || !verifyPassword(cleanPassword, member.passwordHash)) {
      await securityLogs.insertOne({
        type: "login_fail",
        attemptKey,
        createdAt: new Date(),
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    // Clear failed login attempts on successful sign-in
    await securityLogs.deleteMany({ type: "login_fail", attemptKey });
    if (!createdDate || Number.isNaN(createdDate.getTime()) || createdDate <= OG_PROMO_CUTOFF) {
      badgeSet.add("og");
    }
    if (badgeSet.size > 1 && badgeSet.has("member")) {
      badgeSet.delete("member");
    }
    if (badgeSet.size === 0) {
      badgeSet.add("member");
    }

    const resolvedBadges = [...badgeSet].sort((a, b) => {
      const idxA = BADGE_PRIORITY.indexOf(a);
      const idxB = BADGE_PRIORITY.indexOf(b);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    // Automatically upgrade old user documents in MongoDB so their badges persist
    // and remove the deprecated optInDrops field if present
    const needsBadgeMigration =
      !Array.isArray(member.badges) ||
      member.badges.length !== resolvedBadges.length ||
      resolvedBadges.some((b, i) => member.badges[i] !== b) ||
      member.role !== resolvedBadges[0];
    const hasDeprecatedDrops = Object.prototype.hasOwnProperty.call(member, "optInDrops");

    if (needsBadgeMigration || hasDeprecatedDrops) {
      const updateDoc = {};
      if (needsBadgeMigration) {
        updateDoc.$set = {
          badges: resolvedBadges,
          role: resolvedBadges[0],
        };
      }
      if (hasDeprecatedDrops) {
        updateDoc.$unset = { optInDrops: "" };
      }
      await members.updateOne({ _id: member._id }, updateDoc);
    }

    const totalMembers = await members.countDocuments();

    // Return safe member data (never return passwordHash)
    return res.status(200).json({
      totalMembers,
      member: {
        memberId: member.memberId,
        role: resolvedBadges[0],
        badges: resolvedBadges,
        handle: member.handle,
      },
    });
  } catch (error) {
    console.error("MongoDB Login Error:", error);
    return res.status(500).json({
      error: "Server error while logging in. Please try again.",
    });
  }
}