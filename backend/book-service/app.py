import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_conn, init_db

app = FastAPI(title="📚 Book Service", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    init_db()

class BookCreate(BaseModel):
    title: str
    author: str
    price: int
    genre: str | None = None
    description: str | None = None
    image: str | None = None
    stock: int = 50

@app.get("/", tags=["Health"])
def health():
    return {"service": "book-service", "status": "running ✅"}

@app.get("/books", tags=["Books"])
def get_books(
    genre: str | None = Query(None),
    search: str | None = Query(None),
    min_price: int | None = Query(None),
    max_price: int | None = Query(None),
    sort: str = Query("id"),
    order: str = Query("asc"),
):
    allowed = {"price", "rating", "title", "id"}
    sort_col = sort if sort in allowed else "id"
    order_dir = "DESC" if order.lower() == "desc" else "ASC"
    query = "SELECT * FROM books WHERE is_active = 1"
    params = []
    if genre:
        query += " AND genre = ?"
        params.append(genre)
    if search:
        query += " AND (title LIKE ? OR author LIKE ?)"
        params += [f"%{search}%", f"%{search}%"]
    if min_price is not None:
        query += " AND price >= ?"
        params.append(min_price)
    if max_price is not None:
        query += " AND price <= ?"
        params.append(max_price)
    query += f" ORDER BY {sort_col} {order_dir}"
    conn = get_conn()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/books/genres", tags=["Books"])
def get_genres():
    conn = get_conn()
    rows = conn.execute("SELECT DISTINCT genre FROM books WHERE is_active=1 AND genre IS NOT NULL ORDER BY genre").fetchall()
    conn.close()
    return [r["genre"] for r in rows]

@app.get("/books/{book_id}", tags=["Books"])
def get_book(book_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM books WHERE id=? AND is_active=1", (book_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Book not found.")
    return dict(row)

@app.post("/books", status_code=201, tags=["Books"])
def add_book(book: BookCreate):
    conn = get_conn()
    c = conn.cursor()
    c.execute("INSERT INTO books (title,author,price,genre,description,image,stock) VALUES (?,?,?,?,?,?,?)",
              (book.title, book.author, book.price, book.genre, book.description, book.image, book.stock))
    conn.commit()
    row = conn.execute("SELECT * FROM books WHERE id=?", (c.lastrowid,)).fetchone()
    conn.close()
    return {"message": "Book added ✅", "book": dict(row)}