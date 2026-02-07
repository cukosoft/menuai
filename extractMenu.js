/**
 * MPS27 Menüyü Universal Extractor ile çek ve Supabase'e kaydet
 */
require('dotenv').config();
const UniversalMenuExtractor = require('./universalExtractor');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

(async () => {
    try {
        console.log('=== UNIVERSAL EXTRACTOR TEST — MPS27 ===\n');

        // 1. Menüyü çek
        const extractor = new UniversalMenuExtractor({ verbose: true });
        const menuData = await extractor.extract('https://mps27.mobresposmenu.com.tr/?id=MP422');

        console.log('\n=== EXTRACT SONUCU ===');
        console.log('Toplam:', menuData.totalItems, 'urun');
        menuData.categories.forEach(c => {
            console.log(' ', c.name, ':', c.items.length, 'urun');
        });

        // 2. Supabase temizle
        console.log('\nSupabase temizleniyor...');
        const rest = await supabase.from('restaurants').select('id').eq('slug', 'mps27').single();
        if (!rest.data) {
            console.error('Restaurant bulunamadi!');
            process.exit(1);
        }
        const restaurantId = rest.data.id;
        await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);
        await supabase.from('menu_categories').delete().eq('restaurant_id', restaurantId);

        // 3. Supabase'e kaydet
        let itemCount = 0;
        for (let ci = 0; ci < menuData.categories.length; ci++) {
            const catData = menuData.categories[ci];

            const catResult = await supabase.from('menu_categories').insert({
                restaurant_id: restaurantId,
                name: catData.name,
                display_order: ci,
                is_active: true
            }).select().single();

            if (catResult.error) {
                console.error('Kategori hatasi:', catData.name, catResult.error.message);
                continue;
            }

            for (let ii = 0; ii < catData.items.length; ii++) {
                const item = catData.items[ii];
                const r = await supabase.from('menu_items').insert({
                    restaurant_id: restaurantId,
                    category_id: catResult.data.id,
                    name: item.name,
                    price: item.price,
                    description: item.description || '',
                    is_available: true,
                    display_order: ii
                });
                if (!r.error) itemCount++;
                else console.error('  Urun hatasi:', item.name, r.error.message);
            }
            console.log(`  [OK] ${catData.name}: ${catData.items.length} urun`);
        }

        console.log(`\n=== SUPABASE KAYIT TAMAMLANDI: ${itemCount} urun ===`);

        // 4. JSON'a da kaydet (yedek)
        const fs = require('fs');
        fs.writeFileSync('extracted_menu_mps27.json', JSON.stringify(menuData, null, 2), 'utf8');
        console.log('JSON yedek kaydedildi: extracted_menu_mps27.json');

    } catch (e) {
        console.error('HATA:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
})();
