import sys, os, uuid, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_conn, init_db
from auth import get_current_user, CurrentUser

app = FastAPI(title="💳 Payment Service (Mock)", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    init_db()

class PaymentRequest(BaseModel):
    order_id: int
    amount: int
    payment_method: str

class RefundRequest(BaseModel):
    order_id: int
    transaction_id: str
    amount: int

METHOD_LABELS = {"upi":"UPI","credit_card":"Credit Card","debit_card":"Debit Card","net_banking":"Net Banking","cod":"Cash on Delivery"}

def _simulate_payment(method: str, amount: int) -> dict:
    txn_id = "TXN-" + uuid.uuid4().hex[:12].upper()
    if method == "cod":
        return {"transaction_id": txn_id, "status": "SUCCESS", "payment_status": "pending", "note": "Cash will be collected on delivery."}
    if random.random() < 0.05:
        return {"transaction_id": txn_id, "status": "FAILED", "payment_status": "failed", "note": "Payment declined by bank. Please try again."}
    return {"transaction_id": txn_id, "status": "SUCCESS", "payment_status": "paid", "note": f"Payment of ₹{amount} received via {METHOD_LABELS.get(method, method)}."}

@app.get("/", tags=["Health"])
def health():
    return {"service": "payment-service", "status": "running ✅", "mode": "mock"}

@app.post("/pay", tags=["Payments"])
def make_payment(body: PaymentRequest, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (body.order_id, current_user.id)).fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["status"] == "cancelled":
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot pay for a cancelled order.")
    if order["payment_status"] == "paid":
        conn.close()
        raise HTTPException(status_code=400, detail="Order already paid.")

    result = _simulate_payment(body.payment_method, body.amount)
    conn.execute("INSERT INTO payments (order_id,user_id,transaction_id,amount,method,status) VALUES (?,?,?,?,?,?)",
                 (body.order_id, current_user.id, result["transaction_id"], body.amount, body.payment_method, result["status"]))
    conn.execute("UPDATE orders SET payment_status=?, mock_transaction_id=? WHERE id=?",
                 (result["payment_status"], result["transaction_id"], body.order_id))
    conn.commit()
    conn.close()

    if result["status"] == "FAILED":
        raise HTTPException(status_code=402, detail={"status": result["status"], "transaction_id": result["transaction_id"], "note": result["note"]})

    return {"status": result["status"], "transaction_id": result["transaction_id"], "amount": body.amount,
            "method": METHOD_LABELS.get(body.payment_method, body.payment_method), "payment_status": result["payment_status"], "note": result["note"]}

@app.post("/refund", tags=["Payments"])
def refund_payment(body: RefundRequest, current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    order = conn.execute("SELECT * FROM orders WHERE id=? AND user_id=?", (body.order_id, current_user.id)).fetchone()
    if not order:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found.")
    if order["status"] != "cancelled":
        conn.close()
        raise HTTPException(status_code=400, detail="Refunds are only for cancelled orders.")
    if order["payment_status"] != "paid":
        conn.close()
        raise HTTPException(status_code=400, detail="Order was not paid — no refund needed.")
    refund_txn = "REF-" + uuid.uuid4().hex[:10].upper()
    conn.execute("INSERT INTO payments (order_id,user_id,transaction_id,amount,method,status) VALUES (?,?,?,?,?,?)",
                 (body.order_id, current_user.id, refund_txn, body.amount, "refund", "REFUNDED"))
    conn.execute("UPDATE orders SET payment_status='refunded' WHERE id=?", (body.order_id,))
    conn.commit()
    conn.close()
    return {"status": "REFUNDED ✅", "refund_id": refund_txn, "amount": body.amount, "note": f"Mock refund of ₹{body.amount} will reflect in 5-7 business days."}

@app.get("/payments/history", tags=["Payments"])
def payment_history(current_user: CurrentUser = Depends(get_current_user)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC", (current_user.id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]