import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
  const { type, searchQuery, clientsData, workersData, tasksData, validationErrors } = await request.json();

  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "API key not configured." }), { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let prompt = "";
  if (type === "clean_suggestions") {
    prompt = `You are a data cleaning AI. Analyze the following client, worker, and task data. Focus on addressing the provided validation errors. For each validation error, provide a suggestion in a JSON array format. Each object in the array should have 'entityType' (clients, workers, or tasks), 'rowIndex', 'header', 'originalValue', 'suggestedValue', and 'reason'. If no suggestions, return an empty array.\n\nClients: ${JSON.stringify(clientsData)}\nWorkers: ${JSON.stringify(workersData)}\nTasks: ${JSON.stringify(tasksData)}\n\nValidation Errors: ${JSON.stringify(validationErrors)}\n\nExample JSON format for suggestions:\n[\n  {\n    "entityType": "clients",\n    "rowIndex": 0,\n    "header": "ClientName",\n    "originalValue": "john doe",\n    "suggestedValue": "John Doe",\n    "reason": "Standardize capitalization"\n  },\n  {\n    "entityType": "workers",\n    "rowIndex": 1,\n    "header": "AvailableSlots",\n    "originalValue": "five",\n    "suggestedValue": "5",\n    "reason": "Convert text to numeric value"\n  }\n]\n`;
  } else {
    prompt = `You are a data analysis AI. Based on the following client, worker, and task data, answer the user's query. \n\nClients: ${JSON.stringify(clientsData)}\nWorkers: ${JSON.stringify(workersData)}\nTasks: ${JSON.stringify(tasksData)}\n\nUser Query: ${searchQuery}\n\nProvide a concise answer, directly addressing the query. If the query asks for filtering, provide the filtered data in JSON format.`;
  }

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return new Response(JSON.stringify({ result: text }), { status: 200 });
  } catch (error) {
    console.error("AI request error:", error);
    return new Response(JSON.stringify({ error: "Failed to get AI response." }), { status: 500 });
  }
}
