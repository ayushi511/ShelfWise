// ═══════════════════════════════════════════════════════════════════════════
//  SHELFWISE — Auth + Order History + Payment Tracking
// ═══════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";

// ─── LOCAL STORAGE HELPERS ────────────────────────────────────────────────
const LS = {
  get: (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch(_e) { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(_e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch(_e) {} },
};
const fmtDate = ts => new Date(ts).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
const fmtTime = ts => new Date(ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});

// ─── FAKE USER DB ─────────────────────────────────────────────────────────
const getUserDB = () => LS.get("hb_users", {});
const saveUserDB = db => LS.set("hb_users", db);
const getUser = email => getUserDB()[email?.toLowerCase()] || null;
function createUser(name, email, password) {
  const db = getUserDB(); const key = email.toLowerCase();
  if (db[key]) return { error: "Email already registered." };
  db[key] = { name, email: key, password, createdAt: Date.now(), orders: [] };
  saveUserDB(db);
  return { user: { name, email: key } };
}
function loginUser(email, password) {
  const u = getUser(email);
  if (!u) return { error: "No account found with this email." };
  if (u.password !== password) return { error: "Incorrect password." };
  return { user: { name: u.name, email: u.email } };
}
function saveOrder(email, order) {
  const db = getUserDB(); const key = email.toLowerCase();
  if (!db[key]) return [];
  db[key].orders = [order, ...(db[key].orders || [])];
  saveUserDB(db); return db[key].orders;
}
function updateOrderStatus(email, orderId, newStatus) {
  const db = getUserDB(); const key = email.toLowerCase();
  if (!db[key]) return;
  db[key].orders = (db[key].orders || []).map(o =>
    o.id === orderId
      ? { ...o, status: newStatus, cancelledAt: newStatus === "cancelled" ? Date.now() : o.cancelledAt }
      : o
  );
  saveUserDB(db);
}
const getUserOrders = email => { const u = getUser(email); return u ? (u.orders || []) : []; };

// ─── ORDER STATUS LOGIC ───────────────────────────────────────────────────
// Status is derived from elapsed time since order placement — not random.
// confirmed  → 0–30 min
// processing → 30 min–4 hours
// shipped    → 4–48 hours
// delivered  → 48+ hours
// (Cash on Delivery orders take slightly longer.)
function deriveStatus(order) {
  if (order.status === "cancelled") return "cancelled";
  const elapsed = Date.now() - order.placedAt; // ms
  const isCOD = order.paymentMethod === "Cash on Delivery";
  const confirm = 30 * 60 * 1000;
  const process = 4 * 60 * 60 * 1000 * (isCOD ? 1.5 : 1);
  const ship    = 48 * 60 * 60 * 1000 * (isCOD ? 1.5 : 1);
  if (elapsed < confirm)  return "confirmed";
  if (elapsed < process)  return "processing";
  if (elapsed < ship)     return "shipped";
  return "delivered";
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const GENRES = ["Fiction","Non-Fiction","Science","History","Philosophy","Art","Travel","Biography","Mystery","Romance","Self-Help","Technology"];
const CATEGORIES = ["All","Bestsellers","New Arrivals","Staff Picks","Under ₹300","Award Winners"];
const BGS = [
  ["#3D2B1F","#7A4F3A"],["#2B3D4A","#4A6B7A"],["#3B4A39","#6B7F5E"],
  ["#4A2B3D","#7A4A6B"],["#3D3B2B","#7A775E"],["#2B3D2E","#4A7A5E"],
  ["#4A3728","#8B5E45"],["#5C3520","#7A5040"],["#2B2B3D","#4A4A7A"],
  ["#3D2B3B","#7A4A70"],["#2D3D2B","#5A7A4A"],["#3D3220","#7A6040"],
];
const sr = seed => { let s=seed; return ()=>{s=(s*9301+49297)%233280;return s/233280;}; };
function genMeta(title,idx) {
  const r=sr(idx*137+title.length*31);
  return{rating:+(3.2+r()*1.8).toFixed(1),reviews:Math.floor(r()*280+8),genre:GENRES[idx%GENRES.length],isBestseller:r()>.65,isNew:r()>.72,isStaffPick:r()>.78};
}
async function fetchOL(title,author) {
  try {
    const q=encodeURIComponent("title:"+title+(author?" author:"+author:""));
    const d=await(await fetch("https://openlibrary.org/search.json?q="+q+"&limit=1&fields=key,cover_i,first_sentence")).json();
    const doc=d.docs?.[0]; if(!doc)return{};
    const coverImg=doc.cover_i?"https://covers.openlibrary.org/b/id/"+doc.cover_i+"-L.jpg":null;
    let preface=doc.first_sentence?(typeof doc.first_sentence==="string"?doc.first_sentence:doc.first_sentence.value):null;
    if(!preface&&doc.key){try{const w=await(await fetch("https://openlibrary.org"+doc.key+".json")).json();preface=w.description?(typeof w.description==="string"?w.description:w.description.value):null;}catch(_){}}
    return{coverImg,preface};
  } catch(_){return{};}
}

const STATUS_META = {
  confirmed:  { label:"Confirmed",   color:"#2D6B31", bg:"#D4EDD6", icon:"✓" },
  processing: { label:"Processing",  color:"#7A5010", bg:"#FFF0D4", icon:"⟳" },
  shipped:    { label:"Shipped",     color:"#1A5C7A", bg:"#D4EBF5", icon:"📦" },
  delivered:  { label:"Delivered",   color:"#3D2B1F", bg:"#EDE8E0", icon:"🏠" },
  cancelled:  { label:"Cancelled",   color:"#8B1A1A", bg:"#FAD9D9", icon:"✕" },
};
const PAYMENT_META = {
  paid:    { label:"Paid",    color:"#2D6B31", bg:"#D4EDD6" },
  pending: { label:"Pending", color:"#7A5010", bg:"#FFF0D4" },
  failed:  { label:"Failed",  color:"#8B1A1A", bg:"#FAD9D9" },
  refunded:{ label:"Refunded",color:"#1A5C7A", bg:"#D4EBF5" },
};
const PAYMENT_METHODS = ["UPI","Credit Card","Debit Card","Net Banking","Cash on Delivery"];

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Delhi","Jammu & Kashmir","Ladakh","Puducherry",
  "Chandigarh","Andaman & Nicobar Islands","Lakshadweep","Dadra & Nagar Haveli",
];

// ─── CSS ──────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --cream:#F7F3EE;--ivory:#EDE8E0;--warm-brown:#3D2B1F;--mid-brown:#7A4F3A;
  --gold:#C4922A;--gold-light:#E8B84B;--gold-pale:#F5E4B8;
  --sage:#6B7F5E;--terracotta:#C4603A;
  --text-dark:#1E1410;--text-mid:#5C4033;--text-light:#9C7B6B;--white:#FFFDF9;
  --shadow-sm:0 2px 12px rgba(61,43,31,.08);
  --shadow-md:0 4px 24px rgba(61,43,31,.13);
  --shadow-lg:0 8px 40px rgba(61,43,31,.18);
  --shadow-xl:0 20px 70px rgba(20,10,6,.38);
}
body{font-family:'DM Sans',sans-serif;background:var(--cream);min-height:100vh;color:var(--text-dark)}
button{font-family:'DM Sans',sans-serif}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--ivory)}
::-webkit-scrollbar-thumb{background:var(--mid-brown);border-radius:3px}

/* ── AUTH SCREEN ── */
.auth-screen{min-height:100vh;display:flex;align-items:stretch}
.auth-left{width:420px;flex-shrink:0;background:linear-gradient(170deg,var(--warm-brown) 0%,#5C3520 55%,#2A1A0E 100%);display:flex;flex-direction:column;justify-content:space-between;padding:48px 44px;position:relative;overflow:hidden}
.auth-left::before{content:'';position:absolute;top:-80px;right:-80px;width:320px;height:320px;border-radius:50%;background:rgba(196,146,42,.1)}
.auth-left::after{content:'';position:absolute;bottom:-100px;left:-60px;width:380px;height:380px;border-radius:50%;background:rgba(196,146,42,.06)}
.auth-brand{position:relative;z-index:1}
.auth-logo-wrap{display:flex;align-items:center;gap:12px;margin-bottom:32px}
.auth-logo{width:44px;height:44px;background:var(--gold);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 14px rgba(196,146,42,.4)}
.auth-logo-name{font-family:'Playfair Display',serif;font-size:22px;color:var(--white);letter-spacing:.4px}
.auth-logo-tag{font-size:10px;color:var(--gold-light);letter-spacing:2px;text-transform:uppercase;margin-top:1px}
.auth-headline{font-family:'Playfair Display',serif;font-size:36px;color:var(--white);line-height:1.2;margin-bottom:16px}
.auth-headline em{color:var(--gold-light);font-style:italic}
.auth-sub{font-size:14px;color:rgba(237,232,224,.7);line-height:1.65;font-weight:300}
.auth-features{display:flex;flex-direction:column;gap:14px;position:relative;z-index:1}
.auth-feature{display:flex;align-items:center;gap:12px;color:rgba(237,232,224,.82);font-size:13px}
.auth-feature-icon{width:32px;height:32px;background:rgba(196,146,42,.18);border:1px solid rgba(196,146,42,.35);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.auth-right{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px;background:var(--cream)}
.auth-box{width:100%;max-width:420px}
.auth-tabs{display:flex;margin-bottom:32px;background:var(--white);border-radius:12px;padding:4px;box-shadow:var(--shadow-sm)}
.auth-tab{flex:1;padding:10px;border:none;background:none;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;color:var(--text-light);cursor:pointer;border-radius:9px;transition:all .2s}
.auth-tab.active{background:var(--warm-brown);color:var(--white);font-weight:600}
.auth-title{font-family:'Playfair Display',serif;font-size:28px;color:var(--text-dark);margin-bottom:6px}
.auth-desc{font-size:13px;color:var(--text-light);margin-bottom:28px;line-height:1.5}
.form-group{margin-bottom:18px}
.form-label{font-size:12px;font-weight:600;color:var(--text-mid);letter-spacing:.4px;text-transform:uppercase;margin-bottom:7px;display:block}
.form-input{width:100%;padding:12px 14px;border:1.5px solid var(--ivory);border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text-dark);background:var(--white);outline:none;transition:border-color .2s,box-shadow .2s}
.form-input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(196,146,42,.12)}
.form-input.error{border-color:#C4603A}
.form-err{font-size:12px;color:var(--terracotta);margin-top:6px;display:flex;align-items:center;gap:5px}
.pw-wrap{position:relative}
.pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-light);font-size:16px;padding:4px}
.auth-submit{width:100%;padding:14px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));color:var(--white);border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s,box-shadow .2s;box-shadow:0 4px 16px rgba(61,43,31,.25);letter-spacing:.3px;margin-top:8px}
.auth-submit:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 6px 22px rgba(61,43,31,.3)}
.auth-submit:disabled{opacity:.5;cursor:not-allowed;transform:none}
.auth-divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--text-light);font-size:12px}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--ivory)}
.pw-strength{display:flex;gap:4px;margin-top:8px}
.pw-bar{height:3px;flex:1;border-radius:2px;background:var(--ivory);transition:background .3s}
.pw-hint{font-size:11px;color:var(--text-light);margin-top:5px}

/* ── NAV ── */
.nav{background:var(--warm-brown);height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 36px;position:sticky;top:0;z-index:300;border-bottom:2px solid var(--gold)}
.nav-brand{display:flex;align-items:center;gap:11px;cursor:pointer}
.nav-logo{width:34px;height:34px;background:var(--gold);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:17px}
.nav-name{font-family:'Playfair Display',serif;font-size:20px;color:var(--white);letter-spacing:.4px}
.nav-tag{font-size:10px;color:var(--gold-light);letter-spacing:2px;text-transform:uppercase}
.nav-actions{display:flex;align-items:center;gap:8px}
.nav-btn{background:none;border:none;color:var(--ivory);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:8px;transition:background .2s}
.nav-btn:hover{background:rgba(255,255,255,.1)}
.nav-badge{background:var(--terracotta);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.nav-user-btn{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);border:none;border-radius:10px;padding:7px 13px;cursor:pointer;transition:background .2s}
.nav-user-btn:hover{background:rgba(255,255,255,.18)}
.nav-avatar{width:28px;height:28px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--warm-brown);font-family:'Playfair Display',serif;flex-shrink:0}
.nav-user-name{font-size:13px;color:var(--white);font-weight:500;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-menu-overlay{position:fixed;inset:0;z-index:350}
.user-menu{position:absolute;right:0;top:calc(100% + 8px);background:var(--white);border-radius:14px;box-shadow:var(--shadow-lg);min-width:220px;overflow:hidden;z-index:360;animation:slu .2s ease;border:1px solid var(--ivory)}
@keyframes slu{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.user-menu-head{padding:16px 18px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown))}
.user-menu-name{font-family:'Playfair Display',serif;font-size:15px;color:var(--white)}
.user-menu-email{font-size:11px;color:rgba(237,232,224,.7);margin-top:2px}
.user-menu-item{display:flex;align-items:center;gap:10px;padding:12px 18px;font-size:13px;color:var(--text-mid);cursor:pointer;transition:background .15s;border:none;background:none;width:100%;text-align:left}
.user-menu-item:hover{background:var(--cream)}
.user-menu-item.danger{color:var(--terracotta)}
.user-menu-sep{height:1px;background:var(--ivory);margin:4px 0}
.nav-pos{position:relative}

