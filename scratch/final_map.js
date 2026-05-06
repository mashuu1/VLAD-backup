const fs = require('fs');
const path = require('path');

const offeringsPath = path.join('c:', 'Users', 'CEEJAY', 'Documents', 'COLLEGE', '2ND YEAR', 'SECOND SEMESTER', 'app dev', 'VLAD_prototype', 'data', 'offerings.json');

// Re-categorizing based on the user's feedback and standard academic mapping
// We only care about the SCORE now.
const SCORE_MAP = {
  // Hard
  'ACCA': 4, 'ACCP': 4, 'AIMI': 4, 'AIMP': 4, 'ARCH': 4, 'BCGA': 4, 'CALC': 4, 'CENG': 4, 
  'CGAE': 4, 'CGAF': 4, 'CGAM': 4, 'CGAP': 4, 'CHEM': 3.5, 'COMP': 4, 'CRCP': 4, 'CSDC': 4, 
  'CSEC': 4, 'CSMC': 4, 'ISEC': 4, 'ISMC': 4, 'ITEC': 4, 'ITMC': 4, 'MCGA': 4, 'MITC': 4, 
  'MITP': 4, 'MITS': 4, 'MIWR': 4, 'MMTH': 4, 'MSCS': 4, 'NCMC': 3.5, 'NCMP': 3.5, 'NSCS': 3.5, 
  'QCPA': 4, 'QCPE': 4, 'QCPP': 4, 'QECA': 4, 'QECC': 4, 'QECE': 4, 'QECP': 4, 'STAT': 3.5, 'SYST': 4,
  
  // Easy (as specified by user)
  'THEN': 1.5, 'PHIN': 1.5, 'SOCS': 1.5, 'PHIS': 1.5, 'GC': 1.5, 'GECC': 1.5, 'GEMT': 1.5, 'GESC': 1.5,
  'NSTP': 1, 'PFIT': 1,
};

try {
    const data = JSON.parse(fs.readFileSync(offeringsPath, 'utf8'));
    const subjectPrefixes = new Set();
    
    data.forEach(item => {
        if (item.course_code) {
            const match = item.course_code.match(/^[A-Z]+/i);
            if (match) {
                let prefix = match[0].toUpperCase().substring(0, 4);
                subjectPrefixes.add(prefix);
            }
        }
    });

    const sortedPrefixes = Array.from(subjectPrefixes).sort();
    
    let output = 'export const DIFFICULTY_MAP = {\n';
    sortedPrefixes.forEach(prefix => {
        let score = 2.5; // Default Moderate
        if (SCORE_MAP[prefix]) {
            score = SCORE_MAP[prefix];
        } else {
            // Check for shorter matches (e.g. PHI matching PHIN)
            const shorterKeys = Object.keys(SCORE_MAP).filter(k => prefix.startsWith(k));
            if (shorterKeys.length > 0) {
                // Take the longest match
                const bestMatch = shorterKeys.sort((a,b) => b.length - a.length)[0];
                score = SCORE_MAP[bestMatch];
            }
        }
        output += `  '${prefix}': { score: ${score} },\n`;
    });
    output += '};\n\n';
    
    output += `export const getDifficulty = (courseCode) => {
  if (!courseCode) return { score: 0 };
  
  const match = courseCode.match(/^[A-Z]+/i);
  if (!match) return { score: 2.5 };
  
  const prefix = match[0].toUpperCase().substring(0, 4);
  
  if (DIFFICULTY_MAP[prefix]) return DIFFICULTY_MAP[prefix];

  // Try shorter prefixes
  for (let i = prefix.length - 1; i >= 1; i--) {
    const shorter = prefix.substring(0, i);
    if (DIFFICULTY_MAP[shorter]) return DIFFICULTY_MAP[shorter];
  }

  return { score: 2.5 };
};
`;

    fs.writeFileSync('c:/Users/CEEJAY/Documents/COLLEGE/2ND YEAR/SECOND SEMESTER/app dev/VLAD_prototype/client/src/difficulty_map.js', output);
    console.log('Successfully simplified difficulty_map.js to revolve on score.');

} catch (error) {
    console.error('Error:', error);
}
