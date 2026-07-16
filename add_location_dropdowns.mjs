import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/tanel/OneDrive/Escritorio/DQ_Maintenance_Tracking_System_with_Location_Dropdowns.xlsx";
const outputDir = "outputs/location-dropdown-workbook";
const outputPath = `${outputDir}/DQ_Maintenance_Tracking_System_with_Location_Dropdowns_location_dropdowns.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

function sheet(name) {
  return workbook.worksheets.getItem(name);
}

function usedRows(sheetName) {
  const info = sheet(sheetName).getUsedRange(true);
  const address = info.address || "A1:A1";
  const last = address.split(":").pop();
  const row = Number(String(last).match(/\d+/)?.[0] || 1);
  return Math.max(row, 500);
}

const locationsSheet = sheet("Locations");
const listsSheet = sheet("Lists");
const locations = locationsSheet.getRange("A2:B200").values
  .filter(row => row[0] !== null && row[0] !== "" && row[1] !== null && row[1] !== "")
  .map(row => [row[0], row[1]]);

const locationRows = locations.length;
const serviceAreas = [["All Locations"], ...locations.map(row => [row[1]])];

listsSheet.getRange("J1:K1").values = [["Location ID Dropdown", "Location Name Dropdown"]];
listsSheet.getRangeByIndexes(1, 9, locationRows, 2).values = locations;
listsSheet.getRange("L1").values = [["Service Area Dropdown"]];
listsSheet.getRangeByIndexes(1, 11, serviceAreas.length, 1).values = serviceAreas;

listsSheet.getRange("J1:L1").format = {
  fill: "#0A2E5C",
  font: { bold: true, color: "#FFFFFF" },
};
listsSheet.getRangeByIndexes(1, 9, Math.max(locationRows, serviceAreas.length), 3).format.borders = {
  preset: "all",
  style: "thin",
  color: "#DCE4EE",
};
listsSheet.getRange("J:L").format.autofitColumns();

const idList = "'Lists'!$J$2:$J$" + (locationRows + 1);
const nameList = "'Lists'!$K$2:$K$" + (locationRows + 1);
const serviceAreaList = "'Lists'!$L$2:$L$" + (serviceAreas.length + 1);

const validations = [
  { sheetName: "Work Orders", range: `C2:C${usedRows("Work Orders")}`, formula: idList },
  { sheetName: "Work Orders", range: `D2:D${usedRows("Work Orders")}`, formula: nameList },
  { sheetName: "Equipment", range: `B2:B${usedRows("Equipment")}`, formula: idList },
  { sheetName: "Equipment", range: `C2:C${usedRows("Equipment")}`, formula: nameList },
  { sheetName: "PM Schedule", range: `B2:B${usedRows("PM Schedule")}`, formula: idList },
  { sheetName: "PM Schedule", range: `C2:C${usedRows("PM Schedule")}`, formula: nameList },
  { sheetName: "Vendors", range: `H2:H${usedRows("Vendors")}`, formula: serviceAreaList },
];

for (const item of validations) {
  sheet(item.sheetName).getRange(item.range).dataValidation = {
    allowBlank: true,
    list: { inCellDropDown: true, source: `=${item.formula}` },
  };
}

for (const name of ["Work Orders", "Equipment", "PM Schedule", "Vendors", "Lists"]) {
  try {
    sheet(name).freezePanes.freezeRows(1);
  } catch {}
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
  maxChars: 4000,
});
console.log(errors.ndjson);

await fs.mkdir(outputDir, { recursive: true });

for (const name of ["Work Orders", "Equipment", "PM Schedule", "Vendors", "Lists"]) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${name.replace(/[^a-z0-9]+/gi, "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
