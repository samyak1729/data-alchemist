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
const validateDuplicateIds = (data: Record<string, string | number | boolean | object>[], idHeader: string): ValidationResult[] => {
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
      if (item === '') continue; // Allow for trailing commas

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
const validateOutOfRange = (data: Record<string, string | number | boolean | object>[], header: string, min: number, max: number): ValidationResult[] => {
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
const validateBrokenJson = (data: Record<string, string | number | boolean | object>[], header: string): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  data.forEach((row, rowIndex) => {
    const value = row[header];
    if (value && typeof value === 'string') {
      try {
        JSON.parse(value);
      } catch {};
    }
    }
  });
  return errors;
};

// Rule: Unknown References (Requested TaskIDs not found in tasks)
const validateUnknownReferences = (
  clientsData: Record<string, string | number | boolean | object>[],
  tasksData: Record<string, string | number | boolean | object>[]
): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  const taskIds = new Set(tasksData.map(task => task.TaskID));

  clientsData.forEach((client, clientIndex) => {
    const requestedTasksStr = client['Requested TaskIDs'];
    if (requestedTasksStr) {
      const { normalized, error } = validateAndNormalizeList(requestedTasksStr, { numeric: false, allowRanges: false });
      if (error) {
        errors.push({
          rowIndex: clientIndex,
          header: 'Requested TaskIDs',
          message: `Malformed Requested TaskIDs: ${error}`,
        });
        return;
      }
      const requestedTaskIds = normalized ? normalized.split(',').map(id => id.trim()) : [];
      requestedTaskIds.forEach(reqTaskId => {
        if (!taskIds.has(reqTaskId)) {
          errors.push({
            rowIndex: clientIndex,
            header: 'Requested TaskIDs',
            message: `Unknown TaskID: ${reqTaskId} in Requested TaskIDs`,
          });
        }
      });
    }
  });
  return errors;
};

// Rule: Overloaded Workers (AvailableSlots.length < MaxLoadPerPhase)
const validateOverloadedWorkers = (workersData: Record<string, string | number | boolean | object>[]): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  workersData.forEach((worker, workerIndex) => {
    const availableSlotsStr = worker.AvailableSlots;
    const maxLoadPerPhase = Number(worker.MaxLoadPerPhase);

    if (availableSlotsStr && !isNaN(maxLoadPerPhase)) {
      const { normalized, error } = validateAndNormalizeList(availableSlotsStr, { numeric: true, allowRanges: false });
      if (error) {
        errors.push({
          rowIndex: workerIndex,
          header: 'AvailableSlots',
          message: `Malformed AvailableSlots: ${error}`,
        });
        return;
      }
      const availableSlots = normalized ? normalized.split(',').map(Number) : [];
      if (availableSlots.length < maxLoadPerPhase) {
        errors.push({
          rowIndex: workerIndex,
          header: 'MaxLoadPerPhase',
          message: `Worker has ${availableSlots.length} available slots but MaxLoadPerPhase is ${maxLoadPerPhase}`,
        });
      }
    }
  });
  return errors;
};

// Rule: Skill-Coverage Matrix (every RequiredSkill maps to at least one worker)
const validateSkillCoverageMatrix = (
  tasksData: Record<string, string | number | boolean | object>[],
  workersData: Record<string, string | number | boolean | object>[]
): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  const workerSkills = new Set<string>();

  workersData.forEach(worker => {
    const skillsStr = worker.Skills;
    if (skillsStr) {
      const { normalized } = validateAndNormalizeList(skillsStr, { numeric: false, allowRanges: false });
      if (normalized) {
        normalized.split(',').map(s => s.trim()).forEach(skill => workerSkills.add(skill));
      }
    }
  });

  tasksData.forEach((task, taskIndex) => {
    const requiredSkillsStr = task.RequiredSkills;
    if (requiredSkillsStr) {
      const { normalized, error } = validateAndNormalizeList(requiredSkillsStr, { numeric: false, allowRanges: false });
      if (error) {
        errors.push({
          rowIndex: taskIndex,
          header: 'RequiredSkills',
          message: `Malformed RequiredSkills: ${error}`,
        });
        return;
      }
      const requiredSkills = normalized ? normalized.split(',').map(s => s.trim()) : [];
      requiredSkills.forEach(reqSkill => {
        if (!workerSkills.has(reqSkill)) {
          errors.push({
            rowIndex: taskIndex,
            header: 'RequiredSkills',
            message: `Required skill '${reqSkill}' not found in any worker`,
          });
        }
      });
    }
  });
  return errors;
};

