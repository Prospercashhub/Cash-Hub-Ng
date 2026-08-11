// Cash Hub NG - Server API
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const supabase = require("./supabase");

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

// ================= AUTH =================

// SIGNUP
app.post("/api/signup", async (req, res) => {
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
    const cleanEmail =
      String(email).trim().toLowerCase();

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

    const {
      data: existingUser,
      error: existingError
    } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);

      return res.status(500).json({
        error: "Unable to check account."
      });
    }

    if (existingUser) {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const referralCode =
      "CH" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const {
      data,
      error
    } = await supabase
      .from("users")
      .insert({
        full_name: cleanName,
        email: cleanEmail,
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

    // Process referral
    try {
      if (referral_code) {
        const code =
          String(referral_code).trim();

        const {
          data: inviter
        } = await supabase
          .from("users")
          .select("*")
          .eq("referral_code", code)
          .maybeSingle();

        if (inviter && inviter.id) {
          const {
            error: refError
          } = await supabase
            .from("referrals")
            .insert({
              inviter_id: inviter.id,
              referred_user_id: data.id
            });

          if (refError) {
            console.error(
              "Failed to create referral:",
              refError
            );
          } else {
            await supabase
              .from("users")
              .update({
                active_referrals:
                  Number(
                    inviter.active_referrals || 0
                  ) + 1
              })
              .eq("id", inviter.id);
          }
        }
      }
    } catch (refErr) {
      console.error(
        "Referral processing error:",
        refErr
      );
    }

    return res.json({
      success: true,
      user: data
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
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
      String(email || "")
        .trim()
        .toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({
        error: "Email and password are required."
      });
    }

    const {
      data: user,
      error
    } = await supabase
      .from("users")
      .select("*")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: "Login failed."
      });
    }

    if (!user) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    const passwordCorrect =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordCorrect) {
      return res.status(400).json({
        error: "Invalid email or password."
      });
    }

    return res.json({
      success: true,
      user
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// ================= PROFILE =================

// GET PROFILE
app.get("/api/profile/:id", async (req, res) => {
  try {
    const {
      data,
      error
    } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "User not found."
      });
    }

    return res.json(data);

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// UPDATE PROFILE
app.patch("/api/profile/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const {
      full_name,
      email
    } = req.body;

    if (!userId || !full_name || !email) {
      return res.status(400).json({
        error:
          "Full name and email are required."
      });
    }

    const cleanName =
      String(full_name).trim();

    const cleanEmail =
      String(email)
        .trim()
        .toLowerCase();

    if (!cleanName) {
      return res.status(400).json({
        error: "Full name is required."
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    const {
      data: existingUser,
      error: emailCheckError
    } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .neq("id", userId)
      .maybeSingle();

    if (emailCheckError) {
      console.error(
        emailCheckError
      );

      return res.status(500).json({
        error: "Unable to check email."
      });
    }

    if (existingUser) {
      return res.status(400).json({
        error: "Email already exists."
      });
    }

    const {
      data: user,
      error
    } = await supabase
      .from("users")
      .update({
        full_name: cleanName,
        email: cleanEmail
      })
      .eq("id", userId)
      .select(
        "id, full_name, email, balance, earnings, referral_earnings, active_referrals, referral_code"
      )
      .single();

    if (error || !user) {
      console.error(
        "Profile update error:",
        error
      );

      return res.status(500).json({
        error: "Failed to update profile."
      });
    }

    return res.json({
      success: true,
      user
    });

  } catch (err) {
    console.error(
      "PATCH profile error:",
      err
    );

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

    const {
      data: rows,
      error: rowsError
    } = await supabase
      .from("referrals")
      .select("*")
      .eq("inviter_id", userId)
      .order("created_at", {
        ascending: false
      });

    if (rowsError) {
      console.error(rowsError);

      return res.status(500).json({
        error: "Failed to fetch referrals"
      });
    }

    const referredIds =
      (rows || [])
        .map(row => row.referred_user_id)
        .filter(Boolean);

    let usersMap = {};

    if (referredIds.length) {
      const {
        data: users
      } = await supabase
        .from("users")
        .select(
          "id, full_name, email, referral_code"
        )
        .in("id", referredIds);

      (users || []).forEach(user => {
        usersMap[user.id] = user;
      });
    }

    const combined =
      (rows || []).map(row => ({
        id: row.id,
        referred_user_id:
          row.referred_user_id,
        created_at:
          row.created_at,
        user:
          usersMap[
            row.referred_user_id
          ] || null
      }));

    return res.json({
      referrals: combined
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// ================= WALLET =================

app.get("/api/wallet", async (req, res) => {
  try {
    const userId =
      req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: "Missing userId"
      });
    }

    const {
      data: user,
      error: userError
    } = await supabase
      .from("users")
      .select(
        "id, full_name, email, balance, earnings, referral_earnings, active_referrals, referral_code"
      )
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const {
      data: transactions,
      error: txError
    } = await supabase
      .from("transactions")
      .select(
        "id, trans_id, title, type, amount, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      });

    if (txError) {
      console.error(
        "transactions error:",
        txError
      );
    }

    const {
      data: withdrawals,
      error: withdrawalError
    } = await supabase
      .from("withdrawals")
      .select(
        "id, amount, method, status, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      });

    if (withdrawalError) {
      console.error(
        "withdrawals error:",
        withdrawalError
      );
    }

    return res.json({
      user,
      transactions:
        transactions || [],
      withdrawals:
        withdrawals || []
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
  }
});

// ================= WITHDRAWAL =================

app.post("/api/withdraw", async (req, res) => {
  try {
    const {
      userId,
      amount,
      method
    } = req.body;

    const value =
      Number(amount);

    if (
      !userId ||
      !method ||
      !value ||
      value <= 0
    ) {
      return res.status(400).json({
        error: "Missing parameters"
      });
    }

    const {
      data: user,
      error: userError
    } = await supabase
      .from("users")
      .select(
        "balance, active_referrals"
      )
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const activeRefs =
      Number(
        user.active_referrals || 0
      );

    if (activeRefs < 5) {
      return res.status(400).json({
        error:
          "You need 5 active referrals before you can withdraw."
      });
    }

    if (value < 10000) {
      return res.status(400).json({
        error:
          "Minimum withdrawal is ₦10,000."
      });
    }

    if (
      Number(user.balance || 0) <
      value
    ) {
      return res.status(400).json({
        error:
          "Insufficient available balance."
      });
    }

    const {
      error: balanceError
    } = await supabase
      .from("users")
      .update({
        balance:
          Number(user.balance) -
          value
      })
      .eq("id", userId);

    if (balanceError) {
      return res.status(500).json({
        error:
          "Failed to update balance."
      });
    }

    const {
      error: withdrawalError
    } = await supabase
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: value,
        method,
        status: "Pending"
      });

    if (withdrawalError) {
      await supabase
        .from("users")
        .update({
          balance:
            Number(user.balance)
        })
        .eq("id", userId);

      return res.status(500).json({
        error:
          "Failed to create withdrawal request."
      });
    }

    const {
      error: transactionError
    } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: "withdrawal",
        title: "Withdrawal request",
        amount: -value
      });

    if (transactionError) {
      await supabase
        .from("withdrawals")
        .delete()
        .eq("user_id", userId)
        .eq("amount", value);

      await supabase
        .from("users")
        .update({
          balance:
            Number(user.balance)
        })
        .eq("id", userId);

      return res.status(500).json({
        error:
          "Failed to record transaction."
      });
    }

    return res.status(201).json({
      ok: true
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Server Error"
    });
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
app.post(
  "/api/complete-task",
  async (req, res) => {
    try {
      const {
        userId,
        taskId
      } = req.body;

      if (!userId || !taskId) {
        return res.status(400).json({
          error:
            "Missing parameters"
        });
      }

      const task =
        EARN_TASKS.find(
          item => item.id === taskId
        );

      if (!task) {
        return res.status(400).json({
          error: "Invalid task"
        });
      }

      const {
        data: user,
        error: userError
      } = await supabase
        .from("users")
        .select(
          "id, balance, earnings"
        )
        .eq("id", userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          error:
            "User not found"
        });
      }

      const {
        data: existing
      } = await supabase
        .from("completed_tasks")
        .select("id")
        .eq("user_id", userId)
        .eq("task_id", taskId)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({
          error:
            "Task already completed"
        });
      }

      const {
        error: completionError
      } = await supabase
        .from("completed_tasks")
        .insert({
          user_id: userId,
          task_id: taskId
        });

      if (completionError) {
        console.error(
          completionError
        );

        return res.status(500).json({
          error:
            "Failed to record completed task"
        });
      }

      const reward =
        Number(task.reward || 0);

      const {
        error: updateError
      } = await supabase
        .from("users")
        .update({
          balance:
            Number(user.balance || 0) +
            reward,

          earnings:
            Number(user.earnings || 0) +
            reward
        })
        .eq("id", userId);

      if (updateError) {
        await supabase
          .from("completed_tasks")
          .delete()
          .eq("user_id", userId)
          .eq("task_id", taskId);

        return res.status(500).json({
          error:
            "Failed to update user balance"
        });
      }

      const transId =
        `task_${taskId}_${Date.now()}`;

      const {
        error: transactionError
      } = await supabase
        .from("transactions")
        .insert({
          trans_id: transId,
          user_id: userId,
          title: task.title,
          type: "earning",
          amount: reward
        });

      if (transactionError) {
        console.error(
          "Failed to write transaction:",
          transactionError
        );
      }

      return res.json({
        ok: true,
        reward
      });

    } catch (err) {
      console.error(err);

      return res.status(500).json({
        error: "Server Error"
      });
    }
  }
);

// ================= HEALTH =================

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

// ================= CPX HASH =================

app.get(
  "/api/cpx-hash",
  (req, res) => {
    const userId =
      req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error:
          "Missing userId"
      });
    }

    const secureHash =
      crypto
        .createHmac(
          "sha1",
          APP_SECRET
        )
        .update(userId)
        .digest("hex");

    return res.json({
      secureHash
    });
  }
);

// ================= CPX CALLBACK =================

app.get(
  "/api/cpx-callback",
  async (req, res) => {
    try {
      console.log(
        "CPX Callback:",
        req.query
      );

      const {
        user_id,
        trans_id,
        reward_value,
        status
      } = req.query;

      const reward =
        Number(
          reward_value || 0
        );

      if (
        !user_id ||
        !trans_id ||
        reward <= 0
      ) {
        return res
          .status(400)
          .send("Invalid callback");
      }

      const {
        data: existing
      } = await supabase
        .from("transactions")
        .select("id")
        .eq("trans_id", trans_id)
        .maybeSingle();

      if (existing) {
        return res
          .status(200)
          .send("Already Processed");
      }

      const {
        data: user,
        error: userError
      } = await supabase
        .from("users")
        .select("*")
        .eq("id", user_id)
        .single();

      if (userError || !user) {
        return res
          .status(404)
          .send("User not found");
      }

      const {
        error: updateError
      } = await supabase
        .from("users")
        .update({
          balance:
            Number(user.balance || 0) +
            reward,

          earnings:
            Number(user.earnings || 0) +
            reward
        })
        .eq("id", user_id);

      if (updateError) {
        return res
          .status(500)
          .send("Failed to update user");
      }

      const {
        error: transactionError
      } = await supabase
        .from("transactions")
        .insert({
          trans_id,
          user_id,
          title:
            "CPX Survey Reward",
          type: "survey",
          amount: reward
        });

      if (transactionError) {
        console.error(
          transactionError
        );
      }

      return res
        .status(200)
        .send("OK");

    } catch (err) {
      console.error(err);

      return res
        .status(500)
        .send("ERROR");
    }
  }
);

// ================= HOME ===============

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );
});

// ================= START SERVER =================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);
