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

// ================= AUTH APIs =================

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const {
      full_name,
      email,
      password
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        error: "All fields are required."
      });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const referralCode =
      "CH" + Math.random().toString(36).substring(2, 8).toUpperCase();

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
      return res.status(500).json({
        error: "Signup failed."
      });
    }

    res.json({
      success: true,
      user: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server Error"
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {

    const {
      email,
      password
    } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server Error"
    });
  }
});

// Profile
app.get("/api/profile/:id", async (req, res) => {

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  res.json(data);

});

// ================= END AUTH APIs =================
// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// CPX hash API
app.get("/api/cpx-hash", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const secureHash = crypto
    .createHmac("sha1", APP_SECRET)
    .update(userId)
    .digest("hex");

  res.json({ secureHash });
});

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.get("/api/cpx-callback", async (req, res) => {
  try {
    console.log("CPX Callback:", req.query);
    const {
  user_id,
  trans_id,
  reward_value,
  status
} = req.query;

console.log({
  user_id,
  trans_id,
  reward_value,
  status
});

    const reward = Number(reward_value || 0);

if (!user_id || !trans_id || reward <= 0) {
  return res.status(400).send("Invalid callback");
}

// Prevent duplicate rewards
const { data: existing } = await supabase
  .from("transactions")
  .select("id")
  .eq("trans_id", trans_id)
  .maybeSingle();

if (existing) {
  return res.status(200).send("Already Processed");
}

// Find the user
const { data: user, error: userError } = await supabase
  .from("users")
  .select("*")
  .eq("id", user_id)
  .single();

if (userError || !user) {
  console.error(userError);
  return res.status(404).send("User not found");
}

// Update balance and earnings
const { error: updateError } = await supabase
  .from("users")
  .update({
    balance: Number(user.balance) + reward,
    earnings: Number(user.earnings) + reward
  })
  .eq("id", user_id);

if (updateError) {
  console.error(updateError);
  return res.status(500).send("Failed to update user");
}

// Save transaction
const { error: txError } = await supabase
  .from("transactions")
  .insert({
    trans_id: trans_id,
    user_id: user_id,
    title: "CPX Survey Reward",
    type: "survey",
    amount: reward
  });

if (txError) {
  console.error(txError);
}

return res.status(200).send("OK");

  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR");
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
