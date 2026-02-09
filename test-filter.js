const axios = require('axios');

async function test() {
    const r = await axios.get('https://tuccogastrocoffee.com/qrmenu/');
    const html = r.data;

    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    const allUrls = new Set();

    let m;
    while ((m = imgRegex.exec(html)) !== null) allUrls.add(m[1]);
    while ((m = srcsetRegex.exec(html)) !== null) {
        m[1].split(',').map(s => s.trim()).forEach(p => {
            const [u] = p.split(/\s+/);
            if (u) allUrls.add(u);
        });
    }

    const exts = ['.webp', '.jpg', '.jpeg', '.png'];
    const filtered = [...allUrls].filter(u => {
        const l = u.toLowerCase();
        return exts.some(e => l.includes(e)) && !l.includes('logo') && !l.includes('icon');
    });

    console.log('Ham görsel:', filtered.length);

    // Dedup — scaled her zaman kazanır
    const deduped = new Map();
    filtered.forEach(u => {
        const base = u.replace(/-scaled/, '').replace(/-\d+x\d+/, '');
        const ex = deduped.get(base);
        if (!ex) {
            deduped.set(base, u);
        } else if (u.includes('scaled') && !ex.includes('scaled')) {
            deduped.set(base, u);
        }
    });

    const result = [...deduped.values()].sort((a, b) => {
        const na = (a.match(/Page-(\d+)/i) || [, '999'])[1];
        const nb = (b.match(/Page-(\d+)/i) || [, '999'])[1];
        return parseInt(na) - parseInt(nb);
    });

    const scaled = result.filter(u => u.includes('scaled')).length;
    const small = result.filter(u => !u.includes('scaled')).length;

    console.log('Filtre sonrası:', result.length);
    console.log('  Scaled (net):', scaled);
    console.log('  Küçük:', small);
    console.log('\nÖrnekler:');
    result.forEach(u => console.log('  ' + u.split('/').pop()));
}

test().catch(console.error);
