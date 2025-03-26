"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { v4 as uuidv4 } from 'uuid';
import { RefreshCcw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;

  const generateNewUUID = () => {
    onChange(uuidv4());
  };

  return (
    <div className="flex gap-2">
      <Input 
        {...props} 
        ref={ref} 
        className="text-base" 
        readOnly={!field?.options?.editable}
      />
      {field?.options?.generate !== false && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                type="button" 
                variant="outline"
                size="icon"
                onClick={generateNewUUID}
                className="shrink-0"
              >
                <RefreshCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate new UUID</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

export { EditComponent };