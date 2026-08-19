// Cash Hub NG - Server API
// Database: Neon PostgreSQL via DATABASE_URL

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { pool, initializeDatabase } = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const APP_SECRET =
  process.env.CPX_SECRET || "YOUR_CPX_SECRET";

// ================= EARN TASKS =================

const EARN_TASKS = [
  {
    id: "survey1",
    type: "Surveys",
    icon: "📝",
    title: "Short Survey",
    desc: "Complete a quick opinion survey.",
    reward: 1.50,
    time: "5 min"
  },
  {
    id: "task1",
    type: "Tasks",
    icon: "🎯",
    title: "Complete Demo Task",
    desc: "Do a short demonstration task.",
    reward: 2.00,
    time: "10 min"
  },
  {
    id: "game1",
    type: "Games",
    icon: "🎮",
    title: "Play Mini Game",
    desc: "Try a demo game activity.",
    reward: 0.50,
    time: "5 min"
  },
  {
    id: "offer1",
    type: "Offers",
    icon: "🎁",
    title: "Welcome Offer",
    desc: "Complete an eligible offer from the available list.",
    reward: 3.00,
    time: "10 min"
  }
];

// Convert the Neon schema's singular column names into the field names
// already consumed by the existing Cash Hub NG frontend.
function publicUser(row) {
  if (!row) return null;

  return {
    ...row,
    earnings: row.earning ?? 0,
    referral_earnings: row.referral_earning ?? 0,
    activeReferrals: row.active_referrals ?? 0,
    referralCode: row.referral_code ?? ""
  };
}

// ================= AUTH =================

// SIGNUP
app.post("/api/signup", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      full_name,
      email,
      password,
      referral_code
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        error: "All fields are required."
      });
    }

    const cleanName = String(full_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (!cleanName) {
      return res.status(400).json({
        error: "Full name is required."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const referralCode =
      "CH" +
      crypto.randomBytes(4).toString("hex").toUpperCase();

    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO users
        (full_name, email, password, balance, earning,
         referral_earning, active_referrals, referral_code)
       VALUES ($1, $2, $3, 0, 0, 0, 0, $4)
       RETURNING *`,
      [cleanName, cleanEmail, hashedPassword, referralCode]
    );

    const newUser = inserted.rows[0];

    // Process referral in the same transaction so the relationship and
    // inviter's count stay consistent.
    if (referral_code) {
      const code = String(referral_code).trim();

      const inviterResult = await client.query(
        `SELECT * FROM users
         WHERE referral_code = $1
         LIMIT 1
         FOR UPDATE`,
        [code]
      );

      const inviter = inviterResult.rows[0];

      if (inviter && inviter.id !== newUser.id) {
        await client.query(
          `INSERT INTO referrals
            (inviter_id, referred_user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [inviter.id, newUser.id]
        );

        await client.query(
          `UPDATE users
           SET active_referrals = COALESCE(active_referrals, 0) + 1
           WHERE id = $1`,
          [inviter.id]
        );
      }
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      user: publicUser(newUser)
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Signup error:", err);

    return res.status(500).json({
      error: "Signup failed."
    });

  } finally {
    client.release();
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    const cleanEmail =
      String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    const passwordCorrect =
      await bcrypt.compare(password, user.password || "");

    if (!passwordCorrect) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    return res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Login failed."
    });
  }
});

// ================= PROFILE =================

