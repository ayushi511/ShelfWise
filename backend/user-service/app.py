import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import bcrypt
from database import get_conn, init_db
from auth import create_access_token, get_current_user, CurrentUser

app = FastAPI(title="User Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    init_db()

class SignUpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None

class AddressCreate(BaseModel):
    label: str = "Home"
    full_name: str
    phone: str
    line1: str
    line2: str | None = None
    city: str
    state: str
    pincode: str
    is_default: bool = False

@app.get("/")
def health():
    return {"service": "user-service", "status": "running"}

@app.post("/auth/signup", status_code=201)
def signup(body: SignUpRequest):
    conn = get_conn()
    existing = conn.execute("SELECT id FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered.")
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    c = conn.cursor()
    c.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
              (body.name.strip(), body.email.lower(), hashed))
    conn.commit()
    user_id = c.lastrowid
    conn.close()
    token = create_access_token(user_id, body.email.lower(), body.name.strip())
    return {"message": "Account created", "access_token": token, "token_type": "bearer",
            "user": {"id": user_id, "name": body.name.strip(), "email": body.email.lower()}}

@app.post("/auth/signin")
def signin(body: SignInRequest):
    conn = get_conn()
    user = conn.execute("SELECT * FROM users WHERE email=?", (body.email.lower(),)).fetchone()
    conn.close()
    if not user or not bcrypt.checkpw(body.password.encode(), user["password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token(user["id"], user["email"], user["name"])
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": user["id"], "name": user["name"], "email": user["email"]}}

@app.get("/profile")
def get_profile(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    row = conn.execute("SELECT id,name,email,phone,created_at FROM users WHERE id=?", (current_user.id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return dict(row)

@app.patch("/profile")
def update_profile(body: ProfileUpdate, current_user: CurrentUser = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    set_clause = ", ".join(f"{k}=?" for k in updates)
    values = list(updates.values()) + [current_user.id]
    conn = get_conn()
    conn.execute(f"UPDATE users SET {set_clause} WHERE id=?", values)
    conn.commit()
    row = conn.execute("SELECT id,name,email,phone FROM users WHERE id=?", (current_user.id,)).fetchone()
    conn.close()
    return {"message": "Profile updated", "profile": dict(row)}

@app.get("/addresses")
def list_addresses(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC", (current_user.id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/addresses", status_code=201)
def add_address(body: AddressCreate, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    if body.is_default:
        conn.execute("UPDATE addresses SET is_default=0 WHERE user_id=?", (current_user.id,))
    c = conn.cursor()
    c.execute("INSERT INTO addresses (user_id,label,full_name,phone,line1,line2,city,state,pincode,is_default) VALUES (?,?,?,?,?,?,?,?,?,?)",
              (current_user.id, body.label, body.full_name, body.phone, body.line1, body.line2, body.city, body.state, body.pincode, int(body.is_default)))
    conn.commit()
    row = conn.execute("SELECT * FROM addresses WHERE id=?", (c.lastrowid,)).fetchone()
    conn.close()
    return {"message": "Address saved", "address": dict(row)}

@app.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    conn.execute("DELETE FROM addresses WHERE id=? AND user_id=?", (address_id, current_user.id))
    conn.commit()
    conn.close()
