import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const input = await FileBlob.load("C:/Users/tanel/OneDrive/Escritorio/DQ_Maintenance_Tracking_System_with_Location_Dropdowns.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
console.log(workbook.help("dataValidation", { include: "index,examples,notes", maxChars: 8000 }).ndjson);
console.log(workbook.help("dataValidations.add", { include: "index,examples,notes", maxChars: 8000 }).ndjson);
