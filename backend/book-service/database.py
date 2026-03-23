"""
database.py  —  shared by all services
Creates / connects to bookstore.db (SQLite) in the project root.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "bookstore.db")

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row          # rows behave like dicts
    conn.execute("PRAGMA journal_mode=WAL") # safe for concurrent reads
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    """Create all tables if they don't exist yet. Called once on startup."""
    conn = get_conn()
    c = conn.cursor()

    c.executescript("""
    -- ── USERS ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        email       TEXT    NOT NULL UNIQUE,
        password    TEXT    NOT NULL,   -- bcrypt hash
        phone       TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── ADDRESSES ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS addresses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label       TEXT    NOT NULL DEFAULT 'Home',
        full_name   TEXT    NOT NULL,
        phone       TEXT    NOT NULL,
        line1       TEXT    NOT NULL,
        line2       TEXT,
        city        TEXT    NOT NULL,
        state       TEXT    NOT NULL,
        pincode     TEXT    NOT NULL,
        is_default  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── BOOKS ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS books (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        author      TEXT    NOT NULL,
        price       INTEGER NOT NULL,
        genre       TEXT,
        description TEXT,
        image       TEXT,
        rating      REAL    DEFAULT 4.0,
        reviews     INTEGER DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 50,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── CART ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cart_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        quantity    INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, book_id)
    );

    -- ── ORDERS ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS orders (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number        TEXT    NOT NULL UNIQUE,
        user_id             INTEGER NOT NULL REFERENCES users(id),
        status              TEXT    NOT NULL DEFAULT 'confirmed',
        payment_status      TEXT    NOT NULL DEFAULT 'pending',
        payment_method      TEXT    NOT NULL,
        mock_transaction_id TEXT,
        subtotal            INTEGER NOT NULL,
        shipping_charge     INTEGER NOT NULL DEFAULT 0,
        total               INTEGER NOT NULL,
        delivery_address    TEXT    NOT NULL,   -- JSON string
        cancelled_at        TEXT,
        placed_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── ORDER ITEMS ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS order_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        book_id     INTEGER REFERENCES books(id) ON DELETE SET NULL,
        title       TEXT    NOT NULL,
        author      TEXT    NOT NULL,
        price       INTEGER NOT NULL,
        image       TEXT,
        quantity    INTEGER NOT NULL DEFAULT 1
    );

    -- ── PAYMENTS (mock log) ────────────────────────────────
    CREATE TABLE IF NOT EXISTS payments (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id        INTEGER NOT NULL REFERENCES orders(id),
        user_id         INTEGER NOT NULL,
        transaction_id  TEXT    NOT NULL UNIQUE,
        amount          INTEGER NOT NULL,
        method          TEXT    NOT NULL,
        status          TEXT    NOT NULL DEFAULT 'SUCCESS',
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    """)

    # ── Seed books if table is empty ───────────────────────
    count = c.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    if count == 0:
        _seed_books(c)

    conn.commit()
    conn.close()


