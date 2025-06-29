export type ValidationResult = {
  rowIndex: number;
  header: string;
  message: string;
};

export type ValidationResponse = {
  errors: ValidationResult[];
  warnings: ValidationResult[];
};

// --- Individual Rule Implementations ---

// Rule: Missing Required Columns
const validateRequiredColumns = (headers: string[], requiredHeaders: string[]): ValidationResult[] => {
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  return missingHeaders.map(h => ({
    rowIndex: -1, // Table-wide error
    header: h,
    message: `Missing required column: ${h}`,
  }));
};

// Rule: Duplicate IDs
const validateDuplicateIds = (data: any[], idHeader: string): ValidationResult[] => {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  data.forEach(row => {
    const id = row[idHeader];
    if (id) {
      if (seenIds.has(id)) duplicateIds.add(id);
      else seenIds.add(id);
    }
  });

  const errors: ValidationResult[] = [];
  data.forEach((row, rowIndex) => {
    if (duplicateIds.has(row[idHeader])) {
      errors.push({
        rowIndex,
        header: idHeader,
        message: `Duplicate ID found: ${row[idHeader]}`,
      });
    }
  });
  return errors;
};

// Rule: Malformed Lists (and Normalization) - CORRECTED
export const validateAndNormalizeList = (
  value: string,
  options: { allowRanges: boolean; numeric: boolean }
): { error?: string; normalized?: string } => {
  if (!value || typeof value !== 'string') return { normalized: value };

  let processedValue = value.trim();
  if (processedValue.startsWith('[') && processedValue.endsWith(']')) {
    processedValue = processedValue.substring(1, processedValue.length - 1);
  }

  const items = processedValue.split(',').map(item => item.trim()).filter(Boolean);
  
  if (options.numeric) {
    const normalizedParts: number[] = [];
    for (const item of items) {
      if (options.allowRanges && item.includes('-')) {
        const parts = item.split('-').map(p => p.trim());
        if (parts.length !== 2) return { error: `Invalid range format: "${item}"` };
        const [start, end] = parts.map(Number);
        if (isNaN(start) || isNaN(end)) return { error: `Non-numeric value in range: "${item}"` };
        if (start > end) return { error: `Invalid range, start > end: "${item}"` };
        for (let i = start; i <= end; i++) normalizedParts.push(i);
      } else {
        const num = Number(item);
        if (isNaN(num)) return { error: `Non-numeric value: "${item}"` };
        normalizedParts.push(num);
      }
    }
    return { normalized: [...new Set(normalizedParts)].sort((a, b) => a - b).join(', ') };
  } else {
    // For string-based lists (like skills), just trim and remove duplicates
    const normalizedParts = [...new Set(items.filter(item => !item.includes('-')))];
    return { normalized: normalizedParts.sort().join(', ') };
  }
};


// Rule: Out-of-Range Values
const validateOutOfRange = (data: any[], header: string, min: number, max: number): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  data.forEach((row, rowIndex) => {
    const value = Number(row[header]);
    if (row[header] && !isNaN(value) && (value < min || value > max)) {
      errors.push({
        rowIndex,
        header,
        message: `Value ${value} is out of range (${min}-${max})`,
      });
    }
  });
  return errors;
};

// Rule: Broken JSON
const validateBrokenJson = (data: any[], header: string): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  data.forEach((row, rowIndex) => {
    const value = row[header];
    if (value && typeof value === 'string') {
      try {
        JSON.parse(value);
      } catch (e) {
        errors.push({ rowIndex, header, message: 'Invalid JSON format' });
      }
    }
  });
  return errors;
};

// --- Main Validation Orchestrator ---

export const runDeterministicValidations = (
  data: any[],
  headers: string[],
  entityType: 'clients' | 'workers' | 'tasks' | 'unknown'
): ValidationResponse => {
  if (entityType === 'unknown') {
      return { errors: [{rowIndex: -1, header: '', message: 'Could not determine file type. Please name files with "client", "worker", or "task".'}], warnings: [] };
  }

  const allErrors: ValidationResult[] = [];

  const schemas = {
    clients: {
      required: ['ClientID', 'PriorityLevel'],
      id: 'ClientID',
      range: { PriorityLevel: { min: 1, max: 5 } },
      json: ['AttributesJSON'],
      lists: { 'Requested TaskIDs': { numeric: false, allowRanges: false } }
    },
    workers: {
      required: ['WorkerID', 'AvailableSlots'],
      id: 'WorkerID',
      lists: { 'AvailableSlots': { numeric: true, allowRanges: false }, 'Skills': { numeric: false, allowRanges: false } }
    },
    tasks: {
      required: ['TaskID', 'Duration'],
      id: 'TaskID',
      range: { 'Duration': { min: 1, max: Infinity } },
      lists: { 'PreferredPhases': { numeric: true, allowRanges: true }, 'RequiredSkills': { numeric: false, allowRanges: false } }
    }
  };

  const schema = schemas[entityType];

  allErrors.push(...validateRequiredColumns(headers, schema.required));
  allErrors.push(...validateDuplicateIds(data, schema.id));

  if (schema.range) {
    for (const [header, range] of Object.entries(schema.range)) {
      allErrors.push(...validateOutOfRange(data, header, range.min, range.max));
    }
  }
  
  if (schema.json) {
      for (const header of schema.json) {
          allErrors.push(...validateBrokenJson(data, header));
      }
  }

  if (schema.lists) {
      for (const [header, options] of Object.entries(schema.lists)) {
          data.forEach((row, rowIndex) => {
              const result = validateAndNormalizeList(row[header], options);
              if (result.error) {
                  allErrors.push({ rowIndex, header, message: result.error });
              }
          });
      }
  }

  return {
    errors: allErrors,
    warnings: [],
  };
};
