const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY"); // firebase functions:secrets:set RESEND_API_KEY
const APP_URL = defineString("APP_URL");
const MAIL_FROM = defineString("MAIL_FROM");

const COOLDOWN_MS = 60 * 1000; // one email per minute per user
const DAILY_CAP = 10;          // and at most 10 per day

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function throttle(uid) {
  const db = admin.firestore();
  const ref = db.doc("mailThrottle/" + uid);
  const today = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    const x = d.exists ? d.data() : {};
    const now = Date.now();
    if (x.lastSentAt && now - x.lastSentAt < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - x.lastSentAt)) / 1000);
      throw new HttpsError("resource-exhausted", "Please wait " + wait + "s before requesting another email.");
    }
    const count = x.day === today ? (x.count || 0) : 0;
    if (count >= DAILY_CAP) throw new HttpsError("resource-exhausted", "Too many emails today. Try again tomorrow.");
    tx.set(ref, { lastSentAt: now, day: today, count: count + 1 });
  });
}

function emailHtml(name, link) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #dcdcd8;border-radius:16px">
<tr><td style="padding:32px 32px 8px;font-size:20px;font-weight:700;letter-spacing:-.3px">Chatrix</td></tr>
<tr><td style="padding:8px 32px 0;font-size:22px;font-weight:700">Verify your email</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.55;color:#444">Hi ${esc(name)}, confirm this is your email address to finish setting up your Chatrix account.</td></tr>
<tr><td style="padding:24px 32px"><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px">Verify email</a></td></tr>
<tr><td style="padding:0 32px 8px;font-size:13px;line-height:1.5;color:#6b6b6b">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(link)}</span></td></tr>
<tr><td style="padding:16px 32px 32px;font-size:12px;color:#6b6b6b">If you didn't create a Chatrix account, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
}

exports.sendVerificationEmail = onCall({ secrets: [RESEND_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const user = await admin.auth().getUser(req.auth.uid);
  if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
  if (user.emailVerified) return { alreadyVerified: true };

  await throttle(user.uid);

  // Firebase generates and later validates the link; Resend only delivers it.
  const link = await admin.auth().generateEmailVerificationLink(user.email, { url: APP_URL.value() });
  const name = user.displayName || "there";

  const resend = new Resend(RESEND_API_KEY.value());
  const { error } = await resend.emails.send({
    from: MAIL_FROM.value(),
    to: user.email,
    subject: "Verify your Chatrix email",
    html: emailHtml(name, link),
    text: `Hi ${name},\n\nVerify your email to finish setting up Chatrix:\n${link}\n\nIf you didn't create an account, ignore this email.`,
  });
  if (error) {
    console.error("Resend error:", error);
    throw new HttpsError("internal", "Couldn't send the email. Try again shortly.");
  }
  return { sent: true };
});
