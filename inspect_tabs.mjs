import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const inputPath = "C:/Users/tanel/OneDrive/Escritorio/DQ_Maintenance_Tracking_System_with_Location_Dropdowns.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 12000 });
console.log(sheets.ndjson);
for (const name of ["Locations","Work Orders","Equipment","PM Schedule","Vendors","Lists"]) {
  try {
    const inspection = await workbook.inspect({ kind: "table", sheetId: name, range: "A1:Z8", tableMaxRows: 8, tableMaxCols: 26, maxChars: 8000 });
    console.log(`--- ${name} ---`);
    console.log(inspection.ndjson);
  } catch (e) { console.log(`ERR ${name}`, e.message); }
}