// GET PROFILE
app.get("/api/profile/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    return res.json(publicUser(user));

  } catch (err) {
    console.error("GET profile error:", err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// UPDATE PROFILE
app.patch("/api/profile/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { full_name, email } = req.body;

    if (!userId || !full_name || !email) {
      return res.status(400).json({
        error: "Full name and email are required."
      });
    }

    const cleanName = String(full_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    if (!cleanName) {
      return res.status(400).json({
        error: "Full name is required."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    const duplicate = await pool.query(
      `SELECT id FROM users
       WHERE email = $1 AND id <> $2
       LIMIT 1`,
      [cleanEmail, userId]
    );

    if (duplicate.rows.length) {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET full_name = $1, email = $2
       WHERE id = $3
       RETURNING id, full_name, email, balance, earning,
                 referral_earning, active_referrals, referral_code`,
      [cleanName, cleanEmail, userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    return res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (err) {
    console.error("PATCH profile error:", err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// ================= REFERRALS =================

app.get("/api/referrals/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        error: "Missing user id"
      });
    }

    const result = await pool.query(
      `SELECT
         r.id,
         r.referred_user_id,
         r.created_at,
         u.id AS referred_id,
         u.full_name AS referred_full_name,
         u.email AS referred_email,
         u.referral_code AS referred_referral_code
       FROM referrals r
       LEFT JOIN users u ON u.id = r.referred_user_id
       WHERE r.inviter_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const referrals = result.rows.map(row => ({
      id: row.id,
      referred_user_id: row.referred_user_id,
      created_at: row.created_at,
      user: row.referred_id ? {
        id: row.referred_id,
        full_name: row.referred_full_name,
        email: row.referred_email,
        referral_code: row.referred_referral_code
      } : null
    }));

    return res.json({
      referrals
    });

  } catch (err) {
    console.error("Referral fetch error:", err);

    return res.status(500).json({
      error: "Failed to fetch referrals"
    });
  }
});

// ================= WALLET =================

app.get("/api/wallet", async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: "Missing userId"
      });
    }

    const userResult = await pool.query(
      `SELECT
         id, full_name, email, balance, earning,
         referral_earning, active_referrals, referral_code
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const txResult = await pool.query(
      `SELECT id, trans_id, title, type, amount, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const withdrawalResult = await pool.query(
      `SELECT id, amount, method, status, created_at
       FROM withdrawals
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.json({
      user: publicUser(user),
      transactions: txResult.rows,
      withdrawals: withdrawalResult.rows
    });

  } catch (err) {
    console.error("Wallet error:", err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// ================= WITHDRAWAL =================

app.post("/api/withdraw", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      userId,
      amount,
      method
    } = req.body;

    const value = Number(amount);

    if (!userId || !method || !value || value <= 0) {
      return res.status(400).json({
        error: "Missing parameters"
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT balance, active_referrals
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "User not found"
      });
    }

    const activeRefs = Number(user.active_referrals || 0);

    if (activeRefs < 5) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "You need 5 active referrals before you can withdraw."
      });
    }

    if (value < 10000) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Minimum withdrawal is ₦10,000."
      });
    }

    if (Number(user.balance || 0) < value) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Insufficient available balance."
      });
    }

    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) - $1
       WHERE id = $2`,
      [value, userId]
    );

    await client.query(
      `INSERT INTO withdrawals
       (user_id, amount, method, status)
       VALUES ($1, $2, $3, $4)`,
      [userId, value, method, "Pending"]
    );

    await client.query(
      `INSERT INTO transactions
       (user_id, type, title, amount)
       VALUES ($1, $2, $3, $4)`,
      [userId, "withdrawal", "Withdrawal request", -value]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Withdrawal error:", err);

    return res.status(500).json({
      error: "Withdrawal request failed."
    });

  } finally {
    client.release();
  }
});

// ================= TASKS =================

// LIST TASKS
app.get("/api/tasks", async (req, res) => {
  return res.json({
    tasks: EARN_TASKS
  });
});

// COMPLETE TASK
app.post("/api/complete-task", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      userId,
      taskId
    } = req.body;

    if (!userId || !taskId) {
      return res.status(400).json({
        error: "Missing parameters"
      });
    }

    const task = EARN_TASKS.find(
      item => item.id === taskId
    );

    if (!task) {
      return res.status(400).json({
        error: "Invalid task"
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, balance, earning
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "User not found"
      });
    }

    const existing = await client.query(
      `SELECT id
       FROM completed_tasks
       WHERE user_id = $1 AND task_id = $2
       LIMIT 1`,
      [userId, taskId]
    );

    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Task already completed"
      });
    }

    await client.query(
      `INSERT INTO completed_tasks (user_id, task_id)
       VALUES ($1, $2)`,
      [userId, taskId]
    );

    const reward = Number(task.reward || 0);

    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) + $1,
           earning = COALESCE(earning, 0) + $1
       WHERE id = $2`,
      [reward, userId]
    );

    const transId = `task_${taskId}_${Date.now()}`;

    await client.query(
      `INSERT INTO transactions
       (trans_id, user_id, title, type, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [transId, userId, task.title, "earning", reward]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      reward,
      message:
        "Task completed successfully and your reward has been credited."
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Complete task error:", err);

    return res.status(500).json({
      error: "Failed to complete task."
    });

  } finally {
    client.release();
  }
});

// ================= HEALTH =================

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS ok");

    return res.json({
      status: result.rows[0].ok === 1 ? "ok" : "error",
      database: "connected"
    });

  } catch (err) {
    console.error("Health database error:", err);

    return res.status(503).json({
      status: "error",
      database: "disconnected"
    });
  }
});

// ================= CPX HASH =================

app.get("/api/cpx-hash", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({
      error: "Missing userId"
    });
  }

  const secureHash = crypto
    .createHmac("sha1", APP_SECRET)
    .update(userId)
    .digest("hex");

  return res.json({
    secureHash
  });
});

// ================= CPX CALLBACK =================

app.get("/api/cpx-callback", async (req, res) => {
  const client = await pool.connect();

  try {
    console.log("CPX Callback:", req.query);

    const {
      user_id,
      trans_id,
      reward_value
    } = req.query;

    const reward = Number(reward_value || 0);

    if (!user_id || !trans_id || reward <= 0) {
      return res.status(400).send("Invalid callback");
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id
       FROM transactions
       WHERE trans_id = $1
       LIMIT 1`,
      [trans_id]
    );

    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(200).send("Already Processed");
    }

    const userResult = await client.query(
      `SELECT *
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [user_id]
    );

    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).send("User not found");
    }

    await client.query(
      `UPDATE users
       SET balance = COALESCE(balance, 0) + $1,
           earning = COALESCE(earning, 0) + $1
       WHERE id = $2`,
      [reward, user_id]
    );

    await client.query(
      `INSERT INTO transactions
       (trans_id, user_id, title, type, amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [trans_id, user_id, "CPX Survey Reward", "survey", reward]
    );

    await client.query("COMMIT");

    return res.status(200).send("OK");

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("CPX callback error:", err);

    return res.status(500).send("ERROR");

  } finally {
    client.release();
  }
});

// ================= HOME =================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

// ================= START SERVER =================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Cash Hub NG server running on port ${PORT}`);
      console.log("Database: Neon PostgreSQL");
    });
  } catch (err) {
    console.error("Failed to initialize Neon database:", err);
    process.exit(1);
  }
}

startServer();
