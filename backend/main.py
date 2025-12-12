from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import chat, mandi, vision, translate

app = FastAPI(title="Kirana Shop Talk to Data")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router)
app.include_router(mandi.router)
app.include_router(vision.router)
app.include_router(translate.router)



@app.get("/")
def read_root():
    return {"message": "Kirana Shop API is running"}
