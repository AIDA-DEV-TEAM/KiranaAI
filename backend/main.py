from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import inventory, sales, chat, mandi, vision
from seed_data import seed_data

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
