// Cash Hub NG - Server API (Neon PostgreSQL)
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { pool, initializeDatabase } = require("./db");

const app = express();
// ================= DAILY EARNING LIMIT =================
// Users can earn a maximum of ₦3,000 in one fixed 24-hour earning session.
// The session allowance resets after 24 hours from the session start.
// The user's actual wallet balance is never reset or reduced by this limit.
const DAILY_EARNING_LIMIT_NGN = 3000;
const EARNING_TRANSACTION_TYPES = [
  "earning",
  "earnwall",
  "adswedmedia",
  "adslab",
  "adslab_task",
  "adslab_rewarded"
];

async function findActiveEarningSession(client, userId) {
  const marker = await client.query(
    `SELECT created_at
       FROM transactions
      WHERE user_id = $1
        AND type = 'earning_session'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  const createdAt = marker.rows[0]?.created_at
    ? new Date(marker.rows[0].created_at)
    : null;

  if (createdAt && (Date.now() - createdAt.getTime()) < 24 * 60 * 60 * 1000) {
    return createdAt;
  }

  // Existing users may have earning activity from before the fixed-session
  // marker was introduced. Carry forward the earliest earning from the
  // current 24-hour window once, so the new system does not give an accidental
  // second allowance to someone who has already earned today.
  if (!createdAt) {
    const legacy = await client.query(
      `SELECT MIN(created_at) AS first_earning_at
         FROM transactions
        WHERE user_id = $1
          AND amount > 0
          AND type = ANY($2::text[])
          AND created_at >= NOW() - INTERVAL '24 hours'`,
      [userId, EARNING_TRANSACTION_TYPES]
    );
    return legacy.rows[0]?.first_earning_at
      ? new Date(legacy.rows[0].first_earning_at)
      : null;
  }

  return null;
}

async function getDailyEarningStatus(client, userId) {
  const sessionStart = await findActiveEarningSession(client, userId);

  if (!sessionStart) {
    return {
      earned: 0,
      remaining: DAILY_EARNING_LIMIT_NGN,
      locked: false,
      unlockAt: null,
      sessionStartedAt: null
    };
  }

  const sessionEnd = new Date(sessionStart.getTime() + 24 * 60 * 60 * 1000);

  if (Date.now() >= sessionEnd.getTime()) {
    return {
      earned: 0,
      remaining: DAILY_EARNING_LIMIT_NGN,
      locked: false,
      unlockAt: null,
      sessionStartedAt: null
    };
  }

  const result = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE user_id = $1
        AND amount > 0
        AND type = ANY($2::text[])
        AND created_at >= $3
        AND created_at < $4`,
    [userId, EARNING_TRANSACTION_TYPES, sessionStart, sessionEnd]
  );

  const earned = Number(result.rows[0]?.total || 0);
  const locked = earned >= DAILY_EARNING_LIMIT_NGN;

  return {
    earned,
    remaining: Math.max(0, DAILY_EARNING_LIMIT_NGN - earned),
    locked,
    unlockAt: locked ? sessionEnd : null,
    sessionStartedAt: sessionStart
  };
}

