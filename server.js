// Server-side: add tasks endpoints and task completion handling
// This file is the existing server.js with additional endpoints for tasks.
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const supabase = require("./supabase");

const app = express();

app.use(cors());
app.use(express.json());

const APP_SECRET = process.env.CPX_SECRET || "YOUR_CPX_SECRET";

// Simple task catalog served by the backend. In a real app you'd store these in DB.
const EARN_TASKS = [
  { id: "survey1", type: "Surveys", icon: "📝", title: "Short Survey", desc: "Complete a quick opinion survey.", reward: 1.50, time: "5 min" },
  { id: "task1", type: "Tasks", icon: "🎯", title: "Complete Demo Task", desc: "Do a short demonstration task.", reward: 2.00, time: "10 min" },
  { id: "game1", type: "Games", icon: "🎮", title: "Play Mini Game", desc: "Try a demo game activity.", reward: 0.50, time: "5 min" },
  { id: "offer1", type: "Offers", icon: "🎁", title: "Welcome Offer", desc: "Complete an eligible offer from the available list.", reward: 3.00, time: "10 min" }
];

// ================= AUTH APIs =================

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: "Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const referralCode = "CH" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from("users")
      .insert({
        full_name,
        email,
        password: hashedPassword,
        balance: 0,
        earnings: 0,
        referral_earnings: 0,
        active_referrals: 0,
        referral_code: referralCode
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Signup failed." });
    }

    // Best-effort referral processing (no immediate bonus)
    try {
      const providedCode = req.body && req.body.referral_code;
      if (providedCode) {
        const code = String(providedCode).trim();
        const { data: inviter } = await supabase
          .from('users')
          .select('*')
          .eq('referral_code', code)
          .maybeSingle();

        if (inviter && inviter.id) {
          const { error: refErr } = await supabase
            .from('referrals')
            .insert({ inviter_id: inviter.id, referred_user_id: data.id });

          if (refErr) {
            console.error('Failed to insert referral record', refErr);
          } else {
            await supabase
              .from('users')
              .update({ active_referrals: Number(inviter.active_referrals || 0) + 1 })
              .eq('id', inviter.id);
          }
        }
      }
    } catch (reff) {
      console.error('Referral processing error', reff);
    }

    res.json({ success: true, user: data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!user) return res.status(400).json({ error: "Invalid email or password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid email or password." });

    res.json({ success: true, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Profile
app.get("/api/profile/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "User not found." });
  res.json(data);
});

// List referrals for a user (inviter)
app.get('/api/referrals/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'Missing user id' });

    const { data: rows, error: rowsErr } = await supabase
      .from('referrals')
      .select('*')
      .eq('inviter_id', userId)
      .order('created_at', { ascending: false });

    if (rowsErr) return res.status(500).json({ error: 'Failed to fetch referrals' });

    const referredIds = (rows || []).map(r => r.referred_user_id).filter(Boolean);
    let usersMap = {};
    if (referredIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email, referral_code')
        .in('id', referredIds);
      (users || []).forEach(u => { usersMap[u.id] = u; });
    }

    const combined = (rows || []).map(r => ({
      id: r.id,
      referred_user_id: r.referred_user_id,
      created_at: r.created_at,
      user: usersMap[r.referred_user_id] || null
    }));

    res.json({ referrals: combined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ================= WALLET APIs (Supabase-backed) =================

// Get wallet summary, transactions and withdrawals for a user
app.get('/api/wallet', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email, balance, earnings, referral_earnings, active_referrals, referral_code')
      .eq('id', userId)
      .single();

    if (userError || !user) return res.status(404).json({ error: 'User not found' });

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, trans_id, title, type, amount, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (txError) console.error('transactions error', txError);

    const { data: withdrawals, error: wError } = await supabase
      .from('withdrawals')
      .select('id, amount, method, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (wError) console.error('withdrawals error', wError);

    res.json({ user, transactions: transactions || [], withdrawals: withdrawals || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Request a withdrawal
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    const value = Number(amount);

    if (!userId || !method || !value) return res.status(400).json({ error: 'Missing parameters' });

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance, active_referrals')
      .eq('id', userId)
      .single();

    if (userError || !user) return res.status(404).json({ error: 'User not found' });

    const activeRefs = Number(user.active_referrals || 0);
    if (activeRefs < 5) return res.status(400).json({ error: 'You need 5 active referrals before you can withdraw.' });
    if (value < 10000) return res.status(400).json({ error: 'Minimum withdrawal is ₦10,000.' });
    if (Number(user.balance || 0) < value) return res.status(400).json({ error: 'Insufficient available balance.' });

    const { error: updateError } = await supabase
      .from('users')
      .update({ balance: Number(user.balance) - value })
      .eq('id', userId);

    if (updateError) return res.status(500).json({ error: 'Failed to update balance.' });

    const { error: wError } = await supabase
      .from('withdrawals')
      .insert({ user_id: userId, amount: value, method, status: 'Pending' });

    if (wError) {
      await supabase.from('users').update({ balance: Number(user.balance) }).eq('id', userId);
      return res.status(500).json({ error: 'Failed to create withdrawal request.' });
    }

    const { error: txError } = await supabase
      .from('transactions')
      .insert({ user_id: userId, type: 'withdrawal', title: 'Withdrawal request', amount: -value });

    if (txError) {
      await supabase.from('withdrawals').delete().eq('user_id', userId).eq('amount', value);
      await supabase.from('users').update({ balance: Number(user.balance) }).eq('id', userId);
      return res.status(500).json({ error: 'Failed to record transaction.' });
    }

    return res.status(201).json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ================= TASKS / EARNINGS APIs =================

// List available tasks
app.get('/api/tasks', async (req, res) => {
  // For now return the in-memory EARN_TASKS catalog
  res.json({ tasks: EARN_TASKS });
});

// Complete a task: record completed task, update user balance and create transaction
app.post('/api/complete-task', async (req, res) => {
  try {
    const { userId, taskId } = req.body;
    if (!userId || !taskId) return res.status(400).json({ error: 'Missing parameters' });

    const task = EARN_TASKS.find(t => t.id === taskId);
    if (!task) return res.status(400).json({ error: 'Invalid task' });

    // Check user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance, earnings')
      .eq('id', userId)
      .single();

    if (userError || !user) return res.status(404).json({ error: 'User not found' });

    // Check if already completed
    const { data: existing } = await supabase
      .from('completed_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'Task already completed' });

    // Record completed task
    const { error: compErr } = await supabase
      .from('completed_tasks')
      .insert({ user_id: userId, task_id: taskId });

    if (compErr) {
      console.error(compErr);
      return res.status(500).json({ error: 'Failed to record completed task' });
    }

    const reward = Number(task.reward || 0);

    // Update user balance and earnings
    const { error: updateErr } = await supabase
      .from('users')
      .update({ balance: Number(user.balance || 0) + reward, earnings: Number(user.earnings || 0) + reward })
      .eq('id', userId);

    if (updateErr) {
      console.error(updateErr);
      // Best-effort: remove completed_tasks record
      await supabase.from('completed_tasks').delete().eq('user_id', userId).eq('task_id', taskId);
      return res.status(500).json({ error: 'Failed to update user balance' });
    }

    // Create transaction
    const transId = `task_${taskId}_${Date.now()}`;
    const { error: txErr } = await supabase
      .from('transactions')
      .insert({ trans_id: transId, user_id: userId, title: task.title, type: 'earning', amount: reward });

    if (txErr) console.error('Failed to write transaction', txErr);

    return res.json({ ok: true, reward });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// ================= END TASKS / EARNINGS APIs =================

// Health check
app.get("/health", (req, res) => { res.json({ status: "ok" }); });

// CPX hash API
app.get("/api/cpx-hash", (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const secureHash = crypto.createHmac("sha1", APP_SECRET).update(userId).digest("hex");
  res.json({ secureHash });
});

// Home page
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

const PORT = process.env.PORT || 3000;

app.get("/api/cpx-callback", async (req, res) => {
  try {
    console.log("CPX Callback:", req.query);
    const { user_id, trans_id, reward_value, status } = req.query;

    const reward = Number(reward_value || 0);
    if (!user_id || !trans_id || reward <= 0) return res.status(400).send("Invalid callback");

    const { data: existing } = await supabase.from("transactions").select("id").eq("trans_id", trans_id).maybeSingle();
    if (existing) return res.status(200).send("Already Processed");

    const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", user_id).single();
    if (userError || !user) return res.status(404).send("User not found");

    const { error: updateError } = await supabase.from("users").update({ balance: Number(user.balance) + reward, earnings: Number(user.earnings) + reward }).eq("id", user_id);
    if (updateError) return res.status(500).send("Failed to update user");

    const { error: txError } = await supabase.from("transactions").insert({ trans_id: trans_id, user_id: user_id, title: "CPX Survey Reward", type: "survey", amount: reward });
    if (txError) console.error(txError);

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR");
  }
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
