from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

books = [

# ================= SELF HELP (10) =================
{"title":"Atomic Habits","author":"James Clear","price":500,"genre":"Self Help","rating":4.8,"reviews":1200,"description":"Build good habits and break bad ones.","image":"https://covers.openlibrary.org/b/title/Atomic%20Habits-L.jpg"},
{"title":"Deep Work","author":"Cal Newport","price":400,"genre":"Self Help","rating":4.7,"reviews":950,"description":"Focus without distraction.","image":"https://covers.openlibrary.org/b/title/Deep%20Work-L.jpg"},
{"title":"Ikigai","author":"Hector Garcia","price":350,"genre":"Self Help","rating":4.6,"reviews":800,"description":"Secret to long life.","image":"https://covers.openlibrary.org/b/title/Ikigai-L.jpg"},
{"title":"Rich Dad Poor Dad","author":"Robert Kiyosaki","price":380,"genre":"Self Help","rating":4.6,"reviews":2000,"description":"Money lessons.","image":"https://covers.openlibrary.org/b/title/Rich%20Dad%20Poor%20Dad-L.jpg"},
{"title":"Think and Grow Rich","author":"Napoleon Hill","price":350,"genre":"Self Help","rating":4.5,"reviews":1400,"description":"Success mindset.","image":"https://covers.openlibrary.org/b/title/Think%20and%20Grow%20Rich-L.jpg"},
{"title":"The Power of Now","author":"Eckhart Tolle","price":450,"genre":"Self Help","rating":4.6,"reviews":870,"description":"Live in present.","image":"https://covers.openlibrary.org/b/title/The%20Power%20of%20Now-L.jpg"},
{"title":"Start With Why","author":"Simon Sinek","price":390,"genre":"Self Help","rating":4.6,"reviews":750,"description":"Find purpose.","image":"https://covers.openlibrary.org/b/title/Start%20With%20Why-L.jpg"},
{"title":"The Subtle Art of Not Giving a F*ck","author":"Mark Manson","price":420,"genre":"Self Help","rating":4.5,"reviews":1700,"description":"Live boldly.","image":"https://covers.openlibrary.org/b/title/Subtle%20Art%20of%20Not%20Giving%20a%20F*ck-L.jpg"},
{"title":"You Can Win","author":"Shiv Khera","price":300,"genre":"Self Help","rating":4.4,"reviews":600,"description":"Motivation guide.","image":"https://covers.openlibrary.org/b/title/You%20Can%20Win-L.jpg"},
{"title":"7 Habits of Highly Effective People","author":"Stephen Covey","price":520,"genre":"Self Help","rating":4.7,"reviews":1100,"description":"Powerful habits.","image":"https://covers.openlibrary.org/b/title/7%20Habits%20of%20Highly%20Effective%20People-L.jpg"},

# ================= FICTION (10) =================
{"title":"Harry Potter and the Sorcerer's Stone","author":"J.K. Rowling","price":500,"genre":"Fiction","rating":4.9,"reviews":5000,"description":"Wizard begins journey.","image":"https://covers.openlibrary.org/b/title/Harry%20Potter%20Sorcerers%20Stone-L.jpg"},
{"title":"1984","author":"George Orwell","price":350,"genre":"Fiction","rating":4.8,"reviews":2600,"description":"Dystopian control.","image":"https://covers.openlibrary.org/b/title/1984-L.jpg"},
{"title":"The Great Gatsby","author":"F. Scott Fitzgerald","price":320,"genre":"Fiction","rating":4.5,"reviews":1400,"description":"Wealth and tragedy.","image":"https://covers.openlibrary.org/b/title/The%20Great%20Gatsby-L.jpg"},
{"title":"To Kill a Mockingbird","author":"Harper Lee","price":400,"genre":"Fiction","rating":4.9,"reviews":3000,"description":"Justice story.","image":"https://covers.openlibrary.org/b/title/To%20Kill%20a%20Mockingbird-L.jpg"},
{"title":"The Alchemist","author":"Paulo Coelho","price":300,"genre":"Fiction","rating":4.7,"reviews":2100,"description":"Find your destiny.","image":"https://covers.openlibrary.org/b/title/The%20Alchemist-L.jpg"},
{"title":"The Hobbit","author":"J.R.R. Tolkien","price":450,"genre":"Fiction","rating":4.8,"reviews":1800,"description":"Adventure quest.","image":"https://covers.openlibrary.org/b/title/The%20Hobbit-L.jpg"},
{"title":"Pride and Prejudice","author":"Jane Austen","price":280,"genre":"Fiction","rating":4.6,"reviews":1600,"description":"Love and class.","image":"https://covers.openlibrary.org/b/title/Pride%20and%20Prejudice-L.jpg"},
{"title":"Moby Dick","author":"Herman Melville","price":360,"genre":"Fiction","rating":4.3,"reviews":900,"description":"Whale obsession.","image":"https://covers.openlibrary.org/b/title/Moby%20Dick-L.jpg"},
{"title":"The Catcher in the Rye","author":"J.D. Salinger","price":340,"genre":"Fiction","rating":4.4,"reviews":1200,"description":"Teen rebellion.","image":"https://covers.openlibrary.org/b/title/Catcher%20in%20the%20Rye-L.jpg"},
{"title":"The Book Thief","author":"Markus Zusak","price":380,"genre":"Fiction","rating":4.8,"reviews":2000,"description":"WW2 story.","image":"https://covers.openlibrary.org/b/title/The%20Book%20Thief-L.jpg"},

# ================= BUSINESS (10) =================
{"title":"Zero to One","author":"Peter Thiel","price":420,"genre":"Business","rating":4.6,"reviews":1400,"description":"Startup insights.","image":"https://covers.openlibrary.org/b/title/Zero%20to%20One-L.jpg"},
{"title":"Lean Startup","author":"Eric Ries","price":450,"genre":"Business","rating":4.7,"reviews":1300,"description":"Build startups smart.","image":"https://covers.openlibrary.org/b/title/Lean%20Startup-L.jpg"},
{"title":"Rework","author":"Jason Fried","price":380,"genre":"Business","rating":4.5,"reviews":900,"description":"Modern work ideas.","image":"https://covers.openlibrary.org/b/title/Rework-L.jpg"},
{"title":"Good to Great","author":"Jim Collins","price":500,"genre":"Business","rating":4.8,"reviews":2000,"description":"Company growth.","image":"https://covers.openlibrary.org/b/title/Good%20to%20Great-L.jpg"},
{"title":"The Hard Thing About Hard Things","author":"Ben Horowitz","price":480,"genre":"Business","rating":4.7,"reviews":1500,"description":"Startup struggles.","image":"https://covers.openlibrary.org/b/title/Hard%20Thing%20About%20Hard%20Things-L.jpg"},
{"title":"Blue Ocean Strategy","author":"W. Chan Kim","price":460,"genre":"Business","rating":4.6,"reviews":1100,"description":"New markets.","image":"https://covers.openlibrary.org/b/title/Blue%20Ocean%20Strategy-L.jpg"},
{"title":"Hooked","author":"Nir Eyal","price":390,"genre":"Business","rating":4.5,"reviews":1000,"description":"Product habits.","image":"https://covers.openlibrary.org/b/title/Hooked-L.jpg"},
{"title":"Measure What Matters","author":"John Doerr","price":410,"genre":"Business","rating":4.6,"reviews":800,"description":"OKR framework.","image":"https://covers.openlibrary.org/b/title/Measure%20What%20Matters-L.jpg"},
{"title":"Crushing It","author":"Gary Vee","price":370,"genre":"Business","rating":4.4,"reviews":700,"description":"Personal brand.","image":"https://covers.openlibrary.org/b/title/Crushing%20It-L.jpg"},
{"title":"The 100 Startup","author":"Chris Guillebeau","price":350,"genre":"Business","rating":4.5,"reviews":950,"description":"Start small.","image":"https://covers.openlibrary.org/b/title/100%20Startup-L.jpg"},

# ================= SCIENCE (10) =================
{"title":"A Brief History of Time","author":"Stephen Hawking","price":500,"genre":"Science","rating":4.8,"reviews":3000,"description":"Universe explained.","image":"https://covers.openlibrary.org/b/title/Brief%20History%20of%20Time-L.jpg"},
{"title":"Cosmos","author":"Carl Sagan","price":450,"genre":"Science","rating":4.9,"reviews":2500,"description":"Space exploration.","image":"https://covers.openlibrary.org/b/title/Cosmos-L.jpg"},
{"title":"The Selfish Gene","author":"Richard Dawkins","price":420,"genre":"Science","rating":4.7,"reviews":1800,"description":"Evolution theory.","image":"https://covers.openlibrary.org/b/title/Selfish%20Gene-L.jpg"},
{"title":"The Gene","author":"Siddhartha Mukherjee","price":480,"genre":"Science","rating":4.8,"reviews":1500,"description":"Genetics story.","image":"https://covers.openlibrary.org/b/title/The%20Gene-L.jpg"},
{"title":"Sapiens","author":"Yuval Noah Harari","price":520,"genre":"Science","rating":4.9,"reviews":4000,"description":"Human history.","image":"https://covers.openlibrary.org/b/title/Sapiens-L.jpg"},
{"title":"Homo Deus","author":"Yuval Noah Harari","price":510,"genre":"Science","rating":4.7,"reviews":2000,"description":"Future humans.","image":"https://covers.openlibrary.org/b/title/Homo%20Deus-L.jpg"},
{"title":"Astrophysics for People in a Hurry","author":"Neil Tyson","price":400,"genre":"Science","rating":4.6,"reviews":1200,"description":"Quick space guide.","image":"https://covers.openlibrary.org/b/title/Astrophysics%20for%20People%20in%20a%20Hurry-L.jpg"},
{"title":"The Origin of Species","author":"Charles Darwin","price":450,"genre":"Science","rating":4.6,"reviews":1000,"description":"Evolution classic.","image":"https://covers.openlibrary.org/b/title/Origin%20of%20Species-L.jpg"},
{"title":"The Elegant Universe","author":"Brian Greene","price":430,"genre":"Science","rating":4.5,"reviews":900,"description":"String theory.","image":"https://covers.openlibrary.org/b/title/Elegant%20Universe-L.jpg"},
{"title":"The Body","author":"Bill Bryson","price":470,"genre":"Science","rating":4.7,"reviews":1300,"description":"Human body guide.","image":"https://covers.openlibrary.org/b/title/The%20Body-L.jpg"},

# ================= HISTORY (10) =================
{"title":"Guns Germs and Steel","author":"Jared Diamond","price":500,"genre":"History","rating":4.8,"reviews":2000,"description":"Civilizations rise.","image":"https://covers.openlibrary.org/b/title/Guns%20Germs%20and%20Steel-L.jpg"},
{"title":"The Silk Roads","author":"Peter Frankopan","price":480,"genre":"History","rating":4.7,"reviews":1500,"description":"Trade routes.","image":"https://covers.openlibrary.org/b/title/Silk%20Roads-L.jpg"},
{"title":"India After Gandhi","author":"Ramachandra Guha","price":550,"genre":"History","rating":4.9,"reviews":1800,"description":"Modern India.","image":"https://covers.openlibrary.org/b/title/India%20After%20Gandhi-L.jpg"},
{"title":"The Diary of Anne Frank","author":"Anne Frank","price":300,"genre":"History","rating":4.9,"reviews":5000,"description":"WW2 diary.","image":"https://covers.openlibrary.org/b/title/Anne%20Frank%20Diary-L.jpg"},
{"title":"SPQR","author":"Mary Beard","price":450,"genre":"History","rating":4.6,"reviews":1000,"description":"Ancient Rome.","image":"https://covers.openlibrary.org/b/title/SPQR-L.jpg"},
{"title":"Postwar","author":"Tony Judt","price":490,"genre":"History","rating":4.7,"reviews":1100,"description":"Europe after war.","image":"https://covers.openlibrary.org/b/title/Postwar-L.jpg"},
{"title":"Cold War","author":"Odd Arne Westad","price":470,"genre":"History","rating":4.6,"reviews":900,"description":"Global conflict.","image":"https://covers.openlibrary.org/b/title/Cold%20War-L.jpg"},
{"title":"Third Reich","author":"William Shirer","price":600,"genre":"History","rating":4.8,"reviews":1400,"description":"Nazi Germany.","image":"https://covers.openlibrary.org/b/title/Third%20Reich-L.jpg"},
{"title":"Team of Rivals","author":"Doris Goodwin","price":530,"genre":"History","rating":4.7,"reviews":1200,"description":"Lincoln story.","image":"https://covers.openlibrary.org/b/title/Team%20of%20Rivals-L.jpg"},
{"title":"The Wright Brothers","author":"David McCullough","price":420,"genre":"History","rating":4.6,"reviews":800,"description":"Flight pioneers.","image":"https://covers.openlibrary.org/b/title/Wright%20Brothers-L.jpg"},

# ================= TECHNOLOGY (10) =================
{"title":"Clean Code","author":"Robert Martin","price":550,"genre":"Technology","rating":4.9,"reviews":3000,"description":"Write better code.","image":"https://covers.openlibrary.org/b/title/Clean%20Code-L.jpg"},
{"title":"Pragmatic Programmer","author":"Andrew Hunt","price":520,"genre":"Technology","rating":4.8,"reviews":2500,"description":"Programming mindset.","image":"https://covers.openlibrary.org/b/title/Pragmatic%20Programmer-L.jpg"},
{"title":"Introduction to Algorithms","author":"CLRS","price":700,"genre":"Technology","rating":4.7,"reviews":2000,"description":"Algorithm bible.","image":"https://covers.openlibrary.org/b/title/Introduction%20to%20Algorithms-L.jpg"},
{"title":"Design Patterns","author":"Erich Gamma","price":650,"genre":"Technology","rating":4.8,"reviews":1800,"description":"Software patterns.","image":"https://covers.openlibrary.org/b/title/Design%20Patterns-L.jpg"},
{"title":"Code Complete","author":"Steve McConnell","price":600,"genre":"Technology","rating":4.7,"reviews":1500,"description":"Coding practices.","image":"https://covers.openlibrary.org/b/title/Code%20Complete-L.jpg"},
{"title":"You Dont Know JS","author":"Kyle Simpson","price":400,"genre":"Technology","rating":4.6,"reviews":1200,"description":"JS deep dive.","image":"https://covers.openlibrary.org/b/title/You%20Dont%20Know%20JS-L.jpg"},
{"title":"Eloquent JavaScript","author":"Marijn Haverbeke","price":420,"genre":"Technology","rating":4.6,"reviews":1000,"description":"JS fundamentals.","image":"https://covers.openlibrary.org/b/title/Eloquent%20JavaScript-L.jpg"},
{"title":"Python Crash Course","author":"Eric Matthes","price":450,"genre":"Technology","rating":4.7,"reviews":1100,"description":"Learn Python fast.","image":"https://covers.openlibrary.org/b/title/Python%20Crash%20Course-L.jpg"},
{"title":"AI Superpowers","author":"Kai-Fu Lee","price":480,"genre":"Technology","rating":4.6,"reviews":900,"description":"AI future.","image":"https://covers.openlibrary.org/b/title/AI%20Superpowers-L.jpg"},
{"title":"Phoenix Project","author":"Gene Kim","price":430,"genre":"Technology","rating":4.7,"reviews":800,"description":"DevOps story.","image":"https://covers.openlibrary.org/b/title/Phoenix%20Project-L.jpg"}

]
@app.get("/")
def home():
    return {"message": "Book Service Running 📚"}

@app.get("/books")
def get_books():
    return books

@app.post("/books")
def add_book(book: dict):
    books.append(book)
    return {"message": "Book added", "book": book}