from fastapi import FastAPI
import logging
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .routes import inventory, sales, chat, mandi, vision, live_chat
from .seed_data import seed_data

app = FastAPI(title="Kirana Shop Talk to Data")

# Initialize DB
init_db()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(inventory.router)
app.include_router(sales.router)
app.include_router(chat.router)
app.include_router(mandi.router)
app.include_router(vision.router)
app.include_router(live_chat.router)

@app.post("/seed")
def trigger_seed():
    try:
        seed_data()
        return {"message": "Data seeded successfully"}
    except Exception as e:
        return {"message": f"Seeding failed: {str(e)}"}

@app.get("/")
def read_root():
    return {"message": "Kirana Shop API is running"}

# --- Agent Management ---
import subprocess
import sys
import signal
import os

agent_process = None

@app.on_event("startup")
async def startup_event():
    global agent_process
    try:
        # Check if we are in a production-like environment or just want to run the agent
        # We'll run it by default.
        logger = logging.getLogger("uvicorn")
        logger.info("Starting LiveKit Agent subprocess...")
        
        # Use sys.executable to ensure we use the same python interpreter
        script_path = os.path.join(os.path.dirname(__file__), "agent.py")
        
        # Start the agent script
        agent_process = subprocess.Popen(
            [sys.executable, script_path, "start"],
            cwd=os.path.dirname(os.path.dirname(__file__)), # Run from repo root
            stdout=sys.stdout,
            stderr=sys.stderr
        )
        logger.info(f"Agent subprocess started with PID: {agent_process.pid}")
    except Exception as e:
        print(f"Failed to start agent subprocess: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    global agent_process
    if agent_process:
        print(f"Terminating Agent subprocess (PID: {agent_process.pid})...")
        agent_process.terminate()
        try:
            agent_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            agent_process.kill()
        print("Agent subprocess terminated.")
