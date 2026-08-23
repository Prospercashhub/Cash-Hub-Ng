// Cash Hub NG - Server API (Neon PostgreSQL)
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { pool, initializeDatabase } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const CPX_SECRET = process.env.CPX_SECRET || "";
const EARNWALL_API_KEY = process.env.EARNWALL_API_KEY || "";
const EARNWALL_SECRET_KEY = process.env.EARNWALL_SECRET_KEY || "";

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
      "SELECT id, trans_id, title, type, amount, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC",
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
    const { userId, amount, method } = req.body || {};
    const value = Number(amount);
    if (!isUuid(userId) || !method || !Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "Missing parameters" });
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT balance, active_referrals FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const user = rows[0];
    if (!user) { await client.query("ROLLBACK"); return res.status(404).json({ error: "User not found" }); }
    if (Number(user.active_referrals || 0) < 5) { await client.query("ROLLBACK"); return res.status(400).json({ error: "You need 5 active referrals before you can withdraw." }); }
    if (value < 10000) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Minimum withdrawal is ₦10,000." }); }
    if (Number(user.balance || 0) < value) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Insufficient available balance." }); }
    await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [value, userId]);
    await client.query("INSERT INTO withdrawals (user_id, amount, method, status) VALUES ($1, $2, $3, $4)", [userId, value, method, "Pending"]);
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
    await client.query(`UPDATE users SET balance = balance + $1, ${earningColumn} = COALESCE(${earningColumn}, 0) + $1 WHERE id = $2`, [reward, user_id]);
    await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [String(trans_id), user_id, "CPX Survey Reward", "survey", reward]);
    await client.query("COMMIT");
    return res.status(200).send("OK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {}); console.error(err); return res.status(500).send("ERROR");
  } finally { client.release(); }
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
  try {
    if (!EARNWALL_SECRET_KEY) return res.status(503).send("EarnWall not configured");
    const body = req.body || {};
    const userId = String(body.subId || "").trim();
    const transId = String(body.transId || "").trim();
    const rewardRaw = String(body.reward ?? "").trim();
    const signature = String(body.signature || "").trim().toLowerCase();
    const status = String(body.status || "1").trim();
    const debug = String(body.debug || "0").trim();
    if (!isUuid(userId) || !transId || rewardRaw === "" || !signature) return res.status(400).send("Invalid postback");
    if (!/^-?\d+(?:\.\d+)?$/.test(rewardRaw)) return res.status(400).send("Invalid reward");
    const reward = Number(rewardRaw);
    if (!Number.isFinite(reward) || reward <= 0) return res.status(400).send("Invalid reward");
    const expected = crypto.createHash("md5").update(`${userId}${transId}${rewardRaw}${EARNWALL_SECRET_KEY}`, "utf8").digest("hex");
    const supplied = Buffer.from(signature, "utf8");
    const calculated = Buffer.from(expected, "utf8");
    if (supplied.length !== calculated.length || !crypto.timingSafeEqual(supplied, calculated)) return res.status(403).send("ERROR: Signature doesn't match");
    if (debug === "1") return res.send("ok");

    const { earningColumn } = await getUserColumns(client);
    const isChargeback = status === "2";
    const reversalId = `${transId}_reversal`;
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [transId]);

    if (isChargeback) {
      const reversalExists = await client.query("SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1", [reversalId]);
      if (reversalExists.rows[0]) { await client.query("COMMIT"); return res.send("ok"); }
      const original = await client.query("SELECT id, user_id, amount FROM transactions WHERE trans_id = $1 LIMIT 1", [transId]);
      if (!original.rows[0]) {
        await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [reversalId, userId, "EarnWall chargeback pending", "earnwall_reversal", 0]);
        await client.query("COMMIT");
        return res.send("ok");
      }
      if (String(original.rows[0].user_id) !== userId) { await client.query("ROLLBACK"); return res.status(400).send("User mismatch"); }
      const user = (await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
      if (!user) { await client.query("ROLLBACK"); return res.status(404).send("User not found"); }
      const amountToReverse = Math.abs(Number(original.rows[0].amount || reward));
      await client.query(`UPDATE users SET balance = balance - $1, ${earningColumn} = COALESCE(${earningColumn}, 0) - $1 WHERE id = $2`, [amountToReverse, userId]);
      await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [reversalId, userId, "EarnWall chargeback", "earnwall_reversal", -amountToReverse]);
      await client.query("COMMIT");
      return res.send("ok");
    }

    const reversalMarker = await client.query("SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1", [reversalId]);
    if (reversalMarker.rows[0]) { await client.query("COMMIT"); return res.send("ok"); }
    const existing = await client.query("SELECT id FROM transactions WHERE trans_id = $1 LIMIT 1", [transId]);
    if (existing.rows[0]) { await client.query("COMMIT"); return res.send("ok"); }
    const user = (await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!user) { await client.query("ROLLBACK"); return res.status(404).send("User not found"); }
    await client.query(`UPDATE users SET balance = balance + $1, ${earningColumn} = COALESCE(${earningColumn}, 0) + $1 WHERE id = $2`, [reward, userId]);
    await client.query("INSERT INTO transactions (trans_id, user_id, title, type, amount) VALUES ($1, $2, $3, $4, $5)", [transId, userId, String(body.offer_name || "EarnWall Reward"), "earnwall", reward]);
    await client.query("COMMIT");
    return res.send("ok");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("EarnWall postback error:", err);
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