async function enforceDailyEarningLimit(client, userId, reward) {
  const amount = Number(reward);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error("Invalid earning amount");
    err.code = "INVALID_EARNING_AMOUNT";
    throw err;
  }

  let sessionStart = await findActiveEarningSession(client, userId);

  // Start a new fixed session only after the previous session has expired.
  // This is an internal zero-value marker, not a bonus/wallet transaction.
  if (!sessionStart || Date.now() >= sessionStart.getTime() + 24 * 60 * 60 * 1000) {
    sessionStart = new Date();
    const markerId = `earning_session_${userId}_${sessionStart.getTime()}`;
    await client.query(
      `INSERT INTO transactions
        (trans_id, user_id, title, type, amount, provider_amount, cashhub_topup, created_at)
       VALUES ($1, $2, $3, $4, 0, 0, 0, $5)`,
      [markerId, userId, "Earning session marker", "earning_session", sessionStart]
    );
  }

  const sessionEnd = new Date(sessionStart.getTime() + 24 * 60 * 60 * 1000);
  const result = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE user_id = $1
        AND amount > 0
        AND type = ANY($2::text[])
        AND created_at >= $3
        AND created_at < $4`,
    [userId, EARNING_TRANSACTION_TYPES, sessionStart, sessionEnd]
  );

  const earned = Number(result.rows[0]?.total || 0);
  const remaining = Math.max(0, DAILY_EARNING_LIMIT_NGN - earned);

  if (earned >= DAILY_EARNING_LIMIT_NGN || amount > remaining) {
    const err = new Error("Daily earning limit reached");
    err.code = "DAILY_EARNING_LIMIT_REACHED";
    err.unlockAt = sessionEnd;
    throw err;
  }

  return {
    earned,
    remaining,
    locked: false,
    unlockAt: null,
    sessionStartedAt: sessionStart
  };
}

async function recordDailyLimitBlock(client, { transId, userId, title, type, providerAmount = 0 }) {
  if (!transId) return;
  const existing = await client.query(
    "SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1",
    [String(transId)]
  );
  if (existing.rows[0]) return;

  await client.query(
    `INSERT INTO transactions
      (trans_id, user_id, title, type, amount, provider_amount, cashhub_topup)
     VALUES ($1, $2, $3, $4, 0, $5, 0)`,
    [String(transId), userId, String(title || "Earning blocked by daily limit").slice(0, 200), String(type || "earning_blocked"), Number(providerAmount) || 0]
  );
}


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const CPX_SECRET = process.env.CPX_SECRET || "";
const EARNWALL_API_KEY = process.env.EARNWALL_API_KEY || "";
const EARNWALL_SECRET_KEY = process.env.EARNWALL_SECRET_KEY || "";
const EARNWALL_USD_NGN_RATE = Number(process.env.EARNWALL_USD_NGN_RATE || "");
const EARNWALL_POINTS_PER_USD = 550;
const ADSLAB_PUBLISHER_API_KEY = process.env.ADSLAB_PUBLISHER_API_KEY || "";
const ADSLAB_SECURITY_HASH = process.env.ADSLAB_SECURITY_HASH || "";
const ADSLAB_TASK_PLACEMENT_ID = "task-Pi3AhBnLjUO4";
const ADSLAB_REWARDED_PLACEMENT_ID = "rew-sPMekgeEA8RJ";

const EARN_TASKS = [
  { id: "survey1", type: "Surveys", icon: "📝", title: "Short Survey", desc: "Complete a quick opinion survey.", reward: 1.50, time: "5 min" },
  { id: "task1", type: "Tasks", icon: "🎯", title: "Complete Demo Task", desc: "Do a short demonstration task.", reward: 2.00, time: "10 min" },
  { id: "game1", type: "Games", icon: "🎮", title: "Play Mini Game", desc: "Try a demo game activity.", reward: 0.50, time: "5 min" },
  { id: "offer1", type: "Offers", icon: "🎁", title: "Welcome Offer", desc: "Complete an eligible offer from the available list.", reward: 3.00, time: "10 min" }
];

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function publicUser(row) {
  if (!row) return null;
  return {
    ...row,
    earnings: row.earnings == null ? 0 : Number(row.earnings),
    referral_earnings: row.referral_earnings == null ? 0 : Number(row.referral_earnings)
  };
}

async function getUserColumns(client = pool) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'`
  );
  const cols = new Set(rows.map(r => r.column_name));
  if (!cols.has("balance")) throw new Error("Neon users.balance column is missing.");
  const earningColumn = cols.has("earning") ? "earning" : (cols.has("earnings") ? "earnings" : null);
  const referralColumn = cols.has("referral_earning") ? "referral_earning" : (cols.has("referral_earnings") ? "referral_earnings" : null);
  if (!earningColumn || !referralColumn) throw new Error("Neon users earnings columns are missing.");
  return { earningColumn, referralColumn };
}

async function selectUserById(client, userId, columns = "*") {
  const { earningColumn, referralColumn } = await getUserColumns(client);
  const select = columns === "*"
    ? `id, full_name, email, password, balance, ${earningColumn} AS earnings, ${referralColumn} AS referral_earnings, active_referrals, referral_code`
    : columns.replace(/\bearnings\b/g, `${earningColumn} AS earnings`).replace(/\breferral_earnings\b/g, `${referralColumn} AS referral_earnings`);
  const { rows } = await client.query(`SELECT ${select} FROM users WHERE id = $1`, [userId]);
  return rows[0] || null;
}

// ================= AUTH =================

app.get("/api/earning-limit/:userId", async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!isUuid(userId)) return res.status(400).json({ error: "Invalid userId" });

  const client = await pool.connect();
  try {
    const status = await getDailyEarningStatus(client, userId);
    res.json({
      limitNgn: DAILY_EARNING_LIMIT_NGN,
      earnedNgn: Math.min(status.earned, DAILY_EARNING_LIMIT_NGN),
      remainingNgn: status.remaining,
      locked: status.locked,
      unlockAt: status.locked && status.unlockAt ? status.unlockAt.toISOString() : null,
      sessionStartedAt: status.sessionStartedAt ? status.sessionStartedAt.toISOString() : null
    });
  } catch (err) {
    console.error("earning-limit status error:", err);
    res.status(500).json({ error: "Unable to check earning limit" });
  } finally {
    client.release();
  }
});

