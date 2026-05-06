const fs = require('fs');
const path = require('path');

const offeringsPath = path.join('c:', 'Users', 'CEEJAY', 'Documents', 'COLLEGE', '2ND YEAR', 'SECOND SEMESTER', 'app dev', 'VLAD_prototype', 'data', 'offerings.json');

try {
    const data = JSON.parse(fs.readFileSync(offeringsPath, 'utf8'));
    const subjectCodes = new Set();

    data.forEach(item => {
        if (item.course_code) {
            const code = item.course_code.substring(0, 4).toUpperCase();
            // Clean up to keep only letters (as per user's "first 4 letters")
            // Actually, some codes might have numbers if the prefix is shorter than 4, 
            // but the user said "only the first 4 letters". 
            // Let's see what we get.
            subjectCodes.add(code);
        }
    });

    console.log(JSON.stringify(Array.from(subjectCodes).sort(), null, 2));
} catch (error) {
    console.error('Error reading offerings.json:', error);
}
