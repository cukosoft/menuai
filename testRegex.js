// Test script to find which regex destroys img tags
const axios = require('axios');
const zlib = require('zlib');

(async () => {
    const r = await axios.get('https://tuccogastrocoffee.com/qrmenu/', {
        responseType: 'arraybuffer',
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html',
            'Accept-Language': 'tr-TR,tr',
            'Accept-Encoding': 'gzip, deflate, br'
        },
        maxRedirects: 5,
        timeout: 15000
    });

    let buf = r.data;
    const enc = r.headers['content-encoding'] || '';
    if (enc === 'gzip') buf = zlib.gunzipSync(buf);
    else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
    else if (enc === 'deflate') buf = zlib.inflateSync(buf);

    let html = buf.toString('utf-8');
    console.log('=== STEP 0: Raw HTML ===');
    console.log('Length:', html.length);
    console.log('img tags:', (html.match(/<img/g) || []).length);
    console.log('Page-N:', (html.match(/Page-\d+/g) || []).length);

    // Step 1: lazy fix
    let html1 = html.replace(/\s+loading\s*=\s*["']lazy["']/gi, '');
    html1 = html1.replace(/\s+decoding\s*=\s*["']async["']/gi, '');
    html1 = html1.replace(/sizes\s*=\s*["']auto,\s*/gi, 'sizes="');
    console.log('\n=== STEP 1: After lazy fix ===');
    console.log('img tags:', (html1.match(/<img/g) || []).length);

    // Step 2: path rewrite
    var proxyBase = '/p/tucco';
    let html2 = html1.replace(/(src|href|action)=(["'])\/((?!\/|p\/|api\/menu)[^"']*)\2/gi, function (match, attr, q, path) {
        return attr + '=' + q + proxyBase + '/' + path + q;
    });
    console.log('\n=== STEP 2: After path rewrite ===');
    console.log('img tags:', (html2.match(/<img/g) || []).length);

    // Find sample img to show what happened
    const firstPageImg = html.match(/<img[^>]*Page-6[^>]*>/);
    if (firstPageImg) {
        console.log('\n=== Original Page-6 img ===');
        console.log(firstPageImg[0].substring(0, 300));
    }

    const afterPageImg = html2.match(/<img[^>]*Page-6[^>]*>/);
    if (afterPageImg) {
        console.log('\n=== After-rewrite Page-6 img ===');
        console.log(afterPageImg[0].substring(0, 300));
    } else {
        // Search for Page-6 in any context
        const idx = html2.indexOf('Page-6');
        if (idx >= 0) {
            console.log('\n=== Page-6 context in rewritten HTML ===');
            console.log(html2.substring(Math.max(0, idx - 200), idx + 200));
        } else {
            console.log('\nPage-6 NOT FOUND in rewritten HTML!');
        }
    }
})();
