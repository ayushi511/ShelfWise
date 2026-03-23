import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_conn, init_db
from auth import get_current_user, CurrentUser

app = FastAPI(
    title="🛒 Cart Service",
    description="Persistent cart stored in SQLite. Survives page refresh.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

class CartAdd(BaseModel):
    book_id:  int
    quantity: int = 1

class CartUpdate(BaseModel):
    quantity: int

class SyncItem(BaseModel):
    book_id:  int
    quantity: int

class CartSync(BaseModel):
    items: list[SyncItem]

def _get_full_cart(user_id: int, conn) -> list[dict]:
    rows = conn.execute(
        """SELECT ci.id as cart_item_id, ci.book_id, ci.quantity,
                  b.title, b.author, b.price, b.image, b.stock, b.genre
           FROM cart_items ci
           JOIN books b ON b.id = ci.book_id
           WHERE ci.user_id = ?""",
        (user_id,)
    ).fetchall()
    return [dict(r) for r in rows]

@app.get("/", tags=["Health"])
def health():
    return {"service": "cart-service", "status": "running ✅", "port": 8004}

@app.get("/cart", tags=["Cart"])
def get_cart(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    items = _get_full_cart(current_user.id, conn)
    conn.close()
    total = sum(i["price"] * i["quantity"] for i in items)
    return {"items": items, "total": total, "count": sum(i["quantity"] for i in items)}

@app.post("/cart", status_code=201, tags=["Cart"])
def add_to_cart(body: CartAdd, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    book = conn.execute("SELECT id, title, stock FROM books WHERE id=?", (body.book_id,)).fetchone()
    if not book:
        conn.close()
        raise HTTPException(status_code=404, detail="Book not found.")
    if book["stock"] < body.quantity:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Only {book['stock']} copies in stock.")

    existing = conn.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id=? AND book_id=?",
        (current_user.id, body.book_id)
    ).fetchone()

    if existing:
        new_qty = existing["quantity"] + body.quantity
        conn.execute("UPDATE cart_items SET quantity=? WHERE id=?", (new_qty, existing["id"]))
        msg = f"Quantity updated to {new_qty} 🔄"
    else:
        conn.execute(
            "INSERT INTO cart_items (user_id, book_id, quantity) VALUES (?,?,?)",
            (current_user.id, body.book_id, body.quantity)
        )
        msg = "Item added to cart 🛒"

    conn.commit()
    items = _get_full_cart(current_user.id, conn)
    conn.close()
    return {"message": msg, "cart": items}

@app.put("/cart/{book_id}", tags=["Cart"])
def update_quantity(book_id: int, body: CartUpdate, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    if body.quantity <= 0:
        conn.execute("DELETE FROM cart_items WHERE user_id=? AND book_id=?", (current_user.id, book_id))
        conn.commit()
        items = _get_full_cart(current_user.id, conn)
        conn.close()
        return {"message": "Item removed ❌", "cart": items}

    conn.execute(
        "UPDATE cart_items SET quantity=? WHERE user_id=? AND book_id=?",
        (body.quantity, current_user.id, book_id)
    )
    conn.commit()
    items = _get_full_cart(current_user.id, conn)
    conn.close()
    return {"message": f"Quantity set to {body.quantity} ✅", "cart": items}

@app.delete("/cart/{book_id}", status_code=204, tags=["Cart"])
def remove_item(book_id: int, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    conn.execute("DELETE FROM cart_items WHERE user_id=? AND book_id=?", (current_user.id, book_id))
    conn.commit()
    conn.close()

@app.delete("/cart", status_code=204, tags=["Cart"])
def clear_cart(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    conn.execute("DELETE FROM cart_items WHERE user_id=?", (current_user.id,))
    conn.commit()
    conn.close()

@app.post("/cart/sync", tags=["Cart"])
def sync_cart(body: CartSync, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    for item in body.items:
        existing = conn.execute(
            "SELECT id, quantity FROM cart_items WHERE user_id=? AND book_id=?",
            (current_user.id, item.book_id)
        ).fetchone()
        if existing:
            merged = max(existing["quantity"], item.quantity)
            conn.execute("UPDATE cart_items SET quantity=? WHERE id=?", (merged, existing["id"]))
        else:
            conn.execute(
                "INSERT OR IGNORE INTO cart_items (user_id, book_id, quantity) VALUES (?,?,?)",
                (current_user.id, item.book_id, item.quantity)
            )
    conn.commit()
    items = _get_full_cart(current_user.id, conn)
    conn.close()
    return {"message": "Cart synced ✅", "cart": items}