const fs = require('fs');
const path = require('path');

const offeringsPath = path.join('c:', 'Users', 'CEEJAY', 'Documents', 'COLLEGE', '2ND YEAR', 'SECOND SEMESTER', 'app dev', 'VLAD_prototype', 'data', 'offerings.json');

try {
    const data = JSON.parse(fs.readFileSync(offeringsPath, 'utf8'));
    const subjectPrefixes = new Set();
    
    data.forEach(item => {
        if (item.course_code) {
            // Match leading letters
            const match = item.course_code.match(/^[A-Z]+/i);
            if (match) {
                let prefix = match[0].toUpperCase();
                // User said "only the first 4 letters"
                // If it's longer than 4, trim it? Unlikely.
                // If it's shorter, keep it?
                // Most seem to be 3 or 4.
                subjectPrefixes.add(prefix.substring(0, 4));
            }
        }
    });

    console.log(JSON.stringify(Array.from(subjectPrefixes).sort(), null, 2));
} catch (error) {
    console.error('Error reading offerings.json:', error);
}