app.post("/api/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    const { full_name, email, password, referral_code } = req.body || {};
    if (!full_name || !email || !password) return res.status(400).json({ error: "All fields are required." });
    const cleanName = String(full_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanName) return res.status(400).json({ error: "Full name is required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });

    const { earningColumn, referralColumn } = await getUserColumns(client);
    const existing = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [cleanEmail]);
    if (existing.rows[0]) return res.status(400).json({ error: "Email already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = "CH" + Math.random().toString(36).substring(2, 8).toUpperCase();

    await client.query("BEGIN");
    const insert = await client.query(
      `INSERT INTO users (full_name, email, password, balance, ${earningColumn}, ${referralColumn}, active_referrals, referral_code)
       VALUES ($1, $2, $3, 0, 0, 0, 0, $4)
       RETURNING id, full_name, email, balance, ${earningColumn} AS earnings, ${referralColumn} AS referral_earnings, active_referrals, referral_code`,
      [cleanName, cleanEmail, hashedPassword, referralCode]
    );
    const user = insert.rows[0];

    if (referral_code) {
      const inviterResult = await client.query(
        "SELECT id, active_referrals FROM users WHERE referral_code = $1 LIMIT 1 FOR UPDATE",
        [String(referral_code).trim()]
      );
      const inviter = inviterResult.rows[0];
      if (inviter && inviter.id && String(inviter.id) !== String(user.id)) {
        await client.query(
          `INSERT INTO referrals (inviter_id, referred_user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [inviter.id, user.id]
        );
        await client.query(
          "UPDATE users SET active_referrals = COALESCE(active_referrals, 0) + 1 WHERE id = $1",
          [inviter.id]
        );
      }
    }
    await client.query("COMMIT");
    return res.json({ success: true, user });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    return res.status(500).json({ error: "Signup failed." });
  } finally { client.release(); }
});

app.post("/api/login", async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;
    if (!cleanEmail || !password) return res.status(400).json({ error: "Email and password are required." });
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [cleanEmail]);
    const raw = rows[0];
    if (!raw) return res.status(400).json({ error: "Invalid email or password." });
    const passwordCorrect = await bcrypt.compare(password, raw.password);
    if (!passwordCorrect) return res.status(400).json({ error: "Invalid email or password." });
    const user = await selectUserById(pool, raw.id);
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed." });
  }
});

// ================= PROFILE =================
app.get("/api/profile/:id", async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid user id." });
    const user = await selectUserById(pool, req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    delete user.password;
    return res.json(publicUser(user));
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

app.patch("/api/profile/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const cleanName = String(req.body?.full_name || "").trim();
    const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!isUuid(userId) || !cleanName || !cleanEmail) return res.status(400).json({ error: "Full name and email are required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
    const duplicate = await pool.query("SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1", [cleanEmail, userId]);
    if (duplicate.rows[0]) return res.status(400).json({ error: "Email already exists." });
    const { rows } = await pool.query(
      "UPDATE users SET full_name = $1, email = $2 WHERE id = $3 RETURNING id, full_name, email, balance, active_referrals, referral_code",
      [cleanName, cleanEmail, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found." });
    const user = await selectUserById(pool, userId);
    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

// ================= REFERRALS =================
app.get("/api/referrals/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!isUuid(userId)) return res.status(400).json({ error: "Invalid user id" });
    const { rows } = await pool.query(
      `SELECT r.id, r.referred_user_id, r.created_at,
              u.id AS user_id, u.full_name AS user_full_name, u.email AS user_email, u.referral_code AS user_referral_code
         FROM referrals r
         LEFT JOIN users u ON u.id = r.referred_user_id
        WHERE r.inviter_id = $1
        ORDER BY r.created_at DESC`, [userId]
    );
    return res.json({ referrals: rows.map(r => ({
      id: r.id, referred_user_id: r.referred_user_id, created_at: r.created_at,
      user: r.user_id ? { id: r.user_id, full_name: r.user_full_name, email: r.user_email, referral_code: r.user_referral_code } : null
    })) });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

// ================= WALLET =================
app.get("/api/wallet", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!isUuid(userId)) return res.status(400).json({ error: "Missing or invalid userId" });
    const user = await selectUserById(pool, userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    delete user.password;
    const tx = await pool.query(
      "SELECT id, trans_id, title, type, amount, created_at FROM transactions WHERE user_id = $1 AND type <> 'earning_session' ORDER BY created_at DESC",
      [userId]
    );
    const withdrawals = await pool.query(
      "SELECT id, amount, method, status, created_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return res.json({ user: publicUser(user), transactions: tx.rows, withdrawals: withdrawals.rows });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

// ================= WITHDRAWAL =================
app.post("/api/withdraw", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, amount, method, accountName, accountNumber } = req.body || {};
    const value = Number(amount);
    const cleanMethod = String(method || "").trim();
    const cleanAccountName = String(accountName || "").trim();
    const cleanAccountNumber = String(accountNumber || "").trim();
    if (!isUuid(userId) || !cleanMethod || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "Missing parameters" });
    if (!cleanAccountName || !/^\d{10}$/.test(cleanAccountNumber)) return res.status(400).json({ error: "Valid account name and 10-digit account number are required." });
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT balance, active_referrals FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const user = rows[0];
    if (!user) { await client.query("ROLLBACK"); return res.status(404).json({ error: "User not found" }); }
    if (Number(user.active_referrals || 0) < 5) { await client.query("ROLLBACK"); return res.status(400).json({ error: "You need 5 active referrals before you can withdraw." }); }
    if (value < 70000) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Minimum withdrawal is ₦70,000." }); }
    if (Number(user.balance || 0) < value) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Insufficient available balance." }); }
    await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [value, userId]);
    const withdrawalMethod = `${cleanMethod} | Account Name: ${cleanAccountName} | Account Number: ${cleanAccountNumber}`;
    await client.query("INSERT INTO withdrawals (user_id, amount, method, status) VALUES ($1, $2, $3, $4)", [userId, value, withdrawalMethod, "Pending"]);
    await client.query("INSERT INTO transactions (user_id, type, title, amount) VALUES ($1, $2, $3, $4)", [userId, "withdrawal", "Withdrawal request", -value]);
    await client.query("COMMIT");
    return res.status(201).json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {}); console.error(err); return res.status(500).json({ error: "Server Error" });
  } finally { client.release(); }
});

// ================= TASKS =================
app.get("/api/tasks", (req, res) => res.json({ tasks: EARN_TASKS }));

app.post("/api/complete-task", async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, taskId } = req.body || {};
    if (!isUuid(userId) || !taskId) return res.status(400).json({ error: "Missing parameters" });
    const task = EARN_TASKS.find(item => item.id === taskId);
    if (!task) return res.status(400).json({ error: "Invalid task" });
    const { earningColumn } = await getUserColumns(client);
    const reward = Number(task.reward || 0);
    await client.query("BEGIN");
    const userResult = await client.query(`SELECT id, balance, ${earningColumn} AS earnings FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const user = userResult.rows[0];
    if (!user) { await client.query("ROLLBACK"); return res.status(404).json({ error: "User not found" }); }
    const existing = await client.query("SELECT id FROM completed_tasks WHERE user_id = $1 AND task_id = $2 LIMIT 1", [userId, taskId]);
    if (existing.rows[0]) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Task already completed" }); }
    try {
      await enforceDailyEarningLimit(client, userId, reward);
    } catch (limitErr) {
      if (limitErr.code === "DAILY_EARNING_LIMIT_REACHED") {
        const blockedId = `task_${taskId}_daily_limit_blocked`;
        await recordDailyLimitBlock(client, {
          transId: blockedId,
          userId,
          title: `${task.title} — Daily limit reached`,
          type: "earning_blocked",
          providerAmount: reward
        });
        await client.query("COMMIT");
        return res.status(429).json({ error: "Daily earning limit reached. Come back after 24 hours.", unlockAt: limitErr.unlockAt ? limitErr.unlockAt.toISOString() : null });
      }
      await client.query("ROLLBACK");
      throw limitErr;
    }
    await client.query("INSERT INTO completed_tasks (user_id, task_id) VALUES ($1, $2)", [userId, taskId]);
    await client.query(`UPDATE users SET balance = balance + $1, ${earningColumn} = COALESCE(${earningColumn}, 0) + $1 WHERE id = $2`, [reward, userId]);
    await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [`task_${taskId}_${Date.now()}`, userId, task.title, "earning", reward]);
    await client.query("COMMIT");
    return res.json({ ok: true, reward });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {}); console.error(err); return res.status(500).json({ error: "Server Error" });
  } finally { client.release(); }
});

// ================= HEALTH =================
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ================= CPX HASH =================
app.get("/api/cpx-hash", async (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();
    if (!isUuid(userId)) return res.status(400).json({ error: "Invalid userId" });
    if (!CPX_SECRET) return res.status(503).json({ error: "CPX secure hash is not configured." });
    const user = await selectUserById(pool, userId, "id");
    if (!user) return res.status(404).json({ error: "User not found" });
    // CPX iframe documentation: md5(ext_user_id + '-' + app secure hash).
    const secureHash = crypto.createHash("md5").update(`${userId}-${CPX_SECRET}`, "utf8").digest("hex");
    return res.json({ secureHash });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

// ================= CPX CALLBACK =================
app.get("/api/cpx-callback", async (req, res) => {
  const client = await pool.connect();
  try {
    const { user_id, trans_id, reward_value, status } = req.query;
    const reward = Number(reward_value || 0);
    if (!isUuid(user_id) || !trans_id || !Number.isFinite(reward) || reward <= 0) return res.status(400).send("Invalid callback");
    const { earningColumn } = await getUserColumns(client);
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [String(trans_id)]);
    const existing = await client.query("SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1", [String(trans_id)]);
    if (existing.rows[0]) { await client.query("COMMIT"); return res.status(200).send("Already Processed"); }
    const user = (await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user_id])).rows[0];
    if (!user) { await client.query("ROLLBACK"); return res.status(404).send("User not found"); }
    // CPX is intentionally exempt from the Cash Hub ₦3,000 / 24-hour earning lock.
    // CPX rewards continue to credit normally and are not counted toward the lock.

    await client.query(`UPDATE users SET balance = balance + $1, ${earningColumn} = COALESCE(${earningColumn}, 0) + $1 WHERE id = $2`, [reward, user_id]);
    await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [String(trans_id), user_id, "CPX Survey Reward", "survey", reward]);
    await client.query("COMMIT");
    return res.status(200).send("OK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {}); console.error(err); return res.status(500).send("ERROR");
  } finally { client.release(); }
});

// ================= ADSWEDMEDIA CONFIG =================
app.get("/api/adswedmedia-config", async (req, res) => {
  try {
    const userId = String(req.query?.userId || "").trim();
    const publicKey = String(process.env.ADSWEDMEDIA_PUBLIC_KEY || "").trim();

    if (!isUuid(userId)) {
      return res.status(400).json({ error: "Missing or invalid userId" });
    }

    if (!publicKey) {
      return res.status(503).json({ error: "AdsWedMedia public key is not configured." });
    }

    return res.json({ publicKey });
  } catch (err) {
    console.error("AdsWedMedia config error:", err);
    return res.status(500).json({ error: "Server Error" });
  }
});

// ================= EARNWALL =================
app.get("/api/earnwall-config", async (req, res) => {
  try {
    const userId = String(req.query.userId || "").trim();
    if (!isUuid(userId)) return res.status(400).json({ error: "Invalid userId" });
    if (!EARNWALL_API_KEY) return res.status(503).json({ error: "EarnWall is not configured." });
    const user = await selectUserById(pool, userId, "id");
    if (!user) return res.status(404).json({ error: "User not found" });
    const offerwallUrl = `https://earnwall.net/offerwall/${encodeURIComponent(EARNWALL_API_KEY)}/${encodeURIComponent(userId)}`;
    return res.json({ offerwallUrl });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: "Server Error" });
  }
});

