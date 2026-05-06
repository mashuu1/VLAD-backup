const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/CEEJAY/Documents/COLLEGE/2ND YEAR/SECOND SEMESTER/app dev/VLAD_prototype/client/src/difficulty_map.js';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Simple regex to keep only score and level (if needed) but user said "revolve on score"
    // Let's keep level for internal grouping but remove color and bg.
    let newContent = content.replace(/"color":"#[a-f0-9]+",/g, '');
    newContent = newContent.replace(/"bg":"rgba\([^)]+\)",/g, '');
    // Clean up trailing commas before closing braces
    newContent = newContent.replace(/,}/g, '}');
    
    fs.writeFileSync(filePath, newContent);
    console.log('Successfully updated difficulty_map.js to remove color and bg metadata.');
} catch (error) {
    console.error('Error:', error);
}
