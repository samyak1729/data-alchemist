"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";
import Papa from "papaparse";

export default function Home() {
  const [data, setData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
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
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted">
                    <tr>
                      {headers.map((header) => (
                        <th key={header} className="p-2">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b">
                        {headers.map((header) => (
                          <td key={header} className="p-2">{row[header]}</td>
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
            <div className="p-4 border rounded-md bg-muted/40 min-h-[100px] flex items-center justify-center">
              <p className="text-muted-foreground">
                Validation results will be shown here.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
