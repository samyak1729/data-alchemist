"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import Papa from "papaparse";
import { runDeterministicValidations, validateAndNormalizeList, ValidationResult } from "@/lib/validators/deterministic";

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [entityType, setEntityType] = useState<'clients' | 'workers' | 'tasks' | 'unknown'>('unknown');
  const [validationErrors, setValidationErrors] = useState<ValidationResult[]>([]);

  const triggerValidation = useCallback(() => {
    if (data.length > 0) {
      const results = runDeterministicValidations(data, headers, entityType);
      setValidationErrors(results.errors);
    }
  }, [data, headers, entityType]);

  useEffect(() => {
    triggerValidation();
  }, [data, triggerValidation]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const name = file.name.toLowerCase();
      if (name.includes('client')) setEntityType('clients');
      else if (name.includes('worker')) setEntityType('workers');
      else if (name.includes('task')) setEntityType('tasks');
      else setEntityType('unknown');

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setHeaders(results.meta.fields || []);
          setData(results.data);
        },
      });
    }
  };

  const handleCellChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    rowIndex: number,
    header: string
  ) => {
    const newData = [...data];
    newData[rowIndex][header] = e.target.value;
    setData(newData);
  };

  const handleCellBlur = (rowIndex: number, header: string) => {
    const listValidationSchemas = {
        clients: { 'Requested TaskIDs': { numeric: false, allowRanges: false } },
        workers: { 'AvailableSlots': { numeric: true, allowRanges: false }, 'Skills': { numeric: false, allowRanges: false } },
        tasks: { 'PreferredPhases': { numeric: true, allowRanges: true }, 'RequiredSkills': { numeric: false, allowRanges: false } }
    };

    if (entityType !== 'unknown' && listValidationSchemas[entityType][header]) {
        const options = listValidationSchemas[entityType][header];
        const cellValue = data[rowIndex][header];
        const result = validateAndNormalizeList(cellValue, options);

        if (result.normalized !== undefined && result.normalized !== cellValue) {
            const newData = [...data];
            newData[rowIndex][header] = result.normalized;
            setData(newData);
        }
    }
    triggerValidation(); // Re-run validation on blur
  };

  const getCellClassName = (rowIndex: number, header: string) => {
    const isError = validationErrors.some(
      (err) => err.rowIndex === rowIndex && err.header === header
    );
    return isError ? "ring-2 ring-red-500" : "";
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Data Alchemist</h1>
        <p className="text-muted-foreground mt-2">
          Cleanse, validate, and transform your spreadsheet data with the power of AI.
        </p>
      </header>

      <main className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1. Upload Your Data</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".csv"
              onChange={handleFileUpload}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center gap-2 text-center"
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <span className="font-semibold">Click to upload a file</span>
              <span className="text-sm text-muted-foreground">CSV up to 10MB</span>
            </label>
            {fileName && (
              <p className="mt-4 text-sm font-medium">Uploaded: {fileName}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. View and Edit Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              {data.length > 0 ? (
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-muted">
                    <tr>
                      {headers.map((header) => (
                        <th key={header} className="p-2 border-b">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b">
                        {headers.map((header) => (
                          <td key={header} className="p-0">
                            <Input
                              type="text"
                              value={row[header] || ""}
                              onChange={(e) => handleCellChange(e, rowIndex, header)}
                              onBlur={() => handleCellBlur(rowIndex, header)}
                              className={`w-full h-full p-2 bg-transparent border-none rounded-none focus:ring-2 focus:ring-primary ${getCellClassName(rowIndex, header)}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4 border rounded-md bg-muted/40 min-h-[200px] flex items-center justify-center">
                  <p className="text-muted-foreground">
                    Your data will appear here after upload.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Validation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {validationErrors.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-600">
                {validationErrors.map((error, index) => (
                  <li key={index}>
                    {error.rowIndex === -1
                      ? error.message
                      : `Row ${error.rowIndex + 1}, Column '${error.header}': ${error.message}`}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4 border rounded-md bg-muted/40 min-h-[100px] flex items-center justify-center">
                <p className="text-muted-foreground">
                  {data.length > 0 ? "No validation errors found." : "Validation results will be shown here."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
