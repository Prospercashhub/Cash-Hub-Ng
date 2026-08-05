const express = require("express");
const crypto = require("crypto");
const path = require("path");
const supabase = require("./supabase");

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

    // We'll add the real processing in the next step.
    res.status(200).send("OK");

  } catch (err) {
    console.error(err);
    res.status(500).send("ERROR");
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
