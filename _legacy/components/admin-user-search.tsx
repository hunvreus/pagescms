"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useDebounce } from "use-debounce";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

export function AdminUserSearch({
  initialQuery,
}: {
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [debouncedValue] = useDebounce(value, 250);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const currentQuery = searchParams.get("q")?.trim() ?? "";

    if (debouncedValue.trim()) {
      params.set("q", debouncedValue.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");

    if (currentQuery === debouncedValue.trim() && !searchParams.get("page")) {
      return;
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [debouncedValue, pathname, router, searchParams]);

  return (
    <InputGroup className="h-8 w-full max-w-xs rounded-full">
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <Search className="size-3.5" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search users"
        className="h-8"
      />
    </InputGroup>
  );
}