/* ── HERO ── */
.hero{background:linear-gradient(135deg,var(--warm-brown) 0%,#5C3520 60%,#3B2518 100%);padding:44px 36px 40px;position:relative;overflow:hidden}
.hero::before,.hero::after{content:'';position:absolute;border-radius:50%}
.hero::before{width:280px;height:280px;top:-60px;right:-60px;background:rgba(196,146,42,.1)}
.hero::after{width:400px;height:400px;bottom:-120px;left:25%;background:rgba(196,146,42,.06)}
.hero-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(196,146,42,.18);border:1px solid var(--gold);color:var(--gold-light);font-size:10px;letter-spacing:2.5px;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:14px}
.hero-h{font-family:'Playfair Display',serif;font-size:34px;color:var(--white);line-height:1.2;max-width:460px;position:relative;z-index:1}
.hero-h em{color:var(--gold-light);font-style:italic}
.hero-sub{color:rgba(237,232,224,.7);font-size:13px;margin-top:8px;font-weight:300}
.hero-stats{display:flex;gap:28px;margin-top:20px;position:relative;z-index:1}
.hero-stat{color:rgba(237,232,224,.85)}
.hero-stat strong{font-family:'Playfair Display',serif;font-size:22px;color:var(--gold-light);display:block;line-height:1}
.hero-stat span{font-size:11px;letter-spacing:.5px}

/* ── APP BODY / SIDEBAR / MAIN ── */
.app-body{display:flex;gap:0;min-height:calc(100vh - 68px)}
.sidebar{width:246px;flex-shrink:0;background:var(--white);border-right:1px solid var(--ivory);padding:22px 18px;position:sticky;top:68px;height:calc(100vh - 68px);overflow-y:auto}
.sb-sec{margin-bottom:26px}
.sb-title{font-family:'Playfair Display',serif;font-size:12px;color:var(--text-dark);margin-bottom:11px;display:flex;align-items:center;gap:7px;letter-spacing:.3px;text-transform:uppercase}
.sb-title::after{content:'';flex:1;height:1px;background:var(--ivory)}
.search-wrap{position:relative;margin-bottom:18px}
.search-input{width:100%;padding:10px 12px 10px 34px;border:1.5px solid var(--ivory);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;background:var(--cream);color:var(--text-dark);outline:none;transition:border-color .2s}
.search-input:focus{border-color:var(--gold)}
.search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-light);font-size:13px;pointer-events:none}
.genre-pills{display:flex;flex-wrap:wrap;gap:5px}
.gp{padding:5px 11px;border-radius:20px;font-size:11px;font-weight:500;cursor:pointer;border:1.5px solid var(--ivory);background:none;color:var(--text-mid);transition:all .17s;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.gp:hover{border-color:var(--mid-brown)}
.gp.active{background:var(--warm-brown);color:var(--white);border-color:var(--warm-brown)}
.gp .gc{background:rgba(255,255,255,.2);border-radius:10px;padding:1px 5px;font-size:9px}
.gp:not(.active) .gc{background:var(--ivory);color:var(--text-light)}
.sort-select{width:100%;padding:9px 32px 9px 11px;border:1.5px solid var(--ivory);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;background:var(--cream);color:var(--text-dark);outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='7'%3E%3Cpath d='M1 1l4.5 4.5L10 1' stroke='%239C7B6B' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center}
.range-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--text-light);margin-bottom:7px}
.range-input{width:100%;accent-color:var(--gold);cursor:pointer}
.rf-row{display:flex;align-items:center;gap:8px;padding:5px 3px;cursor:pointer;border-radius:7px;transition:background .15s}
.rf-row:hover{background:var(--cream)}
.rf-row input[type=radio]{accent-color:var(--gold);cursor:pointer}

/* ── MAIN ── */
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.cat-tabs{display:flex;padding:14px 26px 0;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--ivory)}
.cat-tabs::-webkit-scrollbar{display:none}
.cat-tab{flex-shrink:0;padding:9px 18px;border:none;background:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:var(--text-light);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1px;transition:all .2s;white-space:nowrap}
.cat-tab.active{color:var(--warm-brown);border-bottom-color:var(--gold);font-weight:600}
.toolbar{display:flex;align-items:center;justify-content:space-between;padding:16px 26px 0;flex-wrap:wrap;gap:10px}
.tb-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rc-txt{font-size:13px;color:var(--text-light)}
.rc-txt strong{color:var(--text-dark);font-weight:600}
.fchip{display:inline-flex;align-items:center;gap:4px;background:var(--gold-pale);border:1px solid var(--gold);color:var(--warm-brown);font-size:11px;padding:3px 9px;border-radius:20px;font-weight:500}
.fchip button{background:none;border:none;cursor:pointer;color:var(--mid-brown);font-size:12px;line-height:1;padding:0 0 0 1px}
.clr-btn{background:none;border:1.5px solid var(--ivory);color:var(--text-light);font-size:12px;padding:5px 12px;border-radius:7px;cursor:pointer;transition:all .2s}
.clr-btn:hover{border-color:var(--terracotta);color:var(--terracotta)}
.view-toggle{display:flex;border:1.5px solid var(--ivory);border-radius:9px;overflow:hidden}
.vb{background:none;border:none;padding:6px 11px;cursor:pointer;color:var(--text-light);font-size:15px;transition:background .15s}
.vb.active{background:var(--warm-brown);color:var(--white)}
.books-area{padding:18px 26px 40px;flex:1}
.bg{display:grid;grid-template-columns:repeat(auto-fill,minmax(183px,1fr));gap:20px}
.bl{display:flex;flex-direction:column;gap:12px}
.empty{text-align:center;padding:80px 20px}
.empty-icon{font-size:50px;margin-bottom:14px;opacity:.38}
.empty-title{font-family:'Playfair Display',serif;font-size:19px;color:var(--text-mid);margin-bottom:7px}

/* ── BOOK CARD ── */
.bcard{background:var(--white);border-radius:14px;overflow:hidden;box-shadow:var(--shadow-sm);border:1px solid rgba(61,43,31,.06);cursor:pointer;transition:transform .24s,box-shadow .24s;display:flex;flex-direction:column;position:relative}
.bcard:hover{transform:translateY(-5px);box-shadow:var(--shadow-lg)}
.bcard:hover .cov-overlay{opacity:1}
.bcard:hover .cov-img{transform:scale(1.05)}
.wbtn{position:absolute;top:9px;right:9px;z-index:2;background:rgba(24,14,8,.42);border:none;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;transition:all .2s;backdrop-filter:blur(4px)}
.wbtn:hover{background:rgba(24,14,8,.65);transform:scale(1.13)}
.wbtn.on{background:rgba(196,146,42,.85)}
.cov-wrap{position:relative;height:188px;overflow:hidden;flex-shrink:0}
.cov-img{width:100%;height:188px;object-fit:cover;object-position:top;display:block;transition:transform .34s}
.cov-fb{width:100%;height:188px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px}
.cov-fb-l{font-family:'Playfair Display',serif;font-size:50px;font-weight:700;color:rgba(255,255,255,.88);line-height:1}
.cov-fb-lines{display:flex;flex-direction:column;gap:5px;align-items:center;width:55%}
.cov-fb-line{height:3px;border-radius:2px;background:rgba(255,255,255,.24)}
.cov-overlay{position:absolute;inset:0;background:rgba(24,12,5,.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s}
.ov-pill{background:var(--gold);color:var(--warm-brown);border:none;padding:9px 20px;border-radius:22px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.3px}
.cov-accent{position:absolute;bottom:0;left:0;right:0;height:3px;background:var(--gold)}
.cbody{padding:12px 13px 14px;flex:1;display:flex;flex-direction:column}
.cgenre{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--sage);font-weight:600;margin-bottom:4px}
.ctitle{font-family:'Playfair Display',serif;font-size:13px;color:var(--text-dark);line-height:1.3;margin-bottom:2px;flex:1}
.cauthor{font-size:11px;color:var(--text-light);margin-bottom:7px}
.cstars{display:flex;align-items:center;gap:3px;margin-bottom:8px}
.cfooter{display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--ivory)}
.cprice{font-size:16px;font-weight:600;color:var(--warm-brown)}
.cprice sup{font-size:10px;font-weight:400;color:var(--text-light);vertical-align:super}
.abtn{background:var(--warm-brown);color:var(--white);border:none;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .15s;line-height:1;flex-shrink:0}
.abtn:hover{background:var(--gold);transform:scale(1.12)}

