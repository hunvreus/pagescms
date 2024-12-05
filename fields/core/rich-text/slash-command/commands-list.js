import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

const CommandsList = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const onKeyDown = (event) => {
    if (event.key === "ArrowUp") {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
      return true;
    } else if (event.key === "ArrowDown") {
      setSelectedIndex((selectedIndex + 1) % items.length);
      return true;
    } else if (event.key === "Enter") {
      selectItem(selectedIndex);
      return true;
    }

    return false;
  };

  const selectItem = (index) => {
    const item = items[index];

    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown,
  }));

  return (
    <div ref={containerRef} className="border rounded-md bg-popover p-1 flex flex-col gap-y-0.5 shadow-md">
      {items.length ? (
        items.map((item, index) => (
          <Button
            key={index}
            size="xs"
            variant="ghost"
            className={cn("justify-start gap-x-1.5", index === selectedIndex ? "bg-muted" : "")}
            onClick={() => selectItem(index)}
          >
            <span>{item.icon}</span>
            {item.title}
          </Button>
        ))
      ) : (
        <div className="flex items-center text-sm text-muted-foreground gap-x-1.5 h-8 px-2">
          <Ban className="h-4 w-4"/>
          No result
        </div>
      )}
    </div>
  );
});

export default CommandsList;
