import { useState, useCallback } from "react";
import Papa from "papaparse";
import { validateAndNormalizeList } from "@/lib/validators/deterministic"; // Assuming this path is correct

export interface EntityData {
  data: Record<string, string | number | boolean | object>[];
  headers: string[];
  fileName: string;
}

export type ValidationOptions = { numeric: boolean; allowRanges: boolean; };

export type EntityType = 'clients' | 'workers' | 'tasks';

export type ValidationSchemaMap = {
  [K in EntityType]: {
    [key: string]: ValidationOptions;
  };
};

interface UseDataManagementProps {
  triggerValidation: () => void;
}

export const useDataManagement = ({ triggerValidation }: UseDataManagementProps) => {
  const [clientsData, setClientsData] = useState<EntityData>({ data: [], headers: [], fileName: '' });
  const [workersData, setWorkersData] = useState<EntityData>({ data: [], headers: [], fileName: '' });
  const [tasksData, setTasksData] = useState<EntityData>({ data: [], headers: [], fileName: '' });

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, entityType: EntityType) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const newEntityData = { data: results.data as Record<string, string | number | boolean | object>[], headers: results.meta.fields || [], fileName: file.name };
          if (entityType === 'clients') setClientsData(newEntityData);
          else if (entityType === 'workers') setWorkersData(newEntityData);
          else if (entityType === 'tasks') setTasksData(newEntityData);
        },
      });
    }
  }, []);

  const handleCellChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    entityType: EntityType,
    rowIndex: number,
    header: string
  ) => {
    const setter = entityType === 'clients' ? setClientsData : entityType === 'workers' ? setWorkersData : setTasksData;
    setter(prev => {
      const newData = [...prev.data] as Record<string, string | number | boolean | object>[];
      newData[rowIndex][header] = e.target.value;
      return { ...prev, data: newData };
    });
  }, []);

  const handleCellBlur = useCallback((
    entityType: EntityType,
    rowIndex: number,
    header: string
  ) => {
    const listValidationSchemas: ValidationSchemaMap = {
        clients: { 'Requested TaskIDs': { numeric: false, allowRanges: false } },
        workers: { 'AvailableSlots': { numeric: true, allowRanges: false }, 'Skills': { numeric: false, allowRanges: false } },
        tasks: { 'PreferredPhases': { numeric: true, allowRanges: true }, 'RequiredSkills': { numeric: false, allowRanges: false } }
    };

    const getValidationOptions = (entityType: EntityType, header: string): ValidationOptions | undefined => {
      const schema = listValidationSchemas[entityType];
      if (schema && header in schema) {
        return schema[header];
      }
      return undefined;
    };

    const currentData = entityType === 'clients' ? clientsData.data : entityType === 'workers' ? workersData.data : tasksData.data;

    const options = getValidationOptions(entityType, header);

    if (options) {
        const cellValue = currentData[rowIndex][header];
        const result = validateAndNormalizeList(String(cellValue), options);

        if (result.normalized !== undefined && String(result.normalized) !== String(cellValue)) {
            const setter = entityType === 'clients' ? setClientsData : entityType === 'workers' ? setWorkersData : setTasksData;
            setter(prev => {
                const newData = [...prev.data] as Record<string, string | number | boolean | object>[];
                newData[rowIndex][header] = result.normalized as string;
                return { ...prev, data: newData };
            });
        }
    }
    triggerValidation(); // Re-run validation on blur
  }, [clientsData, workersData, tasksData, triggerValidation]); // Added triggerValidation to dependencies

  return {
    clientsData,
    setClientsData,
    workersData,
    setWorkersData,
    tasksData,
    setTasksData,
    handleFileUpload,
    handleCellChange,
    handleCellBlur,
  };
};
