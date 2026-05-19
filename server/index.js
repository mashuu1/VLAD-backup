const VERSION = "1.2.0";
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
require('dotenv').config();
const HEADLESS = process.env.HEADLESS !== 'false';
const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

chromium.use(stealth);

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// We no longer need the long URL! We will navigate directly to MyAdNU and let Playwright click the button!
const GOOGLE_LOGIN_URL = 'https://services.adnu.edu.ph/myadnu/';

// Hold references at module scope for scraping
let activeBrowser = null;
let activeOfferingsPage = null;

// Store GBox credentials for KAIZEN reuse
let storedCredentials = { email: null, password: null };

let scrapeState = {
    status: 'idle',
    currentPage: 0,
    totalEntries: 0,
    entries: [],
    error: null,
    lastScrapeTime: null,
};

let passiveInterval = null;
const PASSIVE_SCRAPE_INTERVAL_MS = 120000; // 2 minutes

// KAIZEN state
let activeCollegePage = null;
let kaizenState = {
    status: 'idle',       // 'idle' | 'authenticating' | 'scraping_advisement' | 'scraping_curriculum' | 'done' | 'error'
    advisedSubjects: [],  // array of subject code strings
    electiveOptions: [],  // array of { no, subject_code, subject_title, units, credited }
    error: null,
    lastScrapeTime: null,
};

// Persistence Layer removed per user request for fresh debug state on restart

// =============================================
// UNIT OVERRIDES — Fix subjects whose units are misreported (0) on the portal
// Key: course_code (exact match), Value: correct unit count
// =============================================
const UNIT_OVERRIDES = {
    'CRCP202': 1.5, // College Reading Program 4
    'CRCP201': 1.5, // College Reading Program 3
    'CRCP102': 1.5, // College Reading Program 2
    'CRCP101': 1.5, // College Reading Program 1
    'THEN100': 3,   // Introduction to the Catholic Faith
    'CBAR101': 3,   // Fundamentals of Business
    'CIFP102': 1.5, // ADNU's Social Mission and Formation
};

// Apply unit overrides to a list of offerings
function applyUnitOverrides(entries) {
    let fixCount = 0;
    entries.forEach(e => {
        const code = e.course_code?.trim().toUpperCase();
        if (code && UNIT_OVERRIDES[code] !== undefined && (e.units === 0 || e.units === '0' || !e.units)) {
            e.units = UNIT_OVERRIDES[code];
            fixCount++;
        }
    });
    if (fixCount > 0) {
        console.log(`[Unit Overrides] Corrected units for ${fixCount} entries.`);
    }
    return entries;
}

// Phase 2: Extract One Table Page

async function extractTablePage(offeringsPage, workerState) {
    if (!workerState) workerState = { code: '', title: '', units: 0, section: '' };

    await offeringsPage.waitForSelector('table tbody tr', { timeout: 10000 });
    const rows = await offeringsPage.locator('table tbody tr').all();
    const results = [];

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 3) continue; // Minimum cells for a schedule row

        const texts = await Promise.all(cells.map(c => c.innerText()));
        
        // If it's a full row (typically 8+ columns)
        if (texts.length >= 7) {
            const code = texts[0] ? texts[0].trim() : '';
            const title = texts[1] ? texts[1].trim() : '';
            const unitsStr = texts[2] ? texts[2].trim() : '0';
            const section = texts[3] ? texts[3].trim() : '';

            // Update last known course info if this row has them
            if (code) {
                workerState.code = code;
                workerState.title = title;
                workerState.units = parseInt(unitsStr, 10) || 0;
                workerState.section = section;
            }

            results.push({
                course_code: workerState.code,
                title: workerState.title,
                units: workerState.units,
                section: workerState.section,
                schedule_raw: texts[4] ? texts[4].trim() : '',
                room: texts[5] ? texts[5].trim() : '',
                instructor: texts[6] ? texts[6].trim() : '',
                open_slots: texts[7] ? texts[7].trim() : ''
            });
        } else {
            // It's a partial/sub-row (likely a Lab session under a Lec)
            results.push({
                course_code: workerState.code,
                title: workerState.title,
                units: workerState.units,
                section: workerState.section,
                schedule_raw: texts[texts.length - 4] || '',
                room: texts[texts.length - 3] || '',
                instructor: texts[texts.length - 2] || '',
                open_slots: texts[texts.length - 1] || ''
            });
        }
    }
    return results;
}


app.post('/api/sync-gbox', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    // Store credentials for KAIZEN reuse
    storedCredentials = { email, password };

    try {
        console.log(`[Phase 2] Launching internal Playwright Engine for ${email}...`);
        
        // Launch Playwright with the new headless mode for better performance on Windows
        const browser = await chromium.launch({ headless: HEADLESS });
        const context = await browser.newContext();
        const page = await context.newPage(); // This is the FIRST Tab

        // Navigate directly to the MyAdNU Login URL
        console.log(`[Phase 2] Navigating to MyAdNU Portal: ${GOOGLE_LOGIN_URL}`);
        await page.goto(GOOGLE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 300000 });

        console.log(`[Phase 2] Automatically clicking the MyAdNU 'Sign In with Google' button...`);
        await page.click('a.btn-danger.btn-block');

        // Wait for the email field, type the Gbox email, and press Enter
        console.log(`[Phase 2] Waiting for email field...`);
        await page.waitForSelector('input[type="email"]', { timeout: 300000 });
        await page.fill('input[type="email"]', email);
        console.log(`[Phase 2] Typing email and pressing enter.`);
        await page.keyboard.press('Enter');

        // Wait for the password field, type the password, and press Enter
        console.log(`[Phase 2] Waiting for password field...`);
        // Use state: visible because the password input is physically on the page but often hidden until transition
        await page.waitForSelector('input[type="password"][jsname="YPqjbf"], input[type="password"][name="Passwd"]', { state: 'visible', timeout: 300000 }).catch(async () => {
            // Fallback: wait for ANY visible password field
            await page.waitForSelector('input[type="password"]:not([aria-hidden="true"])', { state: 'visible', timeout: 300000 });
        });
        
        // Add a tiny delay to appear more natural and ensure transition is complete
        await page.waitForTimeout(1500);
        
        console.log(`[Phase 2] Typing password and pressing enter.`);
        // Use the visible password field specifically
        const pwField = await page.$('input[type="password"][jsname="YPqjbf"]') || 
                         await page.$('input[type="password"][name="Passwd"]') ||
                         await page.$('input[type="password"]:not([aria-hidden="true"])');
        if (pwField) {
            await pwField.fill(password);
        } else {
            await page.fill('input[type="password"]', password);
        }
        await page.keyboard.press('Enter');

        console.log(`[Phase 3] Waiting for Google login to redirect back to services.adnu.edu.ph...`);
        // Wait for the URL to change indicating success (we specifically wait for the home dashboard!)
        await page.waitForURL('**/myadnu/index.php/home', { timeout: 300000 });
        console.log(`[Phase 3] Google Handshake completed! Landed heavily on HOME Dashboard.`);
        console.log(`[Phase 3] Waiting for SSO to fully resolve and log in...`);
        // We add a tiny network delay here to ensure MyAdNU successfully recognizes the session cookies
        await page.waitForTimeout(3000); 

        console.log(`[Phase 3] Opening a NEW TAB directly to Course Offerings...`);
        const offeringsPage = await context.newPage();
        await offeringsPage.goto('https://services.adnu.edu.ph/myadnu/index.php/offerings', { waitUntil: 'domcontentloaded' });
        
        console.log(`[Phase 3] Closing the FIRST MyAdNU tab to clean up the workspace...`);
        await page.close();
        
        console.log(`[Phase 3] Dashboard active! Sending Client Signal (200 OK) for Final Redirect.`);
        
        activeBrowser = browser;
        activeOfferingsPage = offeringsPage;

        // We will purposely leave the browser OPEN so you can see it physically running.
        res.status(200).json({ message: 'Session verified and active' });

        // Set status to scraping immediately so the frontend sees it during the redirect
        scrapeState.status = 'scraping';
        scrapeState.totalEntries = 0;
        scrapeState.currentPage = 0;
        
        // Auto-trigger the first scrape immediately after login
        console.log('[Auto-Scrape] Login successful. Triggering first scrape automatically...');
        setTimeout(() => triggerScrape(), 1000);

    } catch (error) {
        console.error('[Phase 2] Automation Error:', error);
        res.status(500).json({ error: 'Automation failed: ' + error.message });
    }
});

// Phase 3: Pagination Loop
async function scrapeAllPages(offeringsPage, onProgress) {
    let allEntries = [];
    let currentPage = 1;
    let workerState = { code: '', title: '', units: 0, section: '' };

    while (true) {
        // Scrape current page
        console.log(`[Scraper] Extracting page ${currentPage}...`);
        const entries = await extractTablePage(offeringsPage, workerState);
        allEntries.push(...entries);

        if (onProgress) onProgress(currentPage, allEntries.length);

        // Locate "Next" button
        const selectors = [
            "a:has-text('Next')",
            "button:has-text('Next')",
            "a:has-text('›')",
            "a:has-text('»')",
            ".pagination .next a",
            ".pagination li:last-child a",
            "a.page-link:has-text('Next')",
            "[aria-label='Next']",
            ".dataTables_paginate .next",
        ];

        let nextBtn = null;
        for (const sel of selectors) {
            const loc = offeringsPage.locator(sel);
            if (await loc.count() > 0) {
                nextBtn = loc.first();
                break;
            }
        }

        if (!nextBtn) break;

        // Check termination conditions
        const disabledAttr = await nextBtn.getAttribute('disabled');
        const classAttr = await nextBtn.getAttribute('class') || '';
        const parentLi = nextBtn.locator('xpath=..');
        const parentClass = await parentLi.count() > 0 ? await parentLi.getAttribute('class') || '' : '';
        const ariaDisabled = await nextBtn.getAttribute('aria-disabled');

        if (disabledAttr !== null || classAttr.includes('disabled') || parentClass.includes('disabled') || ariaDisabled === 'true') {
            break;
        }

        const oldLastRowId = entries.length > 0 ? entries[entries.length - 1].course_code + '-' + entries[entries.length - 1].section + '-' + entries[entries.length - 1].schedule_raw : null;

        await nextBtn.click();
        await offeringsPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await offeringsPage.waitForTimeout(1000); // Wait for table animation/refresh

        const newEntries = await extractTablePage(offeringsPage);
        const newLastRowId = newEntries.length > 0 ? newEntries[newEntries.length - 1].course_code + '-' + newEntries[newEntries.length - 1].section + '-' + newEntries[newEntries.length - 1].schedule_raw : null;
        
        if (oldLastRowId && newLastRowId === oldLastRowId) {
            console.log("[Scraper] Pagination loop detected stale page. Breaking.");
            break;
        }

        currentPage++;
    }
    return allEntries;
}

