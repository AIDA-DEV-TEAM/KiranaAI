import requests
import sys
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load env vars
load_dotenv()

BASE_URL = "http://127.0.0.1:8004"
DB_URL = "sqlite:///./kirana.db"

def log(msg):
    print(msg)
    with open("validation_result.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def check_db():
    log("\n[Database Check]")
    try:
        engine = create_engine(DB_URL)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT count(*) FROM products")).scalar()
            nulls = conn.execute(text("SELECT count(*) FROM products WHERE max_stock IS NULL")).scalar()
            null_req = conn.execute(text("SELECT count(*) FROM products WHERE name IS NULL OR category IS NULL OR price IS NULL OR stock IS NULL")).scalar()
            log(f"[OK] Database connection successful. Products count: {result}. NULL max_stock: {nulls}. NULL required: {null_req}")
            return True
    except Exception as e:
        log(f"[FAIL] Database connection failed: {e}")
        return False

def check_api_health():
    log("\n[API Health Check]")
    endpoints = [
        ("/", "Root"),
        ("/inventory/", "Inventory List"),
        ("/sales/", "Sales List"),
    ]
    
    all_passed = True
    for endpoint, name in endpoints:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}")
            if response.status_code == 200:
                log(f"[OK] {name} ({endpoint}): 200 OK")
            else:
                log(f"[FAIL] {name} ({endpoint}): Failed with {response.status_code}")
                log(f"Response: {response.text}")
                all_passed = False
        except requests.exceptions.ConnectionError:
            log(f"[FAIL] {name} ({endpoint}): Connection Refused (Is backend running?)")
            return False
    return all_passed

def check_vision_endpoint():
    log("\n[Vision Analysis Check]")
    # Mocking a file upload
    try:
        # Create a dummy image
        from PIL import Image
        import io
        img = Image.new('RGB', (100, 100), color = 'red')
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        files = {'file': ('test.png', img_byte_arr, 'image/png')}
        response = requests.post(f"{BASE_URL}/vision/analyze", files=files)
        
        if response.status_code == 200:
            log("[OK] Vision Analysis Endpoint: 200 OK")
            log(f"   Response: {response.json()}")
        else:
            log(f"[FAIL] Vision Analysis Endpoint: Failed with {response.status_code}")
            log(f"   Response: {response.text}")
    except Exception as e:
        log(f"[FAIL] Vision Check Failed: {e}")

def main():
    # Clear log file
    with open("validation_result.log", "w", encoding="utf-8") as f:
        f.write("Starting System Validation...\n")
        
    print("Starting System Validation...")
    
    db_status = check_db()
    api_status = check_api_health()
    
    if api_status:
        check_vision_endpoint()
    
    if db_status and api_status:
        log("\n[SUCCESS] SYSTEM VALIDATION PASSED")
    else:
        log("\n[FAILURE] SYSTEM VALIDATION FAILED")

if __name__ == "__main__":
    main()
