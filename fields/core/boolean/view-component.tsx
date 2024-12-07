"use client";

const ViewComponent = ({ value }: { value: boolean}) => {
  return (
    <>
      {value == null
        ? null
        : value
          ? <span className="inline-block rounded-full border border-primary bg-primary text-primary-foreground px-2 py-0.5 text-sm font-medium">True</span>
          : <span className="inline-block rounded-full border bg-muted px-2 py-0.5 text-sm font-medium">False</span>
      }
    </>
  );
};

export { ViewComponent };