// Helper to optimize the table view (All Subjects + 100 per page)
async function optimizeView(page) {
    try {
        const selectLocator = page.locator('select');
        const count = await selectLocator.count();
        for (let i = 0; i < count; i++) {
            const dropdown = selectLocator.nth(i);
            const textContent = await dropdown.textContent();
            // Select "All Subjects"
            if (textContent.includes('All Subjects') || textContent.includes('Computer Science')) {
                await dropdown.selectOption({ label: 'All Subjects' });
            }
            // Select "100" records per page
            if (textContent.includes('100') && (textContent.includes('10') || textContent.includes('50'))) {
                await dropdown.selectOption('100').catch(() => dropdown.selectOption({ label: '100' }));
            }
        }
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000);
    } catch (err) {
        console.warn('[Scraper] Optimization failed for a tab:', err.message);
    }
}

// Worker to scrape a specific range of pages using fast-forward
async function scrapeChunk(page, startPage, endPage, workerId, onProgress) {
    let allEntries = [];
    let currentPage = 1;

    // Phase 1: Fast-forward to the page BEFORE the starting page
    if (startPage > 1) {
        console.log(`[Worker ${workerId}] Fast-forwarding to page ${startPage - 1}...`);
        while (currentPage < startPage - 1) {
            const nextBtn = page.locator("a:has-text('Next'), button:has-text('Next'), a:has-text('›'), .pagination .next a").first();
            if (await nextBtn.count() === 0) break;
            await nextBtn.click();
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(800);
            currentPage++;
        }
    }

    let workerState = { code: '', title: '', units: 0, section: '' };

    // Phase 1.5: Prime the state by reading the page BEFORE the starting page
    if (startPage > 1 && currentPage === startPage - 1) {
        console.log(`[Worker ${workerId}] Priming state from page ${currentPage}...`);
        // Extract but do not save to allEntries
        await extractTablePage(page, workerState); 
        
        // Click Next to reach the actual startPage
        const nextBtn = page.locator("a:has-text('Next'), button:has-text('Next'), a:has-text('›'), .pagination .next a").first();
        if (await nextBtn.count() > 0) {
            await nextBtn.click();
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1000);
        }
        currentPage++;
    }

    // Phase 2: Actual Scraping
    console.log(`[Worker ${workerId}] Starting scrape from page ${currentPage} to ${endPage}...`);
    
    let previousPageData = null;

    while (currentPage <= endPage) {
        const entries = await extractTablePage(page, workerState);
        
        // Foolproof pagination end detection: if the page data is exactly the same as the previous page,
        // it means clicking 'Next' didn't do anything, and we've hit the end of the portal.
        const currentPageData = JSON.stringify(entries);
        if (previousPageData === currentPageData) {
            console.log(`[Worker ${workerId}] Pagination end detected at page ${currentPage - 1}.`);
            break;
        }
        previousPageData = currentPageData;

        allEntries.push(...entries);
        
        if (onProgress) onProgress(allEntries.length);

        if (currentPage < endPage) {
            const nextBtn = page.locator("a:has-text('Next'), button:has-text('Next'), a:has-text('›'), .pagination .next a").first();
            if (await nextBtn.count() === 0) break;
            
            // Check if disabled
            const classAttr = await nextBtn.getAttribute('class') || '';
            const disabledAttr = await nextBtn.getAttribute('disabled');
            if (disabledAttr !== null || classAttr.includes('disabled')) break;

            await nextBtn.click();
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1000);
        }
        currentPage++;
    }
    console.log(`[Worker ${workerId}] Finished. Collected ${allEntries.length} entries.`);
    return allEntries;
}


// Phase 4: Express API Endpoints

// Reusable internal scrape trigger
async function triggerScrape() {
    if (!activeOfferingsPage) {
        console.log('[Scraper] Cannot scrape: no active offerings page.');
        return;
    }
    // Only skip if an ACTUAL scraping loop is already in progress (currentPage > 0)
    if (scrapeState.status === 'scraping' && scrapeState.currentPage > 0) {
        console.log('[Scraper] Already scraping, skipping.');
        return;
    }

    // Preserve existing entries during passive re-scrapes so the frontend still has data
    scrapeState = {
        status: 'scraping',
        currentPage: 0,
        totalEntries: 0,
        entries: scrapeState.entries,
        error: null,
        lastScrapeTime: scrapeState.lastScrapeTime,
    };

    try {
        // 1. Setup the main page (Tab 1)
        console.log('[Scraper] Navigating to offerings page (Tab 1)...');
        await activeOfferingsPage.goto('https://services.adnu.edu.ph/myadnu/index.php/offerings', { waitUntil: 'domcontentloaded' });
        const offeringsUrl = activeOfferingsPage.url();

        // 2. Open duplicate tabs (Tab 2 and Tab 3)
        const context = activeOfferingsPage.context();
        const tab2 = await context.newPage();
        const tab3 = await context.newPage();
        
        console.log('[Scraper] Opening concurrent tabs (Tab 2 & Tab 3)...');
        await Promise.all([
            tab2.goto(offeringsUrl, { waitUntil: 'domcontentloaded' }),
            tab3.goto(offeringsUrl, { waitUntil: 'domcontentloaded' })
        ]);

        // 3. Optimize all tabs (All Subjects + 100 per page)
        console.log('[Scraper] Optimizing view settings on all tabs...');
        await Promise.all([
            optimizeView(activeOfferingsPage),
            optimizeView(tab2),
            optimizeView(tab3)
        ]);

        // 4. Run Concurrent Scrape
        // No overlapping chunks needed because of the new 'priming' phase.
        console.log('[Scraper] Starting concurrent workers...');
        let capturedByWorker = [0, 0, 0];
        
        const results = await Promise.all([
            scrapeChunk(activeOfferingsPage, 1, 7, 1, (count) => {
                capturedByWorker[0] = count;
                scrapeState.totalEntries = capturedByWorker.reduce((a, b) => a + b, 0);
                scrapeState.currentPage = Math.min(25, Math.floor(scrapeState.totalEntries / 100));
            }),
            scrapeChunk(tab2, 8, 14, 2, (count) => {
                capturedByWorker[1] = count;
                scrapeState.totalEntries = capturedByWorker.reduce((a, b) => a + b, 0);
            }),
            scrapeChunk(tab3, 15, 25, 3, (count) => {
                capturedByWorker[2] = count;
                scrapeState.totalEntries = capturedByWorker.reduce((a, b) => a + b, 0);
            })
        ]);

        // 5. Cleanup extra tabs
        await tab2.close();
        await tab3.close();

        // 6. Combine results (Exact replication of single-tab scrape)
        const entries = [...results[0], ...results[1], ...results[2]];

        console.log(`[Scraper] Exact extraction completed: ${entries.length} raw rows.`);
        scrapeState.currentPage = 25; 
        scrapeState.totalEntries = entries.length;



        // Apply unit corrections for subjects the portal misreports as 0 units
        applyUnitOverrides(entries);

        scrapeState.entries = entries;
        scrapeState.totalEntries = entries.length;
        scrapeState.status = 'done';
        scrapeState.lastScrapeTime = new Date().toISOString();

        if (!fs.existsSync('./data')) fs.mkdirSync('./data');
        fs.writeFileSync('./data/offerings.json', JSON.stringify(entries, null, 2));
        console.log(`[Scraper] Done. Saved ${entries.length} entries to disk.`);

        // Sync to Supabase: Delete ONLY scraped records, preserving manually created ones
        console.log('[Scraper] Syncing to Supabase (Smart Sync)...');
        
        // Delete only non-custom (automatically scraped) entries
        await supabase.from('course_offerings').delete().eq('is_custom', false);

        // Insert in batches
        const batchSize = 100;
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize).map(e => ({
                course_code: e.course_code,
                title: e.title,
                units: e.units,
                section: e.section,
                schedule_raw: e.schedule_raw,
                room: e.room,
                instructor: e.instructor,
                open_slots: e.open_slots,
                last_updated: scrapeState.lastScrapeTime,
                is_custom: false
            }));
            const { error: syncError } = await supabase.from('course_offerings').insert(batch);
            if (syncError) console.error(`[Scraper] Batch ${i} Error:`, syncError);
        }
        
        console.log('[Scraper] Successfully synced all records to Supabase.');

        // Schedule passive re-scraping if not already running
        if (!passiveInterval) {
            console.log(`[Scraper] Starting passive background updates every ${PASSIVE_SCRAPE_INTERVAL_MS / 1000}s...`);
            passiveInterval = setInterval(() => {
                console.log('[Passive Scraper] Triggering background re-scrape...');
                triggerScrape();
            }, PASSIVE_SCRAPE_INTERVAL_MS);
        }

    } catch (err) {
        scrapeState.status = 'error';
        scrapeState.error = err.message;
        console.error(`[Scraper] Error:`, err);
    }
}

