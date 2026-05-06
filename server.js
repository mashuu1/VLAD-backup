const path = require('path');
const fs = require('fs');

// Change working directory to the 'server' folder
// This ensures that relative paths like './data' and './difficulty_map' work correctly
const serverDir = path.join(__dirname, 'server');

if (!fs.existsSync(serverDir)) {
    console.error(`Error: Could not find server directory at ${serverDir}`);
    process.exit(1);
}

process.chdir(serverDir);
console.log(`[VLAD Root] Working directory changed to: ${process.cwd()}`);

// Load the actual server
require('./server/index.js');
