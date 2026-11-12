"use strict";
(() => {
const PAY_ACCOUNT = "XXXX"; // ضع رقم CCP / بريدي موب هنا
const $ = id => document.getElementById(id);
const CFG = window.NIJI_CONFIG || {};
const BUCKET_FILES = "book-files", BUCKET_COVERS = "book-covers";
let db = null, currentUser = null, currentProfile = null, currentRole = "reader";
let books = [], categories = [], favorites = new Set();
let selectedPurchaseBook = null, authMode = "login", busy = false, toastTimer = null;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => Number(n || 0).toLocaleString("ar-DZ");

function message(id, text, kind = "") {
  const el = $(id);
  if (el) { el.textContent = text || ""; el.className = "notice " + kind; }
}
function notify(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4500);
}
function showError(e) { console.error("NIJI APORIA:", e); return e?.message || "حدث خطأ غير متوقع."; }
const isAdmin = () => currentRole === "admin";
const isAuthor = () => ["admin", "author", "seller"].includes(currentRole);

function initSupabase() {
  if (!window.supabase) return message("authMessage", "تعذر تحميل مكتبة Supabase. تحقق من الإنترنت.", "bad");
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return message("authMessage", "إعدادات config.js غير مكتملة.", "bad");
  try {
    db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (e) { message("authMessage", showError(e), "bad"); }
}

function openAuth(mode = "login") {
  authMode = mode;
  $("authTitle").textContent = mode === "register" ? "إنشاء حساب جديد" : "تسجيل الدخول";
  $("authName").classList.toggle("hidden", mode !== "register");
  $("authSubmit").textContent = mode === "register" ? "إنشاء الحساب" : "دخول";
  $("authToggle").textContent = mode === "register" ? "لديك حساب؟ تسجيل الدخول" : "إنشاء حساب جديد";
  $("authModal").classList.add("open");
  message("authMessage", "");
}
const closeAuth = () => $("authModal").classList.remove("open");

async function submitAuth() {
  if (!db) return message("authMessage", "تعذر الاتصال بـ Supabase. راجع config.js.", "bad");
  if (busy) return;
  const email = $("authEmail").value.trim(), password = $("authPassword").value, name = $("authName").value.trim();
  if (!email || !password) return message("authMessage", "أدخل البريد وكلمة المرور.");
  if (password.length < 6) return message("authMessage", "كلمة المرور يجب ألا تقل عن 6 أحرف.");
  if (authMode === "register" && !name) return message("authMessage", "أدخل اسمك الكامل.");
  busy = true; $("authSubmit").disabled = true;
  message("authMessage", "جارٍ الاتصال...");
  try {
    const result = authMode === "register"
      ? await db.auth.signUp({ email, password, options: { data: { full_name: name } } })
      : await db.auth.signInWithPassword({ email, password });
