const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const uid = 'user_1773261779301';

function getUserDataDir(userId) {
    const dir = path.join(dataDir, 'users', userId);
    return dir;
}

const userDir = getUserDataDir(uid);
console.log('User directory:', userDir);
console.log('Exists:', fs.existsSync(userDir));

if (fs.existsSync(userDir)) {
    const files = fs.readdirSync(userDir);
    console.log('All files in userDir:', files);
    const filteredFiles = files.filter(f => f.startsWith('leads_') || f.startsWith('enriched_'));
    console.log('Filtered files:', filteredFiles);

    let allClients = [];
    for (const file of filteredFiles) {
        try {
            const content = fs.readFileSync(path.join(userDir, file), 'utf8');
            const leads = JSON.parse(content);
            console.log(`File ${file} has ${leads.length} leads.`);
            leads.forEach((l, i) => {
                const id = l.id || `lead-${i}`;
                allClients.push({
                    ...l,
                    id: id,
                    file: file,
                    status: l.status || 'New',
                    notes: l.notes || ''
                });
            });
        } catch (e) {
            console.error('Error parsing file:', file, e.message);
        }
    }
    console.log('Total clients aggregated:', allClients.length);
} else {
    console.log('User directory DOES NOT exist at expected path.');
}
