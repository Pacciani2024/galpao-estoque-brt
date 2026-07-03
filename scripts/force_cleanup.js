const fs = require('fs');

const codesToDelete = [
    { itemIndex: "29", qrCode: "000560000560" },
    { itemIndex: "352", qrCode: "000022000022" }, // Tentando este de novo caso o teste não tenha salvo
    { itemIndex: "352", qrCode: "000022000022000045" }
];

console.log('--- Cleaning Up Invalid QRs ---');

if (fs.existsSync('logs/qr_units.json')) {
    let data = JSON.parse(fs.readFileSync('logs/qr_units.json', 'utf-8'));
    let changes = 0;

    codesToDelete.forEach(target => {
        if (data.units[target.itemIndex]) {
            const index = data.units[target.itemIndex].findIndex(u => u.qrCode === target.qrCode);
            if (index !== -1) {
                data.units[target.itemIndex].splice(index, 1);
                console.log(`✅ Deleted ${target.qrCode} from item ${target.itemIndex}`);
                changes++;
            } else {
                console.log(`⚠️ Code ${target.qrCode} not found in item ${target.itemIndex}`);
            }
        }
    });

    if (changes > 0) {
        fs.writeFileSync('logs/qr_units.json', JSON.stringify(data, null, 2));
        console.log('💾 Changes saved to qr_units.json');
    } else {
        console.log('No changes made.');
    }
} else {
    console.log('Error: qr_units.json not found');
}
