import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const inputPath = "C:/Users/tanel/OneDrive/Escritorio/DQ_Maintenance_Tracking_System_with_Location_Dropdowns.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 12000, tableMaxRows: 5, tableMaxCols: 12, tableMaxCellChars: 80 });
console.log(summary.ndjson);
