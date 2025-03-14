"use client";

import { useState, useEffect } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import type { LucideProps } from "lucide-react";

interface IconProps extends Omit<LucideProps, "ref"> {
  name?: string;
  fallback: React.ReactNode;
}

export function Icon({ name, fallback, ...props }: IconProps) {
  const [error, setError] = useState(!name);

  useEffect(() => {
    setError(!name);
  }, [name]);

  if (error) {
    return <>{fallback}</>;
  }

  return (
    <DynamicIcon 
      name={name as any}
      {...props}
      onError={() => setError(true)}
    />
  );
} 