"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import Papa from "papaparse";
import { runDeterministicValidations, validateAndNormalizeList, ValidationResult } from "@/lib/validators/deterministic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EntityData {
  data: any[];
  headers: string[];
  fileName: string;
}

interface CleaningSuggestion {
  entityType: 'clients' | 'workers' | 'tasks';
  rowIndex: number;
  header: string;
  originalValue: any;
  suggestedValue: any;
  reason: string;
}

export default function Home() {
  const [clientsData, setClientsData] = useState<EntityData>({ data: [], headers: [], fileName: '' });
  const [workersData, setWorkersData] = useState<EntityData>({ data: [], headers: [], fileName: '' });
  const [tasksData, setTasksData] = useState<EntityData>({ data: [], headers: [], fileName: '' });
  const [activeTab, setActiveTab] = useState<string>('clients');
  const [allValidationErrors, setAllValidationErrors] = useState<Record<string, ValidationResult[]>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredClientsData, setFilteredClientsData] = useState<any[]>([]);
  const [filteredWorkersData, setFilteredWorkersData] = useState<any[]>([]);
  const [filteredTasksData, setFilteredTasksData] = useState<any[]>([]);
  const [aiResponseText, setAiResponseText] = useState<string>('');
  const [cleaningSuggestions, setCleaningSuggestions] = useState<CleaningSuggestion[]>([]);


  const triggerValidation = useCallback(() => {
    const allData = {
      clients: clientsData,
      workers: workersData,
      tasks: tasksData,
    };
    const results = runDeterministicValidations(allData);
    setAllValidationErrors(results);
  }, [clientsData, workersData, tasksData]);

  useEffect(() => {
    triggerValidation();
  }, [clientsData.data, workersData.data, tasksData.data, triggerValidation]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, entityType: 'clients' | 'workers' | 'tasks') => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const newEntityData = { data: results.data, headers: results.meta.fields || [], fileName: file.name };
          if (entityType === 'clients') setClientsData(newEntityData);
          else if (entityType === 'workers') setWorkersData(newEntityData);
          else if (entityType === 'tasks') setTasksData(newEntityData);
        },
      });
    }
  };

  const handleCellChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    entityType: 'clients' | 'workers' | 'tasks',
    rowIndex: number,
    header: string
  ) => {
    const setter = entityType === 'clients' ? setClientsData : entityType === 'workers' ? setWorkersData : setTasksData;
    setter(prev => {
      const newData = [...prev.data];
      newData[rowIndex][header] = e.target.value;
      return { ...prev, data: newData };
    });
  };

  const handleCellBlur = (
    entityType: 'clients' | 'workers' | 'tasks',
    rowIndex: number,
    header: string
  ) => {
    const listValidationSchemas = {
        clients: { 'Requested TaskIDs': { numeric: false, allowRanges: false } },
        workers: { 'AvailableSlots': { numeric: true, allowRanges: false }, 'Skills': { numeric: false, allowRanges: false } },
        tasks: { 'PreferredPhases': { numeric: true, allowRanges: true }, 'RequiredSkills': { numeric: false, allowRanges: false } }
    };

    const currentData = entityType === 'clients' ? clientsData.data : entityType === 'workers' ? workersData.data : tasksData.data;

    if (listValidationSchemas[entityType] && listValidationSchemas[entityType][header]) {
        const options = listValidationSchemas[entityType][header];
        const cellValue = currentData[rowIndex][header];
        const result = validateAndNormalizeList(cellValue, options);

        if (result.normalized !== undefined && result.normalized !== cellValue) {
            const setter = entityType === 'clients' ? setClientsData : entityType === 'workers' ? setWorkersData : setTasksData;
            setter(prev => {
                const newData = [...prev.data];
                newData[rowIndex][header] = result.normalized;
                return { ...prev, data: newData };
            });
        }
    }
    triggerValidation(); // Re-run validation on blur
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setFilteredClientsData([]);
      setFilteredWorkersData([]);
      setFilteredTasksData([]);
      return;
    }

    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery,
          clientsData: clientsData.data,
          workersData: workersData.data,
          tasksData: tasksData.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("AI Response:", data.result);

      // Assuming the AI returns filtered data in a specific JSON format
      // You'll need to adjust this parsing based on your AI's actual output
      try {
        const aiResponse = JSON.parse(data.result);
        if (aiResponse.clients) setFilteredClientsData(aiResponse.clients);
        if (aiResponse.workers) setFilteredWorkersData(aiResponse.workers);
        if (aiResponse.tasks) setFilteredTasksData(aiResponse.tasks);
      } catch (parseError) {
        console.warn("AI response was not a JSON object, displaying as is:", data.result);
        // Handle cases where AI returns a natural language answer instead of JSON
        // For now, we'll just clear filters if it's not parsable JSON for filtered data
        setFilteredClientsData([]);
        setFilteredWorkersData([]);
        setFilteredTasksData([]);
        setAiResponseText(data.result);
      }

    } catch (error) {
      console.error("Error during AI search:", error);
      setAiResponseText("Failed to get AI response. Check console for details.");
    }
  };

  const handleAcceptAllSuggestions = () => {
    let newClientsData = { ...clientsData };
    let newWorkersData = { ...workersData };
    let newTasksData = { ...tasksData };

    cleaningSuggestions.forEach(suggestion => {
      if (suggestion.entityType === 'clients') {
        newClientsData.data[suggestion.rowIndex][suggestion.header] = suggestion.suggestedValue;
      } else if (suggestion.entityType === 'workers') {
        newWorkersData.data[suggestion.rowIndex][suggestion.header] = suggestion.suggestedValue;
      } else if (suggestion.entityType === 'tasks') {
        newTasksData.data[suggestion.rowIndex][suggestion.header] = suggestion.suggestedValue;
      }
    });

    setClientsData(newClientsData);
    setWorkersData(newWorkersData);
    setTasksData(newTasksData);
    setCleaningSuggestions([]);
    triggerValidation();
  };

  const handleRejectAllSuggestions = () => {
    setCleaningSuggestions([]);
    triggerValidation();
  };

  const handleGetCleaningSuggestions = async () => {
    setAiResponseText(''); // Clear previous AI response
    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: "clean_suggestions",
          clientsData: clientsData.data,
          workersData: workersData.data,
          tasksData: tasksData.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("AI Cleaning Suggestions:", data.result);

      try {
        const suggestions = JSON.parse(data.result);
        setCleaningSuggestions(suggestions);
      } catch (parseError) {
        console.warn("AI cleaning suggestions were not a JSON object, displaying as is:", data.result);
        setAiResponseText("AI Cleaning Suggestions: " + data.result);
        setCleaningSuggestions([]);
      }

    } catch (error) {
      console.error("Error fetching cleaning suggestions:", error);
      setAiResponseText("Failed to get cleaning suggestions. Check console for details.");
    }
  };

  const applySuggestion = (suggestion: CleaningSuggestion) => {
    const setter =
      suggestion.entityType === 'clients'
        ? setClientsData
        : suggestion.entityType === 'workers'
        ? setWorkersData
        : setTasksData;

    setter(prev => {
      const newData = [...prev.data];
      newData[suggestion.rowIndex][suggestion.header] = suggestion.suggestedValue;
      return { ...prev, data: newData };
    });

    // Remove the applied suggestion from the list
    setCleaningSuggestions(prev =>
      prev.filter(s => s !== suggestion)
    );
    triggerValidation(); // Re-run validation after applying suggestion
  };

  const renderDataTable = (data: any[], headers: string[], entityType: 'clients' | 'workers' | 'tasks') => {
    const displayData = (entityType === 'clients' && filteredClientsData.length > 0) ? filteredClientsData :
                        (entityType === 'workers' && filteredWorkersData.length > 0) ? filteredWorkersData :
                        (entityType === 'tasks' && filteredTasksData.length > 0) ? filteredTasksData :
                        data;

    if (displayData.length === 0) {
      return (
        <div className="p-4 border rounded-md bg-muted/40 min-h-[200px] flex items-center justify-center">
          <p className="text-muted-foreground">
            {searchQuery && (filteredClientsData.length === 0 && filteredWorkersData.length === 0 && filteredTasksData.length === 0)
              ? "No results found for your query."
              : `Upload ${entityType} data to view and edit.`}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <TooltipProvider>
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="p-2 border-b">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b">
                  {headers.map((header) => {
                    const suggestion = cleaningSuggestions.find(
                      (s) =>
                        s.entityType === entityType &&
                        s.rowIndex === rowIndex &&
                        s.header === header
                    );
                    return (
                      <td key={header} className="p-0">
                        {suggestion ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Input
                                type="text"
                                value={row[header] || ""}
                                onChange={(e) => handleCellChange(e, entityType, rowIndex, header)}
                                onBlur={() => handleCellBlur(entityType, rowIndex, header)}
                                className={`w-full h-full p-2 bg-transparent border-none rounded-none focus:ring-2 focus:ring-primary ${getCellClassName(entityType, rowIndex, header)}`}
                              />
                            </TooltipTrigger>
                            <TooltipContent className="bg-white text-black p-3 rounded-md shadow-lg border border-gray-200 max-w-xs">
                              <p className="font-bold mb-1">Suggestion:</p>
                              <p>Original: <span className="line-through text-red-500">{String(suggestion.originalValue)}</span></p>
                              <p>Suggested: <span className="text-green-500">{String(suggestion.suggestedValue)}</span></p>
                              <p className="text-muted-foreground text-xs mt-1">Reason: {suggestion.reason}</p>
                              <Button
                                size="sm"
                                className="mt-2 w-full"
                                onClick={() => applySuggestion(suggestion)}
                              >
                                Apply Suggestion
                              </Button>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Input
                            type="text"
                            value={row[header] || ""}
                            onChange={(e) => handleCellChange(e, entityType, rowIndex, header)}
                            onBlur={() => handleCellBlur(entityType, rowIndex, header)}
                            className={`w-full h-full p-2 bg-transparent border-none rounded-none focus:ring-2 focus:ring-primary ${getCellClassName(entityType, rowIndex, header)}`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
    );
  };

  const getCellClassName = (entityType: 'clients' | 'workers' | 'tasks', rowIndex: number, header: string) => {
    const errors = allValidationErrors[entityType];
    if (errors) {
      const error = errors.find(err => err.rowIndex === rowIndex && err.header === header);
      if (error) {
        return 'border-red-500';
      }
    }
    return '';
  };

  const totalErrors = Object.values(allValidationErrors).flat().length;

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
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Client Upload */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg">
              <input
                type="file"
                id="client-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'clients')}
              />
              <label
                htmlFor="client-upload"
                className="cursor-pointer flex flex-col items-center gap-2 text-center"
              >
                <Upload className="w-10 h-10 text-muted-foreground" />
                <span className="font-semibold">Upload Clients CSV</span>
                <span className="text-sm text-muted-foreground">{clientsData.fileName || 'No file chosen'}</span>
              </label>
            </div>

            {/* Worker Upload */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg">
              <input
                type="file"
                id="worker-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'workers')}
              />
              <label
                htmlFor="worker-upload"
                className="cursor-pointer flex flex-col items-center gap-2 text-center"
              >
                <Upload className="w-10 h-10 text-muted-foreground" />
                <span className="font-semibold">Upload Workers CSV</span>
                <span className="text-sm text-muted-foreground">{workersData.fileName || 'No file chosen'}</span>
              </label>
            </div>

            {/* Task Upload */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg">
              <input
                type="file"
                id="task-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => handleFileUpload(e, 'tasks')}
              />
              <label
                htmlFor="task-upload"
                className="cursor-pointer flex flex-col items-center gap-2 text-center"
              >
                <Upload className="w-10 h-10 text-muted-foreground" />
                <span className="font-semibold">Upload Tasks CSV</span>
                <span className="text-sm text-muted-foreground">{tasksData.fileName || 'No file chosen'}</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. View and Edit Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2 mb-4">
              <Input
                type="text"
                placeholder="Ask a question about your data (e.g., 'Show clients with PriorityLevel 5')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              />
              <Button onClick={handleSearch}>Search</Button>
              {cleaningSuggestions.length === 0 ? (
                <Button onClick={handleGetCleaningSuggestions}>Get Cleaning Suggestions</Button>
              ) : (
                <>
                  <Button onClick={handleAcceptAllSuggestions}>Accept All Suggestions</Button>
                  <Button variant="outline" onClick={handleRejectAllSuggestions}>Reject Remaining Suggestions</Button>
                </>
              )}
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="clients">Clients</TabsTrigger>
                <TabsTrigger value="workers">Workers</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
              </TabsList>
              <TabsContent value="clients">
                {renderDataTable(clientsData.data, clientsData.headers, 'clients')}
              </TabsContent>
              <TabsContent value="workers">
                {renderDataTable(workersData.data, workersData.headers, 'workers')}
              </TabsContent>
              <TabsContent value="tasks">
                {renderDataTable(tasksData.data, tasksData.headers, 'tasks')}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {aiResponseText && (
          <Card>
            <CardHeader>
              <CardTitle>AI Response</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 border rounded-md bg-muted/40 min-h-[100px]">
                <p className="text-muted-foreground whitespace-pre-wrap">{aiResponseText}</p>
              </div>
            </CardContent>
          </Card>
        )}

        

        <Card>
          <CardHeader>
            <CardTitle>3. Validation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {totalErrors > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-600">
                {Object.entries(allValidationErrors || {}).map(([entityType, errors]) => (
                  (errors || []).map((error, index) => (
                    <li key={`${entityType}-${index}`}>
                      <strong>{entityType.charAt(0).toUpperCase() + entityType.slice(1)}: </strong>
                      {error.rowIndex === -1
                        ? error.message
                        : `Row ${error.rowIndex + 1}, Column '${error.header}': ${error.message}`}
                    </li>
                  ))
                ))}
              </ul>
            ) : (
              <div className="p-4 border rounded-md bg-muted/40 min-h-[100px] flex items-center justify-center">
                <p className="text-muted-foreground">
                  {clientsData.data.length > 0 || workersData.data.length > 0 || tasksData.data.length > 0
                    ? "No validation errors found." 
                    : "Validation results will be shown here after you upload data."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
