from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .seed_data import seed_default_data
from .routes import inventory, sales, chat, mandi, vision




app = FastAPI(title="Kirana Shop Talk to Data")

# Initialize DB and Seed Data
init_db()
seed_default_data()

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



@app.get("/")
def read_root():
    return {"message": "Kirana Shop API is running"}
