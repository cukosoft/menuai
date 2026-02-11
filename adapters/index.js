/**
 * Adapter Registry
 * URL'e bakarak doğru menü çıkarma adaptörünü seçer
 * 
 * Yeni platform desteği eklemek için:
 * 1. adapters/ altına yeniAdapter.js oluştur (canHandle + extract)
 * 2. Bu dosyadaki ADAPTERS listesine ekle
 */

const mobrespos = require('./mobresposAdapter');
const finedine = require('./finedineAdapter');
const staticMenu = require('./staticMenuAdapter');

// Sıralama önemli! staticMenu her zaman true döner (fallback)
const ADAPTERS = [
    mobrespos,
    finedine,
    staticMenu, // ← fallback, en sona koy
];

/**
 * URL'e göre doğru adaptörü seç
 * @param {string} url - Menü URL'i
 * @returns {{ NAME: string, extract: function }}
 */
function detectAdapter(url) {
    for (const adapter of ADAPTERS) {
        if (adapter.canHandle(url)) {
            return adapter;
        }
    }
    // Buraya düşmemeli — staticMenu fallback
    return staticMenu;
}

module.exports = { detectAdapter, ADAPTERS };
