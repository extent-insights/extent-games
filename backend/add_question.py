from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional
import psycopg2
import psycopg2.extras
import os

load_dotenv()  # reads .env and loads variables into os.environ

# Make sure we are ok in DEBUG mode
def require_debug():
    if not DEBUG:
        raise HTTPException(status_code=403, detail="ERROR: Debug mode is disabled")

def get_public_ip() -> str:
    """
    Ask an external service what our public IP is.
    Falls back to empty string if unavailable.
    """
    try:
        import urllib.request
        with urllib.request.urlopen("https://api.ipify.org", timeout=2) as r:
            return r.read().decode().strip()
    except Exception:
        return ""

# Are We Debugging?
DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

# Get public IP
PUBLIC_IP = get_public_ip()
if DEBUG:
    print(f"[DEBUG] Public IP: {PUBLIC_IP}")

app = FastAPI(title="Trivia API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://192.168.1.30",        # your local server
        "http://localhost",
        "http://localhost:5500",       # if using VS Code Live Server
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── DB config from environment variables ───
# Set these in your shell or a .env file — never hardcode credentials
DB_HOST = os.environ.get("DB_HOST")
DB_NAME = os.environ.get("DB_NAME")
DB_USER = os.environ.get("DB_USER")
DB_PASS = os.environ.get("DB_PASS")

if not all([DB_HOST, DB_NAME, DB_USER, DB_PASS]):
    raise RuntimeError("ERROR: One or more required DB environment variables are not set")

try:
    db_pool = psycopg2.pool.SimpleConnectionPool(
        1, 10,
        host=DB_HOST,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
except Exception as e:
    print("ERROR: Error creating DB pool:", e)
    raise e


# --- Schema ---
class TriviaQuestion(BaseModel):
    question: str
    category: str
    decade: str
    answer_a: str
    answer_b: str
    answer_c: str
    answer_d: str
    correct_answer: str

    @validator("correct_answer")
    def must_be_valid(cls, v):
        if v.upper() not in ("A", "B", "C", "D"):
            raise ValueError("correct_answer must be A, B, C, or D")
        return v.upper()


# --- Startup: create table + migrate decade column if missing ---
@app.on_event("startup")
def create_table():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS trivia (
            id             SERIAL PRIMARY KEY,
            question       TEXT    NOT NULL,
            category       TEXT    NOT NULL,
            decade         TEXT    NOT NULL DEFAULT '',
            answer_a       TEXT    NOT NULL,
            answer_b       TEXT    NOT NULL,
            answer_c       TEXT    NOT NULL,
            answer_d       TEXT    NOT NULL,
            correct_answer CHAR(1) NOT NULL
        );
    """)
    # Migrate: add decade column if the table already existed without it
    cur.execute("""
        ALTER TABLE trivia
        ADD COLUMN IF NOT EXISTS decade TEXT NOT NULL DEFAULT '';
    """)
    conn.commit()
    cur.close()
    conn.close()


# --- Routes ---
@app.post("/questions", status_code=201)
def create_question(q: TriviaQuestion):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO trivia
                (question, category, decade, answer_a, answer_b, answer_c, answer_d, correct_answer)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *;
        """, (q.question, q.category, q.decade, q.answer_a, q.answer_b, q.answer_c, q.answer_d, q.correct_answer))
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@app.get("/questions")
def list_questions(category: Optional[str] = None, decade: Optional[str] = None):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        filters, params = [], []
        if category:
            filters.append("category = %s")
            params.append(category)
        if decade:
            filters.append("decade = %s")
            params.append(decade)
        where = ("WHERE " + " AND ".join(filters)) if filters else ""
        cur.execute(f"SELECT * FROM trivia {where} ORDER BY id DESC;", params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@app.get("/questions/{question_id}")
def get_question(question_id: int):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("SELECT * FROM trivia WHERE id = %s;", (question_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found")
        return dict(row)
    finally:
        cur.close()
        conn.close()


@app.delete("/questions/{question_id}", status_code=204)
def delete_question(question_id: int):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM trivia WHERE id = %s RETURNING id;", (question_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Question not found")
        conn.commit()
    finally:
        cur.close()
        conn.close()


@app.get("/categories")
def list_categories():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT category FROM trivia ORDER BY category;")
        return [row[0] for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@app.get("/decades")
def list_decades():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT decade FROM trivia ORDER BY decade;")
        return [row[0] for row in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@app.get("/health")
def health():
    return {"status": "ok"}