def _seed_books(c):
    books = [
        # Self Help
        ("Atomic Habits","James Clear",500,"Self Help","Build good habits and break bad ones.","https://covers.openlibrary.org/b/title/Atomic%20Habits-L.jpg",4.8,1200),
        ("Deep Work","Cal Newport",400,"Self Help","Focus without distraction.","https://covers.openlibrary.org/b/title/Deep%20Work-L.jpg",4.7,950),
        ("Ikigai","Hector Garcia",350,"Self Help","Secret to long life.","https://covers.openlibrary.org/b/title/Ikigai-L.jpg",4.6,800),
        ("Rich Dad Poor Dad","Robert Kiyosaki",380,"Self Help","Money lessons.","https://covers.openlibrary.org/b/title/Rich%20Dad%20Poor%20Dad-L.jpg",4.6,2000),
        ("Think and Grow Rich","Napoleon Hill",350,"Self Help","Success mindset.","https://covers.openlibrary.org/b/title/Think%20and%20Grow%20Rich-L.jpg",4.5,1400),
        ("The Power of Now","Eckhart Tolle",450,"Self Help","Live in present.","https://covers.openlibrary.org/b/title/The%20Power%20of%20Now-L.jpg",4.6,870),
        ("Start With Why","Simon Sinek",390,"Self Help","Find purpose.","https://covers.openlibrary.org/b/title/Start%20With%20Why-L.jpg",4.6,750),
        ("The Subtle Art of Not Giving a F*ck","Mark Manson",420,"Self Help","Live boldly.","https://covers.openlibrary.org/b/title/The%20Subtle%20Art-L.jpg",4.5,1700),
        ("You Can Win","Shiv Khera",300,"Self Help","Motivation guide.","https://covers.openlibrary.org/b/title/You%20Can%20Win-L.jpg",4.4,600),
        ("7 Habits of Highly Effective People","Stephen Covey",520,"Self Help","Powerful habits.","https://covers.openlibrary.org/b/title/7%20Habits-L.jpg",4.7,1100),
        # Fiction
        ("Harry Potter and the Sorcerer's Stone","J.K. Rowling",500,"Fiction","Wizard begins journey.","https://covers.openlibrary.org/b/title/Harry%20Potter-L.jpg",4.9,5000),
        ("1984","George Orwell",350,"Fiction","Dystopian control.","https://covers.openlibrary.org/b/title/1984-L.jpg",4.8,2600),
        ("The Great Gatsby","F. Scott Fitzgerald",320,"Fiction","Wealth and tragedy.","https://covers.openlibrary.org/b/title/The%20Great%20Gatsby-L.jpg",4.5,1400),
        ("To Kill a Mockingbird","Harper Lee",400,"Fiction","Justice story.","https://covers.openlibrary.org/b/title/To%20Kill%20a%20Mockingbird-L.jpg",4.9,3000),
        ("The Alchemist","Paulo Coelho",300,"Fiction","Find your destiny.","https://covers.openlibrary.org/b/title/The%20Alchemist-L.jpg",4.7,2100),
        ("The Hobbit","J.R.R. Tolkien",450,"Fiction","Adventure quest.","https://covers.openlibrary.org/b/title/The%20Hobbit-L.jpg",4.8,1800),
        ("Pride and Prejudice","Jane Austen",280,"Fiction","Love and class.","https://covers.openlibrary.org/b/title/Pride%20and%20Prejudice-L.jpg",4.6,1600),
        ("Moby Dick","Herman Melville",360,"Fiction","Whale obsession.","https://covers.openlibrary.org/b/title/Moby%20Dick-L.jpg",4.3,900),
        ("The Catcher in the Rye","J.D. Salinger",340,"Fiction","Teen rebellion.","https://covers.openlibrary.org/b/title/Catcher%20in%20the%20Rye-L.jpg",4.4,1200),
        ("The Book Thief","Markus Zusak",380,"Fiction","WW2 story.","https://covers.openlibrary.org/b/title/The%20Book%20Thief-L.jpg",4.8,2000),
        # Business
        ("Zero to One","Peter Thiel",420,"Business","Startup insights.","https://covers.openlibrary.org/b/title/Zero%20to%20One-L.jpg",4.6,1400),
        ("Lean Startup","Eric Ries",450,"Business","Build startups smart.","https://covers.openlibrary.org/b/title/Lean%20Startup-L.jpg",4.7,1300),
        ("Rework","Jason Fried",380,"Business","Modern work ideas.","https://covers.openlibrary.org/b/title/Rework-L.jpg",4.5,900),
        ("Good to Great","Jim Collins",500,"Business","Company growth.","https://covers.openlibrary.org/b/title/Good%20to%20Great-L.jpg",4.8,2000),
        ("The Hard Thing About Hard Things","Ben Horowitz",480,"Business","Startup struggles.","https://covers.openlibrary.org/b/title/The%20Hard%20Thing-L.jpg",4.7,1500),
        ("Blue Ocean Strategy","W. Chan Kim",460,"Business","New markets.","https://covers.openlibrary.org/b/title/Blue%20Ocean%20Strategy-L.jpg",4.6,1100),
        ("Hooked","Nir Eyal",390,"Business","Product habits.","https://covers.openlibrary.org/b/title/Hooked-L.jpg",4.5,1000),
        ("Measure What Matters","John Doerr",410,"Business","OKR framework.","https://covers.openlibrary.org/b/title/Measure%20What%20Matters-L.jpg",4.6,800),
        ("Crushing It","Gary Vee",370,"Business","Personal brand.","https://covers.openlibrary.org/b/title/Crushing%20It-L.jpg",4.4,700),
        ("The 100 Startup","Chris Guillebeau",350,"Business","Start small.","https://covers.openlibrary.org/b/title/The%20100%20Startup-L.jpg",4.5,950),
        # Science
        ("A Brief History of Time","Stephen Hawking",500,"Science","Universe explained.","https://covers.openlibrary.org/b/title/A%20Brief%20History%20of%20Time-L.jpg",4.8,3000),
        ("Cosmos","Carl Sagan",450,"Science","Space exploration.","https://covers.openlibrary.org/b/title/Cosmos-L.jpg",4.9,2500),
        ("The Selfish Gene","Richard Dawkins",420,"Science","Evolution theory.","https://covers.openlibrary.org/b/title/The%20Selfish%20Gene-L.jpg",4.7,1800),
        ("Sapiens","Yuval Noah Harari",520,"Science","Human history.","https://covers.openlibrary.org/b/title/Sapiens-L.jpg",4.9,4000),
        ("Homo Deus","Yuval Noah Harari",510,"Science","Future humans.","https://covers.openlibrary.org/b/title/Homo%20Deus-L.jpg",4.7,2000),
        ("Astrophysics for People in a Hurry","Neil Tyson",400,"Science","Quick space guide.","https://covers.openlibrary.org/b/title/Astrophysics-L.jpg",4.6,1200),
        ("The Origin of Species","Charles Darwin",450,"Science","Evolution classic.","https://covers.openlibrary.org/b/title/Origin%20of%20Species-L.jpg",4.6,1000),
        ("The Elegant Universe","Brian Greene",430,"Science","String theory.","https://covers.openlibrary.org/b/title/The%20Elegant%20Universe-L.jpg",4.5,900),
        ("The Gene","Siddhartha Mukherjee",480,"Science","Genetics story.","https://covers.openlibrary.org/b/title/The%20Gene-L.jpg",4.8,1500),
        ("The Body","Bill Bryson",470,"Science","Human body guide.","https://covers.openlibrary.org/b/title/The%20Body-L.jpg",4.7,1300),
        # History
        ("Guns Germs and Steel","Jared Diamond",500,"History","Civilizations rise.","https://covers.openlibrary.org/b/title/Guns%20Germs%20and%20Steel-L.jpg",4.8,2000),
        ("The Silk Roads","Peter Frankopan",480,"History","Trade routes.","https://covers.openlibrary.org/b/title/The%20Silk%20Roads-L.jpg",4.7,1500),
        ("India After Gandhi","Ramachandra Guha",550,"History","Modern India.","https://covers.openlibrary.org/b/title/India%20After%20Gandhi-L.jpg",4.9,1800),
        ("The Diary of Anne Frank","Anne Frank",300,"History","WW2 diary.","https://covers.openlibrary.org/b/title/The%20Diary%20of%20Anne%20Frank-L.jpg",4.9,5000),
        ("SPQR","Mary Beard",450,"History","Ancient Rome.","https://covers.openlibrary.org/b/title/SPQR-L.jpg",4.6,1000),
        ("Postwar","Tony Judt",490,"History","Europe after war.","https://covers.openlibrary.org/b/title/Postwar-L.jpg",4.7,1100),
        ("Cold War","Odd Arne Westad",470,"History","Global conflict.","https://covers.openlibrary.org/b/title/Cold%20War-L.jpg",4.6,900),
        ("Third Reich","William Shirer",600,"History","Nazi Germany.","https://covers.openlibrary.org/b/title/Third%20Reich-L.jpg",4.8,1400),
        ("Team of Rivals","Doris Goodwin",530,"History","Lincoln story.","https://covers.openlibrary.org/b/title/Team%20of%20Rivals-L.jpg",4.7,1200),
        ("The Wright Brothers","David McCullough",420,"History","Flight pioneers.","https://covers.openlibrary.org/b/title/The%20Wright%20Brothers-L.jpg",4.6,800),
        # Technology
        ("Clean Code","Robert Martin",550,"Technology","Write better code.","https://covers.openlibrary.org/b/title/Clean%20Code-L.jpg",4.9,3000),
        ("Pragmatic Programmer","Andrew Hunt",520,"Technology","Programming mindset.","https://covers.openlibrary.org/b/title/Pragmatic%20Programmer-L.jpg",4.8,2500),
        ("Introduction to Algorithms","CLRS",700,"Technology","Algorithm bible.","https://covers.openlibrary.org/b/title/Introduction%20to%20Algorithms-L.jpg",4.7,2000),
        ("Design Patterns","Erich Gamma",650,"Technology","Software patterns.","https://covers.openlibrary.org/b/title/Design%20Patterns-L.jpg",4.8,1800),
        ("Code Complete","Steve McConnell",600,"Technology","Coding practices.","https://covers.openlibrary.org/b/title/Code%20Complete-L.jpg",4.7,1500),
        ("You Dont Know JS","Kyle Simpson",400,"Technology","JS deep dive.","https://covers.openlibrary.org/b/title/You%20Dont%20Know%20JS-L.jpg",4.6,1200),
        ("Eloquent JavaScript","Marijn Haverbeke",420,"Technology","JS fundamentals.","https://covers.openlibrary.org/b/title/Eloquent%20JavaScript-L.jpg",4.6,1000),
        ("Python Crash Course","Eric Matthes",450,"Technology","Learn Python fast.","https://covers.openlibrary.org/b/title/Python%20Crash%20Course-L.jpg",4.7,1100),
        ("AI Superpowers","Kai-Fu Lee",480,"Technology","AI future.","https://covers.openlibrary.org/b/title/AI%20Superpowers-L.jpg",4.6,900),
        ("Phoenix Project","Gene Kim",430,"Technology","DevOps story.","https://covers.openlibrary.org/b/title/Phoenix%20Project-L.jpg",4.7,800),
    ]
    c.executemany(
        "INSERT INTO books (title,author,price,genre,description,image,rating,reviews) VALUES (?,?,?,?,?,?,?,?)",
        books
    )
