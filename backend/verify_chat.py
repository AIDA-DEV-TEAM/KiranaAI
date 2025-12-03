import asyncio
from backend.database import SessionLocal
from backend.services.chat_service import process_chat_message

async def verify_chat():
    db = SessionLocal()
    try:
        print("--- TEST 1: Query ---")
        response = await process_chat_message("How much rice do we have?", db)
        print(f"Response: {response['response']}")
        print(f"SQL: {response['sql_query']}")
        
        print("\n--- TEST 2: Action ---")
        response = await process_chat_message("Sold 1 rice", db)
        print(f"Response: {response['response']}")
        print(f"SQL: {response['sql_query']}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(verify_chat())
