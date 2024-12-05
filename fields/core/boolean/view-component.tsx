"use client";

const ViewComponent = ({ value }: { value: boolean}) => {
  return (
    <>
      {value == null
        ? null
        : value
          ? <span className="inline-block rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium">True</span>
          : <span className="inline-block rounded-md border bg-muted px-2 py-0.5 text-xs font-medium">False</span>
      }
    </>
  );
};

export { ViewComponent };