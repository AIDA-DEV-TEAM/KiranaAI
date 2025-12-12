
// Map of keywords/names to local asset paths (after bundling)
export const DEFAULT_IMAGES = {
    'rice': '/assets/defaults/rice.png',
    'sugar': '/assets/defaults/sugar.png',
    'oil': '/assets/defaults/oil.png',
    'milk': '/assets/defaults/milk.png',
    'curd': '/assets/defaults/milk.png',
    'wheat': '/assets/defaults/wheat.png',
    'flour': '/assets/defaults/wheat.png', // Atta
    'dal': '/assets/defaults/dal.png',
    'pulse': '/assets/defaults/dal.png',
    'lentil': '/assets/defaults/dal.png',
    'spice': '/assets/defaults/spices.png',
    'chilli': '/assets/defaults/spices.png',
    'turmeric': '/assets/defaults/spices.png',
    'veg': '/assets/defaults/vegetables.png',
    'onion': '/assets/defaults/vegetables.png',
    'potato': '/assets/defaults/vegetables.png',
    'tomato': '/assets/defaults/vegetables.png',
};

// Map of Category to fallback image
export const CATEGORY_IMAGES = {
    'Grains': '/assets/defaults/rice.png', // Fallback for general grains
    'Pulses': '/assets/defaults/dal.png',
    'Oil': '/assets/defaults/oil.png',
    'Flour': '/assets/defaults/wheat.png',
    'Spices': '/assets/defaults/spices.png',
    'Dairy': '/assets/defaults/milk.png',
    'Veg': '/assets/defaults/vegetables.png',
};

/**
 * Smartly resolves the product image using the new fallback system.
 * 1. User Upload (if available)
 * 2. Keyword Match in Name (e.g. "Sona Masoori Rice" -> rice.png)
 * 3. Category Match 
 */
export const getProductImage = (product) => {
    // 1. User uploaded image (Base64 or URL)
    if (product.image_url && product.image_url.trim() !== '') {
        return product.image_url;
    }

    const name = (typeof product.name === 'object'
        ? (product.name.en || Object.values(product.name)[0])
        : product.name || '').toLowerCase();

    const category = product.category;

    // 2. Keyword Match
    // Check if any key in DEFAULT_IMAGES is contained in the product name
    const keys = Object.keys(DEFAULT_IMAGES);
    for (const key of keys) {
        if (name.includes(key)) {
            return DEFAULT_IMAGES[key];
        }
    }

    // 3. Category Match
    if (CATEGORY_IMAGES[category]) {
        return CATEGORY_IMAGES[category];
    }

    // Return null so the UI can decide to show an Icon or placeholder
    return null;
};
