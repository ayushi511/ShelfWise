import sys, os, json, random, string
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_conn, init_db
from auth import get_current_user, CurrentUser

app = FastAPI(title="📦 Order Service", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    init_db()

class OrderItem(BaseModel):
    book_id: int
    quantity: int

class PlaceOrderRequest(BaseModel):
    items: list[OrderItem]
    payment_method: str
    delivery_address: dict
    subtotal: int
    shipping_charge: int = 0
    total: int

class CancelRequest(BaseModel):
    reason: str | None = None

def _format_order(order_row, item_rows):
    o = dict(order_row)
    o["delivery_address"] = json.loads(o["delivery_address"])
    o["items"] = [dict(r) for r in item_rows]
    return o

@app.get("/", tags=["Health"])
def health():
    return {"service": "order-service", "status": "running ✅"}

@app.post("/orders", status_code=201, tags=["Orders"])
def place_order(body: PlaceOrderRequest, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    book_ids = [i.book_id for i in body.items]
    placeholders = ",".join("?" * len(book_ids))
    books = conn.execute(f"SELECT * FROM books WHERE id IN ({placeholders})", book_ids).fetchall()
    books_map = {b["id"]: dict(b) for b in books}

    for item in body.items:
        book = books_map.get(item.book_id)
        if not book:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Book id={item.book_id} not found.")
        if book["stock"] < item.quantity:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Only {book['stock']} copies of '{book['title']}' available.")

    order_num = "ORD" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    c = conn.cursor()
    c.execute("INSERT INTO orders (order_number,user_id,status,payment_status,payment_method,subtotal,shipping_charge,total,delivery_address) VALUES (?,?,?,?,?,?,?,?,?)",
              (order_num, current_user.id, "confirmed", "pending", body.payment_method,
               body.subtotal, body.shipping_charge, body.total, json.dumps(body.delivery_address)))
    order_id = c.lastrowid

    for item in body.items:
        book = books_map[item.book_id]
        c.execute("INSERT INTO order_items (order_id,book_id,title,author,price,image,quantity) VALUES (?,?,?,?,?,?,?)",
                  (order_id, item.book_id, book["title"], book["author"], book["price"], book.get("image",""), item.quantity))
        conn.execute("UPDATE books SET stock = stock - ? WHERE id=?", (item.quantity, item.book_id))

    conn.execute("DELETE FROM cart_items WHERE user_id=?", (current_user.id,))
    conn.commit()

    order_row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    item_rows = conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()
    conn.close()
    return {"message": "Order placed ✅", "order": _format_order(order_row, item_rows)}

@app.get("/orders", tags=["Orders"])
def get_orders(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    orders = conn.execute("SELECT * FROM orders WHERE user_id=? ORDER BY placed_at DESC", (current_user.id,)).fetchall()
    result = []
    for order in orders:
        items = conn.execute("SELECT * FROM order_items WHERE order_id=?", (order["id"],)).fetchall()
        result.append(_format_order(order, items))
    conn.close()
    return result

@app.get("/orders/stats", tags=["Orders"])
def order_stats(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    orders = conn.execute("SELECT status,payment_status,total FROM orders WHERE user_id=?", (current_user.id,)).fetchall()
    total_orders = len(orders)
    total_spent = sum(o["total"] for o in orders if o["payment_status"]=="paid" and o["status"]!="cancelled")
    delivered = sum(1 for o in orders if o["status"]=="delivered")
    rows = conn.execute("SELECT SUM(oi.quantity) as total_books FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND o.status!='cancelled'", (current_user.id,)).fetchone()
    conn.close()
    return {"total_orders": total_orders, "total_spent": total_spent, "total_books": rows["total_books"] or 0, "delivered": delivered}

@app.get("/orders/{order_id}", tags=["Orders"])
def get_order(order_id: int, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, current_user.id)).fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found.")
    items = conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()
    conn.close()
    return _format_order(order, items)

@app.patch("/orders/{order_id}/cancel", tags=["Orders"])
def cancel_order(order_id: int, body: CancelRequest, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (order_id, current_user.id)).fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["status"] not in ("confirmed", "processing"):
        conn.close()
        raise HTTPException(status_code=400, detail=f"Cannot cancel an order with status '{order['status']}'.")
    items = conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()
    for item in items:
        conn.execute("UPDATE books SET stock = stock + ? WHERE id=?", (item["quantity"], item["book_id"]))
    conn.execute("UPDATE orders SET status='cancelled', cancelled_at=datetime('now') WHERE id=?", (order_id,))
    conn.commit()
    conn.close()
    return {"message": "Order cancelled ✅", "order_id": order_id, "refund_needed": order["payment_status"]=="paid", "total": order["total"]}