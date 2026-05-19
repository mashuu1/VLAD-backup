const VERSION = "1.2.0";
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
require('dotenv').config();
const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Paginated helper to fetch ALL records from a Supabase table (bypassing default 1000-row limit)
async function fetchFullTable(tableName, orderColumn = 'id') {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const fromRange = page * pageSize;
        const toRange = fromRange + pageSize - 1;
        
        let query = supabase.from(tableName).select('*').range(fromRange, toRange);
        if (orderColumn) {
            query = query.order(orderColumn, { ascending: true });
        }
        
        const { data, error } = await query;
        if (error) {
            console.error(`[fetchFullTable] Error on page ${page} of ${tableName}:`, error.message);
            throw error;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    return allData;
}

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

let scrapeState = {
    status: 'idle',
    currentPage: 0,
    totalEntries: 0,
    entries: [],
    error: null,
    lastScrapeTime: null,
};

let kaizenState = {
    status: 'idle',
    advisedSubjects: [],
    electiveOptions: [],
    error: null,
    lastScrapeTime: null,
};

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








// Phase 4: Express API Endpoints




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
        try {
            offerings = await fetchFullTable('course_offerings', 'course_code');
        } catch (err) {
            console.error('[KAIZEN Generator] Error fetching from Supabase, trying local file backup:', err);
            if (fs.existsSync('./data/offerings.json')) {
                offerings = JSON.parse(fs.readFileSync('./data/offerings.json', 'utf8'));
            } else {
                throw err;
            }
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
        try {
            const offeringsData = await fetchFullTable('course_offerings', 'course_code');
            if (offeringsData && offeringsData.length > 0) {
                scrapeState.entries = offeringsData;
                scrapeState.totalEntries = offeringsData.length;
                scrapeState.status = 'done';
                scrapeState.lastScrapeTime = new Date().toISOString();
                console.log(`[Init] Loaded ${offeringsData.length} offerings from Supabase.`);
                
                // Save local file backup
                if (!fs.existsSync('./data')) fs.mkdirSync('./data');
                fs.writeFileSync('./data/offerings.json', JSON.stringify(offeringsData, null, 2));
            }
        } catch (offError) {
            console.warn('[Init] Supabase offerings load failed, attempting local file backup:', offError.message || offError);
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
