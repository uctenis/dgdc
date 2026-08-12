const xlsx = require('xlsx');
const path = require('path');

try {
  const filePath = path.join(__dirname, '..', 'SGC PS-FOR-DGDC 0005 PRESUPUESTO INFRAESTRUCTURA 2026.xlsx');
  const workbook = xlsx.readFile(filePath);
  
  console.log(`Found ${workbook.SheetNames.length} sheets`);
  workbook.SheetNames.forEach(sheetName => {
      console.log(`Sheet: ${sheetName}`);
      if (sheetName.toLowerCase().includes('ppto') || sheetName.toLowerCase().includes('cartera') || sheetName === 'BASE') {
          console.log(`--- ${sheetName} Content ---`);
          const sheet = workbook.Sheets[sheetName];
          const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          // Print first 20 rows
          data.slice(0, 20).forEach((row, i) => {
              if (row.length > 0) {
                  console.log(`Row ${i + 1}:`, row);
              }
          });
      }
  });
} catch (e) {
  console.error('Error reading excel:', e);
}
