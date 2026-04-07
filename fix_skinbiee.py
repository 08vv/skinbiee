import re

with open('frontend/skinbiee.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace renderSkinResults
old_render_skin_results = """function renderSkinResults(results, imgUrl) {
    const img = byId('skin-result-img', 'skin-result-img-sb');
    if (img) img.src = imgUrl;

    const badgeContainer = byId('skin-result-badges', 'skin-result-badges-sb');
    const list = byId('skin-concerns-list', 'skin-concerns-list-sb');
    const title = byId('skin-result-title', 'skin-result-title-sb');
    const desc = byId('skin-result-desc', 'skin-result-desc-sb');
    
    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) {
        list.innerHTML = '';
        list.classList.add('result-card-entry');
    }
    
    const advice = {
        "Acne": "Your skin is dealing with some breakouts. We'll focus on soothing and clearing these areas gently! 🌿",
        "Dark Spots": "We noticed some areas with extra pigment. These can fade over time with brightening care! ✨",
        "Oiliness": "Your skin is producing extra glow. We'll help balance it so you stay fresh all day. 🌊",
        "Dryness": "Your skin is feeling a bit thirsty! We'll look for rich, hydrating ingredients for you. 💧",
        "Normal": "Your skin is looking balanced and healthy! Let's keep it protected and happy. ☀️",
        "Healthy / Normal": "Overall, your skin is in a great place! Just keep up the healthy habits. 🌟"
    };

    const skinTypeMap = {
        "Oiliness": "Oily", "Dryness": "Dry", "Acne": "Acne-Prone", "Normal": "Normal", "Healthy / Normal": "Normal"
    };
    const detectedConcerns = results.map(r => r.concern);
    let skinType = 'Normal';
    for (const concern of detectedConcerns) {
        if (skinTypeMap[concern]) { skinType = skinTypeMap[concern]; break; }
    }
    if (title) title.textContent = `Skin Type: ${skinType}`;

    const mainConcern = results.sort((a,b) => b.confidence - a.confidence)[0];
    if (desc) {
        if (mainConcern && (mainConcern.concern === 'Healthy / Normal' || mainConcern.concern === 'Normal')) {
            desc.innerHTML = `<strong>Overall:</strong> Your skin looks healthy and balanced! Keep up the good habits. 🌟`;
        } else if (mainConcern) {
            desc.innerHTML = `<strong>Overall:</strong> Your skin is showing signs of <strong>${mainConcern.concern}</strong>. Don't worry, bestie — we've got a plan for you! 💖`;
        } else {
            desc.textContent = "Analysis complete.";
        }
    }

    results.forEach(res => {
        const severityColor = res.severity === 'Moderate' ? 'badge-yellow' : res.severity === 'Mild' ? 'badge-green' : 'badge-red';
        const borderColor = res.severity === 'Moderate' ? '#ffd93d' : res.severity === 'Mild' ? '#6bcb77' : '#ff6b6b';

        const badge = document.createElement('span');
        badge.className = `severity-badge ${severityColor}`;
        badge.textContent = `${res.severity} ${res.concern}`;
        if (badgeContainer) badgeContainer.appendChild(badge);

        const card = document.createElement('div');
        card.className = 'ing-card mb-3';
        card.style.borderLeft = `5px solid ${borderColor}`;
        card.innerHTML = `
            <div class="flex-between">
                <strong>${res.concern}</strong>
                <span class="micro-text text-muted">Severity: ${res.severity || 'Detected'}</span>
            </div>
            <p class="micro-text mt-2 mb-0">${advice[res.concern] || "We'll help you manage this concern with the right routine! 🧴"}</p>
        `;
        if (list) list.appendChild(card);
    });

    const existingBtn = document.getElementById('btn-go-products');
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => renderSkinProductRecommendations(results, null);
        if (list) list.parentElement.appendChild(btn);

        const recContainer = document.createElement('div');
        recContainer.id = 'product-rec-container';
        if (list) list.parentElement.appendChild(recContainer);
    } else {
        existingBtn.onclick = () => renderSkinProductRecommendations(results, null);
        existingBtn.textContent = 'See Recommended Products 🛍️';
        const recContainer = document.getElementById('product-rec-container');
        if (recContainer) {
            recContainer.innerHTML = '';
        } else if (existingBtn.parentElement) {
            const container = document.createElement('div');
            container.id = 'product-rec-container';
            existingBtn.parentElement.insertBefore(container, existingBtn);
        }
    }
}
"""

# 2. Replace renderSkinProductRecommendations
old_render_recs = """function renderSkinProductRecommendations(results, dummyContainer) {
    let container = document.getElementById('product-rec-container');
    if (!container) return;

    if (container.innerHTML.trim() !== '') {
        container.innerHTML = '';
        const btn = document.getElementById('btn-go-products');
        if (btn) btn.textContent = 'See Recommended Products 🛍️';
        return;
    }

    const btn = document.getElementById('btn-go-products');
    if (btn) btn.textContent = 'Hide Recommendations ✕';

    container.innerHTML = `
        <div class="rec-section-header mt-4">
            <h3>Recommended for You</h3>
            <p class="micro-text" style="color:var(--text-secondary);margin-bottom:0">Curated picks based on your scan results</p>
        </div>
        <div class="product-rec-grid mt-3" id="rec-cards-grid"></div>
    `;

    const grid = container.querySelector('#rec-cards-grid');

    const PRODUCT_MAP = {
        'Acne':          { query: 'best salicylic acid face wash for acne skin india', tip: 'Use a salicylic acid-based face wash to unclog pores.' },
        'Dark Spots':    { query: 'dark spot removal serum cream india', tip: 'A Vitamin C or niacinamide serum helps fade dark spots.' },
        'Oiliness':      { query: 'oil control mattifying face wash india', tip: 'A lightweight, oil-free moisturiser keeps shine in check.' },
        'Dryness':       { query: 'best deep moisturiser for dry skin india', tip: 'Look for hyaluronic acid or ceramide-rich moisturisers.' },
        'Normal':        { query: 'gentle daily face wash normal skin india', tip: 'Maintain your balance with a gentle cleanser and SPF.' },
        'Healthy / Normal': { query: 'gentle daily face wash normal skin india', tip: 'Keep your healthy skin protected with a good SPF routine.' },
        'Dark Circles':  { query: 'dark circle removal under eye cream india', tip: 'Caffeine or retinol eye creams can lighten dark circles.' },
        'Pigmentation':  { query: 'pigmentation removal face cream india', tip: 'Alpha-arbutin or kojic acid serums work well on pigmentation.' },
        'Wrinkles':      { query: 'anti aging wrinkle cream retinol india', tip: 'Retinol and peptide creams are proven anti-aging ingredients.' },
        'Redness':       { query: 'soothing redness relief face cream india', tip: 'Centella asiatica and green tea extracts calm redness.' },
        'Sensitive Skin':{ query: 'gentle face wash sensitive skin fragrance free india', tip: 'Stick to fragrance-free, dermatologist-tested products.' }
    };

    const mapFunc = {
        'Acne': '🧴', 'Dark Spots': '✨', 'Oiliness': '💦',
        'Dryness': '💧', 'Normal': '🌿', 'Healthy / Normal': '🌿',
        'Dark Circles': '👁️', 'Pigmentation': '🌸', 'Wrinkles': '🕰️',
        'Redness': '🌹', 'Sensitive Skin': '🤍'
    };

    results.forEach(res => {
        const info = PRODUCT_MAP[res.concern] || PRODUCT_MAP['Normal'];
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(info.query)}`;
        const emoji = mapFunc[res.concern] || '✨';

        const card = document.createElement('div');
        card.className = 'product-rec-card';
        card.innerHTML = `
            <div class="rec-card-icon">${emoji}</div>
            <div class="rec-card-body">
                <h4 class="rec-card-title">${res.concern}</h4>
                <p class="rec-card-tip">${info.tip}</p>
                <a class="shop-btn" style="text-decoration:none;" href="${amazonUrl}" target="_blank" rel="noopener noreferrer">
                    Shop on Amazon <span class="shop-arrow">→</span>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}
"""

# 3. Replace renderProdResults
old_render_prod = """function renderProdResults(data) {
    const analysis = data.analysis || {};
    const breakdown = data.ingredient_breakdown || [];
    const rawIngredients = data.ingredients || [];
    
    // 1. Score handling (0-10 scale)
    let score = typeof analysis.score === 'number' ? analysis.score : 5.0;
    if (score > 10.5) score = score / 10;
    score = Math.min(10, Math.max(0, score));

    const isGood = score >= 7.0;
    const isWarn = score >= 4.0 && score < 7.0;
    const barColor = isGood ? 'var(--success)' : isWarn ? 'var(--warning)' : 'var(--danger)';

    const title = document.getElementById('prod-result-title');
    const scoreBadge = document.getElementById('prod-score-badge');
    const desc = document.getElementById('prod-result-desc');
    const ingredients = document.getElementById('prod-ingredients-text');

    if (title) title.textContent = isGood ? "Safe for you! ✅" : isWarn ? "Use With Caution ⚠️" : "Not Recommended ❌";
    
    if (scoreBadge) {
        scoreBadge.className = `severity-badge ${isGood ? 'badge-green' : isWarn ? 'badge-yellow' : 'badge-red'}`;
        scoreBadge.textContent = `Compatibility: ${score.toFixed(1)}/10`;
    }
    
    if (desc) {
        const skinCond = (data.skin_condition || 'your skin').replace(/_/g, ' ');
        desc.textContent = analysis.recommendation || `We evaluated this product against ${skinCond}.`;
    }
    
    if (ingredients) {
        if (breakdown.length > 0) {
            ingredients.textContent = breakdown.map(i => i.name).join(', ');
        } else if (rawIngredients && rawIngredients.length > 0) {
            ingredients.textContent = rawIngredients.substring(0, 300) + (rawIngredients.length > 300 ? "..." : "");
        } else {
            ingredients.textContent = "No ingredients were reliably detected.";
        }
    }
}
"""

content = re.sub(r'function renderSkinResults\(.*?(?=function renderProdResults)', 
                 old_render_skin_results + "\n" + old_render_recs + "\n", 
                 content, flags=re.DOTALL)

content = re.sub(r'function renderProdResults\(.*?(?=function resetAnalyzer)', 
                 old_render_prod + "\n", 
                 content, flags=re.DOTALL)

with open('frontend/skinbiee.js', 'w', encoding='utf-8') as f:
    f.write(content)