/* ── LIST ROW ── */
.brow{background:var(--white);border-radius:14px;padding:15px;display:flex;gap:14px;box-shadow:var(--shadow-sm);border:1px solid rgba(61,43,31,.06);cursor:pointer;transition:box-shadow .2s,transform .2s;position:relative}
.brow:hover{box-shadow:var(--shadow-md);transform:translateX(3px)}
.rthumb{width:62px;height:90px;border-radius:7px;overflow:hidden;flex-shrink:0}
.rthumb img,.rthumb-fb{width:100%;height:100%}
.rthumb-fb{display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:rgba(255,255,255,.88)}
.rinfo{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}
.rgenre{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--sage);font-weight:600;margin-bottom:3px}
.rtitle{font-family:'Playfair Display',serif;font-size:15px;color:var(--text-dark);line-height:1.25;margin-bottom:2px}
.rauthor{font-size:12px;color:var(--text-light);margin-bottom:5px}
.rpref{font-size:12px;color:var(--text-mid);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rbottom{display:flex;align-items:center;justify-content:space-between;margin-top:9px}
.ractions{display:flex;align-items:center;gap:8px}
.rwish{background:none;border:1.5px solid var(--ivory);border-radius:8px;width:33px;height:33px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;transition:all .2s}
.rwish:hover,.rwish.on{border-color:var(--gold);background:var(--gold-pale)}
.rprice{font-size:16px;font-weight:600;color:var(--warm-brown)}

/* ── DRAWERS ── */
.doverlay{position:fixed;inset:0;background:rgba(20,10,6,.52);z-index:400;animation:fdi .2s}
@keyframes fdi{from{opacity:0}to{opacity:1}}
.drawer{position:fixed;right:0;top:0;bottom:0;width:375px;background:var(--white);box-shadow:-8px 0 40px rgba(20,10,6,.2);display:flex;flex-direction:column;z-index:401;animation:slr .28s cubic-bezier(.34,1.4,.64,1)}
@keyframes slr{from{transform:translateX(100%)}to{transform:none}}
.dhead{padding:20px 22px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.dhead-cart{background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown))}
.dhead-wish{background:linear-gradient(135deg,#4A2B3D,#7A4A6B)}
.dhead-title{font-family:'Playfair Display',serif;color:var(--white);font-size:19px}
.dclose{background:rgba(255,255,255,.15);border:none;color:var(--white);width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;transition:background .2s}
.dclose:hover{background:rgba(255,255,255,.28)}
.dbody{flex:1;overflow-y:auto;padding:14px 20px}
.dempty{text-align:center;padding:56px 0}
.dempty .dei{font-size:42px;opacity:.4;margin-bottom:12px}
.dempty p{font-family:'Playfair Display',serif;font-size:15px;color:var(--text-mid);margin-bottom:5px}
.dempty small{font-size:12px;color:var(--text-light)}
.dfoot{padding:16px 22px 22px;border-top:1px solid var(--ivory);flex-shrink:0}
.dfoot-total{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
.dfoot-lbl{font-size:13px;color:var(--text-light)}
.dfoot-amt{font-family:'Playfair Display',serif;font-size:25px;color:var(--warm-brown);font-weight:700}
.pay-btn{width:100%;padding:14px;background:linear-gradient(135deg,var(--gold),var(--gold-light));border:none;border-radius:12px;color:var(--warm-brown);font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s,box-shadow .2s;box-shadow:0 4px 14px rgba(196,146,42,.38)}
.pay-btn:hover{opacity:.91;transform:translateY(-1px)}
.ci{display:flex;gap:11px;padding:12px 0;border-bottom:1px solid var(--ivory)}
.ci:last-child{border-bottom:none}
.cithumb{width:44px;height:62px;border-radius:6px;overflow:hidden;flex-shrink:0}
.cithumb img{width:100%;height:100%;object-fit:cover}
.cifb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:17px;color:rgba(255,255,255,.88);font-weight:700}
.ciinfo{flex:1;min-width:0}
.cititle{font-size:13px;font-weight:500;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.ciprice{font-size:12px;color:var(--gold);font-weight:600;margin-bottom:7px}
.ciqty{display:flex;align-items:center;gap:7px}
.ciqb{width:25px;height:25px;border:1.5px solid var(--ivory);background:var(--cream);border-radius:7px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-mid);transition:border-color .2s;line-height:1}
.ciqb:hover{border-color:var(--mid-brown)}
.ciqn{font-size:13px;font-weight:600;min-width:16px;text-align:center}
.cidel{background:none;border:none;color:var(--terracotta);font-size:15px;cursor:pointer;padding:3px;border-radius:5px;opacity:.7;margin-left:auto;display:flex}
.cidel:hover{opacity:1}
.wi{display:flex;gap:11px;align-items:center;padding:11px 0;border-bottom:1px solid var(--ivory)}
.wi:last-child{border-bottom:none}
.withumb{width:38px;height:54px;border-radius:6px;overflow:hidden;flex-shrink:0}
.withumb img{width:100%;height:100%;object-fit:cover}
.wifb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:16px;color:rgba(255,255,255,.88);font-weight:700}
.wiinfo{flex:1;min-width:0}
.wititle{font-size:13px;font-weight:500;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wiauthor{font-size:11px;color:var(--text-light);margin:2px 0 6px}
.wiadd{background:var(--warm-brown);color:var(--white);border:none;padding:5px 13px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .2s}
.wiadd:hover{background:var(--gold)}
.widel{background:none;border:none;color:var(--terracotta);cursor:pointer;font-size:14px;padding:3px;opacity:.7}
.widel:hover{opacity:1}

/* ── GUEST LOGIN PROMPT MODAL ── */
.guest-login-overlay{position:fixed;inset:0;background:rgba(14,7,3,.85);backdrop-filter:blur(10px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:fdi .22s}
.guest-login-modal{background:var(--white);border-radius:24px;max-width:440px;width:100%;overflow:hidden;box-shadow:var(--shadow-xl);animation:slu2 .3s cubic-bezier(.34,1.4,.64,1)}
.glm-header{background:linear-gradient(135deg,var(--warm-brown) 0%,#5C3520 60%,#3B2518 100%);padding:32px 32px 28px;position:relative;overflow:hidden;text-align:center}
.glm-header::before{content:'';position:absolute;top:-50px;right:-50px;width:200px;height:200px;border-radius:50%;background:rgba(196,146,42,.12)}
.glm-header::after{content:'';position:absolute;bottom:-60px;left:-40px;width:240px;height:240px;border-radius:50%;background:rgba(196,146,42,.07)}
.glm-lock-icon{width:64px;height:64px;background:rgba(196,146,42,.18);border:2px solid rgba(196,146,42,.4);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px;position:relative;z-index:1}
.glm-title{font-family:'Playfair Display',serif;font-size:22px;color:var(--white);margin-bottom:8px;position:relative;z-index:1}
.glm-sub{font-size:13px;color:rgba(237,232,224,.72);line-height:1.55;position:relative;z-index:1;font-weight:300}
.glm-body{padding:28px 32px 32px}
.glm-perks{display:flex;flex-direction:column;gap:11px;margin-bottom:26px}
.glm-perk{display:flex;align-items:center;gap:11px;font-size:13px;color:var(--text-mid)}
.glm-perk-dot{width:28px;height:28px;border-radius:8px;background:var(--gold-pale);border:1px solid rgba(196,146,42,.3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.glm-actions{display:flex;flex-direction:column;gap:9px}
.glm-signin{width:100%;padding:13px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));color:var(--white);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;box-shadow:0 4px 14px rgba(61,43,31,.25);letter-spacing:.2px}
.glm-signin:hover{opacity:.9;transform:translateY(-1px)}
.glm-signup{width:100%;padding:13px;background:var(--gold-pale);color:var(--warm-brown);border:1.5px solid rgba(196,146,42,.4);border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}
.glm-signup:hover{background:var(--gold);color:var(--warm-brown)}
.glm-dismiss{width:100%;padding:10px;background:none;color:var(--text-light);border:none;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;transition:color .2s}
.glm-dismiss:hover{color:var(--text-mid)}
.glm-divider{display:flex;align-items:center;gap:10px;color:var(--text-light);font-size:11px;margin:4px 0}
.glm-divider::before,.glm-divider::after{content:'';flex:1;height:1px;background:var(--ivory)}

/* ── CANCEL CONFIRM MODAL ── */
.cancel-overlay{position:fixed;inset:0;background:rgba(14,7,3,.75);backdrop-filter:blur(6px);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;animation:fdi .18s}
.cancel-modal{background:var(--white);border-radius:20px;max-width:400px;width:100%;padding:32px 30px;text-align:center;box-shadow:var(--shadow-xl);animation:slu2 .25s cubic-bezier(.34,1.4,.64,1)}
.cancel-icon{width:60px;height:60px;background:#FAE8E8;border:2px solid rgba(196,96,58,.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 18px}
.cancel-title{font-family:'Playfair Display',serif;font-size:20px;color:var(--text-dark);margin-bottom:8px}
.cancel-sub{font-size:13px;color:var(--text-light);line-height:1.6;margin-bottom:6px}
.cancel-order-ref{display:inline-block;background:var(--ivory);border-radius:7px;padding:5px 14px;font-size:12px;font-weight:600;color:var(--warm-brown);letter-spacing:.5px;margin-bottom:24px}
.cancel-refund-note{font-size:12px;color:var(--sage);background:#EDF5EC;border-radius:8px;padding:9px 13px;margin-bottom:22px;text-align:left;display:flex;align-items:flex-start;gap:7px}
.cancel-refund-note span:first-child{flex-shrink:0}
.cancel-actions{display:flex;gap:10px}
.cancel-confirm-btn{flex:1;padding:12px;background:linear-gradient(135deg,#C4603A,#A84028);color:var(--white);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;box-shadow:0 4px 12px rgba(196,96,58,.3)}
.cancel-confirm-btn:hover{opacity:.9;transform:translateY(-1px)}
.cancel-confirm-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.cancel-back-btn{flex:1;padding:12px;background:var(--ivory);color:var(--text-mid);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s}
.cancel-back-btn:hover{background:#E0D9CE}

/* ── CHECKOUT MODAL ── */
.checkout-overlay{position:fixed;inset:0;background:rgba(14,7,3,.82);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;animation:fdi .22s}
.checkout-modal{background:var(--white);border-radius:22px;max-width:580px;width:100%;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-xl);animation:slu2 .3s cubic-bezier(.34,1.4,.64,1)}
@keyframes slu2{from{transform:translateY(28px) scale(.96);opacity:0}to{transform:none;opacity:1}}
.co-head{background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));padding:22px 26px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.co-title{font-family:'Playfair Display',serif;color:var(--white);font-size:20px}
.co-steps{display:flex;align-items:center;gap:6px}
.co-step-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.3);transition:all .25s}
.co-step-dot.active{background:var(--gold-light);width:22px;border-radius:4px}
.co-step-dot.done{background:rgba(255,255,255,.7)}
.co-body{padding:24px 26px;overflow-y:auto;flex:1}
.co-section-title{font-size:12px;font-weight:600;color:var(--text-mid);letter-spacing:.5px;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.co-section-title::after{content:'';flex:1;height:1px;background:var(--ivory)}
.co-items{margin-bottom:20px}
.co-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--ivory)}
.co-item:last-child{border-bottom:none}
.co-item-thumb{width:36px;height:50px;border-radius:5px;overflow:hidden;flex-shrink:0}
.co-item-thumb img{width:100%;height:100%;object-fit:cover}
.co-item-fb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:14px;color:rgba(255,255,255,.88);font-weight:700}
.co-item-info{flex:1;min-width:0}
.co-item-title{font-size:12px;font-weight:500;color:var(--text-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.co-item-qty{font-size:11px;color:var(--text-light)}
.co-item-price{font-size:13px;font-weight:600;color:var(--warm-brown)}
.addr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px}
.addr-full{grid-column:1/-1}
.addr-field{display:flex;flex-direction:column;gap:5px}
.addr-label{font-size:11px;font-weight:600;color:var(--text-mid);letter-spacing:.4px;text-transform:uppercase}
.addr-input{padding:10px 12px;border:1.5px solid var(--ivory);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text-dark);background:var(--cream);outline:none;transition:border-color .2s,box-shadow .2s;width:100%}
.addr-input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(196,146,42,.1)}
.addr-input.err{border-color:var(--terracotta)}
.addr-select{padding:10px 32px 10px 12px;border:1.5px solid var(--ivory);border-radius:10px;font-family:'DM Sans',sans-serif;font-size:13px;background:var(--cream);color:var(--text-dark);outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239C7B6B' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;width:100%;transition:border-color .2s}
.addr-select:focus{border-color:var(--gold);outline:none}
.addr-select.err{border-color:var(--terracotta)}
.addr-err{font-size:11px;color:var(--terracotta);margin-top:2px}
.addr-type-pills{display:flex;gap:8px;margin-bottom:4px}
.addr-type-pill{flex:1;padding:8px;border:1.5px solid var(--ivory);border-radius:9px;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:var(--text-mid);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .18s}
.addr-type-pill:hover{border-color:var(--mid-brown)}
.addr-type-pill.sel{border-color:var(--gold);background:var(--gold-pale);color:var(--warm-brown);font-weight:600}
.pay-method-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
.pm-btn{padding:11px 10px;border:1.5px solid var(--ivory);border-radius:10px;background:none;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;color:var(--text-mid);cursor:pointer;transition:all .18s;text-align:left;display:flex;align-items:center;gap:7px}
.pm-btn:hover{border-color:var(--mid-brown)}
.pm-btn.sel{border-color:var(--gold);background:var(--gold-pale);color:var(--warm-brown);font-weight:600}
.co-total-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid var(--ivory);margin-top:8px}
.co-total-lbl{font-size:14px;color:var(--text-mid);font-weight:500}
.co-total-amt{font-family:'Playfair Display',serif;font-size:26px;color:var(--warm-brown);font-weight:700}
.co-breakdown{margin-bottom:4px}
.co-breakdown-row{display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);padding:3px 0}
.co-breakdown-row.discount{color:var(--sage)}
.co-foot{padding:16px 26px 22px;border-top:1px solid var(--ivory);flex-shrink:0;display:flex;gap:10px}
.co-cancel{padding:13px 20px;background:var(--ivory);color:var(--text-mid);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s}
.co-cancel:hover{background:#E0D9CE}
.co-back{padding:13px 20px;background:var(--ivory);color:var(--text-mid);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s;display:flex;align-items:center;gap:6px}
.co-back:hover{background:#E0D9CE}
.co-pay{flex:1;padding:13px;background:linear-gradient(135deg,var(--gold),var(--gold-light));border:none;border-radius:11px;color:var(--warm-brown);font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s;box-shadow:0 4px 14px rgba(196,146,42,.35);letter-spacing:.2px}
.co-pay:hover{opacity:.91;transform:translateY(-1px)}
.co-pay:disabled{opacity:.4;cursor:not-allowed;transform:none}
.co-next{flex:1;padding:13px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));border:none;border-radius:11px;color:var(--white);font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;letter-spacing:.2px}
.co-next:hover{opacity:.9;transform:translateY(-1px)}
.co-next:disabled{opacity:.4;cursor:not-allowed;transform:none}
.addr-summary-card{background:var(--cream);border:1px solid var(--ivory);border-radius:11px;padding:12px 15px;margin-bottom:20px;display:flex;align-items:flex-start;gap:10px}
.addr-summary-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.addr-summary-text{font-size:13px;color:var(--text-mid);line-height:1.55}
.addr-summary-name{font-weight:600;color:var(--text-dark);margin-bottom:2px;font-size:13px}
.addr-edit-btn{background:none;border:none;color:var(--gold);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;margin-left:auto;flex-shrink:0;padding:2px 6px;border-radius:5px;transition:background .15s}
.addr-edit-btn:hover{background:var(--gold-pale)}

/* ── SUCCESS MODAL ── */
.success-overlay{position:fixed;inset:0;background:rgba(14,7,3,.82);backdrop-filter:blur(8px);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;animation:fdi .22s}
.success-modal{background:var(--white);border-radius:22px;max-width:420px;width:100%;padding:44px 36px;text-align:center;box-shadow:var(--shadow-xl);animation:slu2 .3s cubic-bezier(.34,1.4,.64,1)}
.success-icon{width:72px;height:72px;background:linear-gradient(135deg,#2D6B31,#3D8B42);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;box-shadow:0 4px 20px rgba(45,107,49,.3)}
.success-title{font-family:'Playfair Display',serif;font-size:26px;color:var(--text-dark);margin-bottom:8px}
.success-sub{font-size:14px;color:var(--text-light);line-height:1.6;margin-bottom:8px}
.order-id-tag{display:inline-block;background:var(--ivory);border-radius:8px;padding:7px 16px;font-size:13px;font-weight:600;color:var(--warm-brown);letter-spacing:.5px;margin-bottom:24px;font-family:'DM Sans',sans-serif}
.success-btns{display:flex;gap:10px}
.success-secondary{flex:1;padding:12px;background:var(--ivory);color:var(--text-mid);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s}
.success-secondary:hover{background:#E0D9CE}
.success-primary{flex:1;padding:12px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));color:var(--white);border:none;border-radius:11px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s}
.success-primary:hover{opacity:.88;transform:translateY(-1px)}

/* ── ORDERS PAGE ── */
.orders-page{max-width:900px;margin:0 auto;padding:36px 28px 60px}
.page-header{margin-bottom:32px}
.page-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--text-light);font-size:13px;cursor:pointer;padding:0;margin-bottom:16px;transition:color .2s;font-family:'DM Sans',sans-serif}
.page-back:hover{color:var(--text-mid)}
.page-title{font-family:'Playfair Display',serif;font-size:30px;color:var(--text-dark)}
.page-sub{font-size:13px;color:var(--text-light);margin-top:4px}
.orders-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
.ostat{background:var(--white);border-radius:14px;padding:18px 20px;box-shadow:var(--shadow-sm);border:1px solid rgba(61,43,31,.06)}
.ostat-val{font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:var(--warm-brown);margin-bottom:3px}
.ostat-lbl{font-size:11px;color:var(--text-light);letter-spacing:.5px;text-transform:uppercase}
.order-filters{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.ofilter{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid var(--ivory);background:none;color:var(--text-mid);transition:all .17s}
.ofilter:hover{border-color:var(--mid-brown)}
.ofilter.active{background:var(--warm-brown);color:var(--white);border-color:var(--warm-brown)}
.order-card{background:var(--white);border-radius:16px;margin-bottom:16px;box-shadow:var(--shadow-sm);border:1px solid rgba(61,43,31,.06);overflow:hidden;transition:box-shadow .2s}
.order-card:hover{box-shadow:var(--shadow-md)}
.order-card-head{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ivory);flex-wrap:wrap;gap:10px}
.order-id{font-size:13px;font-weight:700;color:var(--warm-brown);letter-spacing:.5px}
.order-date{font-size:12px;color:var(--text-light)}
.order-status-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.3px}
.pay-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500}
.order-card-body{padding:16px 20px}
.order-items-preview{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.order-item-chip{display:flex;align-items:center;gap:7px;background:var(--cream);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--text-mid)}
.order-item-thumb{width:28px;height:38px;border-radius:4px;overflow:hidden;flex-shrink:0}
.order-item-thumb img{width:100%;height:100%;object-fit:cover}
.order-item-fb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:11px;color:rgba(255,255,255,.88);font-weight:700}
.order-item-name{font-weight:500;color:var(--text-dark);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.order-meta-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.order-meta-info{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.order-meta-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-light)}
.order-meta-item strong{color:var(--text-mid)}
.order-total-amt{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--warm-brown)}
.order-card-foot{padding:12px 20px;background:var(--cream);border-top:1px solid var(--ivory);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.order-action-btn{padding:7px 16px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:all .18s}
.oab-primary{background:var(--warm-brown);color:var(--white);border:none}
.oab-primary:hover{background:var(--mid-brown)}
.oab-secondary{background:none;border:1.5px solid var(--ivory);color:var(--text-mid)}
.oab-secondary:hover{border-color:var(--mid-brown);color:var(--warm-brown)}
.oab-cancel{background:none;border:1.5px solid rgba(196,96,58,.35);color:var(--terracotta);font-size:12px;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .18s}
.oab-cancel:hover{background:#FAE8E8;border-color:var(--terracotta)}
.order-progress{display:flex;align-items:center;margin:14px 0;overflow-x:auto}
.prog-step{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;min-width:60px}
.prog-dot{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;border:2px solid var(--ivory);background:var(--cream);color:var(--text-light);position:relative;z-index:1}
.prog-dot.done{background:var(--sage);border-color:var(--sage);color:#fff}
.prog-dot.current{background:var(--gold);border-color:var(--gold);color:var(--warm-brown)}
.prog-label{font-size:10px;color:var(--text-light);text-align:center;letter-spacing:.3px}
.prog-label.done{color:var(--sage);font-weight:500}
.prog-label.current{color:var(--gold);font-weight:600}
.prog-line{flex:1;height:2px;background:var(--ivory);z-index:0;align-self:flex-start;margin-top:11px}
.prog-line.done{background:var(--sage)}
.orders-empty{text-align:center;padding:80px 20px}
.orders-empty-icon{font-size:56px;margin-bottom:18px;opacity:.35}
.orders-empty-title{font-family:'Playfair Display',serif;font-size:22px;color:var(--text-mid);margin-bottom:8px}
.cancelled-stripe{background:repeating-linear-gradient(135deg,transparent,transparent 6px,rgba(196,96,58,.04) 6px,rgba(196,96,58,.04) 12px);border-left:3px solid rgba(196,96,58,.4)!important}
.status-timeline-note{font-size:11px;color:var(--text-light);font-style:italic;margin-top:6px;display:flex;align-items:center;gap:5px}

/* ── BOOK MODAL ── */
.modal-overlay{position:fixed;inset:0;background:rgba(14,7,3,.8);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;animation:fdi .22s}
.modal{background:var(--white);border-radius:24px;max-width:780px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-xl);animation:slu2 .3s cubic-bezier(.34,1.4,.64,1)}
.modal-inner{display:flex;flex:1;min-height:0;overflow:hidden}
.mleft{width:196px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:28px 16px 26px;position:relative}
.mcov{width:136px;height:196px;border-radius:9px;overflow:hidden;box-shadow:0 14px 44px rgba(0,0,0,.55);margin-bottom:18px;flex-shrink:0}
.mcov img{width:100%;height:100%;object-fit:cover}
.mcovfb{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.mcovfb-l{font-family:'Playfair Display',serif;font-size:56px;font-weight:700;color:rgba(255,255,255,.88);line-height:1}
.mcovfb-lines{display:flex;flex-direction:column;gap:5px;align-items:center;width:52%}
.mcovfb-line{height:3px;border-radius:2px;background:rgba(255,255,255,.2)}
.mprice{background:var(--gold);color:var(--warm-brown);font-size:18px;font-weight:700;font-family:'Playfair Display',serif;padding:9px 22px;border-radius:40px;box-shadow:0 4px 16px rgba(196,146,42,.45)}
.mx{position:absolute;top:11px;right:11px;background:rgba(255,255,255,.12);border:none;color:rgba(255,255,255,.8);width:28px;height:28px;border-radius:50%;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}
.mx:hover{background:rgba(255,255,255,.25);color:#fff}
.mright{flex:1;padding:30px 28px 18px;overflow-y:auto;display:flex;flex-direction:column}
.mgenre{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--sage);font-weight:600;margin-bottom:8px}
.mtitle{font-family:'Playfair Display',serif;font-size:25px;color:var(--text-dark);line-height:1.2;margin-bottom:7px}
.mauthor-row{display:flex;align-items:center;gap:7px;margin-bottom:13px}
.mdot{width:6px;height:6px;border-radius:50%;background:var(--gold);flex-shrink:0}
.mauthor{font-size:14px;color:var(--text-mid);font-style:italic}
.mrating-row{display:flex;align-items:center;gap:9px;margin-bottom:20px;flex-wrap:wrap}
.mavg{font-size:15px;font-weight:600;color:var(--warm-brown)}
.mrc{font-size:12px;color:var(--text-light)}
.mbadge{font-size:10px;padding:3px 8px;border-radius:20px;font-weight:600;letter-spacing:.8px}
.badge-bs{background:#FFF0D4;color:#A06A10}
.badge-new{background:#D4EDD6;color:#2D6B31}
.msec{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-light);margin-bottom:9px;display:flex;align-items:center;gap:9px}
.msec::after{content:'';flex:1;height:1px;background:var(--ivory)}
.mpref{font-size:14px;line-height:1.78;color:var(--text-mid);font-weight:300;margin-bottom:22px}
.mloading{display:flex;align-items:center;gap:8px;color:var(--text-light);font-size:13px;margin-bottom:22px}
.dp{display:flex;gap:4px}
.dp span{width:5px;height:5px;border-radius:50%;background:var(--gold);animation:dpa 1.2s infinite}
.dp span:nth-child(2){animation-delay:.2s}
.dp span:nth-child(3){animation-delay:.4s}
@keyframes dpa{0%,60%,100%{opacity:.2;transform:scale(.8)}30%{opacity:1;transform:scale(1)}}
.rv-card{background:var(--cream);border-radius:10px;padding:12px 14px;margin-bottom:9px}
.rv-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.rv-name{font-size:13px;font-weight:600;color:var(--text-dark)}
.rv-date{font-size:11px;color:var(--text-light)}
.rv-stars{display:flex;gap:2px;margin-bottom:6px}
.rv-txt{font-size:13px;color:var(--text-mid);line-height:1.55}
.rv-form{margin-top:14px;padding-top:14px;border-top:1px solid var(--ivory)}
.rv-form-title{font-size:11px;font-weight:600;color:var(--text-dark);margin-bottom:9px;letter-spacing:.3px;text-transform:uppercase}
.spicker{display:flex;gap:3px;margin-bottom:9px}
.spick{background:none;border:none;font-size:21px;cursor:pointer;transition:transform .14s;line-height:1;padding:2px}
.spick:hover{transform:scale(1.2)}
.rv-input{width:100%;padding:8px 11px;border:1.5px solid var(--ivory);border-radius:9px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text-dark);background:var(--cream);outline:none;transition:border-color .2s;margin-bottom:7px}
.rv-input:focus{border-color:var(--gold)}
.rv-ta{width:100%;padding:9px 11px;border:1.5px solid var(--ivory);border-radius:9px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text-dark);background:var(--cream);resize:none;outline:none;transition:border-color .2s;line-height:1.55}
.rv-ta:focus{border-color:var(--gold)}
.rv-submit{background:var(--warm-brown);color:var(--white);border:none;padding:9px 20px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:background .2s,transform .15s;margin-top:8px}
.rv-submit:hover{background:var(--mid-brown);transform:translateY(-1px)}
.rv-submit:disabled{opacity:.48;cursor:not-allowed;transform:none}
.mfoot{padding:14px 28px 20px;border-top:1px solid var(--ivory);display:flex;gap:9px;flex-shrink:0}
.maddBtn{flex:1;padding:13px;background:linear-gradient(135deg,var(--warm-brown),var(--mid-brown));color:var(--white);border:none;border-radius:11px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s}
.maddBtn:hover{opacity:.87;transform:translateY(-1px)}
.mwishBtn{padding:13px 15px;border:1.5px solid var(--ivory);border-radius:11px;background:none;font-size:17px;cursor:pointer;transition:all .2s}
.mwishBtn:hover,.mwishBtn.on{border-color:var(--gold);background:var(--gold-pale)}
.mcloseBtn{padding:13px 18px;background:var(--ivory);color:var(--text-mid);border:none;border-radius:11px;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s}
.mcloseBtn:hover{background:#E0D9CE}

/* ── TOAST ── */
.toast{position:fixed;bottom:26px;right:26px;background:var(--warm-brown);color:var(--white);padding:11px 17px;border-radius:11px;font-size:13px;box-shadow:var(--shadow-lg);border-left:3px solid var(--gold);animation:tin .3s ease;z-index:9999;max-width:280px}
@keyframes tin{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
.skel{background:linear-gradient(90deg,var(--ivory) 25%,var(--cream) 50%,var(--ivory) 75%);background-size:200% 100%;animation:shim 1.4s infinite;border-radius:6px}
@keyframes shim{0%{background-position:200% 0}100%{background-position:-200% 0}}

@media(max-width:960px){.sidebar{width:216px}}
@media(max-width:800px){
  .app-body{flex-direction:column}
  .sidebar{width:100%;height:auto;position:static;border-right:none;border-bottom:1px solid var(--ivory)}
  .auth-left{display:none}
  .drawer,.orders-page{max-width:100%}
  .orders-stats{grid-template-columns:repeat(2,1fr)}
  .addr-grid{grid-template-columns:1fr}
}
@media(max-width:560px){
  .nav,.hero,.toolbar,.books-area,.cat-tabs{padding-left:14px;padding-right:14px}
  .modal-inner{flex-direction:column}
  .mleft{width:100%;flex-direction:row;padding:16px 20px;gap:16px;align-items:center}
  .mcov{width:76px;height:110px;margin-bottom:0}
  .mright,.mfoot{padding:16px 20px}
  .orders-stats{grid-template-columns:repeat(2,1fr)}
  .addr-grid{grid-template-columns:1fr}
}
`;

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────
function Stars({rating, size=12}) {
  return <span style={{display:"inline-flex",gap:1}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:size,color:i<=Math.round(rating)?"#C4922A":"#D8CEC4"}}>★</span>)}</span>;
}
const DEMO_REVS = [
  {name:"Priya S.",rating:5,date:"Mar 2025",text:"An absolute masterpiece. Couldn't put it down — stunning prose."},
  {name:"Rahul M.",rating:4,date:"Jan 2025",text:"Beautifully written. A few slow moments but the payoff is worth it."},
  {name:"Ananya K.",rating:5,date:"Dec 2024",text:"One of the best books I read this year. Highly recommend!"},
];

// ─── PASSWORD STRENGTH ────────────────────────────────────────────────────
function pwStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const PW_LABELS = ["","Weak","Fair","Good","Strong"];
const PW_COLORS = ["","#C4603A","#C4922A","#6B7F5E","#2D6B31"];

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────
function AuthScreen({onAuth, initialTab="login"}) {
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = pwStrength(pw);

  const handleSubmit = async () => {
    setErr("");
    if (tab === "signup") {
      if (!name.trim()) { setErr("Please enter your name."); return; }
      if (!email.includes("@")) { setErr("Please enter a valid email."); return; }
      if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
      setLoading(true);
      await new Promise(r => setTimeout(r, 600));
      const res = createUser(name.trim(), email.trim(), pw);
      setLoading(false);
      if (res.error) { setErr(res.error); return; }
      onAuth(res.user);
    } else {
      if (!email || !pw) { setErr("Please fill all fields."); return; }
      setLoading(true);
      await new Promise(r => setTimeout(r, 500));
      const res = loginUser(email.trim(), pw);
      setLoading(false);
      if (res.error) { setErr(res.error); return; }
      onAuth(res.user);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-logo-wrap">
            <div className="auth-logo">📚</div>
            <div><div className="auth-logo-name">Shelfwise</div><div className="auth-logo-tag">Curated Reads</div></div>
          </div>
          <div className="auth-headline">Your personal <em>literary</em> universe</div>
          <div className="auth-sub">Track every book you've bought, revisit your reading journey, manage your wishlist, and discover your next favourite read.</div>
        </div>
        <div className="auth-features">
          {[
            {icon:"📦", text:"Full order history & payment tracking"},
            {icon:"♥", text:"Personal wishlist across devices"},
            {icon:"⭐", text:"Rate and review every purchase"},
            {icon:"🔔", text:"Exclusive member deals & early access"},
          ].map((f,i) => (
            <div className="auth-feature" key={i}>
              <div className="auth-feature-icon">{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-box">
          <div className="auth-tabs">
            <button className={`auth-tab${tab==="login"?" active":""}`} onClick={()=>{setTab("login");setErr("");}}>Sign In</button>
            <button className={`auth-tab${tab==="signup"?" active":""}`} onClick={()=>{setTab("signup");setErr("");}}>Create Account</button>
          </div>
          <div className="auth-title">{tab==="login"?"Welcome back":"Join Shelfwise"}</div>
          <div className="auth-desc">{tab==="login"?"Sign in to access your orders and wishlist.":"Create your account to start your reading journey."}</div>
          {tab==="signup" && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className={`form-input${err&&!name.trim()?" error":""}`} placeholder="Priya Sharma" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@email.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="pw-wrap">
              <input className="form-input" type={showPw?"text":"password"} placeholder={tab==="signup"?"Min 6 characters":"Your password"} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
              <button className="pw-toggle" onClick={()=>setShowPw(s=>!s)}>{showPw?"🙈":"👁"}</button>
            </div>
            {tab==="signup" && pw && (
              <>
                <div className="pw-strength">{[1,2,3,4].map(i=><div key={i} className="pw-bar" style={{background:i<=strength?PW_COLORS[strength]:"var(--ivory)"}}/>)}</div>
                <div className="pw-hint" style={{color:PW_COLORS[strength]}}>{PW_LABELS[strength]}</div>
              </>
            )}
          </div>
          {err && <div className="form-err">⚠ {err}</div>}
          <button className="auth-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? "Please wait…" : tab==="login" ? "Sign In →" : "Create Account →"}
          </button>
          {tab==="login" && (
            <>
              <div className="auth-divider">or try a demo account</div>
              <button className="auth-submit" style={{background:"var(--ivory)",color:"var(--text-mid)",boxShadow:"none"}} onClick={()=>{
                createUser("Demo Reader","demo@shelfwise.com","demo123");
                const r=loginUser("demo@shelfwise.com","demo123");
                if(r.user)onAuth(r.user);
              }}>Continue as Guest 👋</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GUEST LOGIN PROMPT ───────────────────────────────────────────────────
function GuestLoginPrompt({ onSignIn, onSignUp, onDismiss }) {
  return (
    <div className="guest-login-overlay" onClick={e=>e.target===e.currentTarget&&onDismiss()}>
      <div className="guest-login-modal">
        <div className="glm-header">
          <div className="glm-lock-icon">🔐</div>
          <div className="glm-title">Sign in to place your order</div>
          <div className="glm-sub">Guest browsing is fine, but you'll need an account to checkout — so we can save your orders and keep you updated.</div>
        </div>
        <div className="glm-body">
          <div className="glm-perks">
            {[
              {icon:"📦", text:"Track every order in real time"},
              {icon:"🧾", text:"Access invoices & order history"},
              {icon:"♥", text:"Sync your wishlist across devices"},
              {icon:"🎁", text:"Get member-only deals & early access"},
            ].map((p,i)=>(
              <div className="glm-perk" key={i}><div className="glm-perk-dot">{p.icon}</div><span>{p.text}</span></div>
            ))}
          </div>
          <div className="glm-actions">
            <button className="glm-signin" onClick={onSignIn}>Sign In to My Account →</button>
            <div className="glm-divider">or</div>
            <button className="glm-signup" onClick={onSignUp}>Create a Free Account</button>
            <button className="glm-dismiss" onClick={onDismiss}>Maybe later, continue browsing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CANCEL ORDER CONFIRM MODAL ───────────────────────────────────────────
function CancelOrderModal({ order, onConfirm, onDismiss }) {
  const [loading, setLoading] = useState(false);
  const isPaid = order.paymentStatus === "paid";

  const handleConfirm = async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setLoading(false);
    onConfirm(order.id);
  };

  return (
    <div className="cancel-overlay" onClick={e=>e.target===e.currentTarget&&onDismiss()}>
      <div className="cancel-modal">
        <div className="cancel-icon">🚫</div>
        <div className="cancel-title">Cancel this order?</div>
        <div className="cancel-sub">This will cancel your order and you won't be able to undo it.</div>
        <div className="cancel-order-ref">#{order.id}</div>
        {isPaid && (
          <div className="cancel-refund-note">
            <span>💚</span>
            <span>Since you paid via <strong>{order.paymentMethod}</strong>, a full refund of <strong>₹{order.total}</strong> will be initiated within 5–7 business days.</span>
          </div>
        )}
        {!isPaid && (
          <div className="cancel-refund-note" style={{background:"#FFF5E8",color:"#7A5010"}}>
            <span>ℹ️</span>
            <span>This is a Cash on Delivery order — no payment has been collected, so no refund is needed.</span>
          </div>
        )}
        <div className="cancel-actions">
          <button className="cancel-back-btn" onClick={onDismiss}>Keep Order</button>
          <button className="cancel-confirm-btn" onClick={handleConfirm} disabled={loading}>
            {loading ? "Cancelling…" : "Yes, Cancel Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BOOK MODAL ───────────────────────────────────────────────────────────
function BookModal({book,idx,ol,olLoading,onClose,onAdd,onWish,wished}) {
  const[bg1,bg2]=BGS[idx%BGS.length];
  const meta=useMemo(()=>genMeta(book.title,idx),[book.title,idx]);
  const[covErr,setCovErr]=useState(false);
  const[nr,setNr]=useState(0);const[hr,setHr]=useState(0);
  const[rt,setRt]=useState("");const[rn,setRn]=useState("");
  const[revs,setRevs]=useState(DEMO_REVS.slice(0,2+(idx%2)));
  const avg=revs.length?(revs.reduce((s,r)=>s+r.rating,0)/revs.length).toFixed(1):meta.rating;
  const letter=(book.title||"B")[0].toUpperCase();
  const submit=()=>{if(!nr||!rt.trim())return;setRevs(p=>[{name:rn.trim()||"Anonymous Reader",rating:nr,date:"Just now",text:rt.trim()},...p]);setNr(0);setRt("");setRn("");};
  return(
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-inner">
          <div className="mleft" style={{background:`linear-gradient(170deg,${bg1},#120806)`}}>
            <button className="mx" onClick={onClose}>✕</button>
            <div className="mcov">
              {ol?.coverImg&&!covErr?<img src={ol.coverImg} alt={book.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setCovErr(true)}/>
              :<div className="mcovfb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}><div className="mcovfb-l">{letter}</div><div className="mcovfb-lines"><div className="mcovfb-line" style={{width:"100%"}}/><div className="mcovfb-line" style={{width:"65%"}}/><div className="mcovfb-line" style={{width:"80%"}}/></div></div>}
            </div>
            <div className="mprice">₹{book.price}</div>
          </div>
          <div className="mright">
            <div className="mgenre">{meta.genre}</div>
            <div className="mtitle">{book.title}</div>
            <div className="mauthor-row"><div className="mdot"/><div className="mauthor">{book.author||"Unknown Author"}</div></div>
            <div className="mrating-row">
              <Stars rating={+avg} size={15}/><span className="mavg">{avg}</span>
              <span className="mrc">({revs.length} review{revs.length!==1?"s":""})</span>
              {meta.isBestseller&&<span className="mbadge badge-bs">BESTSELLER</span>}
              {meta.isNew&&<span className="mbadge badge-new">NEW</span>}
            </div>
            <div className="msec">Preface</div>
            {olLoading?<div className="mloading"><div className="dp"><span/><span/><span/></div>Fetching preface…</div>
            :<div className="mpref">{ol?.preface||`"${book.title}" is a captivating work by ${book.author||"this author"} that has resonated with readers worldwide.`}</div>}
            <div className="msec">Reader Reviews</div>
            {revs.map((r,i)=>(
              <div className="rv-card" key={i}><div className="rv-hd"><span className="rv-name">{r.name}</span><span className="rv-date">{r.date}</span></div><div className="rv-stars"><Stars rating={r.rating} size={11}/></div><div className="rv-txt">{r.text}</div></div>
            ))}
            <div className="rv-form">
              <div className="rv-form-title">Write a Review</div>
              <input className="rv-input" placeholder="Your name (optional)" value={rn} onChange={e=>setRn(e.target.value)}/>
              <div className="spicker">{[1,2,3,4,5].map(s=><button key={s} className="spick" style={{color:s<=(hr||nr)?"#C4922A":"#D0C4BA"}} onMouseEnter={()=>setHr(s)} onMouseLeave={()=>setHr(0)} onClick={()=>setNr(s)}>★</button>)}{nr>0&&<span style={{fontSize:11,color:"var(--text-light)",alignSelf:"center",marginLeft:5}}>{nr}/5</span>}</div>
              <textarea className="rv-ta" rows={3} placeholder="Share your thoughts…" value={rt} onChange={e=>setRt(e.target.value)}/>
              <div style={{display:"flex",justifyContent:"flex-end"}}><button className="rv-submit" onClick={submit} disabled={!nr||!rt.trim()}>Post Review</button></div>
            </div>
          </div>
        </div>
        <div className="mfoot">
          <button className="mcloseBtn" onClick={onClose}>Close</button>
          <button className={`mwishBtn${wished?" on":""}`} onClick={()=>onWish(book)}>{wished?"♥":"♡"}</button>
          <button className="maddBtn" onClick={()=>{onAdd(book);onClose();}}>Add to Cart — ₹{book.price}</button>
        </div>
      </div>
    </div>
  );
}

// ─── CHECKOUT MODAL (2-step) ──────────────────────────────────────────────
const PM_ICONS = {"UPI":"📱","Credit Card":"💳","Debit Card":"💳","Net Banking":"🏦","Cash on Delivery":"💵"};
const EMPTY_ADDR = { fullName:"", phone:"", line1:"", line2:"", city:"", state:"", pincode:"", type:"Home" };

function CheckoutModal({cart, olCache, BGS, user, onClose, onSuccess}) {
  const [step, setStep] = useState(1);
  const [addr, setAddr] = useState(() => {
    const saved = LS.get("hb_lastaddr_" + (user?.email || ""), null);
    return saved ? saved : { ...EMPTY_ADDR, fullName: user?.name || "", state: "Uttar Pradesh" };
  });
  const [addrErrors, setAddrErrors] = useState({});
  const [selMethod, setSelMethod] = useState("UPI");
  const [processing, setProcessing] = useState(false);

  const subtotal = cart.reduce((s,i)=>s+i.price*i.quantity, 0);
  const shipping = subtotal >= 499 ? 0 : 49;
  const total = subtotal + shipping;

  const setField = (key, val) => { setAddr(p=>({...p,[key]:val})); if(addrErrors[key])setAddrErrors(p=>({...p,[key]:""})); };

  const validateAddr = () => {
    const e = {};
    if (!addr.fullName.trim()) e.fullName = "Required";
    if (!addr.phone.trim() || !/^[6-9]\d{9}$/.test(addr.phone.replace(/\s/g,""))) e.phone = "Valid 10-digit mobile number required";
    if (!addr.line1.trim()) e.line1 = "Required";
    if (!addr.city.trim()) e.city = "Required";
    if (!addr.state) e.state = "Required";
    if (!addr.pincode.trim() || !/^\d{6}$/.test(addr.pincode)) e.pincode = "Valid 6-digit PIN required";
    setAddrErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => { if(validateAddr()){ LS.set("hb_lastaddr_"+(user?.email||""),addr); setStep(2); } };

  const handlePay = async () => {
    setProcessing(true);
    await new Promise(r=>setTimeout(r,1800));
    setProcessing(false);
    const deliveryAddr = `${addr.line1}${addr.line2?", "+addr.line2:""}, ${addr.city}, ${addr.state} – ${addr.pincode}`;
    onSuccess({ method: selMethod, total, deliveryAddress: deliveryAddr, recipientName: addr.fullName, recipientPhone: addr.phone });
  };

  return (
    <div className="checkout-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="checkout-modal">
        <div className="co-head">
          <div>
            <div className="co-title">{step===1?"Delivery Address":"Review & Pay"}</div>
            <div style={{fontSize:11,color:"rgba(237,232,224,.6)",marginTop:3}}>Step {step} of 2</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div className="co-steps">
              <div className={`co-step-dot${step===1?" active":step>1?" done":""}`}/>
              <div className={`co-step-dot${step===2?" active":""}`}/>
            </div>
            <button className="dclose" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="co-body">
          {step===1 ? (
            <>
              <div className="co-section-title">Address Type</div>
              <div className="addr-type-pills" style={{marginBottom:18}}>
                {["Home","Work","Other"].map(t=>(
                  <button key={t} className={`addr-type-pill${addr.type===t?" sel":""}`} onClick={()=>setField("type",t)}>
                    {t==="Home"?"🏠":t==="Work"?"🏢":"📍"} {t}
                  </button>
                ))}
              </div>
              <div className="co-section-title">Contact Details</div>
              <div className="addr-grid" style={{marginBottom:18}}>
                <div className="addr-field addr-full">
                  <label className="addr-label">Full Name *</label>
                  <input className={`addr-input${addrErrors.fullName?" err":""}`} placeholder="Priya Sharma" value={addr.fullName} onChange={e=>setField("fullName",e.target.value)}/>
                  {addrErrors.fullName&&<div className="addr-err">{addrErrors.fullName}</div>}
                </div>
                <div className="addr-field addr-full">
                  <label className="addr-label">Mobile Number *</label>
                  <input className={`addr-input${addrErrors.phone?" err":""}`} placeholder="98765 43210" value={addr.phone} onChange={e=>setField("phone",e.target.value)} maxLength={10}/>
                  {addrErrors.phone&&<div className="addr-err">{addrErrors.phone}</div>}
                </div>
              </div>
              <div className="co-section-title">Delivery Address</div>
              <div className="addr-grid">
                <div className="addr-field addr-full">
                  <label className="addr-label">House / Flat / Street *</label>
                  <input className={`addr-input${addrErrors.line1?" err":""}`} placeholder="12, Civil Lines" value={addr.line1} onChange={e=>setField("line1",e.target.value)}/>
                  {addrErrors.line1&&<div className="addr-err">{addrErrors.line1}</div>}
                </div>
                <div className="addr-field addr-full">
                  <label className="addr-label">Landmark / Area (optional)</label>
                  <input className="addr-input" placeholder="Near High Court" value={addr.line2} onChange={e=>setField("line2",e.target.value)}/>
                </div>
                <div className="addr-field">
                  <label className="addr-label">City *</label>
                  <input className={`addr-input${addrErrors.city?" err":""}`} placeholder="Prayagraj" value={addr.city} onChange={e=>setField("city",e.target.value)}/>
                  {addrErrors.city&&<div className="addr-err">{addrErrors.city}</div>}
                </div>
                <div className="addr-field">
                  <label className="addr-label">PIN Code *</label>
                  <input className={`addr-input${addrErrors.pincode?" err":""}`} placeholder="211001" value={addr.pincode} onChange={e=>setField("pincode",e.target.value.replace(/\D/g,""))} maxLength={6}/>
                  {addrErrors.pincode&&<div className="addr-err">{addrErrors.pincode}</div>}
                </div>
                <div className="addr-field addr-full">
                  <label className="addr-label">State *</label>
                  <select className={`addr-select${addrErrors.state?" err":""}`} value={addr.state} onChange={e=>setField("state",e.target.value)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  {addrErrors.state&&<div className="addr-err">{addrErrors.state}</div>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:18,padding:"10px 13px",background:"var(--cream)",borderRadius:9,border:"1px solid var(--ivory)"}}>
                <span style={{fontSize:16}}>🚚</span>
                <span style={{fontSize:12,color:"var(--text-mid)"}}>
                  {shipping===0?<><strong style={{color:"var(--sage)"}}>Free delivery</strong> on your order (above ₹499)</>
                  :<>₹49 delivery charge · <strong style={{color:"var(--sage)"}}>Free above ₹499</strong> — add ₹{499-subtotal} more!</>}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="co-section-title">Delivering To</div>
              <div className="addr-summary-card">
                <div className="addr-summary-icon">{addr.type==="Home"?"🏠":addr.type==="Work"?"🏢":"📍"}</div>
                <div style={{flex:1}}>
                  <div className="addr-summary-name">{addr.fullName} · {addr.phone}</div>
                  <div className="addr-summary-text">{addr.line1}{addr.line2?", "+addr.line2:""}, {addr.city}, {addr.state} – {addr.pincode}</div>
                  <div style={{fontSize:11,color:"var(--text-light)",marginTop:3}}>{addr.type} address</div>
                </div>
                <button className="addr-edit-btn" onClick={()=>setStep(1)}>Edit</button>
              </div>
              <div className="co-section-title">Order Summary</div>
              <div className="co-items">
                {cart.map((item,i)=>{
                  const[bg1,bg2]=BGS[i%BGS.length];const ol=olCache[item.title];const letter=(item.title||"B")[0].toUpperCase();
                  return(
                    <div className="co-item" key={i}>
                      <div className="co-item-thumb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}>
                        {ol?.coverImg?<img src={ol.coverImg} alt={item.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>:<div className="co-item-fb">{letter}</div>}
                      </div>
                      <div className="co-item-info">
                        <div className="co-item-title">{item.title}</div>
                        <div className="co-item-qty">Qty: {item.quantity} × ₹{item.price}</div>
                      </div>
                      <div className="co-item-price">₹{item.price*item.quantity}</div>
                    </div>
                  );
                })}
              </div>
              <div className="co-section-title">Price Details</div>
              <div className="co-breakdown">
                <div className="co-breakdown-row"><span>Subtotal ({cart.reduce((s,i)=>s+i.quantity,0)} items)</span><span>₹{subtotal}</span></div>
                <div className="co-breakdown-row"><span>Delivery</span><span>{shipping===0?<span style={{color:"var(--sage)"}}>FREE</span>:`₹${shipping}`}</span></div>
                {shipping===0&&<div className="co-breakdown-row discount"><span>✓ Free delivery applied</span><span>–₹49</span></div>}
              </div>
              <div className="co-total-row">
                <span className="co-total-lbl">Total Payable</span>
                <span className="co-total-amt">₹{total}</span>
              </div>
              <div className="co-section-title" style={{marginTop:18}}>Payment Method</div>
              <div className="pay-method-grid">
                {PAYMENT_METHODS.map(m=>(
                  <button key={m} className={`pm-btn${selMethod===m?" sel":""}`} onClick={()=>setSelMethod(m)}>
                    <span>{PM_ICONS[m]}</span>{m}
                    {selMethod===m&&<span style={{marginLeft:"auto",fontSize:14}}>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="co-foot">
          {step===1 ? (
            <><button className="co-cancel" onClick={onClose}>Cancel</button><button className="co-next" onClick={handleNext}>Continue to Payment →</button></>
          ) : (
            <><button className="co-back" onClick={()=>setStep(1)}>← Back</button>
            <button className="co-pay" onClick={handlePay} disabled={processing}>
              {processing?<span style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}><div className="dp" style={{transform:"scale(.8)"}}><span/><span/><span/></div>Processing…</span>:`Pay ₹${total} via ${selMethod} →`}
            </button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ORDERS PAGE ──────────────────────────────────────────────────────────
const ORDER_STEPS = ["Confirmed","Processing","Shipped","Delivered"];
function getStepIdx(status) { return ORDER_STEPS.map(s=>s.toLowerCase()).indexOf(status); }

function OrdersPage({user, olCache, BGS, onBack, onOrdersChange}) {
  const [orders, setOrders] = useState(() => getUserOrders(user.email));
  const [filter, setFilter] = useState("All");
  const [cancelTarget, setCancelTarget] = useState(null); // order to confirm-cancel

  // Re-derive live statuses on every render (elapsed-time based)
  const liveOrders = useMemo(() =>
    orders.map(o => ({ ...o, status: deriveStatus(o) })),
  [orders]);

  const statuses = ["All","Delivered","Shipped","Processing","Confirmed","Cancelled"];
  const filtered = filter==="All" ? liveOrders : liveOrders.filter(o=>o.status===filter.toLowerCase());

  const stats = useMemo(()=>({
    total: liveOrders.length,
    spent: liveOrders.filter(o=>o.paymentStatus==="paid"&&o.status!=="cancelled").reduce((s,o)=>s+o.total,0),
    books: liveOrders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+(o.items||[]).reduce((ss,i)=>ss+(i.quantity||1),0),0),
    delivered: liveOrders.filter(o=>o.status==="delivered").length,
  }),[liveOrders]);

  const handleCancelConfirm = (orderId) => {
    updateOrderStatus(user.email, orderId, "cancelled");
    const updated = getUserOrders(user.email);
    setOrders(updated);
    setCancelTarget(null);
    if (onOrdersChange) onOrdersChange();
  };

  // Can only cancel if status is confirmed or processing
  const canCancel = (status) => status === "confirmed" || status === "processing";

  const ThumbImg = ({item,idx}) => {
    const[bg1,bg2]=BGS[idx%BGS.length];const[e,setE]=useState(false);const ol=olCache[item.title];const letter=(item.title||"B")[0].toUpperCase();
    if(ol?.coverImg&&!e)return<img src={ol.coverImg} alt={item.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setE(true)}/>;
    return<div className="order-item-fb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}>{letter}</div>;
  };

  return (
    <>
      <div className="orders-page">
        <div className="page-header">
          <button className="page-back" onClick={onBack}>← Back to Store</button>
          <div className="page-title">My Orders</div>
          <div className="page-sub">{user.name} · {user.email}</div>
        </div>

        <div className="orders-stats">
          {[
            {val:stats.total,lbl:"Total Orders",icon:"📦"},
            {val:`₹${stats.spent.toLocaleString()}`,lbl:"Total Spent",icon:"💰"},
            {val:stats.books,lbl:"Books Bought",icon:"📚"},
            {val:stats.delivered,lbl:"Delivered",icon:"✅"},
          ].map((s,i)=>(
            <div className="ostat" key={i}>
              <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
              <div className="ostat-val">{s.val}</div>
              <div className="ostat-lbl">{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* Status legend */}
        <div style={{background:"var(--white)",borderRadius:12,padding:"12px 16px",marginBottom:20,border:"1px solid var(--ivory)",fontSize:12,color:"var(--text-mid)",display:"flex",alignItems:"flex-start",gap:8}}>
          <span style={{fontSize:14,flexShrink:0}}>ℹ️</span>
          <span>Order status updates automatically based on time elapsed: <strong>Confirmed</strong> (0–30 min) → <strong>Processing</strong> (30 min–4 hrs) → <strong>Shipped</strong> (4–48 hrs) → <strong>Delivered</strong> (48+ hrs). COD orders take 1.5× longer.</span>
        </div>

        <div className="order-filters">
          {statuses.map(s=><button key={s} className={`ofilter${filter===s?" active":""}`} onClick={()=>setFilter(s)}>{s}</button>)}
        </div>

        {filtered.length===0 ? (
          <div className="orders-empty">
            <div className="orders-empty-icon">📭</div>
            <div className="orders-empty-title">{filter==="All"?"No orders yet":"No "+filter.toLowerCase()+" orders"}</div>
            <p style={{fontSize:13,color:"var(--text-light)",marginBottom:20}}>{filter==="All"?"Start shopping and your orders will appear here.":"Try a different filter."}</p>
            <button style={{background:"var(--warm-brown)",color:"var(--white)",border:"none",padding:"12px 28px",borderRadius:11,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}} onClick={onBack}>Browse Books</button>
          </div>
        ) : filtered.map((order) => {
          const sm = STATUS_META[order.status] || STATUS_META.confirmed;
          const pm = PAYMENT_META[order.paymentStatus] || PAYMENT_META.pending;
          const stepIdx = getStepIdx(order.status);
          const isCancelled = order.status === "cancelled";
          return (
            <div className={`order-card${isCancelled?" cancelled-stripe":""}`} key={order.id}>
              <div className="order-card-head">
                <div>
                  <div className="order-id">#{order.id}</div>
                  <div className="order-date">{fmtDate(order.placedAt)} at {fmtTime(order.placedAt)}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span className="order-status-badge" style={{color:sm.color,background:sm.bg}}>{sm.icon} {sm.label}</span>
                  <span className="pay-badge" style={{color:pm.color,background:pm.bg}}>💳 {pm.label}</span>
                </div>
              </div>
              <div className="order-card-body">
                {!isCancelled && (
                  <div className="order-progress">
                    {ORDER_STEPS.map((step,si)=>{
                      const done = stepIdx > si;
                      const current = stepIdx === si;
                      return (
                        <React.Fragment key={step}>
                          <div className="prog-step">
                            <div className={`prog-dot${done?" done":current?" current":""}`}>{done?"✓":si+1}</div>
                            <div className={`prog-label${done?" done":current?" current":""}`}>{step}</div>
                          </div>
                          {si < ORDER_STEPS.length-1 && <div className={`prog-line${done?" done":""}`}/>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
                {isCancelled && order.cancelledAt && (
                  <div style={{fontSize:12,color:"var(--terracotta)",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <span>✕</span><span>Cancelled on {fmtDate(order.cancelledAt)} at {fmtTime(order.cancelledAt)}</span>
                  </div>
                )}
                <div className="order-items-preview">
                  {(order.items||[]).slice(0,4).map((item,ii)=>(
                    <div className="order-item-chip" key={ii}>
                      <div className="order-item-thumb"><ThumbImg item={item} idx={ii}/></div>
                      <span className="order-item-name">{item.title}</span>
                      {item.quantity>1&&<span style={{color:"var(--text-light)",fontSize:11}}>×{item.quantity}</span>}
                    </div>
                  ))}
                  {(order.items||[]).length>4&&<div className="order-item-chip" style={{fontStyle:"italic",color:"var(--text-light)"}}>+{order.items.length-4} more</div>}
                </div>
                <div className="order-meta-row">
                  <div className="order-meta-info">
                    <div className="order-meta-item">📱 <strong>{order.paymentMethod}</strong></div>
                    <div className="order-meta-item">📚 <strong>{(order.items||[]).reduce((s,i)=>s+(i.quantity||1),0)} book{(order.items||[]).reduce((s,i)=>s+(i.quantity||1),0)!==1?"s":""}</strong></div>
                    {order.deliveryAddress && <div className="order-meta-item">📍 <strong style={{maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block"}}>{order.deliveryAddress}</strong></div>}
                  </div>
                  <div className="order-total-amt" style={isCancelled?{textDecoration:"line-through",opacity:.55}:{}}>₹{order.total.toLocaleString()}</div>
                </div>
              </div>
              <div className="order-card-foot">
                {order.status==="delivered" && <button className="order-action-btn oab-primary">Reorder</button>}
                {order.status==="shipped" && <button className="order-action-btn oab-primary">Track Package</button>}
                {!isCancelled && <button className="order-action-btn oab-secondary">View Invoice</button>}
                {canCancel(order.status) && (
                  <button className="oab-cancel" onClick={()=>setCancelTarget(order)}>Cancel Order</button>
                )}
                {isCancelled && order.paymentStatus==="paid" && (
                  <span style={{fontSize:11,color:"var(--sage)",display:"flex",alignItems:"center",gap:4}}>
                    <span>💚</span> Refund of ₹{order.total} initiated
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel confirm modal */}
      {cancelTarget && (
        <CancelOrderModal
          order={cancelTarget}
          onConfirm={handleCancelConfirm}
          onDismiss={()=>setCancelTarget(null)}
        />
      )}
    </>
  );
}

// ─── GUEST HELPER ─────────────────────────────────────────────────────────
const GUEST_EMAIL = "demo@shelfwise.com";
const isGuestUser = (user) => user?.email === GUEST_EMAIL;

// ─── MAIN APP ─────────────────────────────────────────────────────────────
export default function App() {
  const[user,setUser]=useState(()=>LS.get("hb_session",null));
  const[page,setPage]=useState("store");
  const[authTab,setAuthTab]=useState("login");
  const[books,setBooks]=useState(null);
  const[cart,setCart]=useState([]);
  const[wishlist,setWishlist]=useState([]);
  const[toast,setToast]=useState(null);
  const[sel,setSel]=useState(null);
  const[olCache,setOlCache]=useState({});
  const[olLoad,setOlLoad]=useState({});
  const[cartOpen,setCartOpen]=useState(false);
  const[wishOpen,setWishOpen]=useState(false);
  const[checkoutOpen,setCheckoutOpen]=useState(false);
  const[guestPromptOpen,setGuestPromptOpen]=useState(false);
  const[successData,setSuccessData]=useState(null);
  const[userMenuOpen,setUserMenuOpen]=useState(false);
  const[view,setView]=useState("grid");
  const[search,setSearch]=useState("");
  const[genre,setGenre]=useState("All");
  const[category,setCategory]=useState("All");
  const[sortBy,setSortBy]=useState("default");
  const[maxPrice,setMaxPrice]=useState(2000);
  const[minRating,setMinRating]=useState(0);
  const[orderCount,setOrderCount]=useState(()=>user?getUserOrders(user?.email).length:0);

  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),2800);};

  const handleAuth = (u) => {
    LS.set("hb_session", u); setUser(u); setPage("store");
    if(guestPromptOpen){ setGuestPromptOpen(false); setCheckoutOpen(true); }
  };
  const handleLogout = () => { LS.del("hb_session"); setUser(null); setCart([]); setWishlist([]); showToast("Signed out."); };

  const handleCheckoutClick = useCallback(() => {
    if (!user || isGuestUser(user)) { setCartOpen(false); setGuestPromptOpen(true); }
    else { setCartOpen(false); setCheckoutOpen(true); }
  }, [user]);

  useEffect(()=>{
    if(!user)return;
    axios.get("http://127.0.0.1:8002/books")
      .then(r=>{ const data=Array.isArray(r.data)?r.data:(r.data.books||Object.values(r.data)); setBooks(data); })
      .catch(()=>{ setBooks([]); showToast("Could not connect to book service on port 8002."); });
  },[user]);

  useEffect(()=>{
    if(!books)return;
    books.forEach(b=>{ if(olCache[b.title]!==undefined)return; fetchOL(b.title,b.author).then(d=>setOlCache(p=>({...p,[b.title]:d}))); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[books]);

  const openBook=useCallback((book,idx)=>{
    setSel({book,idx});
    const key=book.title;
    if(olCache[key]?.preface!==undefined)return;
    setOlLoad(p=>({...p,[key]:true}));
    fetchOL(book.title,book.author).then(d=>{setOlCache(p=>({...p,[key]:d}));setOlLoad(p=>({...p,[key]:false}));});
  },[olCache]);

  const addToCart=useCallback((book)=>{ setCart(p=>{const i=p.findIndex(x=>x.title===book.title);if(i>=0){const n=[...p];n[i]={...n[i],quantity:n[i].quantity+1};return n;}return[...p,{...book,quantity:1}];}); showToast(`"${book.title}" added to cart`); },[]);
  const incQty=useCallback((i)=>setCart(p=>{const n=[...p];n[i]={...n[i],quantity:n[i].quantity+1};return n;}),[]);
  const decQty=useCallback((i)=>setCart(p=>{const n=[...p];if(n[i].quantity>1){n[i]={...n[i],quantity:n[i].quantity-1};return n;}return n.filter((_,j)=>j!==i);}),[]);
  const remCart=useCallback((i)=>setCart(p=>p.filter((_,j)=>j!==i)),[]);

  const handleCheckoutSuccess = useCallback(({method,total,deliveryAddress,recipientName,recipientPhone})=>{
    const order = {
      id: "ORD"+Math.random().toString(36).slice(2,8).toUpperCase(),
      placedAt: Date.now(),
      items: cart.map(i=>({...i})),
      total,
      paymentMethod: method,
      paymentStatus: method==="Cash on Delivery"?"pending":"paid",
      // Status is NOT stored — it's derived live from placedAt. We store placedAt only.
      // But we do need to store a field so deriveStatus() can detect cancellation:
      status: "confirmed", // will be overridden by deriveStatus unless cancelled
      deliveryAddress,
      recipientName,
      recipientPhone,
    };
    if(user) saveOrder(user.email, order);
    setCart([]); setCheckoutOpen(false); setCartOpen(false); setSuccessData(order);
    setOrderCount(c=>c+1);
  },[cart,user]);

  const toggleWish=useCallback((book)=>{ const on=wishlist.some(w=>w.title===book.title); if(on){setWishlist(p=>p.filter(w=>w.title!==book.title));showToast("Removed from wishlist");}else{setWishlist(p=>[...p,book]);showToast(`"${book.title}" wishlisted ♥`);} },[wishlist]);
  const isWished=useCallback((t)=>wishlist.some(w=>w.title===t),[wishlist]);

  const booksWithMeta=useMemo(()=>{ if(!books)return[]; return books.map((b,i)=>({...b,_idx:i,_meta:genMeta(b.title,i)})); },[books]);
  const genreCounts=useMemo(()=>{ const m={}; booksWithMeta.forEach(b=>{m[b._meta.genre]=(m[b._meta.genre]||0)+1;}); return m; },[booksWithMeta]);
  const catMax=useMemo(()=>booksWithMeta.reduce((m,b)=>Math.max(m,b.price),500),[booksWithMeta]);

  const filtered=useMemo(()=>{
    let list=[...booksWithMeta];
    if(search.trim()){const q=search.toLowerCase();list=list.filter(b=>b.title.toLowerCase().includes(q)||(b.author||"").toLowerCase().includes(q));}
    if(genre!=="All")list=list.filter(b=>b._meta.genre===genre);
    if(category==="Bestsellers")list=list.filter(b=>b._meta.isBestseller);
    else if(category==="New Arrivals")list=list.filter(b=>b._meta.isNew);
    else if(category==="Staff Picks")list=list.filter(b=>b._meta.isStaffPick);
    else if(category==="Under ₹300")list=list.filter(b=>b.price<300);
    else if(category==="Award Winners")list=list.filter((_,i)=>i%4===0);
    list=list.filter(b=>b.price<=maxPrice);
    if(minRating>0)list=list.filter(b=>b._meta.rating>=minRating);
    if(sortBy==="price-asc")list.sort((a,b)=>a.price-b.price);
    else if(sortBy==="price-desc")list.sort((a,b)=>b.price-a.price);
    else if(sortBy==="rating")list.sort((a,b)=>b._meta.rating-a._meta.rating);
    else if(sortBy==="reviews")list.sort((a,b)=>b._meta.reviews-a._meta.reviews);
    else if(sortBy==="az")list.sort((a,b)=>a.title.localeCompare(b.title));
    else if(sortBy==="za")list.sort((a,b)=>b.title.localeCompare(a.title));
    return list;
  },[booksWithMeta,search,genre,category,maxPrice,minRating,sortBy]);

  const cartCount=cart.reduce((s,i)=>s+(i.quantity||1),0);
  const cartTotal=cart.reduce((s,i)=>s+i.price*i.quantity,0);
  const activeFilters=[];
  if(genre!=="All")activeFilters.push({label:genre,clear:()=>setGenre("All")});
  if(minRating>0)activeFilters.push({label:`${minRating}★+`,clear:()=>setMinRating(0)});
  if(maxPrice<catMax)activeFilters.push({label:`≤₹${maxPrice}`,clear:()=>setMaxPrice(catMax)});
  if(search)activeFilters.push({label:`"${search}"`,clear:()=>setSearch("")});

  // ── EARLY RETURNS ──────────────────────────────────────────────────────
  if (!user || page==="auth") return (<><style>{css}</style><AuthScreen onAuth={handleAuth} initialTab={authTab}/></>);
  if (page==="orders") return (
    <>
      <style>{css}</style>
      <OrdersPage
        user={user} olCache={olCache} BGS={BGS}
        onBack={()=>setPage("store")}
        onOrdersChange={()=>setOrderCount(getUserOrders(user.email).length)}
      />
    </>
  );

  const isGuest = isGuestUser(user);

  const CovImg=({book,bg1,bg2})=>{
    const[e,setE]=useState(false);const ol=olCache[book.title];const letter=(book.title||"B")[0].toUpperCase();
    if(ol?.coverImg&&!e)return<img className="cov-img" src={ol.coverImg} alt={book.title} style={{height:188}} onError={()=>setE(true)}/>;
    return<div className="cov-fb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`,height:188}}><div className="cov-fb-l">{letter}</div><div className="cov-fb-lines"><div className="cov-fb-line" style={{width:"100%"}}/><div className="cov-fb-line" style={{width:"68%"}}/><div className="cov-fb-line" style={{width:"84%"}}/></div></div>;
  };
  const ThumbImg=({book,idx,h=62})=>{
    const[bg1,bg2]=BGS[idx%BGS.length];const[e,setE]=useState(false);const ol=olCache[book.title];const letter=(book.title||"B")[0].toUpperCase();
    if(ol?.coverImg&&!e)return<img src={ol.coverImg} alt={book.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setE(true)}/>;
    return<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:Math.round(h*.27),color:"rgba(255,255,255,.88)",fontWeight:700,background:`linear-gradient(135deg,${bg1},${bg2})`}}>{letter}</div>;
  };

  const userInitial=(user.name||"U")[0].toUpperCase();

  return (
    <>
      <style>{css}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand" onClick={()=>setPage("store")}>
          <div className="nav-logo">📚</div>
          <div><div className="nav-name">Shelfwise</div><div className="nav-tag">Curated Reads</div></div>
        </div>
        <div className="nav-actions">
          <button className="nav-btn" style={{color:"var(--gold-light)"}} onClick={()=>setWishOpen(true)}>♥{wishlist.length>0&&<span className="nav-badge" style={{background:"rgba(196,146,42,.9)"}}>{wishlist.length}</span>}</button>
          <button className="nav-btn" onClick={()=>setCartOpen(true)}>🛒{cartCount>0&&<span className="nav-badge">{cartCount}</span>}</button>
          <div className="nav-pos">
            <button className="nav-user-btn" onClick={()=>setUserMenuOpen(s=>!s)}>
              <div className="nav-avatar">{userInitial}</div>
              <span className="nav-user-name">{isGuest?"Guest":user.name}</span>
              <span style={{fontSize:10,color:"rgba(237,232,224,.6)",marginLeft:2}}>▾</span>
            </button>
            {userMenuOpen&&<>
              <div className="user-menu-overlay" onClick={()=>setUserMenuOpen(false)}/>
              <div className="user-menu">
                <div className="user-menu-head">
                  <div className="user-menu-name">{isGuest?"Guest User":user.name}</div>
                  <div className="user-menu-email">{isGuest?"Browsing as guest":user.email}</div>
                </div>
                {isGuest ? (
                  <>
                    <button className="user-menu-item" onClick={()=>{setUserMenuOpen(false);setAuthTab("login");setPage("auth");}}>🔑 Sign In</button>
                    <button className="user-menu-item" onClick={()=>{setUserMenuOpen(false);setAuthTab("signup");setPage("auth");}}>✨ Create Account</button>
                  </>
                ) : (
                  <>
                    <button className="user-menu-item" onClick={()=>{setUserMenuOpen(false);setPage("orders");}}>📦 My Orders ({orderCount})</button>
                    <button className="user-menu-item" onClick={()=>{setUserMenuOpen(false);setWishOpen(true);}}>♥ Wishlist ({wishlist.length})</button>
                  </>
                )}
                <div className="user-menu-sep"/>
                <button className="user-menu-item danger" onClick={()=>{setUserMenuOpen(false);handleLogout();}}>⎋ Sign Out</button>
              </div>
            </>}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <div className="hero">
        <div className="hero-pill">{isGuest?"👋 Browsing as Guest":`✦ Welcome back, ${user.name.split(" ")[0]}`}</div>
        <div className="hero-h">Discover your next <em>great read</em></div>
        <div className="hero-sub">{isGuest?"Sign in to track orders and get member deals":"Handpicked books for every curious mind"}</div>
        <div className="hero-stats">
          <div className="hero-stat"><strong>{books?.length||"—"}</strong><span>Titles</span></div>
          {!isGuest&&<div className="hero-stat"><strong>{orderCount}</strong><span>Orders</span></div>}
          <div className="hero-stat"><strong>{wishlist.length}</strong><span>Wishlisted</span></div>
        </div>
      </div>

      <div className="app-body">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search books or authors…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="sb-sec">
            <div className="sb-title">Genre</div>
            <div className="genre-pills">
              <button className={`gp${genre==="All"?" active":""}`} onClick={()=>setGenre("All")}>All<span className="gc">{booksWithMeta.length}</span></button>
              {Object.entries(genreCounts).map(([g,cnt])=><button key={g} className={`gp${genre===g?" active":""}`} onClick={()=>setGenre(g)}>{g}<span className="gc">{cnt}</span></button>)}
            </div>
          </div>
          <div className="sb-sec">
            <div className="sb-title">Sort By</div>
            <select className="sort-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="default">Default</option>
              <option value="rating">Highest Rated</option>
              <option value="reviews">Most Reviewed</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
          <div className="sb-sec">
            <div className="sb-title">Max Price</div>
            <div className="range-labels"><span>₹0</span><span>₹{maxPrice}</span></div>
            <input type="range" className="range-input" min={0} max={catMax||2000} value={maxPrice} onChange={e=>setMaxPrice(+e.target.value)}/>
          </div>
          <div className="sb-sec">
            <div className="sb-title">Min Rating</div>
            {[0,3,3.5,4,4.5].map(r=>(
              <label key={r} className="rf-row">
                <input type="radio" name="minRating" checked={minRating===r} onChange={()=>setMinRating(r)}/>
                {r===0?<span style={{fontSize:12,color:"var(--text-mid)"}}>Any rating</span>:<><Stars rating={r} size={11}/><span style={{fontSize:11,color:"var(--text-mid)",marginLeft:3}}>{r}+</span></>}
              </label>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="cat-tabs">
            {CATEGORIES.map(c=><button key={c} className={`cat-tab${category===c?" active":""}`} onClick={()=>setCategory(c)}>{c}</button>)}
          </div>
          <div className="toolbar">
            <div className="tb-left">
              <span className="rc-txt"><strong>{filtered.length}</strong> book{filtered.length!==1?"s":""}</span>
              {activeFilters.map((f,i)=><span key={i} className="fchip">{f.label}<button onClick={f.clear}>×</button></span>)}
              {activeFilters.length>1&&<button className="clr-btn" onClick={()=>{setGenre("All");setMinRating(0);setMaxPrice(catMax);setSearch("");setSortBy("default");setCategory("All");}}>Clear all</button>}
            </div>
            <div className="view-toggle">
              <button className={`vb${view==="grid"?" active":""}`} onClick={()=>setView("grid")}>⊞</button>
              <button className={`vb${view==="list"?" active":""}`} onClick={()=>setView("list")}>☰</button>
            </div>
          </div>
          <div className="books-area">
            {!books?(
              <div className="bg">{[...Array(8)].map((_,i)=>(
                <div key={i} style={{background:"var(--white)",borderRadius:14,overflow:"hidden",border:"1px solid rgba(61,43,31,.06)"}}>
                  <div className="skel" style={{height:188}}/><div style={{padding:13}}>
                    <div className="skel" style={{height:10,marginBottom:7,width:"45%"}}/><div className="skel" style={{height:14,marginBottom:5}}/><div className="skel" style={{height:11,width:"60%",marginBottom:11}}/><div style={{display:"flex",justifyContent:"space-between",paddingTop:8}}><div className="skel" style={{height:16,width:48}}/><div className="skel" style={{height:32,width:32,borderRadius:"50%"}}/></div>
                  </div>
                </div>
              ))}</div>
            ):filtered.length===0?(
              <div className="empty">
                <div className="empty-icon">{books&&books.length===0?"⚠":"📭"}</div>
                <div className="empty-title">{books&&books.length===0?"Book service not reachable":"No books match your filters"}</div>
                <p style={{fontSize:13,color:"var(--text-light)",marginTop:6}}>{books&&books.length===0?"Make sure book-service is running: cd backend/book-service && python app.py":"Try adjusting your search or filters"}</p>
              </div>
            ):view==="grid"?(
              <div className="bg">
                {filtered.map(book=>{
                  const{_idx:idx,_meta:meta}=book;const[bg1,bg2]=BGS[idx%BGS.length];const wished=isWished(book.title);
                  return(
                    <div className="bcard" key={idx} onClick={()=>openBook(book,idx)}>
                      <button className={`wbtn${wished?" on":""}`} onClick={e=>{e.stopPropagation();toggleWish(book);}}>{wished?"♥":"♡"}</button>
                      <div className="cov-wrap" style={!olCache[book.title]?.coverImg?{background:`linear-gradient(135deg,${bg1},${bg2})`}:{}}>
                        <CovImg book={book} bg1={bg1} bg2={bg2}/>
                        <div className="cov-overlay"><div className="ov-pill">View Details</div></div>
                        <div className="cov-accent"/>
                      </div>
                      <div className="cbody">
                        <div className="cgenre">{meta.genre}</div>
                        <div className="ctitle">{book.title}</div>
                        <div className="cauthor">{book.author}</div>
                        <div className="cstars"><Stars rating={meta.rating} size={11}/><span style={{fontSize:10,color:"var(--text-light)",marginLeft:3}}>{meta.rating} ({meta.reviews})</span></div>
                        <div className="cfooter"><div className="cprice"><sup>₹</sup>{book.price}</div><button className="abtn" onClick={e=>{e.stopPropagation();addToCart(book);}}>+</button></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ):(
              <div className="bl">
                {filtered.map(book=>{
                  const{_idx:idx,_meta:meta}=book;const[bg1,bg2]=BGS[idx%BGS.length];const wished=isWished(book.title);
                  return(
                    <div className="brow" key={idx} onClick={()=>openBook(book,idx)}>
                      <div className="rthumb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}><ThumbImg book={book} idx={idx} h={90}/></div>
                      <div className="rinfo">
                        <div><div className="rgenre">{meta.genre}</div><div className="rtitle">{book.title}</div><div className="rauthor">{book.author}</div>{olCache[book.title]?.preface&&<div className="rpref">{olCache[book.title].preface}</div>}</div>
                        <div className="rbottom">
                          <div style={{display:"flex",alignItems:"center",gap:5}}><Stars rating={meta.rating} size={11}/><span style={{fontSize:11,color:"var(--text-light)"}}>{meta.rating} ({meta.reviews})</span></div>
                          <div className="ractions">
                            <div className="rprice">₹{book.price}</div>
                            <button className={`rwish${wished?" on":""}`} onClick={e=>{e.stopPropagation();toggleWish(book);}}>{wished?"♥":"♡"}</button>
                            <button className="abtn" onClick={e=>{e.stopPropagation();addToCart(book);}}>+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CART DRAWER */}
      {cartOpen&&<>
        <div className="doverlay" onClick={()=>setCartOpen(false)}/>
        <div className="drawer">
          <div className="dhead dhead-cart"><div className="dhead-title">Cart {cartCount>0&&`(${cartCount})`}</div><button className="dclose" onClick={()=>setCartOpen(false)}>✕</button></div>
          <div className="dbody">
            {cart.length===0?<div className="dempty"><div className="dei">🛒</div><p>Your cart is empty</p><small>Start adding books!</small></div>
            :cart.map((item,i)=>{const[bg1,bg2]=BGS[i%BGS.length];return(
              <div className="ci" key={i}>
                <div className="cithumb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}><ThumbImg book={item} idx={i} h={62}/></div>
                <div className="ciinfo"><div className="cititle">{item.title}</div><div className="ciprice">₹{item.price}</div><div className="ciqty"><button className="ciqb" onClick={()=>decQty(i)}>−</button><span className="ciqn">{item.quantity}</span><button className="ciqb" onClick={()=>incQty(i)}>+</button></div></div>
                <button className="cidel" onClick={()=>remCart(i)}>✕</button>
              </div>
            );})}
          </div>
          {cart.length>0&&(
            <div className="dfoot">
              <div className="dfoot-total"><span className="dfoot-lbl">Total</span><span className="dfoot-amt">₹{cartTotal}</span></div>
              {isGuest&&<div style={{background:"var(--gold-pale)",border:"1px solid rgba(196,146,42,.3)",borderRadius:10,padding:"9px 12px",marginBottom:10,fontSize:12,color:"var(--warm-brown)",display:"flex",alignItems:"center",gap:7}}><span>🔐</span><span>Sign in required to checkout</span></div>}
              <button className="pay-btn" onClick={handleCheckoutClick}>{isGuest?"Sign In to Checkout →":"Proceed to Checkout →"}</button>
            </div>
          )}
        </div>
      </>}

      {/* WISHLIST DRAWER */}
      {wishOpen&&<>
        <div className="doverlay" onClick={()=>setWishOpen(false)}/>
        <div className="drawer">
          <div className="dhead dhead-wish"><div className="dhead-title">Wishlist ♥ ({wishlist.length})</div><button className="dclose" onClick={()=>setWishOpen(false)}>✕</button></div>
          <div className="dbody">
            {wishlist.length===0?<div className="dempty"><div className="dei">♡</div><p>Nothing wishlisted yet</p><small>Tap ♡ on any book to save it</small></div>
            :wishlist.map((book,i)=>{const idx=books?.findIndex(b=>b.title===book.title)??i;const[bg1,bg2]=BGS[Math.max(0,idx)%BGS.length];return(
              <div className="wi" key={i}>
                <div className="withumb" style={{background:`linear-gradient(135deg,${bg1},${bg2})`}}><ThumbImg book={book} idx={Math.max(0,idx)} h={54}/></div>
                <div className="wiinfo"><div className="wititle">{book.title}</div><div className="wiauthor">{book.author}</div><button className="wiadd" onClick={()=>{addToCart(book);toggleWish(book);}}>Move to Cart</button></div>
                <button className="widel" onClick={()=>toggleWish(book)}>✕</button>
              </div>
            );})}
          </div>
        </div>
      </>}

      {/* GUEST LOGIN PROMPT */}
      {guestPromptOpen&&<GuestLoginPrompt onSignIn={()=>{setGuestPromptOpen(false);setAuthTab("login");setPage("auth");}} onSignUp={()=>{setGuestPromptOpen(false);setAuthTab("signup");setPage("auth");}} onDismiss={()=>setGuestPromptOpen(false)}/>}

      {/* CHECKOUT MODAL */}
      {checkoutOpen&&!isGuest&&<CheckoutModal cart={cart} olCache={olCache} BGS={BGS} user={user} onClose={()=>setCheckoutOpen(false)} onSuccess={handleCheckoutSuccess}/>}

      {/* SUCCESS MODAL */}
      {successData&&(
        <div className="success-overlay">
          <div className="success-modal">
            <div className="success-icon">✓</div>
            <div className="success-title">Order Placed!</div>
            <div className="success-sub">Your books are on their way, {user.name.split(" ")[0]}!</div>
            <div className="order-id-tag">Order #{successData.id}</div>
            <div style={{fontSize:12,color:"var(--text-light)",marginBottom:6}}>Paid ₹{successData.total} via {successData.paymentMethod}</div>
            {successData.deliveryAddress&&<div style={{fontSize:12,color:"var(--text-light)",marginBottom:24,display:"flex",alignItems:"center",gap:5,justifyContent:"center"}}>📍 {successData.deliveryAddress}</div>}
            <div className="success-btns">
              <button className="success-secondary" onClick={()=>setSuccessData(null)}>Continue Shopping</button>
              <button className="success-primary" onClick={()=>{setSuccessData(null);setPage("orders");}}>View My Orders</button>
            </div>
          </div>
        </div>
      )}

      {/* BOOK MODAL */}
      {sel&&<BookModal book={sel.book} idx={sel.idx} ol={olCache[sel.book.title]} olLoading={!!olLoad[sel.book.title]} onClose={()=>setSel(null)} onAdd={addToCart} onWish={toggleWish} wished={isWished(sel.book.title)}/>}

      {toast&&<div className="toast">✦ {toast}</div>}
    </>
  );
}