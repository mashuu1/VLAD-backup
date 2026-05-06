
const fs = require('fs');
const content = fs.readFileSync('c:/Users/CEEJAY/Documents/COLLEGE/2ND YEAR/SECOND SEMESTER/app dev/VLAD_prototype/client/src/App.jsx', 'utf8');

const lines = content.split('\n');
const startLine = 611; // Success return start
const endLine = 1000; // Success return end

let braces = 0;
let brackets = 0;
let parens = 0;
let singleQuotes = false;
let doubleQuotes = false;
let backticks = false;

for (let i = startLine - 1; i < endLine; i++) {
    const line = lines[i];
    if (!line) continue;
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const prev = line[j-1];

        if (char === "'" && !doubleQuotes && !backticks && prev !== '\\') singleQuotes = !singleQuotes;
        if (char === '"' && !singleQuotes && !backticks && prev !== '\\') doubleQuotes = !doubleQuotes;
        if (char === '`' && !singleQuotes && !doubleQuotes && prev !== '\\') backticks = !backticks;

        if (!singleQuotes && !doubleQuotes && !backticks) {
            if (char === '{') braces++;
            if (char === '}') braces--;
            if (char === '[') brackets++;
            if (char === ']') brackets--;
            if (char === '(') parens++;
            if (char === ')') parens--;
        }
    }
}

console.log(`Braces: ${braces}`);
console.log(`Brackets: ${brackets}`);
console.log(`Parens: ${parens}`);
console.log(`SingleQuotes: ${singleQuotes}`);
console.log(`DoubleQuotes: ${doubleQuotes}`);
console.log(`Backticks: ${backticks}`);
