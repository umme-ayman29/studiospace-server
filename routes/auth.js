const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { getDb } = require("../db");
const { verifyToken, setAuthCookie, clearAuthCookie } = require("../middleware/auth");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
const publicUser = (u) => ({ name: u.name, email: u.email, photoURL: u.photoURL || "" });

router.post("/register", async (req, res) => {
  const { name, email, photoURL, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message: "Password must have an uppercase letter, a lowercase letter and be at least 6 characters",
    });
  }
  const users = (await getDb()).collection("users");
  const exists = await users.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ message: "This email is already registered" });

  await users.insertOne({
    name,
    email: email.toLowerCase(),
    photoURL: photoURL || "",
    password: await bcrypt.hash(password, 10),
    provider: "credentials",
    createdAt: new Date(),
  });
  res.status(201).json({ message: "Registration successful" });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  const users = (await getDb()).collection("users");
  const user = await users.findOne({ email: email.toLowerCase() });
  if (!user || !user.password) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid email or password" });

  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ message: "Google credential is required" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    if (!p.email || !p.email_verified) {
      return res.status(401).json({ message: "Google email is not verified" });
    }
    const email = p.email.toLowerCase();
    const users = (await getDb()).collection("users");
    let user = await users.findOne({ email });
    if (!user) {
      user = {
        name: p.name || email.split("@")[0],
        email,
        photoURL: p.picture || "",
        provider: "google",
        createdAt: new Date(),
      };
      await users.insertOne(user);
    }
    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(401).json({ message: "Google sign-in failed" });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  const users = (await getDb()).collection("users");
  const user = await users.findOne({ email: req.user.email });
  if (!user) return res.status(401).json({ message: "User not found" });
  res.json({ user: publicUser(user) });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

module.exports = router;