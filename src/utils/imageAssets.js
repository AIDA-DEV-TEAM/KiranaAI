
// Map of keywords/names to local asset paths (after bundling)
export const DEFAULT_IMAGES = {
    // Grains
    'rice': '/assets/defaults/rice.png',
    'basmati': '/assets/defaults/rice.png',
    'paddy': '/assets/defaults/rice.png',
    'poha': '/assets/defaults/rice.png',

    // Sugar/Sweet
    'sugar': '/assets/defaults/sugar.png',
    'jaggery': '/assets/defaults/sugar.png',
    'gud': '/assets/defaults/sugar.png',

    // Oils
    'oil': '/assets/defaults/oil.png',
    'ghee': '/assets/defaults/oil.png',
    'butter': '/assets/defaults/oil.png',

    // Dairy
    'milk': '/assets/defaults/milk.png',
    'curd': '/assets/defaults/milk.png',
    'paneer': '/assets/defaults/milk.png',
    'yogurt': '/assets/defaults/milk.png',
    'cheese': '/assets/defaults/milk.png',

    // Wheat/Flour
    'wheat': '/assets/defaults/wheat.png',
    'flour': '/assets/defaults/wheat.png',
    'atta': '/assets/defaults/wheat.png',
    'maida': '/assets/defaults/wheat.png',
    'suji': '/assets/defaults/wheat.png',
    'rava': '/assets/defaults/wheat.png',

    // Pulses (Dal)
    'dal': '/assets/defaults/dal.png',
    'pulse': '/assets/defaults/dal.png',
    'lentil': '/assets/defaults/dal.png',
    'gram': '/assets/defaults/dal.png',
    'rajma': '/assets/defaults/dal.png',
    'chana': '/assets/defaults/dal.png',
    'peas': '/assets/defaults/dal.png',
    'bean': '/assets/defaults/dal.png',

    // Spices
    'spice': '/assets/defaults/spices.png',
    'chilli': '/assets/defaults/spices.png',
    'turmeric': '/assets/defaults/spices.png',
    'haldi': '/assets/defaults/spices.png',
    'mirch': '/assets/defaults/spices.png',
    'cumin': '/assets/defaults/spices.png',
    'jeera': '/assets/defaults/spices.png',
    'mustard': '/assets/defaults/spices.png',
    'clove': '/assets/defaults/spices.png',
    'cardamom': '/assets/defaults/spices.png',
    'cinnamon': '/assets/defaults/spices.png',
    'masala': '/assets/defaults/spices.png',
    'pepper': '/assets/defaults/spices.png',

    // Vegetables
    'veg': '/assets/defaults/vegetables.png',
    'onion': '/assets/defaults/vegetables.png',
    'potato': '/assets/defaults/vegetables.png',
    'tomato': '/assets/defaults/vegetables.png',
    'brinjal': '/assets/defaults/vegetables.png',
    'eggplant': '/assets/defaults/vegetables.png',
    'okra': '/assets/defaults/vegetables.png',
    'bhindi': '/assets/defaults/vegetables.png',
    'cabbage': '/assets/defaults/vegetables.png',
    'cauliflower': '/assets/defaults/vegetables.png',
    'spinach': '/assets/defaults/vegetables.png',
    'palak': '/assets/defaults/vegetables.png',
    'carrot': '/assets/defaults/vegetables.png',
    'garlic': '/assets/defaults/vegetables.png',
    'ginger': '/assets/defaults/vegetables.png',
    'lemon': '/assets/defaults/vegetables.png',

    // Salt
    'salt': '/assets/defaults/salt.png',
    'namak': '/assets/defaults/salt.png',

    // Snacks
    'chip': '/assets/defaults/snacks.png',
    'biscuit': '/assets/defaults/snacks.png',
    'cookie': '/assets/defaults/snacks.png',
    'noodle': '/assets/defaults/snacks.png',
    'snack': '/assets/defaults/snacks.png',
    'maggie': '/assets/defaults/snacks.png',

    // Beverages
    'tea': '/assets/defaults/beverages.png',
    'chai': '/assets/defaults/beverages.png',
    'coffee': '/assets/defaults/beverages.png',
    'drink': '/assets/defaults/beverages.png',
    'juice': '/assets/defaults/beverages.png',

    // Cleaning / Household
    'soap': '/assets/defaults/cleaning.png',
    'detergent': '/assets/defaults/cleaning.png',
    'surf': '/assets/defaults/cleaning.png',
    'wash': '/assets/defaults/cleaning.png',
    'clean': '/assets/defaults/cleaning.png',
    'paste': '/assets/defaults/cleaning.png',
    'brush': '/assets/defaults/cleaning.png',
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
    'Beverages': '/assets/defaults/beverages.png',
    'Snacks': '/assets/defaults/snacks.png',
    'Cleaning': '/assets/defaults/cleaning.png',
    'Household': '/assets/defaults/cleaning.png',
    'Personal Care': '/assets/defaults/cleaning.png', // Fallback to cleaning for now or generate specific if needed
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
