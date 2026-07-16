import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "outputs/location-dropdown-workbook/DQ_Maintenance_Tracking_System_with_Location_Dropdowns_dependent_dropdowns.xlsx";
const outputDir = "outputs/location-dropdown-workbook/dependent-dropdown-previews";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const sheetName of ["Work Orders", "Equipment", "PM Schedule", "Vendors", "Lists"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    `${outputDir}/${sheetName.replaceAll(" ", "_")}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
  maxChars: 3000,
});
console.log(errors.ndjson);