app.post("/api/earnwall/postback", async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    if (!EARNWALL_SECRET_KEY) return res.status(503).send("EarnWall not configured");
    if (!Number.isFinite(EARNWALL_USD_NGN_RATE) || EARNWALL_USD_NGN_RATE <= 0) {
      return res.status(503).send("EarnWall currency conversion is not configured");
    }

    const body = req.body || {};
    const userId = String(body.subId ?? "").trim();
    const transId = String(body.transId ?? "").trim();
    const rewardRaw = String(body.reward ?? "").trim();
    const signature = String(body.signature ?? "").trim().toLowerCase();
    const status = String(body.status ?? "").trim();
    const debug = String(body.debug ?? "0").trim();

    if (!isUuid(userId) || !transId || transId.length > 255 || !signature) {
      return res.status(400).send("Invalid postback");
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rewardRaw)) {
      return res.status(400).send("Invalid reward");
    }

    const reward = Number(rewardRaw);
    if (!Number.isFinite(reward) || reward <= 0) {
      return res.status(400).send("Invalid reward");
    }

    // Cash Hub NG keeps 50% of the EarnWall USD payout and credits the user 50%.
    // EarnWall is configured at 550 Points = $1, so the user reward is:
    // (points / 550) * USD/NGN rate * 0.50.
    const userReward = (reward / EARNWALL_POINTS_PER_USD) * EARNWALL_USD_NGN_RATE * 0.50;
    if (!Number.isFinite(userReward) || userReward <= 0) {
      return res.status(400).send("Invalid calculated reward");
    }

    if (status !== "1" && status !== "2") {
      return res.status(400).send("Invalid status");
    }

    // EarnWall documents: MD5(subId + transId + reward + Secret Key).
    // Keep the exact provider-supplied reward string in the hash.
    const expected = crypto
      .createHash("md5")
      .update(`${userId}${transId}${rewardRaw}${EARNWALL_SECRET_KEY}`, "utf8")
      .digest("hex");

    if (!/^[a-f0-9]{32}$/.test(signature)) {
      return res.status(403).send("ERROR: Signature doesn't match");
    }

    const supplied = Buffer.from(signature, "utf8");
    const calculated = Buffer.from(expected, "utf8");
    if (!crypto.timingSafeEqual(supplied, calculated)) {
      return res.status(403).send("ERROR: Signature doesn't match");
    }

    // EarnWall debug/test calls are authenticated but must never credit the wallet.
    if (debug === "1") return res.send("ok");

    const { earningColumn } = await getUserColumns(client);
    const isChargeback = status === "2";
    const reversalId = `${transId}_reversal`;

    await client.query("BEGIN");
    inTransaction = true;

    // Serialize every callback for the same provider transaction.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`earnwall:${transId}`]);

    const user = (await client.query(
      "SELECT id FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    )).rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(404).send("User not found");
    }

    if (isChargeback) {
      // A reversal is its own transaction record, making repeated chargebacks idempotent.
      const reversalExists = await client.query(
        "SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1",
        [reversalId]
      );
      if (reversalExists.rows[0]) {
        await client.query("COMMIT");
        inTransaction = false;
        return res.send("ok");
      }

      const original = await client.query(
        "SELECT id, user_id, amount FROM transactions WHERE trans_id = $1 AND type = $2 LIMIT 1",
        [transId, "earnwall"]
      );

      // Do not create a fake pending wallet transaction. If the original reward is
      // absent, acknowledge the provider without changing the wallet.
      if (!original.rows[0]) {
        await client.query("COMMIT");
        inTransaction = false;
        return res.send("ok");
      }

      if (String(original.rows[0].user_id) !== userId) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("User mismatch");
      }

      const amountToReverse = Math.abs(Number(original.rows[0].amount));
      if (!Number.isFinite(amountToReverse) || amountToReverse <= 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("Invalid original reward");
      }

      await client.query(
        `UPDATE users
            SET balance = balance - $1,
                ${earningColumn} = COALESCE(${earningColumn}, 0) - $1
          WHERE id = $2`,
        [amountToReverse, userId]
      );

      await client.query(
        "INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)",
        [reversalId, userId, "EarnWall chargeback", "earnwall_reversal", -amountToReverse]
      );

      await client.query("COMMIT");
      inTransaction = false;
      return res.send("ok");
    }

    // A previous successful callback or a prior reversal marker means this provider
    // transaction has already been handled.
    const existing = await client.query(
      "SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1",
      [transId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      inTransaction = false;
      return res.send("ok");
    }

    try {
      await enforceDailyEarningLimit(client, userId, userReward);
    } catch (limitErr) {
      if (limitErr.code === "DAILY_EARNING_LIMIT_REACHED") {
        await recordDailyLimitBlock(client, {
          transId,
          userId,
          title: "EarnWall Reward — Daily limit reached",
          type: "earnwall_blocked",
          providerAmount: reward
        });
        await client.query("COMMIT");
        return res.status(200).send("DAILY_LIMIT_REACHED");
      }
      await client.query("ROLLBACK");
      throw limitErr;
    }

    await client.query(
      `UPDATE users
          SET balance = balance + $1,
              ${earningColumn} = COALESCE(${earningColumn}, 0) + $1
        WHERE id = $2`,
      [userReward, userId]
    );

    await client.query(
      "INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)",
      [transId, userId, String(body.offer_name || "EarnWall Reward"), "earnwall", userReward]
    );

    await client.query("COMMIT");
    inTransaction = false;
    return res.send("ok");
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    console.error("EarnWall postback error:", err);
    return res.status(500).send("ERROR");
  } finally {
    client.release();
  }
});


