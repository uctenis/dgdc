const ExcelJS = require('exceljs');
const path = require('path');

async function readExcel() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '..', 'SGC PS-FOR-DGDC 0005 PRESUPUESTO INFRAESTRUCTURA 2026.xlsx');
  await workbook.xlsx.readFile(filePath);
  
  console.log(`Found ${workbook.worksheets.length} sheets`);
  workbook.worksheets.forEach(sheet => {
      console.log(`Sheet: ${sheet.name}`);
      // Let's print the first 10 rows of 'ppto 2026' or similar if it exists
      if (sheet.name.toLowerCase().includes('ppto') || sheet.name.toLowerCase().includes('cartera') || sheet.name === 'BASE') {
          console.log(`--- ${sheet.name} Content ---`);
          for (let i = 1; i <= 15; i++) {
              const row = sheet.getRow(i).values;
              if (row && row.length > 0) {
                  console.log(`Row ${i}:`, row);
              }
          }
      }
  });
}

readExcel().catch(console.error);
