"use client";

import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button";
import { Loader } from "lucide-react";

export function SubmitButton({ ...props }) {
  const { pending } = useFormStatus();

  return (
    <Button 
      {...props} 
      type="submit" 
      disabled={props.disabled || pending}
    >
      {props.children}
      {pending && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
    </Button>
  );
};