// ================= ADSWEDMEDIA POSTBACK =================
app.all("/api/adswedmedia/postback", async (req, res) => {
  // Support both AdsWedMedia production parameter names and the dashboard tester aliases.
  const params = { ...(req.query || {}), ...(req.body || {}) };
  const type = String(params.type ?? "").trim().toLowerCase();

  // AdsWedMedia dashboard test callbacks must always be acknowledged without
  // touching the wallet or transactions table.
  if (type === "test") return res.status(200).send("OK");

  const client = await pool.connect();
  let inTransaction = false;
  try {
    const userId = String(params.subId ?? params.user_id ?? "").trim();
    const transId = String(params.transId ?? params.transid ?? "").trim();
    const rewardRaw = String(params.reward ?? "").trim();
    const signature = String(params.signature ?? "").trim().toLowerCase();
    const status = String(params.status ?? "").trim();

    if (!userId || !isUuid(userId) || !transId || transId.length > 255) {
      return res.status(400).send("Invalid postback");
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rewardRaw)) {
      return res.status(400).send("Invalid reward");
    }

    const reward = Number(rewardRaw);
    if (!Number.isFinite(reward) || reward <= 0) {
      return res.status(400).send("Invalid reward");
    }
    if (status !== "1" && status !== "2") {
      return res.status(400).send("Invalid status");
    }

    const secret = process.env.ADSWEDMEDIA_SECRET_KEY || "";
    if (!secret) return res.status(503).send("AdsWedMedia not configured");

    // Production signature: MD5(subId + transId + reward + ADSWEDMEDIA_SECRET_KEY).
    const expected = crypto
      .createHash("md5")
      .update(`${userId}${transId}${rewardRaw}${secret}`, "utf8")
      .digest("hex");

    if (!/^[a-f0-9]{32}$/.test(signature)) {
      return res.status(403).send("ERROR: Signature doesn't match");
    }

    const supplied = Buffer.from(signature, "utf8");
    const calculated = Buffer.from(expected, "utf8");
    if (!crypto.timingSafeEqual(supplied, calculated)) {
      return res.status(403).send("ERROR: Signature doesn't match");
    }

    const { earningColumn } = await getUserColumns(client);
    const isChargeback = status === "2";
    const reversalId = `${transId}_reversal`;

    await client.query("BEGIN");
    inTransaction = true;

    // Serialize callbacks for the same AdsWedMedia transaction.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`adswedmedia:${transId}`]);

    const user = (await client.query(
      "SELECT id FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    )).rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(404).send("User not found");
    }

    if (isChargeback) {
      // A chargeback is recorded separately so repeated chargebacks are idempotent.
      const reversalExists = await client.query(
        "SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1",
        [reversalId]
      );
      if (reversalExists.rows[0]) {
        await client.query("COMMIT");
        inTransaction = false;
        return res.send("DUP");
      }

      const original = await client.query(
        "SELECT id, user_id, amount FROM transactions WHERE trans_id = $1 AND type = $2 LIMIT 1",
        [transId, "adswedmedia"]
      );

      // If there is no credited transaction to reverse, acknowledge the provider
      // without changing the wallet.
      if (!original.rows[0]) {
        await client.query("COMMIT");
        inTransaction = false;
        return res.send("OK");
      }

      if (String(original.rows[0].user_id) !== userId) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("User mismatch");
      }

      const amountToReverse = Math.abs(Number(original.rows[0].amount));
      if (!Number.isFinite(amountToReverse) || amountToReverse <= 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("Invalid original reward");
      }

      await client.query(
        `UPDATE users
            SET balance = balance - $1,
                ${earningColumn} = COALESCE(${earningColumn}, 0) - $1
          WHERE id = $2`,
        [amountToReverse, userId]
      );

      await client.query(
        "INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)",
        [reversalId, userId, "AdsWedMedia chargeback", "adswedmedia_reversal", -amountToReverse]
      );

      await client.query("COMMIT");
      inTransaction = false;
      return res.send("OK");
    }

    // The provider transaction ID is the idempotency key.
    const existing = await client.query(
      "SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1",
      [transId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      inTransaction = false;
      return res.send("DUP");
    }

    // Cash Hub NG targets ONE combined user reward of ₦1,000.
    // The verified provider reward is preserved internally in provider_amount;
    // Cash Hub tops up only the difference needed to reach the ₦1,000 total.
    const TOTAL_USER_REWARD = 1000;
    const providerAmount = reward;
    const cashhubTopup = TOTAL_USER_REWARD - providerAmount;

    if (
      !Number.isFinite(providerAmount) ||
      providerAmount <= 0 ||
      !Number.isFinite(cashhubTopup) ||
      cashhubTopup < 0
    ) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(400).send("Invalid provider reward for ₦1,000 total reward");
    }

    const userReward = TOTAL_USER_REWARD;

    try {
      await enforceDailyEarningLimit(client, userId, userReward);
    } catch (limitErr) {
      if (limitErr.code === "DAILY_EARNING_LIMIT_REACHED") {
        await recordDailyLimitBlock(client, {
          transId,
          userId,
          title: `${String(params.offer_name || "AdsWedMedia Reward").slice(0, 160)} — Daily limit reached`,
          type: "adswedmedia_blocked",
          providerAmount
        });
        await client.query("COMMIT");
        return res.status(200).send("DAILY_LIMIT_REACHED");
      }
      await client.query("ROLLBACK");
      throw limitErr;
    }

    await client.query(
      `UPDATE users
          SET balance = balance + $1,
              ${earningColumn} = COALESCE(${earningColumn}, 0) + $1
        WHERE id = $2`,
      [userReward, userId]
    );

    await client.query(
      `INSERT INTO transactions
        (trans_id, user_id, title, type, amount, provider_amount, cashhub_topup)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transId,
        userId,
        String(params.offer_name || "AdsWedMedia Reward"),
        "adswedmedia",
        userReward,
        providerAmount,
        cashhubTopup
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;
    return res.send("OK");
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    console.error("AdsWedMedia postback error:", err);
    return res.status(500).send("ERROR");
  } finally {
    client.release();
  }
});


// ================= ADSLAB TASKS + POSTBACK =================
function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || req.ip || "127.0.0.1").replace(/^::ffff:/, "");
}

app.get("/api/adslab/tasks", async (req, res) => {
  try {
    if (!ADSLAB_PUBLISHER_API_KEY) {
      return res.status(503).json({ error: "AdsLab Publisher API Key is not configured." });
    }

    const sessionUserId = String(req.query.userId || "").trim();
    if (!isUuid(sessionUserId)) return res.status(400).json({ error: "Invalid userId" });

    const user = await selectUserById(pool, sessionUserId, "id");
    if (!user) return res.status(404).json({ error: "User not found" });

    const country = String(req.query.country || "ng").trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 2) || "ng";
    const type = String(req.query.type || "all").trim().toLowerCase();
    const allowedTypes = new Set(["all", "telegram", "ptc", "shortlinks", "surveys", "offers"]);
    const safeType = allowedTypes.has(type) ? type : "all";
    const ip = getClientIp(req);

    const url = `https://adslab.me/api/tasks-share/${ADSLAB_TASK_PLACEMENT_ID}/${encodeURIComponent(ADSLAB_PUBLISHER_API_KEY)}/${encodeURIComponent(country)}/${encodeURIComponent(sessionUserId)}/${encodeURIComponent(ip)}/${safeType}`;
    const response = await fetch(url, {
      headers: { "User-Agent": String(req.headers["user-agent"] || "Cash Hub NG") },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return res.status(502).json({ error: "AdsLab tasks service is unavailable." });
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("AdsLab tasks error:", err);
    return res.status(502).json({ error: "Unable to load AdsLab tasks." });
  }
});

app.get("/api/adslab/postback", async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const uid = String(req.query.uid || "").trim();
    const pid = String(req.query.pid || "").trim();
    const txid = String(req.query.txid || "").trim();
    const rewardRaw = String(req.query.reward || "").trim();
    const status = String(req.query.status || "completed").trim().toLowerCase();
    const signature = String(req.query.signature || "").trim().toLowerCase();

    if (!isUuid(uid) || !txid || txid.length > 255 || !signature) return res.status(400).send("Invalid postback");
    if (![ADSLAB_TASK_PLACEMENT_ID, ADSLAB_REWARDED_PLACEMENT_ID, "int-qGxFeIYSPabq"].includes(pid)) return res.status(400).send("Invalid placement");
    if (!ADSLAB_SECURITY_HASH) return res.status(503).send("AdsLab not configured");

    const expected = crypto.createHash("sha256").update(`${txid}-${ADSLAB_SECURITY_HASH}`, "utf8").digest("hex");
    if (!/^[a-f0-9]{64}$/.test(signature)) return res.status(403).send("Invalid signature");
    const a = Buffer.from(signature, "utf8"), b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).send("Invalid signature");

    // Interstitial callbacks have no user reward in AdsLab's documented format.
    if (pid === "int-qGxFeIYSPabq") return res.status(200).send("OK");

    const { earningColumn } = await getUserColumns(client);
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`adslab:${txid}`]);

    const user = (await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [uid])).rows[0];
    if (!user) { await client.query("ROLLBACK"); inTransaction = false; return res.status(404).send("User not found"); }

    const existing = await client.query("SELECT id, amount, user_id, type FROM transactions WHERE trans_id = $1 LIMIT 1", [txid]);

    if (status === "chargeback" || status === "reversed" || status === "rejected") {
      const reversalId = `${txid}_reversal`;
      const reversalExists = await client.query("SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1", [reversalId]);
      if (reversalExists.rows[0] || !existing.rows[0]) {
        await client.query("COMMIT"); inTransaction = false; return res.send("OK");
      }
      const original = existing.rows[0];
      if (String(original.user_id) !== uid) { await client.query("ROLLBACK"); inTransaction = false; return res.status(400).send("User mismatch"); }
      const amount = Math.abs(Number(original.amount || 0));
      if (amount > 0) {
        await client.query(`UPDATE users SET balance = balance - $1, ${earningColumn} = COALESCE(${earningColumn},0) - $1 WHERE id = $2`, [amount, uid]);
        await client.query("INSERT INTO transactions (trans_id,user_id,title,type,amount,provider_amount,cashhub_topup) VALUES ($1,$2,$3,$4,$5,$6,$7)", [reversalId, uid, "AdsLab chargeback", "adslab_reversal", -amount, 0, 0]);
      }
      await client.query("COMMIT"); inTransaction = false; return res.send("OK");
    }

    if (existing.rows[0]) { await client.query("COMMIT"); inTransaction = false; return res.send("DUP"); }

    let userReward = 0;
    let providerAmount = 0;
    let cashhubTopup = 0;
    let title = "AdsLab Reward";
    let type = "adslab";

    if (pid === ADSLAB_TASK_PLACEMENT_ID) {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rewardRaw)) { await client.query("ROLLBACK"); inTransaction = false; return res.status(400).send("Invalid reward"); }
      providerAmount = Number(rewardRaw);
      if (!Number.isFinite(providerAmount) || providerAmount <= 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("Invalid reward");
      }

      // Cash Hub NG targets ONE combined user reward of ₦1,000 for AdsLab Tasks.
      // Keep the verified provider reward internally and top up only the difference.
      const TOTAL_USER_REWARD = 1000;
      cashhubTopup = TOTAL_USER_REWARD - providerAmount;

      // Never allow a provider reward above the target to create a negative top-up.
      if (cashhubTopup < 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(400).send("Provider reward exceeds ₦1,000 target");
      }

      userReward = TOTAL_USER_REWARD;
      title = String(req.query.name || "AdsLab Task Reward").slice(0, 200);
      type = "adslab_task";
    } else {
      // AdsLab's rewarded-ad callback contains no reward amount. Therefore this
      // endpoint does not invent a provider payout. Set a business reward only
      // after deciding the amount in Render via ADSLAB_REWARDED_USER_REWARD_NGN.
      const configured = Number(process.env.ADSLAB_REWARDED_USER_REWARD_NGN || 0);
      if (!Number.isFinite(configured) || configured <= 0) {
        await client.query("COMMIT"); inTransaction = false; return res.send("OK");
      }
      userReward = configured;
      cashhubTopup = configured;
      title = "AdsLab Rewarded Ad";
      type = "adslab_rewarded";
    }

    try {
      await enforceDailyEarningLimit(client, uid, userReward);
    } catch (limitErr) {
      if (limitErr.code === "DAILY_EARNING_LIMIT_REACHED") {
        await recordDailyLimitBlock(client, {
          transId: txid,
          userId: uid,
          title: `${title} — Daily limit reached`,
          type: "adslab_blocked",
          providerAmount
        });
        await client.query("COMMIT");
        return res.status(200).send("DAILY_LIMIT_REACHED");
      }
      await client.query("ROLLBACK");
      throw limitErr;
    }

    await client.query(`UPDATE users SET balance = balance + $1, ${earningColumn} = COALESCE(${earningColumn},0) + $1 WHERE id = $2`, [userReward, uid]);
    await client.query("INSERT INTO transactions (trans_id,user_id,title,type,amount,provider_amount,cashhub_topup) VALUES ($1,$2,$3,$4,$5,$6,$7)", [txid, uid, title, type, userReward, providerAmount, cashhubTopup]);

    await client.query("COMMIT"); inTransaction = false; return res.send("OK");
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    console.error("AdsLab postback error:", err);
    return res.status(500).send("ERROR");
  } finally { client.release(); }
});

// ================= HOME =================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error("Database initialization failed:", err);
    process.exit(1);
  });
