/**
 * Import extracted menu JSON into Supabase
 * Usage: node importToSupabase.js <json_file> <slug> <restaurant_name> <menu_url>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function importMenu(jsonFileOrData, slug, restaurantName, menuUrl) {
    console.log(`\n🚀 Importing menu for "${restaurantName}" (slug: ${slug})`);

    // 1. Read JSON — accept file path or direct data object
    let data;
    if (typeof jsonFileOrData === 'string') {
        data = JSON.parse(fs.readFileSync(jsonFileOrData, 'utf-8'));
    } else {
        data = jsonFileOrData;
    }
    console.log(`📂 ${data.categories.length} categories, ${data.categories.reduce((a, c) => a + c.items.length, 0)} items`);

    // 2. Create or update restaurant
    const { data: existing } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', slug)
        .single();

    let restaurantId;
    if (existing) {
        restaurantId = existing.id;
        await supabase
            .from('restaurants')
            .update({ name: restaurantName, menu_url: menuUrl, is_active: true })
            .eq('id', restaurantId);
        console.log(`✏️  Restaurant updated: ${restaurantId}`);

        // Delete existing categories and items for this restaurant
        console.log('🗑️  Cleaning old data...');
        // First get category IDs
        const { data: oldCats } = await supabase
            .from('menu_categories')
            .select('id')
            .eq('restaurant_id', restaurantId);

        if (oldCats && oldCats.length > 0) {
            const catIds = oldCats.map(c => c.id);
            // Delete items for these categories
            await supabase
                .from('menu_items')
                .delete()
                .in('category_id', catIds);
            // Delete categories
            await supabase
                .from('menu_categories')
                .delete()
                .eq('restaurant_id', restaurantId);
        }
        console.log('✅ Old data cleaned');
    } else {
        // Generate restaurant key
        const key = 'MAKI-2026-' + Math.random().toString(36).substr(2, 4).toUpperCase();
        const { data: newRest, error } = await supabase
            .from('restaurants')
            .insert({
                name: restaurantName,
                slug: slug,
                menu_url: menuUrl,
                restaurant_key: key,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('❌ Restaurant create error:', error.message);
            return;
        }
        restaurantId = newRest.id;
        console.log(`✅ Restaurant created: ${restaurantId} (key: ${key})`);
    }

    // 3. Normalize categories (merge similar names like "Aperatifler" and "Aperati̇fler")
    const normalizedCategories = {};
    for (const cat of data.categories) {
        // Normalize Turkish I issues and trim
        const normalKey = cat.name
            .replace(/İ/g, 'İ')  // normalize
            .replace(/i̇/g, 'i')  // combining dot
            .toLowerCase()
            .trim();

        if (!normalizedCategories[normalKey]) {
            normalizedCategories[normalKey] = {
                name: cat.name.replace(/i̇/g, 'i').replace(/İ/g, 'İ'), // Clean display name
                items: []
            };
        }
        normalizedCategories[normalKey].items.push(...cat.items);
    }

    const mergedCategories = Object.values(normalizedCategories);
    console.log(`📊 Merged to ${mergedCategories.length} unique categories (from ${data.categories.length})`);

    // 4. Build parent menu map (for hierarchical menus like FineDine)
    const parentMenuIds = {};
    for (const cat of data.categories) {
        if (cat.parentMenu && !parentMenuIds[cat.parentMenu]) {
            parentMenuIds[cat.parentMenu] = null; // will be filled after insert
        }
    }

    // Create parent categories if any
    let parentOrder = 0;
    for (const parentName of Object.keys(parentMenuIds)) {
        parentOrder++;
        const { data: parentCat, error: parentErr } = await supabase
            .from('menu_categories')
            .insert({
                restaurant_id: restaurantId,
                name: parentName,
                display_order: parentOrder,
                is_active: true,
                parent_id: null
            })
            .select()
            .single();

        if (!parentErr && parentCat) {
            parentMenuIds[parentName] = parentCat.id;
            console.log(`  📁 Üst kategori: ${parentName}`);
        }
    }

    const hasParents = Object.keys(parentMenuIds).length > 0;

    // 5. Insert categories and items
    let totalItems = 0;
    let sortOrder = parentOrder;

    for (const cat of mergedCategories) {
        sortOrder++;
        const parentId = cat.parentMenu ? parentMenuIds[cat.parentMenu] : null;
        const { data: newCat, error: catErr } = await supabase
            .from('menu_categories')
            .insert({
                restaurant_id: restaurantId,
                name: cat.name,
                display_order: sortOrder,
                is_active: true,
                parent_id: parentId
            })
            .select()
            .single();

        if (catErr) {
            console.error(`❌ Category "${cat.name}" error:`, catErr.message);
            continue;
        }

        // Dedup items within category (by name)
        const uniqueItems = [];
        const seenNames = new Set();
        for (const item of cat.items) {
            const key = (item.name || '').toLowerCase().trim();
            if (key && !seenNames.has(key)) {
                seenNames.add(key);
                uniqueItems.push(item);
            }
        }

        // Insert items in batches of 50
        const batchSize = 50;
        for (let i = 0; i < uniqueItems.length; i += batchSize) {
            const batch = uniqueItems.slice(i, i + batchSize).map((item, idx) => ({
                restaurant_id: restaurantId,
                category_id: newCat.id,
                name: item.name || 'İsimsiz',
                price: parseFloat(item.price) || 0,
                description: item.description || '',
                is_available: true,
                display_order: i + idx + 1
            }));

            const { error: itemErr } = await supabase
                .from('menu_items')
                .insert(batch);

            if (itemErr) {
                console.error(`  ❌ Items batch error in "${cat.name}":`, itemErr.message);
            }
        }

        totalItems += uniqueItems.length;
        console.log(`  ✅ ${cat.name}: ${uniqueItems.length} items`);
    }

    console.log(`\n🎉 Import complete!`);
    console.log(`   Restaurant: ${restaurantName} (${slug})`);
    console.log(`   Categories: ${mergedCategories.length}`);
    console.log(`   Items: ${totalItems}`);
    console.log(`   Menu URL: ${menuUrl}`);
}

// Export for programmatic use
module.exports = { importMenu };

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log('Usage: node importToSupabase.js <json_file> <slug> <restaurant_name> <menu_url>');
        console.log('Example: node importToSupabase.js extracted_menu.json tucco "Tucco Gastro Coffee" "https://tuccogastrocoffee.com/qrmenu/"');
        process.exit(1);
    }

    importMenu(args[0], args[1], args[2], args[3]).catch(err => {
        console.error('❌ Fatal:', err.message);
        process.exit(1);
    });
}