// =============================================
// DATA CLEANUP ENDPOINT
// =============================================
app.post('/api/data/clean', (req, res) => {
    console.log('[Cleanup] /api/data/clean hit. Cleaning all scraped data...');

    try {
        // 1. Stop passive scraping interval to prevent file write conflicts
        if (passiveInterval) {
            clearInterval(passiveInterval);
            passiveInterval = null;
            console.log('[Cleanup] Stopped passive scraping interval.');
        }

        // 2. Delete all files inside ./data
        const dataDir = './data';
        if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir);
            for (const file of files) {
                const filePath = `${dataDir}/${file}`;
                try {
                    fs.unlinkSync(filePath);
                    console.log(`[Cleanup] Deleted: ${filePath}`);
                } catch (unlinkErr) {
                    console.error(`[Cleanup] Failed to delete ${filePath}:`, unlinkErr.message);
                }
            }
            // Remove the directory itself, then recreate it empty
            try {
                fs.rmdirSync(dataDir);
                console.log('[Cleanup] Removed data directory.');
            } catch (rmdirErr) {
                console.warn('[Cleanup] Could not remove data directory (may still have files):', rmdirErr.message);
            }
        }

        // 3. Reset in-memory scrape state
        scrapeState = {
            status: 'idle',
            currentPage: 0,
            totalEntries: 0,
            entries: [],
            error: null,
            lastScrapeTime: null,
        };

        // 4. Reset in-memory KAIZEN state
        kaizenState = {
            status: 'idle',
            advisedSubjects: [],
            electiveOptions: [],
            error: null,
            lastScrapeTime: null,
        };

        console.log('[Cleanup] All data cleaned. States reset to idle.');
        res.json({
            ok: true,
            message: 'Data folder cleaned and all states reset to idle.',
            deletedDir: 'server/data/',
        });

    } catch (err) {
        console.error('[Cleanup] Error during cleanup:', err);
        res.status(500).json({ error: 'Cleanup failed: ' + err.message });
    }
});

// Debug health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true, hasOfferingsPage: !!activeOfferingsPage, scrapeStatus: scrapeState.status });
});

// Manual scrape trigger (kept as fallback)
app.post('/api/scrape/start', async (req, res) => {
    console.log('[Scraper] /api/scrape/start hit. activeOfferingsPage exists:', !!activeOfferingsPage);
    if (!activeOfferingsPage) return res.status(400).json({ error: 'Not authenticated. Please login with GBox first.' });
    if (scrapeState.status === 'scraping') return res.status(409).json({ error: 'Already scraping' });

    res.status(200).json({ status: 'started' });
    triggerScrape();
});

app.get('/api/scrape/status', (req, res) => {
    res.json({
        status: scrapeState.status,
        currentPage: scrapeState.currentPage,
        totalEntries: scrapeState.totalEntries,
        error: scrapeState.error,
        lastScrapeTime: scrapeState.lastScrapeTime,
    });
});

app.get('/api/scrape/data', async (req, res) => {
    // 1. Primary: Try Supabase directly (always gives freshest CRUD + scraped data)
    try {
        const { data, error } = await supabase.from('course_offerings').select('*').order('course_code', { ascending: true });
        if (!error && data && data.length > 0) {
            return res.json({ 
                source: 'supabase', 
                total: data.length, 
                entries: data,
                offerings: data 
            });
        }
    } catch (err) {
        console.error('[API] Supabase primary fetch failed, falling back to memory:', err);
    }

    // 2. Fallback: Try live memory data
    if (scrapeState.entries && scrapeState.entries.length > 0) {
        return res.json({ 
            source: 'live', 
            total: scrapeState.entries.length, 
            entries: scrapeState.entries,
            offerings: scrapeState.entries 
        });
    }

    res.status(404).json({ error: 'No data available. Scrape might be in progress.' });
});

// =============================================
// DATABASE CRUD ENDPOINTS
// =============================================

