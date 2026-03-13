const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    const filePath = path.join(srcDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Replace require('./src/...') with require('./...')
    // Matches both single and double quotes
    content = content.replace(/require\(['"]\.\/src\/(.*?)['"]\)/g, "require('./$1')");
    
    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`[Fixed] ${file}`);
    }
});