// Rule: Max-Concurrency Feasibility (MaxConcurrent <= count of qualified, available workers)
const validateMaxConcurrencyFeasibility = (
  tasksData: Record<string, string | number | boolean | object>[],
  workersData: Record<string, string | number | boolean | object>[]
): ValidationResult[] => {
  const errors: ValidationResult[] = [];

  tasksData.forEach((task, taskIndex) => {
    const maxConcurrent = Number(task.MaxConcurrent);
    const requiredSkillsStr = task.RequiredSkills;

    if (isNaN(maxConcurrent) || maxConcurrent <= 0) {
      // This should ideally be caught by out-of-range validation, but good to have a fallback
      return;
    }

    let qualifiedWorkerCount = 0;
    if (requiredSkillsStr) {
      const { normalized } = validateAndNormalizeList(requiredSkillsStr, { numeric: false, allowRanges: false });
      const requiredSkills = normalized ? normalized.split(',').map(s => s.trim()) : [];

      workersData.forEach(worker => {
        const workerSkillsStr = worker.Skills;
        if (workerSkillsStr) {
          const { normalized: workerNormalizedSkills } = validateAndNormalizeList(workerSkillsStr, { numeric: false, allowRanges: false });
          const workerSkills = workerNormalizedSkills ? workerNormalizedSkills.split(',').map(s => s.trim()) : [];
          
          const hasAllSkills = requiredSkills.every(reqSkill => workerSkills.includes(reqSkill));
          if (hasAllSkills) {
            qualifiedWorkerCount++;
          }
        }
      });
    }

    if (maxConcurrent > qualifiedWorkerCount) {
      errors.push({
        rowIndex: taskIndex,
        header: 'MaxConcurrent',
        message: `MaxConcurrent (${maxConcurrent}) is higher than available qualified workers (${qualifiedWorkerCount})`,
      });
    }
  });
  return errors;
};

// Rule: Phase-Slot Saturation (sum of task durations per phase > total worker slots)
const validatePhaseSlotSaturation = (
  tasksData: Record<string, string | number | boolean | object>[],
  workersData: Record<string, string | number | boolean | object>[]
): ValidationResult[] => {
  const errors: ValidationResult[] = [];
  const phaseCapacities: { [key: number]: number } = {}; // MaxLoadPerPhase sum
  const phaseDemands: { [key: number]: number } = {}; // Task Duration sum

  // Determine max phase for iteration
  let maxPhase = 0;
  workersData.forEach(worker => {
    const availableSlotsStr = worker.AvailableSlots;
    if (availableSlotsStr) {
      const { normalized } = validateAndNormalizeList(availableSlotsStr, { numeric: true, allowRanges: false });
      const slots = normalized ? normalized.split(',').map(Number) : [];
      slots.forEach(slot => {
        if (slot > maxPhase) maxPhase = slot;
      });
    }
  });
  tasksData.forEach(task => {
    const preferredPhasesStr = task.PreferredPhases;
    if (preferredPhasesStr) {
      const { normalized } = validateAndNormalizeList(preferredPhasesStr, { numeric: true, allowRanges: true });
      const phases = normalized ? normalized.split(',').map(Number) : [];
      phases.forEach(phase => {
        if (phase > maxPhase) maxPhase = phase;
      });
    }
  });

  // Calculate Phase Capacities
  for (let p = 1; p <= maxPhase; p++) {
    phaseCapacities[p] = 0;
    workersData.forEach(worker => {
      const availableSlotsStr = worker.AvailableSlots;
      const maxLoadPerPhase = Number(worker.MaxLoadPerPhase);
      if (availableSlotsStr && !isNaN(maxLoadPerPhase)) {
        const { normalized } = validateAndNormalizeList(availableSlotsStr, { numeric: true, allowRanges: false });
        const slots = normalized ? normalized.split(',').map(Number) : [];
        if (slots.includes(p)) {
          phaseCapacities[p] += maxLoadPerPhase;
        }
      }
    });
  }

  // Calculate Phase Demands
  for (let p = 1; p <= maxPhase; p++) {
    phaseDemands[p] = 0;
    tasksData.forEach(task => {
      const duration = Number(task.Duration);
      const preferredPhasesStr = task.PreferredPhases;

      if (!isNaN(duration) && duration > 0 && preferredPhasesStr) {
        const { normalized } = validateAndNormalizeList(preferredPhasesStr, { numeric: true, allowRanges: true });
        const phases = normalized ? normalized.split(',').map(Number) : [];
        
        // A task contributes to demand for each phase it's active in within its duration
        // and preferred phases. For simplicity, we assume a task consumes 1 slot per phase it's active.
        // More complex logic might involve distributing duration across phases.
        if (phases.includes(p)) {
            phaseDemands[p] += 1; // Each task consumes 1 unit of demand per phase it's active in
        }
      }
    });
  }

  // Compare Demands vs Capacities
  for (let p = 1; p <= maxPhase; p++) {
    if (phaseDemands[p] > phaseCapacities[p]) {
      errors.push({
        rowIndex: -1, // Table-wide error for the phase
        header: `Phase ${p}`,
        message: `Phase ${p} is saturated: Demand (${phaseDemands[p]}) exceeds Capacity (${phaseCapacities[p]})`,
      });
    }
  }

  return errors;
};

