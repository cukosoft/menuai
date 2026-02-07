/**
 * MenüAi - Supabase Test Script
 * Veritabanı bağlantısını ve tablo yapısını test eder
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
    console.log('\n🔍 MenüAi Supabase Test\n');
    console.log('='.repeat(50));

    // 1. Environment Check
    console.log('\n📋 Environment Variables:');
    console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set (' + process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...)' : '❌ Missing'}`);

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.log('\n❌ Missing environment variables. Check .env file.');
        return;
    }

    // 2. Connection Test
    console.log('\n🔌 Testing Connection...');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // 3. Table Tests
    const tables = ['restaurants', 'menu_categories', 'menu_items', 'menu_parse_logs'];

    for (const table of tables) {
        try {
            const { data, error, count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error) {
                if (error.message.includes('does not exist')) {
                    console.log(`   ❌ ${table}: Table not found`);
                } else if (error.message.includes('Invalid API key')) {
                    console.log(`   ❌ ${table}: Invalid API Key`);
                } else {
                    console.log(`   ⚠️ ${table}: ${error.message}`);
                }
            } else {
                console.log(`   ✅ ${table}: OK (${count || 0} records)`);
            }
        } catch (e) {
            console.log(`   ❌ ${table}: ${e.message}`);
        }
    }

    // 4. Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n📖 Eğer tablolar bulunamazsa:');
    console.log('   1. Supabase Dashboard > SQL Editor açın');
    console.log('   2. supabase_schema.sql dosyasının içeriğini kopyalayın');
    console.log('   3. SQL Editor\'da çalıştırın');
    console.log('\n📖 Eğer API Key geçersizse:');
    console.log('   1. Supabase Dashboard > Settings > API');
    console.log('   2. "anon public" key\'i kopyalayın');
    console.log('   3. .env dosyasındaki SUPABASE_ANON_KEY değerini güncelleyin\n');
}

testSupabase();
