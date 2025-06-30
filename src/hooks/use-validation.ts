import { useState, useCallback, useEffect } from "react";
import { runDeterministicValidations, ValidationResult } from "@/lib/validators/deterministic";
import { EntityData } from "./use-data-management";

interface UseValidationProps {
  clientsData: EntityData;
  workersData: EntityData;
  tasksData: EntityData;
}

export const useValidation = ({ clientsData, workersData, tasksData }: UseValidationProps) => {
  const [allValidationErrors, setAllValidationErrors] = useState<Record<string, ValidationResult[]>>({});

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
  }, [triggerValidation]);

  return {
    allValidationErrors,
    setAllValidationErrors,
    triggerValidation,
  };
};