// --- Main Validation Orchestrator ---

interface AllData {
  clients: { data: Record<string, string | number | boolean | object>[]; headers: string[] };
  workers: { data: Record<string, string | number | boolean | object>[]; headers: string[] };
  tasks: { data: Record<string, string | number | boolean | object>[]; headers: string[] };
}

export const runDeterministicValidations = (
  allData: AllData
): Record<string, ValidationResult[]> => {
  const allErrors: Record<string, ValidationResult[]> = {
    clients: [],
    workers: [],
    tasks: [],
  };

  const { clients, workers, tasks } = allData;

  // --- Single-Entity Validations ---

  // Clients
  allErrors.clients.push(...validateRequiredColumns(clients.headers, ['ClientID', 'PriorityLevel', 'Requested TaskIDs', 'AttributesJSON']));
  allErrors.clients.push(...validateDuplicateIds(clients.data, 'ClientID'));
  allErrors.clients.push(...validateOutOfRange(clients.data, 'PriorityLevel', 1, 5));
  allErrors.clients.push(...validateBrokenJson(clients.data, 'AttributesJSON'));
  // Requested TaskIDs list format is handled by cross-validation below

  // Workers
  allErrors.workers.push(...validateRequiredColumns(workers.headers, ['WorkerID', 'Skills', 'AvailableSlots', 'MaxLoadPerPhase']));
  allErrors.workers.push(...validateDuplicateIds(workers.data, 'WorkerID'));
  allErrors.workers.push(...validateOverloadedWorkers(workers.data)); // Single-entity check

  // Tasks
  allErrors.tasks.push(...validateRequiredColumns(tasks.headers, ['TaskID', 'Duration', 'RequiredSkills', 'PreferredPhases', 'MaxConcurrent']));
  allErrors.tasks.push(...validateDuplicateIds(tasks.data, 'TaskID'));
  allErrors.tasks.push(...validateOutOfRange(tasks.data, 'Duration', 1, Infinity));
  allErrors.tasks.push(...validateOutOfRange(tasks.data, 'MaxConcurrent', 1, Infinity));

  // --- Cross-Entity Validations ---
  if (clients.data.length > 0 && tasks.data.length > 0) {
    allErrors.clients.push(...validateUnknownReferences(clients.data, tasks.data));
  }

  if (tasks.data.length > 0 && workers.data.length > 0) {
    allErrors.tasks.push(...validateSkillCoverageMatrix(tasks.data, workers.data));
    allErrors.tasks.push(...validateMaxConcurrencyFeasibility(tasks.data, workers.data));
  }

  if (tasks.data.length > 0 && workers.data.length > 0) {
    allErrors.tasks.push(...validatePhaseSlotSaturation(tasks.data, workers.data));
  }

  return allErrors;
};
