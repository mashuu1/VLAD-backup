const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://services.adnu.edu.ph/college');
    await page.waitForTimeout(3000);
    
    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync('kaizen_html.txt', html);
    
    console.log('Saved kaizen HTML to kaizen_html.txt');
    await browser.close();
})();
