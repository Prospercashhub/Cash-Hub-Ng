
import { pool } from "./db.js";
export async function wallet(req,res){
 const user=(await pool.query("SELECT balance,earnings,referral_earnings FROM users WHERE id=$1",[req.auth.id])).rows[0];
 const transactions=(await pool.query("SELECT type,title,amount,created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC",[req.auth.id])).rows;
 const withdrawals=(await pool.query("SELECT amount,method,status,created_at FROM withdrawals WHERE user_id=$1 ORDER BY created_at DESC",[req.auth.id])).rows;
 res.json({user,transactions,withdrawals});
}
export async function withdraw(req,res){
 const {amount,method}=req.body; const value=Number(amount);
 if(!value||value<10||!method)return res.status(400).json({error:"Minimum withdrawal is $10.00 and a method is required."});
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const u=(await c.query("SELECT balance FROM users WHERE id=$1 FOR UPDATE",[req.auth.id])).rows[0];
  if(Number(u.balance)<value){await c.query("ROLLBACK");return res.status(400).json({error:"Insufficient balance."})}
  await c.query("UPDATE users SET balance=balance-$1 WHERE id=$2",[value,req.auth.id]);
  await c.query("INSERT INTO withdrawals(user_id,amount,method) VALUES($1,$2,$3)",[req.auth.id,value,method]);
  await c.query("INSERT INTO transactions(user_id,type,title,amount) VALUES($1,'withdrawal','Withdrawal request',$2)",[req.auth.id,-value]);
  await c.query("COMMIT");res.status(201).json({ok:true});
 }catch(e){await c.query("ROLLBACK");console.error(e);res.status(500).json({error:"Withdrawal request failed."})}finally{c.release()}
}
