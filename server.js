const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const supabase = require("./supabase");

const app = express();

app.use(express.json());

const APP_SECRET = process.env.CPX_SECRET || "YOUR_CPX_SECRET";

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
