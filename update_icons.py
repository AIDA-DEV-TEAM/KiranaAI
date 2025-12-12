from PIL import Image, ImageOps
import os
import shutil

# Config
SOURCE_ICON = r"C:\Users\Mr.Beast\.gemini\antigravity\brain\2153d0cd-1803-4f68-9c5a-5193d35016b1\kirana_ai_app_icon_1765518194750.png"
ANDROID_RES_DIR = r"d:\Desktop\KiranaMobile\android\app\src\main\res"

# Standard Legacy Sizes
SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
}

# Adaptive Icon Config (Canvas 108dp, Safe 66dp)
# We map standard density buckets to the 108dp px size equivalent
# mdpi 108dp = 108px
# hdpi 108dp = 162px
# xhdpi 108dp = 216px
# xxhdpi 108dp = 324px
# xxxhdpi 108dp = 432px
ADAPTIVE_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432
}

def get_dominant_color(img):
    # Sample the corners or edges to find the background color
    # or just resize to 1x1
    tmp = img.copy()
    tmp = tmp.resize((1, 1), Image.Resampling.LANCZOS)
    color = tmp.getpixel((0, 0))
    # Convert to Hex
    return '#{:02x}{:02x}{:02x}'.format(color[0], color[1], color[2])

def update_icons():
    if not os.path.exists(SOURCE_ICON):
        print(f"Error: Source icon not found at {SOURCE_ICON}")
        return

    try:
        img = Image.open(SOURCE_ICON).convert("RGBA")
        
        # 1. Determine Background Color
        bg_color_hex = get_dominant_color(img)
        print(f"Detected Background Color: {bg_color_hex}")

        # 2. Update colors.xml
        colors_path = os.path.join(ANDROID_RES_DIR, "values", "colors.xml")
        os.makedirs(os.path.dirname(colors_path), exist_ok=True)
        # Simple overwrite or robust XML edit? Simple overwrite is risky if file implies other colors.
        # But for this task, we can just ensure the color resource exists.
        # Let's write a dedicated icon_colors.xml or check if we can append.
        # Safe bet: Write a minimal colors icon file that won't conflict? 
        # Actually, let's just make a new file values/icon_colors.xml
        icon_colors_path = os.path.join(ANDROID_RES_DIR, "values", "icon_colors.xml")
        with open(icon_colors_path, "w") as f:
            f.write(f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="icon_background">{bg_color_hex}</color>
</resources>''')

        # 3. Generate Legacy Icons (Fill Square)
        for folder, size in SIZES.items():
            target_dir = os.path.join(ANDROID_RES_DIR, folder)
            os.makedirs(target_dir, exist_ok=True)
            
            # Legacy Square
            square = img.resize((size, size), Image.Resampling.LANCZOS)
            square.save(os.path.join(target_dir, "ic_launcher.png"))
            
            # Legacy Round
            mask = Image.new('L', (size, size), 0)
            from PIL import ImageDraw
            ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
            round_icon = img.resize((size, size), Image.Resampling.LANCZOS)
            output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            output.paste(round_icon, (0, 0), mask=mask)
            output.save(os.path.join(target_dir, "ic_launcher_round.png"))

        # 4. Generate Adaptive Foregrounds
        # Foreground should be the icon centered
        # Strategy: "Full Bleed" / Zoom.
        # We scale the icon UP to > 1.0 so that the rounded corners (transparency)
        # are pushed OUTSIDE the canvas.
        # This ensures the Safe Zone (center 66dp) is 100% Opaque Green.
        # Scale 1.25 ensures we crop out the transparent corners of the source image.
        scale_factor = 1.25
        
        for folder, canvas_size in ADAPTIVE_SIZES.items():
            target_dir = os.path.join(ANDROID_RES_DIR, folder)
            
            # Create transparent canvas
            canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
            
            # Resize icon -> Larger than canvas
            icon_size = int(canvas_size * scale_factor)
            resized_icon = img.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
            
            # Center it (Negative offset to crop)
            offset = (canvas_size - icon_size) // 2
            canvas.paste(resized_icon, (offset, offset))
            
            canvas.save(os.path.join(target_dir, "ic_launcher_foreground.png"))

        # 5. Create Adaptive XMLs in mipmap-anydpi-v26
        anydpi_dir = os.path.join(ANDROID_RES_DIR, "mipmap-anydpi-v26")
        os.makedirs(anydpi_dir, exist_ok=True)
        
        xml_content = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/icon_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>'''

        with open(os.path.join(anydpi_dir, "ic_launcher.xml"), "w") as f:
            f.write(xml_content)
        with open(os.path.join(anydpi_dir, "ic_launcher_round.xml"), "w") as f:
            f.write(xml_content)

        print("Adaptive Icon update complete!")

    except Exception as e:
        print(f"Failed to update icons: {e}")

if __name__ == "__main__":
    update_icons()