// CREATE a manual course offering
app.post('/api/offerings', async (req, res) => {
    try {
        const newRecord = {
            ...req.body,
            is_custom: true, // Mark as custom to protect from scraper deletion
            last_updated: new Date().toISOString()
        };
        const { data, error } = await supabase.from('course_offerings').insert([newRecord]).select();
        if (error) throw error;
        
        // Update in-memory state
        if (data && data[0]) {
            scrapeState.entries.push(data[0]);
            scrapeState.totalEntries = scrapeState.entries.length;
        }
        
        res.status(201).json({ success: true, data: data[0] });
    } catch (err) {
        console.error('[CRUD] Error creating offering:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE a course offering
app.put('/api/offerings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedFields = {
            ...req.body,
            last_updated: new Date().toISOString()
        };
        const { data, error } = await supabase.from('course_offerings').update(updatedFields).eq('id', id).select();
        if (error) throw error;
        
        // Update in-memory state
        if (data && data[0]) {
            const idx = scrapeState.entries.findIndex(e => String(e.id) === String(id));
            if (idx !== -1) {
                scrapeState.entries[idx] = data[0];
            }
        }
        
        res.json({ success: true, data: data[0] });
    } catch (err) {
        console.error('[CRUD] Error updating offering:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE a course offering
app.delete('/api/offerings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('course_offerings').delete().eq('id', id);
        if (error) throw error;
        
        // Update in-memory state
        scrapeState.entries = scrapeState.entries.filter(e => String(e.id) !== String(id));
        scrapeState.totalEntries = scrapeState.entries.length;
        
        res.json({ success: true, message: 'Offering deleted successfully' });
    } catch (err) {
        console.error('[CRUD] Error deleting offering:', err);
        res.status(500).json({ error: err.message });
    }
});

// CREATE manual student advisement subject
app.post('/api/advisement', async (req, res) => {
    try {
        const newRecord = {
            ...req.body,
            is_custom: true
        };
        const { data, error } = await supabase.from('student_advisement').insert([newRecord]).select();
        if (error) throw error;
        
        // Update in-memory state
        if (data && data[0]) {
            if (!kaizenState.advisedSubjects.includes(data[0].subject_code)) {
                kaizenState.advisedSubjects.push(data[0].subject_code);
            }
        }
        res.status(201).json({ success: true, data: data[0] });
    } catch (err) {
        console.error('[CRUD] Error creating advisement:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE manual student advisement subject
app.delete('/api/advisement/:subject_code', async (req, res) => {
    try {
        const { subject_code } = req.params;
        const { error } = await supabase.from('student_advisement').delete().eq('subject_code', subject_code);
        if (error) throw error;
        
        // Update in-memory state
        kaizenState.advisedSubjects = kaizenState.advisedSubjects.filter(c => c !== subject_code);
        
        res.json({ success: true, message: 'Advisement subject deleted successfully' });
    } catch (err) {
        console.error('[CRUD] Error deleting advisement:', err);
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// KAIZEN ENDPOINTS
// =============================================

const COLLEGE_URL = 'https://services.adnu.edu.ph/college';

app.post('/api/kaizen/start', async (req, res) => {
    if (!storedCredentials.email || !storedCredentials.password) {
        return res.status(400).json({ error: 'No GBox credentials stored. Please login to VLAD first.' });
    }
    if (kaizenState.status !== 'idle' && kaizenState.status !== 'done' && kaizenState.status !== 'error') {
        return res.status(409).json({ error: 'KAIZEN is already running.' });
    }

    kaizenState = { status: 'authenticating', advisedSubjects: [], electiveOptions: [], error: null };
    res.status(200).json({ status: 'started' });

    // Run the entire KAIZEN pipeline async
    (async () => {
        try {
            // === PHASE 1: Authenticate into College Portal ===
            console.log(`[KAIZEN Phase 1] Launching automated browser for ${storedCredentials.email}...`);
            
            // Run with headless: false to physically monitor the automated flow
            const browser = await chromium.launch({ 
                headless: HEADLESS,
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            const context = await browser.newContext();
            const page = await context.newPage();
            
            // --- SESSION RIDE STRATEGY ---
            // 1. Establish a global Google SSO session using the robust MyAdNU login portal
            console.log(`[KAIZEN Phase 1] Establishing Global SSO Session via MyAdNU...`);
            await page.goto('https://services.adnu.edu.ph/myadnu/', { waitUntil: 'domcontentloaded', timeout: 300000 });
            await page.click('a.btn-danger.btn-block');

            // Enter Google credentials
            await page.waitForSelector('input[type="email"]', { timeout: 300000 });
            await page.fill('input[type="email"]', storedCredentials.email);
            await page.keyboard.press('Enter');

            await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 300000 });
            await page.waitForTimeout(1000);
            await page.fill('input[type="password"]', storedCredentials.password);
            await page.keyboard.press('Enter');

            console.log(`[KAIZEN Phase 1] Waiting for MyAdNU login success...`);
            await page.waitForURL('**/myadnu/index.php/home', { timeout: 300000 });
            
            // 2. Navigate to Kaizen Homepage & use POPUP INTERCEPTION strategy
            console.log(`[KAIZEN Phase 1] SSO Session Active! Navigating to Kaizen Homepage...`);
            
            await page.goto(COLLEGE_URL, { waitUntil: 'domcontentloaded', timeout: 300000 });
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForTimeout(3000); // Let Google's GSI script fully initialize

            console.log('[KAIZEN Phase 1] Page loaded. Setting up popup trap and clicking Sign-In...');
            
            // Set up the popup trap BEFORE clicking. When the Google iframe button is clicked,
            // it opens a popup window. Playwright catches it at the browser level.
            const popupPromise = page.waitForEvent('popup', { timeout: 300000 }).catch(() => null);
            
            let clickSucceeded = false;

            // 1. Ensure the accordion is actually open. 
            // We check if #divSignIn_2 has the 'in' class.
            try {
                const isAccordionOpen = await page.evaluate(() => {
                    const panel = document.querySelector('#divSignIn_2');
                    return panel && panel.classList.contains('in');
                });
                
                if (!isAccordionOpen) {
                    console.log('[KAIZEN Phase 1] Google Sign-In accordion appears closed. Opening it...');
                    await page.click('a[href="#divSignIn_2"]', { force: true, timeout: 3000 });
                    await page.waitForTimeout(2000);
                } else {
                    console.log('[KAIZEN Phase 1] Google Sign-In accordion is already open.');
                }
            } catch(e) {
                console.log('[KAIZEN Phase 1] Could not determine accordion state.');
            }

            // 2. Scroll the button into view
            try {
                await page.evaluate(() => {
                    const btn = document.querySelector('.g_id_signin');
                    if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                });
                await page.waitForTimeout(1000);
            } catch (e) {}

            // 3. Click the Google Sign-In button
            // The GSI button is rendered as HTML inside .g_id_signin, not necessarily inside an iframe
            try {
                console.log('[KAIZEN Phase 1] Attempting to click the HTML GSI button...');
                await page.click('.g_id_signin div[role="button"]', { force: true, timeout: 5000 });
                clickSucceeded = true;
                console.log('[KAIZEN Phase 1] Clicked Google Sign-In HTML button!');
            } catch(e) {
                console.log('[KAIZEN Phase 1] HTML button click failed. Trying fallback...');
            }

            // 4. Fallback: Direct click on .g_id_signin
            if (!clickSucceeded) {
                try {
                    await page.click('.g_id_signin', { force: true, timeout: 5000 });
                    clickSucceeded = true;
                    console.log('[KAIZEN Phase 1] Clicked .g_id_signin directly!');
                } catch(e) {
                    console.log('[KAIZEN Phase 1] Direct .g_id_signin click also failed.');
                }
            }

            // Wait for the popup window to appear
            const popup = await popupPromise;
            
            if (popup) {
                console.log(`[KAIZEN Phase 1] Popup intercepted! URL: ${popup.url().substring(0, 100)}...`);
                
                // DO NOT close the popup. Google Identity Services relies on postMessage from the popup
                // to the parent window. If we close it and redirect the parent, the flow breaks.
                console.log('[KAIZEN Phase 1] Interacting with the popup directly...');
                
                try {
                    await popup.waitForLoadState('domcontentloaded');
                    
                    const currentUrl = popup.url();
                    if (currentUrl.includes('accounts.google.com')) {
                        console.log('[KAIZEN Phase 1] Account Chooser in popup. Selecting GBox profile...');
                        try {
                            await popup.waitForSelector('text=/@gbox\\.adnu\\.edu\\.ph/i', { timeout: 10000 });
                            await popup.click('text=/@gbox\\.adnu\\.edu\\.ph/i');
                            console.log('[KAIZEN Phase 1] Clicked GBox profile in popup!');
                        } catch(e) {
                            try {
                                await popup.click('div[data-identifier]', { timeout: 5000 });
                                console.log('[KAIZEN Phase 1] Clicked default account profile in popup!');
                            } catch(e2) {
                                console.log('[KAIZEN Phase 1] Could not find any account to click in popup.');
                            }
                        }
                    } else {
                        console.log(`[KAIZEN Phase 1] Popup is at URL: ${currentUrl.substring(0, 80)}`);
                    }
                    
                    console.log('[KAIZEN Phase 1] Waiting for Google Sign-In to complete and popup to close automatically...');
                } catch(err) {
                    console.log('[KAIZEN Phase 1] Error interacting with popup:', err.message);
                }
            } else {
                console.log('[KAIZEN Phase 1] No popup appeared. Checking if already redirected...');
            }

            console.log('[KAIZEN Phase 1] Waiting for final Kaizen Home redirect...');
            try {
                await page.waitForURL('**/college/home', { timeout: 45000 });
                console.log('[KAIZEN Phase 1] Automated login successful! Reached Home Page.');
            } catch (err) {
                throw new Error(`Automated login timed out. Main page URL is currently: ${page.url()}`);
            }


            console.log('[KAIZEN Phase 1] Proceeding to automated scraping...');
            
            await page.waitForTimeout(2000);
            console.log('[KAIZEN Phase 1] College portal authenticated and Home reached!');

            activeCollegePage = page;

            // === PHASE 2: Scrape Advisement ===
            kaizenState.status = 'scraping_advisement';
            console.log('[KAIZEN Phase 2] Navigating to Advisement page...');
            await page.goto('https://services.adnu.edu.ph/college/student/advisement', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Scrape the advised subject codes
            console.log('[KAIZEN Phase 2] Scraping advised subjects...');
            const advisedSubjects = await page.evaluate(() => {
                const subjects = [];
                // Look for subject entries — they appear as bold text or links with subject codes
                const elements = document.querySelectorAll('.list-group-item, .card-body .row, [class*="subject"], [class*="advise"]');
                elements.forEach(el => {
                    const text = el.textContent.trim();
                    // Match subject codes like CSEC001, CSMC312, PHRE03, THEN102, etc.
                    const codeMatch = text.match(/^([A-Z]{2,6}\d{2,4}[A-Za-z]?)/);
                    if (codeMatch) {
                        subjects.push(codeMatch[1]);
                    }
                });
                
                // Fallback: try to find bold/strong elements that look like subject codes
                if (subjects.length === 0) {
                    const bolds = document.querySelectorAll('b, strong, .fw-bold, h6, h5');
                    bolds.forEach(el => {
                        const text = el.textContent.trim();
                        const codeMatch = text.match(/^([A-Z]{2,6}\d{2,4}[A-Za-z]?)$/);
                        if (codeMatch) {
                            subjects.push(codeMatch[1]);
                        }
                    });
                }
                
                // Ultimate fallback: scan all text nodes for subject code patterns
                if (subjects.length === 0) {
                    const allText = document.body.innerText;
                    const matches = allText.match(/[A-Z]{2,6}\d{2,4}[A-Za-z]?/g);
                    if (matches) {
                        // Deduplicate
                        const unique = [...new Set(matches)];
                        subjects.push(...unique);
                    }
                }
                
                return subjects;
            });

            kaizenState.advisedSubjects = [...new Set(advisedSubjects)]; // deduplicate
            console.log(`[KAIZEN Phase 2] Found ${kaizenState.advisedSubjects.length} advised subjects:`, kaizenState.advisedSubjects);

            // === PHASE 3: Scrape Curriculum (Electives) ===
            kaizenState.status = 'scraping_curriculum';
            console.log('[KAIZEN Phase 3] Navigating to Curriculum page...');
            await page.goto('https://services.adnu.edu.ph/college/student/curriculum', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);

            console.log('[KAIZEN Phase 3] Searching for specifically the "Options for Elective Subjects" table...');
            
            const electiveOptions = await page.evaluate(() => {
                const results = [];
                const allTables = Array.from(document.querySelectorAll('table'));
                
                console.log(`[DEBUG] Found ${allTables.length} tables total on this page.`);
                
                // Find the table that contains "Elective" and looks like our target
                let targetTable = allTables.find(t => {
                    const txt = t.innerText || '';
                    return (txt.includes('Options for Elective Subjects') || 
                           (txt.includes('Elective') && txt.includes('Subject Code')));
                });
                
                // Fallback to 10th table (index 9) if text search fails
                if (!targetTable && allTables.length >= 10) {
                    targetTable = allTables[9];
                }

                if (targetTable) {
                    // Log for debugging in terminal (via page.on('console') if enabled)
                    const rows = targetTable.querySelectorAll('tbody tr');
                    for (const row of rows) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 4) {
                            results.push({
                                no: cells[0] ? cells[0].textContent.trim() : '',
                                subject_code: cells[1] ? cells[1].textContent.trim() : '',
                                subject_title: cells[2] ? cells[2].textContent.trim() : '',
                                units: cells[3] ? cells[3].textContent.trim() : '',
                                credited: cells[4] ? cells[4].textContent.trim() : '',
                            });
                        }
                    }
                } else {
                    return { error: 'TABLE_NOT_FOUND', tableCount: allTables.length, headers: allTables.map(t => t.innerText.substring(0, 50)) };
                }
                return results;
            });
            
            if (electiveOptions.error) {
                console.log('[KAIZEN Phase 3] ERROR: Could not find Elective Table. Table summaries:', electiveOptions.headers);
                kaizenState.electiveOptions = [];
            } else {
                kaizenState.electiveOptions = electiveOptions;
                console.log(`[KAIZEN Phase 3] Successfully scraped ${electiveOptions.length} elective options.`);
            }

            console.log(`[KAIZEN Phase 3] Found ${kaizenState.electiveOptions.length} curriculum entries.`);

            kaizenState.lastScrapeTime = new Date().toISOString();
            kaizenState.status = 'done';

            // Persist to disk
            if (!fs.existsSync('./data')) fs.mkdirSync('./data');
            fs.writeFileSync('./data/advisement.json', JSON.stringify({
                advisedSubjects: kaizenState.advisedSubjects,
                electiveOptions: kaizenState.electiveOptions,
                lastScrapeTime: kaizenState.lastScrapeTime
            }, null, 2));

            console.log('[KAIZEN] All phases complete! Saved to disk.');

            // Sync to Supabase
            console.log('[KAIZEN] Syncing to Supabase (Smart Sync)...');
            
            // 1. Sync Advisement
            if (kaizenState.advisedSubjects.length > 0) {
                // Clear only automatically scraped advisement (is_custom = false)
                await supabase.from('student_advisement').delete().eq('is_custom', false);
                await supabase.from('student_advisement').insert(
                    kaizenState.advisedSubjects.map(code => ({ subject_code: code, is_custom: false }))
                );
            }

            // 2. Sync Electives
            if (kaizenState.electiveOptions.length > 0) {
                // Clear only automatically scraped electives (is_custom = false)
                await supabase.from('elective_options').delete().eq('is_custom', false);
                await supabase.from('elective_options').insert(
                    kaizenState.electiveOptions.map(e => ({
                        subject_code: e.subject_code,
                        subject_title: e.subject_title,
                        units: e.units,
                        credited: e.credited,
                        is_custom: false
                    }))
                );
            }
            console.log('[KAIZEN] Successfully synced to Supabase.');

        } catch (err) {
            kaizenState.status = 'error';
            kaizenState.error = err.message;
            console.error('[KAIZEN] Error:', err);
        }
    })();
});

// NEW: Test Mode Bypass
app.post('/api/kaizen/bypass', (req, res) => {
    console.log('[KAIZEN Bypass] Test Mode Activated. Loading local data or defaults...');
    
    try {
        if (fs.existsSync('./data/advisement.json')) {
            const saved = JSON.parse(fs.readFileSync('./data/advisement.json', 'utf8'));
            kaizenState.advisedSubjects = saved.advisedSubjects;
            kaizenState.electiveOptions = saved.electiveOptions;
        } else {
            // Default Test Data
            kaizenState.advisedSubjects = ['COMP301', 'CSEC312', 'COMP302', 'MATH301', 'THEN101', 'PE03'];
            kaizenState.electiveOptions = [
                { no: '1', subject_code: 'CSEC312', subject_title: 'Cloud Computing', units: '3', credited: 'No' },
                { no: '2', subject_code: 'CSEC313', subject_title: 'Mobile App Dev', units: '3', credited: 'No' }
            ];
        }
        
        kaizenState.status = 'done';
        kaizenState.lastScrapeTime = new Date().toISOString();
        res.json({ status: 'done', advisedSubjects: kaizenState.advisedSubjects });
    } catch (err) {
        res.status(500).json({ error: 'Bypass failed: ' + err.message });
    }
});

app.get('/api/kaizen/status', (req, res) => {
    res.json({
        status: kaizenState.status,
        advisedCount: kaizenState.advisedSubjects.length,
        electiveCount: kaizenState.electiveOptions.length,
        error: kaizenState.error,
        lastScrapeTime: kaizenState.lastScrapeTime,
    });
});

app.get('/api/kaizen/data', async (req, res) => {
    // 1. Primary: Try Supabase directly (always gives freshest CRUD + scraped data)
    try {
        const { data: advData, error: advError } = await supabase.from('student_advisement').select('*');
        const { data: elecData, error: elecError } = await supabase.from('elective_options').select('*');
        
        if (!advError && !elecError && advData && elecData && (advData.length > 0 || elecData.length > 0)) {
            const advised = advData.map(d => d.subject_code);
            const electives = elecData.map(e => ({
                no: e.id,
                subject_code: e.subject_code,
                subject_title: e.subject_title,
                units: e.units,
                credited: e.credited,
                is_custom: e.is_custom
            }));
            
            return res.json({
                advisedSubjects: advised,
                electiveOptions: electives,
                lastScrapeTime: kaizenState.lastScrapeTime || new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('[API] Supabase primary fetch failed, falling back to memory:', err);
    }

    // 2. Fallback: Only return data if the user has explicitly connected (status is 'done')
    if (kaizenState.status === 'done' && (kaizenState.advisedSubjects.length > 0 || kaizenState.electiveOptions.length > 0)) {
        return res.json({
            advisedSubjects: kaizenState.advisedSubjects,
            electiveOptions: kaizenState.electiveOptions,
            lastScrapeTime: kaizenState.lastScrapeTime,
        });
    }
    res.status(404).json({ error: 'No KAIZEN data available. Please connect your Kaizen account first.' });
});

const { getDifficulty } = require('./difficulty_map');

function parseTimeStr(timeStr, ampm) {
    let [h, m] = timeStr.split(':').map(Number);
    const period = ampm.toUpperCase();
    if (period === 'NN') {
        // NN = Noon → treat 12:00 as 12:00 PM
        // h should be 12 already
        return 12 * 60 + m;
    }
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

// Pre-process schedule string to normalize day ranges and full day names
function normalizeScheduleStr(raw) {
    let s = raw;
    // Normalize full day names to single-letter codes FIRST (before range expansion)
    // Order matters: THU before TUE (so TH doesn't get partially matched)
    s = s.replace(/\bTHU(?:RS(?:DAY)?)?\b/gi, 'H');
    s = s.replace(/\bTUE(?:S(?:DAY)?)?\b/gi, 'T');
    s = s.replace(/\bMON(?:DAY)?\b/gi, 'M');
    s = s.replace(/\bWED(?:NES(?:DAY)?)?\b/gi, 'W');
    s = s.replace(/\bFRI(?:DAY)?\b/gi, 'F');
    s = s.replace(/\bSUN(?:DAY)?\b/gi, 'SU');
    s = s.replace(/\bSAT(?:UR(?:DAY)?)?\b/gi, 'S');
    // Expand day ranges: M-TH → MTWH, M-F → MTWHF, M-SU → MTWHFSU
    s = s.replace(/M-TH/g, 'MTWH');
    s = s.replace(/M-SU/g, 'MTWHFS');
    s = s.replace(/M-F/g, 'MTWHF');
    s = s.replace(/M-S(?!U)/g, 'MTWHFS');
    return s;
}

// Utility to parse MyAdNU schedule strings (e.g., "MTH 07:30-09:00 AM / S 07:30-10:30 AM")
function parseSchedule(raw, item = null) {
    if (!raw || raw === 'TBA') return [];
    
    // Safety Fallback: If we have pre-parsed blocks from the scraper, use them!
    if (item && item.schedule_blocks && item.schedule_blocks.length > 0) {
        const sessions = [];
        item.schedule_blocks.forEach(block => {
            const start = parseTimeStr(block.startTime, block.startTime.includes('PM') ? 'PM' : 'AM');
            const end = parseTimeStr(block.endTime, block.endTime.includes('PM') ? 'PM' : 'AM');
            
            const daysRaw = block.days.join('');
            const days = [];
            if (daysRaw.includes('M')) days.push('Mon');
            if (daysRaw.includes('T')) days.push('Tue');
            if (daysRaw.includes('W')) days.push('Wed');
            if (daysRaw.includes('H')) days.push('Thu');
            if (daysRaw.includes('F')) days.push('Fri');
            if (daysRaw.includes('S')) days.push('Sat');
            
            days.forEach(day => sessions.push({ day, start, end }));
        });
        if (sessions.length > 0) return sessions;
    }

    const normalized = normalizeScheduleStr(raw);
    const parts = normalized.split('/').map(p => p.trim());
    const sessions = [];

    parts.forEach(part => {
        // Updated regex: supports AM, PM, and NN (noon)
        const match = part.match(/([MTWHFS]+)\s+(\d{1,2}:\d{2})\s*(AM|PM|NN)?\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM|NN)/i);
        if (match) {
            const daysRaw = match[1];
            const startTimeStr = match[2];
            const startAMPM = match[3] || match[5];
            const endTimeStr = match[4];
            const endAMPM = match[5];

            const days = [];
            if (daysRaw.includes('M')) days.push('Mon');
            if (daysRaw.includes('T')) days.push('Tue');
            if (daysRaw.includes('W')) days.push('Wed');
            if (daysRaw.includes('H')) days.push('Thu');
            if (daysRaw.includes('F')) days.push('Fri');
            if (daysRaw.includes('S')) days.push('Sat');

            const start = parseTimeStr(startTimeStr, startAMPM);
            const end = parseTimeStr(endTimeStr, endAMPM);

            days.forEach(day => sessions.push({ day, start, end }));
        }
    });
    return sessions;
}

// Check for time conflicts between a new section unit (can have multiple rows like Lec/Lab) and an existing schedule
function hasConflict(sectionUnit, currentSchedule) {
    const sections = Array.isArray(sectionUnit) ? sectionUnit : [sectionUnit];
    
    // Collect all new sessions from all rows in this section (Lec + Lab)
    const newSessions = [];
    sections.forEach(s => {
        newSessions.push(...parseSchedule(s.schedule_raw, s));
    });

    for (const existingUnit of currentSchedule) {
        const existingSections = Array.isArray(existingUnit) ? existingUnit : [existingUnit];
        const existingSessions = [];
        existingSections.forEach(es => {
            existingSessions.push(...parseSchedule(es.schedule_raw, es));
        });

        for (const s1 of newSessions) {
            for (const s2 of existingSessions) {
                if (s1.day === s2.day) {
                    if (s1.start < s2.end && s1.end > s2.start) {
                        console.warn(`[Conflict Detected] ${sections[0].course_code} overlaps with ${existingSections[0].course_code} on ${s1.day}`);
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Helper to detect elective placeholders (e.g., CSEC001, CSME001)
function isElectivePlaceholder(code) {
    if (!code) return false;
    const electivePrefixes = ['CSEC', 'ITEC', 'ISEC', 'CSGE', 'ITGE', 'ISGE', 'CSME', 'MSGE'];
    const hasPrefix = electivePrefixes.some(prefix => code.startsWith(prefix));
    // A placeholder usually ends with 001, 002, etc. and doesn't look like a real catalog number
    const isPlaceholderPattern = /00\d$/.test(code) || code.includes('ELEC');
    return hasPrefix && isPlaceholderPattern;
}

// Main Generation Logic
app.post('/api/kaizen/generate', async (req, res) => {
    const { answers, advisedSubjects } = req.body;
    
    if (!advisedSubjects || advisedSubjects.length === 0) {
        return res.status(400).json({ error: 'No advised subjects to generate schedule for.' });
    }

    try {
        let offerings = [];
        console.log('[KAIZEN Generator] Fetching offerings from Supabase...');
        const { data, error } = await supabase.from('course_offerings').select('*');
        if (error) {
            console.error('[KAIZEN Generator] Error fetching from Supabase, trying local file backup:', error);
            if (fs.existsSync('./data/offerings.json')) {
                offerings = JSON.parse(fs.readFileSync('./data/offerings.json', 'utf8'));
            } else {
                throw error;
            }
        } else {
            offerings = data;
        }
        // Always apply unit overrides when loading offerings (catches stale disk data)
        applyUnitOverrides(offerings);
        console.log(`[KAIZEN Generator] Loaded ${offerings.length} total offerings for generation.`);
        
        // Helper to group flat offerings into units (Lec+Lab)
        const groupOfferings = (list) => {
            const groups = {};
            // First, deduplicate identical rows (common in scraped data)
            const uniqueRows = [];
            const rowSeen = new Set();
            list.forEach(o => {
                const rowKey = `${o.course_code}-${o.section}-${o.schedule_raw}-${o.instructor}`;
                if (!rowSeen.has(rowKey)) {
                    uniqueRows.push(o);
                    rowSeen.add(rowKey);
                }
            });

            uniqueRows.forEach(o => {
                const key = `${o.course_code}-${o.section}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(o);
            });
            return Object.values(groups);
        };

        // Group sections by course code or elective type
        const pool = {};
        const missingSubjects = [];
        console.log(`[KAIZEN Generator v${VERSION}] Building pool for ${advisedSubjects.length} subjects...`);
        
        advisedSubjects.forEach(code => {
            const cleanCode = code.trim().toUpperCase();
            
            let matches = [];
            // Always try exact match first
            matches = offerings.filter(o => o.course_code.trim().toUpperCase() === cleanCode && o.schedule_raw !== 'TBA');
            
            // Fallback for PFIT/PATHFIT: only if exact match yields zero results
            if (matches.length === 0) {
                const isPathfit = cleanCode.includes('PFIT') || cleanCode.includes('PATHFIT');
                if (isPathfit) {
                    matches = offerings.filter(o => 
                        (o.course_code.toUpperCase().includes('PFIT') || o.title.toUpperCase().includes('PATHFIT')) && 
                        o.schedule_raw !== 'TBA'
                    );
                    if (matches.length > 0) {
                        console.log(`[Pool] ${code}: No exact match, using ${matches.length} broad PFIT matches.`);
                    }
                }
            }

            // Exclude restricted sections (RR prefix)
            matches = matches.filter(o => !o.section || !o.section.toUpperCase().startsWith('RR'));

            pool[code] = groupOfferings(matches);
            if (pool[code].length === 0) missingSubjects.push(code);
            else {
                console.log(`[Pool] ${code}: ${pool[code].length} section option(s), rows per section: [${pool[code].map(u => u.length).join(',')}]`);
            }
        });

        if (missingSubjects.length > 0) {
            return res.status(400).json({ 
                error: `Missing Offerings: ${missingSubjects.join(', ')}`,
                details: 'These subjects have no available sections or schedules in the database. Please check your spelling or selection.'
            });
        }

        const activeCodes = advisedSubjects;
        const permissions = answers.permissions || { threeMajors: false, fourConsecutive: false };
        
        // ===== INLINE CONSTRAINT CHECKER =====
        // Check consecutive-class constraints on a partial schedule DURING search.
        // Returns true if the schedule is VALID (no violations).
        function passesConsecutiveCheck(current) {
            if (permissions.threeMajors && permissions.fourConsecutive) return true; // Admin bypass
            
            const dayMap = {};
            current.forEach(unit => {
                // Determine if this subject is "heavy" based on its actual credit units,
                // NOT the difficulty-map score. A subject with >= 3 units is considered heavy.
                const unitCredits = parseInt(unit[0].units, 10) || 0;
                const isHeavy = unitCredits >= 3;
                unit.forEach(row => {
                    const sessions = parseSchedule(row.schedule_raw);
                    sessions.forEach(s => {
                        if (!dayMap[s.day]) dayMap[s.day] = [];
                        dayMap[s.day].push({ ...s, isHeavy, code: row.course_code });
                    });
                });
            });
            
            for (const day of Object.keys(dayMap)) {
                const daySessions = dayMap[day].sort((a, b) => a.start - b.start);
                if (daySessions.length < 2) continue;
                
                // Merge same-subject consecutive sessions (e.g., Lec+Lab back-to-back) into single blocks
                const blocks = [];
                for (let i = 0; i < daySessions.length; i++) {
                    const s = daySessions[i];
                    if (blocks.length > 0) {
                        const last = blocks[blocks.length - 1];
                        if (last.code === s.code && (s.start - last.end < 30)) {
                            last.end = s.end;
                            last.isHeavy = last.isHeavy || s.isHeavy;
                            continue;
                        }
                    }
                    blocks.push({ ...s });
                }
                
                // Check 3 consecutive heavy (3-unit) subjects with no meaningful break (< 30 min gap)
                if (!permissions.threeMajors && blocks.length >= 3) {
                    for (let i = 0; i < blocks.length - 2; i++) {
                        if (blocks[i].isHeavy && blocks[i+1].isHeavy && blocks[i+2].isHeavy) {
                            const g1 = blocks[i+1].start - blocks[i].end;
                            const g2 = blocks[i+2].start - blocks[i+1].end;
                            if (g1 < 30 && g2 < 30) return false;
                        }
                    }
                }
                
                // Check 4 consecutive any subjects with no meaningful break (< 30 min gap each)
                if (!permissions.fourConsecutive && blocks.length >= 4) {
                    for (let i = 0; i < blocks.length - 3; i++) {
                        const g1 = blocks[i+1].start - blocks[i].end;
                        const g2 = blocks[i+2].start - blocks[i+1].end;
                        const g3 = blocks[i+3].start - blocks[i+2].end;
                        if (g1 < 30 && g2 < 30 && g3 < 30) return false;
                    }
                }
            }
            return true;
        }
        
        // ===== MULTI-ROUND DIVERSITY SEARCH ENGINE =====
        // Strategy: Run multiple independent search rounds with different "anchor" sections
        // for bottleneck subjects (those with fewest options). Each round explores a
        // fundamentally different branch of the solution space.
        
        const results = [];
        const seenSignatures = new Set();
        const maxPermutationsPerRound = 100000;
        let totalCount = 0;

        // Identify bottleneck subjects (fewest sections = hardest to swap)
        const subjectsByConstraint = [...activeCodes].sort((a, b) => {
            return (pool[a]?.length || 0) - (pool[b]?.length || 0);
        });
        
        console.log(`[Generator v${VERSION}] Subject constraint order: [${subjectsByConstraint.map(c => `${c}(${pool[c]?.length || 0})`).join(', ')}]`);

        // Determine how many rounds: product of bottleneck section counts (capped)
        const bottleneckCodes = subjectsByConstraint.filter(c => (pool[c]?.length || 0) <= 4);
        const numRounds = Math.min(20, bottleneckCodes.reduce((p, c) => p * (pool[c]?.length || 1), 1) * 3);
        
        console.log(`[Generator v${VERSION}] Running ${numRounds} diversity rounds...`);
        
        for (let round = 0; round < numRounds; round++) {
            if (results.length >= 200) break; // Enough diversity in the pool

            let count = 0;
            
            // Each round uses a different subject ordering for different anchor patterns
            // Strategy: Bottleneck subjects first (most constrained), then shuffle the rest
            const constrained = [...bottleneckCodes];
            const flexible = subjectsByConstraint.filter(c => !bottleneckCodes.includes(c));
            
            // Rotate the constrained order each round so different subjects get priority
            const rotated = [...constrained.slice(round % constrained.length), ...constrained.slice(0, round % constrained.length)];
            const shuffledFlexible = [...flexible].sort(() => Math.random() - 0.5);
            const searchOrder = [...rotated, ...shuffledFlexible];
            
            // For each round, create a locally-shuffled pool so different sections are tried first
            const localPool = {};
            Object.keys(pool).forEach(code => {
                const sections = [...pool[code]];
                // For bottleneck subjects, rotate which section is tried first based on round
                if (bottleneckCodes.includes(code)) {
                    const offset = Math.floor(round / Math.max(1, numRounds / sections.length)) % sections.length;
                    localPool[code] = [...sections.slice(offset), ...sections.slice(0, offset)];
                } else {
                    // For flexible subjects, full random shuffle
                    localPool[code] = sections.sort(() => Math.random() - 0.5);
                }
            });

            function findCombinations(index, current) {
                if (count >= maxPermutationsPerRound) return;
                if (results.length >= 200) return;
                
                if (index === searchOrder.length) {
                    // STRICT COMPLETENESS CHECK
                    const placedCodes = new Set(current.map(u => u[0].course_code.trim().toUpperCase()));
                    for (const code of activeCodes) {
                        if (!placedCodes.has(code.trim().toUpperCase())) return;
                    }

                    const sig = current.map(u => u.map(r => `${r.course_code}-${r.section}`).join('|')).sort().join('::');
                    if (seenSignatures.has(sig)) return;

                    let hasFinalConflict = false;
                    for (let i = 0; i < current.length; i++) {
                        for (let j = i + 1; j < current.length; j++) {
                            if (hasConflict(current[i], [current[j]])) {
                                hasFinalConflict = true;
                                break;
                            }
                        }
                        if (hasFinalConflict) break;
                    }

                    // Final consecutive constraint check on the complete schedule
                    if (!hasFinalConflict && passesConsecutiveCheck(current)) {
                        results.push([...current]);
                        seenSignatures.add(sig);
                    }
                    return;
                }
     
                const slotCode = searchOrder[index];
                const options = localPool[slotCode] || [];
                
                for (const sectionUnit of options) {
                    if (hasConflict(sectionUnit, current)) continue;
                    if (current.some(unit => unit[0].course_code === sectionUnit[0].course_code)) continue;
     
                    current.push(sectionUnit);
                    
                    // Early pruning: check consecutive constraints after 3+ subjects placed
                    if (current.length >= 3 && !passesConsecutiveCheck(current)) {
                        current.pop();
                        count++;
                        continue;
                    }
                    
                    findCombinations(index + 1, current);
                    current.pop();
                    
                    count++;
                }
            }

            findCombinations(0, []);
            totalCount += count;
        }
        
        console.log(`[Generator v${VERSION}] Multi-round search complete. Found ${results.length} unique candidates across ${numRounds} rounds. (explored ${totalCount} total branches)`);
        
        // Post-search validation
        if (results.length > 0) {
            const sample = results[0];
            const sampleCodes = sample.map(u => u[0].course_code);
            console.log(`[Generator v${VERSION}] Sample schedule #1 contains ${sampleCodes.length} subjects: [${sampleCodes.join(', ')}]`);
            console.log(`[Generator v${VERSION}] Each schedule has Lec+Lab rows: [${sample.map(u => `${u[0].course_code}(${u.length} rows)`).join(', ')}]`);
            
            // Log diversity stats: how many unique section combinations per subject
            const diversityMap = {};
            results.forEach(schedule => {
                schedule.forEach(unit => {
                    const code = unit[0].course_code;
                    const sec = unit[0].section;
                    if (!diversityMap[code]) diversityMap[code] = new Set();
                    diversityMap[code].add(sec);
                });
            });
            console.log(`[Generator v${VERSION}] Section diversity: [${Object.entries(diversityMap).map(([c, s]) => `${c}:${s.size}/${pool[c]?.length || '?'}`).join(', ')}]`);
        }

        if (results.length === 0) {
            return res.status(404).json({ 
                error: 'No valid schedules found that include ALL requested subjects without overlaps.',
                details: 'This usually happens if two of your subjects have ONLY sections that conflict with each other. Try checking their schedules manually.'
            });
        }

        // Scoring Logic — Absolute Match Percentages (0–100%)
        const scoredSchedules = results.map(schedule => {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            // Collect ALL sessions across the schedule
            const allSessions = [];
            schedule.forEach(unit => {
                unit.forEach(row => {
                    const sessions = parseSchedule(row.schedule_raw);
                    sessions.forEach(s => allSessions.push({ ...s, code: row.course_code, instructor: row.instructor }));
                });
            });

            // ===== 1. SCHEDULE COMPLIANCE (free days + cutoff) =====
            const blockedDays = answers.fixed.freeDays || [];
            const cutOffStr = answers.fixed.cutOff || '08:30 PM';
            const [ch, cm] = cutOffStr.split(':');
            let cutOffMinutes = parseInt(ch) * 60 + parseInt(cm.split(' ')[0]);
            if (cutOffStr.includes('PM') && parseInt(ch) < 12) cutOffMinutes += 12 * 60;

            let violations = 0;
            let totalChecks = allSessions.length;
            allSessions.forEach(s => {
                if (blockedDays.includes(s.day)) violations++;
                if (s.end > cutOffMinutes) violations++;
            });
            // Each session checked for day+cutoff compliance
            totalChecks = Math.max(totalChecks, 1);
            const compliancePct = Math.round(Math.max(0, (1 - violations / totalChecks)) * 100);

            // ===== 2. TIME PREFERENCE MATCH =====
            // Measures how many sessions fall within the user's comfort zone
            // Comfort zone: Not too early (based on 730aversion) and not too late (based on eveningFlex)
            const earlyAversion = answers.timeTolerance?.['730aversion'] || 3; // 1=love early, 5=hate early
            const eveningFlex = answers.timeTolerance?.['eveningFlex'] || 3;   // 1=hate late, 5=love late
            // Threshold: user who hates early (5) → anything before 9:30AM is bad; user who loves early (1) → fine with 7:00AM
            const earlyThreshold = 450 + (earlyAversion - 1) * 22; // 450-540 (7:30AM-9:00AM)
            const lateThreshold = 960 + (eveningFlex - 1) * 45;    // 960-1140 (4PM-7PM)
            
            let timeMatches = 0;
            allSessions.forEach(s => {
                const earlyOk = s.start >= earlyThreshold;
                const lateOk = s.end <= lateThreshold;
                if (earlyOk && lateOk) timeMatches++;
                else if (earlyOk || lateOk) timeMatches += 0.5; // half credit
            });
            const timePct = Math.round((timeMatches / Math.max(allSessions.length, 1)) * 100);

            // ===== 3. PROFESSOR MATCH (Enhanced v2) =====
            const preferredProfs = answers.preferredProfessors || [];
            const timeFirstPref = answers.pedagogy?.['timeFirst'] || 3;
            let profPct = 100;
            const matchedProfNames = [];
            if (preferredProfs.length > 0) {
                let matched = 0;
                preferredProfs.forEach(p => {
                    if (schedule.some(unit => unit.some(row => row.instructor.includes(p.name)))) {
                        matched++;
                        matchedProfNames.push(p.name);
                    }
                });
                const rawProfPct = (matched / preferredProfs.length) * 100;
                // Soften based on timeFirst: user who doesn't care (5) → floor at 70%
                // User who cares deeply (1) → raw score used directly
                const profFloor = Math.min(70, (timeFirstPref - 1) * 17);
                profPct = Math.round(Math.max(profFloor, rawProfPct));
            }

            // ===== 4. COMPACTNESS / GAP SCORE (Enhanced v2) =====
            // Uses user preferences to determine ideal gap pattern
            const marathonMode = answers.flow?.['marathonMode'] || 3;
            const gapStrategy = answers.flow?.['gapStrategy'] || 3;
            let totalGapMinutes = 0;
            let activeDays = 0;
            const daySessionCounts = {};
            days.forEach(day => {
                const daySessions = allSessions.filter(s => s.day === day).sort((a, b) => a.start - b.start);
                daySessionCounts[day] = daySessions.length;
                if (daySessions.length < 2) return;
                activeDays++;
                for (let i = 0; i < daySessions.length - 1; i++) {
                    const gap = daySessions[i + 1].start - daySessions[i].end;
                    if (gap > 10) totalGapMinutes += gap;
                }
            });
            const avgGapPerDay = activeDays > 0 ? totalGapMinutes / activeDays : 0;
            // User ideal gap: marathonMode high + gapStrategy low → compact (~20 min avg)
            //                  marathonMode low + gapStrategy high → spacious (~80 min avg)
            const compactPref = (marathonMode - gapStrategy + 5) / 2;
            const idealGap = 90 - (compactPref * 15);
            // Bell-curve scoring: distance from ideal
            const gapDeviation = Math.abs(avgGapPerDay - idealGap);
            const gapPct = Math.round(Math.max(20, 100 - (gapDeviation / 100) * 80));

            // ===== 5. COGNITIVE LOAD BALANCE (Enhanced v2) =====
            // Dynamic threshold based on actual course load, CV-based balance measurement
            const dailyStress = {};
            days.forEach(d => dailyStress[d] = 0);
            let totalCourseStress = 0;
            schedule.forEach(unit => {
                const weight = getDifficulty(unit[0].course_code).score;
                totalCourseStress += weight;
                const unitDays = new Set();
                unit.forEach(row => {
                    parseSchedule(row.schedule_raw).forEach(s => unitDays.add(s.day));
                });
                unitDays.forEach(d => dailyStress[d] += weight);
            });
            const stressValues = Object.values(dailyStress).filter(v => v > 0);
            let stressPct = 100;
            if (stressValues.length > 0) {
                const actualAvg = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
                const maxStress = Math.max(...stressValues);
                // Coefficient of variation: stdDev / mean (0 = perfect balance)
                const variance = stressValues.reduce((sum, v) => sum + Math.pow(v - actualAvg, 2), 0) / stressValues.length;
                const stdDev = Math.sqrt(variance);
                const cv = actualAvg > 0 ? stdDev / actualAvg : 0;
                // CV of 0 = 100%, CV of 0.8+ = 25%
                const balanceScore = Math.max(0.25, 1 - (cv * 0.95));
                // Overload penalty only if one day is disproportionately loaded
                const perfectAvg = totalCourseStress / Math.max(stressValues.length, 1);
                const overloadPenalty = maxStress > (perfectAvg * 2.5) ? 0.85 : 1.0;
                stressPct = Math.round(balanceScore * overloadPenalty * 100);
            }

            // ===== FINAL WEIGHTED MATCH PERCENTAGE =====
            const g = answers.ranking || ['Time Tolerance', 'Professor Priority', 'Professional Intensity', 'Gap/Minor Strategy'];
            const getWeight = (label) => {
                const idx = g.indexOf(label);
                if (idx === 0) return 1.5;
                if (idx === 1) return 1.2;
                if (idx === 2) return 1.0;
                return 0.8;
            };

            const wTime = getWeight('Time Tolerance');
            const wProf = getWeight('Professor Priority');
            const wInt = getWeight('Professional Intensity');
            const wGap = getWeight('Gap/Minor Strategy');
            const totalWeight = wTime + wProf + wInt + wGap;

            // Weighted combination of all dimensions
            let matchPercentage = (
                (timePct * wTime) +
                (profPct * wProf) +
                (stressPct * wInt) +
                (gapPct * wGap)
            ) / totalWeight;

            // Compliance as ADDITIVE BLEND (not multiplicative gate)
            // 85% from dimension scores + 15% from compliance adherence
            matchPercentage = Math.round(matchPercentage * 0.85 + compliancePct * 0.15);

            const totalScore = matchPercentage;

            // Build diversity metadata for multi-dimensional selection
            // Timeslot fingerprint: early/mid/late pattern per day
            const timeslotFP = days.map(day => {
                const ds = allSessions.filter(s => s.day === day);
                if (ds.length === 0) return '-';
                const earliest = Math.min(...ds.map(s => s.start));
                if (earliest < 480) return 'E'; // before 8AM = Early
                if (earliest < 600) return 'M'; // before 10AM = Mid
                return 'L'; // Late
            }).join('');

            // Day-load pattern: how many sessions per day
            const dayLoadFP = days.map(day => daySessionCounts[day] || 0).join('');

            return {
                schedule,
                totalScore,
                matchPercentage,
                isHardValid: true,
                matchedProfNames,
                timeslotFP,
                dayLoadFP,
                avgGapPerDay: Math.round(avgGapPerDay),
                breakdown: {
                    timePct,
                    profPct,
                    stressPct,
                    gapPct,
                    compliancePct
                }
            };
        });

        // ===== MULTI-DIMENSIONAL DIVERSITY SELECTION (v2) =====
        // Selects top 10 schedules that feel genuinely DIFFERENT across ALL dimensions:
        //   - Section combinations (different sections for same course)
        //   - Professor combinations (rotate which preferred profs are matched)
        //   - Timeslot patterns (early-bird vs mid-day vs late schedules)
        //   - Compactness profiles (tight vs spaced-out)
        //   - Day-load distribution (heavy MWF vs heavy TTH vs balanced)
        
        const validCount = scoredSchedules.filter(s => s.isHardValid).length;
        console.log(`[Generator v${VERSION}] Scoring complete. ${scoredSchedules.length} scored, ${validCount} pass hard-constraint check.`);
        
        const validSchedules = scoredSchedules
            .filter(s => s.isHardValid)
            .sort((a, b) => b.totalScore - a.totalScore);

        function getScheduleFingerprint(schedule) {
            return schedule.map(unit => `${unit[0].course_code}:${unit[0].section}`).sort().join('|');
        }

        function countDifferences(fpA, fpB) {
            const a = fpA.split('|');
            const b = fpB.split('|');
            let diffs = 0;
            a.forEach((entry, i) => { if (entry !== b[i]) diffs++; });
            return diffs;
        }

        // Multi-dimensional distance between two schedule results
        function diversityDistance(candidate, selected) {
            let distance = 0;
            const cfp = getScheduleFingerprint(candidate.schedule);
            
            selected.forEach(sel => {
                const sfp = getScheduleFingerprint(sel.schedule);
                
                // 1. Section differences (weight: 3 per different section)
                distance += countDifferences(cfp, sfp) * 3;
                
                // 2. Professor diversity (weight: 4 if different prof combo)
                const cProfs = (candidate.matchedProfNames || []).sort().join(',');
                const sProfs = (sel.matchedProfNames || []).sort().join(',');
                if (cProfs !== sProfs) distance += 4;
                
                // 3. Timeslot pattern diversity (weight: 3 if different time feel)
                if (candidate.timeslotFP !== sel.timeslotFP) distance += 3;
                
                // 4. Compactness diversity (weight: 2 if gap profile differs significantly)
                const gapDiff = Math.abs((candidate.avgGapPerDay || 0) - (sel.avgGapPerDay || 0));
                if (gapDiff > 20) distance += 2;
                if (gapDiff > 45) distance += 1;
                
                // 5. Day-load pattern diversity (weight: 2 if different day distribution)
                if (candidate.dayLoadFP !== sel.dayLoadFP) distance += 2;
            });
            
            // Normalize by number of selected (so early picks don't get unfairly high scores)
            return distance / Math.max(selected.length, 1);
        }

        const topSchedules = [];
        if (validSchedules.length > 0) {
            // Always pick the best-scoring schedule first
            topSchedules.push(validSchedules[0]);

            // Minimum quality threshold: don't pick schedules too far below the best
            const bestScore = validSchedules[0].totalScore;
            const qualityFloor = Math.max(bestScore * 0.55, 20);

            const remaining = validSchedules.slice(1);
            while (topSchedules.length < 10 && remaining.length > 0) {
                let bestIdx = -1;
                let bestCombinedScore = -Infinity;

                for (let i = 0; i < remaining.length; i++) {
                    // Skip if quality is too far below the best
                    if (remaining[i].totalScore < qualityFloor) continue;
                    
                    const divDist = diversityDistance(remaining[i], topSchedules);
                    
                    // Combined score: diversity (60%) + quality (40%)
                    // This ensures we get DIFFERENT schedules but don't sacrifice too much quality
                    const qualityNorm = remaining[i].totalScore / Math.max(bestScore, 1);
                    const combinedScore = (divDist * 0.6) + (qualityNorm * 10 * 0.4);
                    
                    if (combinedScore > bestCombinedScore) {
                        bestCombinedScore = combinedScore;
                        bestIdx = i;
                    }
                }

                if (bestIdx >= 0) {
                    topSchedules.push(remaining[bestIdx]);
                    remaining.splice(bestIdx, 1);
                } else break;
            }

            console.log(`[Generator v${VERSION}] Selected ${topSchedules.length} diverse schedules from ${validSchedules.length} valid candidates.`);
            if (topSchedules.length > 0) {
                console.log(`[Generator v${VERSION}] Score range: ${Math.round(topSchedules[0].totalScore)} to ${Math.round(topSchedules[topSchedules.length-1].totalScore)}`);
                // Log diversity dimensions for debugging
                topSchedules.forEach((s, i) => {
                    console.log(`  Option #${i+1}: ${s.totalScore}% | Profs:[${(s.matchedProfNames||[]).join(',')||'none'}] | Time:${s.timeslotFP} | DayLoad:${s.dayLoadFP} | AvgGap:${s.avgGapPerDay}min`);
                });
            }
        }

        if (topSchedules.length === 0) {
            return res.status(404).json({ 
                error: 'No valid schedules found that include ALL requested subjects without time conflicts or constraint violations.',
                details: 'All section combinations either overlap or violate consecutive-class rules. Try enabling Admin Permission in the questionnaire (Step 7) to relax the consecutive-subject constraints, or remove a subject.'
            });
        }

        res.json({
            count: topSchedules.length,
            schedules: topSchedules
        });

    } catch (err) {
        console.error('[KAIZEN Generator] Error:', err);
        res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
});

const PORT = 3000;

async function initServerData() {
    console.log('[Init] Checking for existing data in Supabase (Primary Source)...');
    try {
        // 1. Fetch offerings from Supabase
        const { data: offeringsData, error: offError } = await supabase.from('course_offerings').select('*');
        if (!offError && offeringsData && offeringsData.length > 0) {
            scrapeState.entries = offeringsData;
            scrapeState.totalEntries = offeringsData.length;
            scrapeState.status = 'done';
            scrapeState.lastScrapeTime = new Date().toISOString();
            console.log(`[Init] Loaded ${offeringsData.length} offerings from Supabase.`);
            
            // Save local file backup
            if (!fs.existsSync('./data')) fs.mkdirSync('./data');
            fs.writeFileSync('./data/offerings.json', JSON.stringify(offeringsData, null, 2));
        } else if (offError) {
            console.warn('[Init] Supabase offerings load failed, attempting local file backup:', offError.message);
            if (fs.existsSync('./data/offerings.json')) {
                const local = JSON.parse(fs.readFileSync('./data/offerings.json', 'utf8'));
                if (local.length > 0) {
                    scrapeState.entries = local;
                    scrapeState.totalEntries = local.length;
                    scrapeState.status = 'done';
                    scrapeState.lastScrapeTime = new Date().toISOString();
                    console.log('[Init] Loaded offerings from local cache backup.');
                }
            }
        }

        // 2. Fetch advisement & electives from Supabase
        const { data: advData, error: advError } = await supabase.from('student_advisement').select('*');
        const { data: elecData, error: elecError } = await supabase.from('elective_options').select('*');

        if (!advError && advData && advData.length > 0) {
            kaizenState.advisedSubjects = advData.map(d => d.subject_code);
            console.log(`[Init] Loaded ${advData.length} advised subjects from Supabase.`);
        }
        if (!elecError && elecData && elecData.length > 0) {
            kaizenState.electiveOptions = elecData.map(e => ({
                no: e.id,
                subject_code: e.subject_code,
                subject_title: e.subject_title,
                units: e.units,
                credited: e.credited,
                is_custom: e.is_custom
            }));
            console.log(`[Init] Loaded ${elecData.length} elective options from Supabase.`);
        }

        // Keep local cache file updated as backup
        if (kaizenState.advisedSubjects.length > 0 || kaizenState.electiveOptions.length > 0) {
            kaizenState.lastScrapeTime = new Date().toISOString();
            if (!fs.existsSync('./data')) fs.mkdirSync('./data');
            fs.writeFileSync('./data/advisement.json', JSON.stringify({
                advisedSubjects: kaizenState.advisedSubjects,
                electiveOptions: kaizenState.electiveOptions,
                lastScrapeTime: kaizenState.lastScrapeTime
            }, null, 2));
        } else {
            // Local file backup fallback if Supabase tables are empty
            if (fs.existsSync('./data/advisement.json')) {
                const saved = JSON.parse(fs.readFileSync('./data/advisement.json', 'utf8'));
                kaizenState.advisedSubjects = saved.advisedSubjects || [];
                kaizenState.electiveOptions = saved.electiveOptions || [];
                kaizenState.lastScrapeTime = saved.lastScrapeTime || null;
                console.log('[Init] Loaded advisement from local cache backup (Supabase tables empty).');
            }
        }
    } catch (err) {
        console.error('[Init] Failed to load initial data from Supabase:', err);
    }
}

app.post('/api/ai/analyze-schedule', async (req, res) => {
    const { schedule, preferences, matchScore } = req.body;
    
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Groq API Key not configured on server.' });
    }

    // Initialize lazily so dotenv is guaranteed to have loaded
    const groq = new Groq({ apiKey });

    try {
        // Pre-compute per-day workload summary so the AI has accurate data
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayWorkload = {};
        days.forEach(d => dayWorkload[d] = { classes: 0, totalMinutes: 0 });

        if (Array.isArray(schedule)) {
            schedule.forEach(unit => {
                if (!Array.isArray(unit)) return;
                unit.forEach(row => {
                    if (!row.schedule_raw) return;
                    // Parse schedule_raw like "MWF 08:00 AM - 09:00 AM"
                    const parts = row.schedule_raw.split(' ');
                    if (parts.length < 4) return;
                    const dayStr = parts[0];
                    const timeStr = parts.slice(1).join(' ');
                    const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)\s*-\s*(\d+):(\d+)\s*(AM|PM)/i);
                    if (!timeMatch) return;
                    let sh = parseInt(timeMatch[1]), sm = parseInt(timeMatch[2]);
                    const sAmPm = timeMatch[3].toUpperCase();
                    let eh = parseInt(timeMatch[4]), em = parseInt(timeMatch[5]);
                    const eAmPm = timeMatch[6].toUpperCase();
                    if (sAmPm === 'PM' && sh !== 12) sh += 12;
                    if (sAmPm === 'AM' && sh === 12) sh = 0;
                    if (eAmPm === 'PM' && eh !== 12) eh += 12;
                    if (eAmPm === 'AM' && eh === 12) eh = 0;
                    const duration = (eh * 60 + em) - (sh * 60 + sm);
                    const dayMap = { M: 'Mon', T: 'Tue', W: 'Wed', H: 'Thu', F: 'Fri', S: 'Sat' };
                    dayStr.split('').forEach(ch => {
                        const day = dayMap[ch];
                        if (day && dayWorkload[day]) {
                            dayWorkload[day].classes++;
                            dayWorkload[day].totalMinutes += duration;
                        }
                    });
                });
            });
        }

        const workloadSummary = days.map(d => {
            const w = dayWorkload[d];
            if (w.classes === 0) return `${d}: FREE`;
            return `${d}: ${w.classes} class(es), ${Math.round(w.totalMinutes / 60 * 10) / 10} hrs total`;
        }).join(' | ');

        const prompt = `
            You are VLAD Advisor, an intelligent Academic Schedule Analyst for Ateneo de Naga University (AdNU).
            Analyze the following schedule which has an overall match score of ${matchScore}%.

            IMPORTANT — PER-DAY WORKLOAD (use this for accurate day assessments, do NOT guess from class count alone):
            ${workloadSummary}

            USER PREFERENCES:
            ${JSON.stringify(preferences, null, 2)}

            SCHEDULE DATA (section/instructor/time details):
            ${JSON.stringify(schedule, null, 2)}

            Provide a concise, student-friendly analysis with clear PROS and CONS of this schedule.
            Do NOT use any emojis. Use plain text only.
            Base your day-by-day assessment strictly on the PER-DAY WORKLOAD above.
            A day with 6+ hours of class is heavy, not light, regardless of how many sessions there are.
            Focus on:
            1. Time convenience — early starts, late finishes, genuinely free days.
            2. Daily workload balance — which days are heavy or light based on total hours.
            3. Gaps and transitions — is there breathing room between classes?
            4. Preferred professors — which were matched or missed.
            5. Red flags — long consecutive blocks, back-to-back majors, tight transitions.

            Be precise, honest, and concise. Limit to about 200 words.
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
        });

        res.json({ analysis: chatCompletion.choices[0].message.content });
    } catch (err) {
        console.error('[VLAD Advisor] Error:', err);
        res.status(500).json({ error: 'VLAD Advisor failed: ' + err.message });
    }
});

const server = app.listen(PORT, async () => {
    console.log(`\n========================================`);
    console.log(`VLAD Scheduler Backend v${VERSION}`);
    console.log(`========================================`);
    console.log(`Middleman Backend Server running on http://localhost:${PORT}`);
    await initServerData();
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
    console.log(`Process exiting with code: ${code}`);
});

// Force event loop to stay active
setInterval(() => {}, 60000);
// SYNC: 04/26/2026 17:13:01
