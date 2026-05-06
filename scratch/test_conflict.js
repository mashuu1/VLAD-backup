
function parseTimeStr(timeStr, ampm) {
    let [h, m] = timeStr.split(':').map(Number);
    const period = ampm.toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

function parseSchedule(raw) {
    if (!raw || raw === 'TBA') return [];
    const parts = raw.split('/').map(p => p.trim());
    const sessions = [];

    parts.forEach(part => {
        // The regex I used in backend Turn 14
        const match = part.match(/([MTWHFS]+)\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)/i);
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

function hasConflict(sectionUnit, currentSchedule) {
    const sections = Array.isArray(sectionUnit) ? sectionUnit : [sectionUnit];
    const newSessions = [];
    sections.forEach(s => {
        newSessions.push(...parseSchedule(s.schedule_raw));
    });

    for (const existingUnit of currentSchedule) {
        const existingSections = Array.isArray(existingUnit) ? existingUnit : [existingUnit];
        const existingSessions = [];
        existingSections.forEach(es => {
            existingSessions.push(...parseSchedule(es.schedule_raw));
        });

        for (const s1 of newSessions) {
            for (const s2 of existingSessions) {
                if (s1.day === s2.day) {
                    if (s1.start < s2.end && s1.end > s2.start) return true;
                }
            }
        }
    }
    return false;
}

const s1 = [{ schedule_raw: 'MW 09:00AM - 10:30AM' }]; // CRCP202
const s2 = [{ schedule_raw: 'TTH 09:00AM - 10:00AM / MW 09:00AM - 10:30AM' }]; // CSDC105

console.log('Conflict between s1 and s2:', hasConflict(s1, [s2]));

const sessions1 = parseSchedule(s1[0].schedule_raw);
const sessions2 = parseSchedule(s2[0].schedule_raw);

console.log('Sessions 1:', JSON.stringify(sessions1));
console.log('Sessions 2:', JSON.stringify(sessions2));
 
