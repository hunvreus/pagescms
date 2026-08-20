"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { field, onChange, ...restProps } = props;
  const isInputReadonly = field?.readonly || !field?.options?.editable;

  const generateNewUUID = () => {
    onChange(crypto.randomUUID());
  };

  return (
    <div className="flex gap-2">
      <Input 
        {...restProps} 
        ref={ref} 
        className="text-base" 
        readOnly={isInputReadonly}
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
                disabled={field?.readonly}
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
