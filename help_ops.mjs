import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const input = await FileBlob.load("C:/Users/tanel/OneDrive/Escritorio/DQ_Maintenance_Tracking_System_with_Location_Dropdowns.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
console.log(workbook.help("op", { search: "datavalidation|apply|operation", include: "index,examples,notes", maxChars: 12000 }).ndjson);
