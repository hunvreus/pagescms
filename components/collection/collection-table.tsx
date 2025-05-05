"use client"

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
  RowData,
  TableState,
  ExpandedState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

type TableData = Record<string, any> & {
  type?: "file" | "dir";
};

export function CollectionTable<TData extends TableData>({
  columns,
  data,
  initialState,
  search,
  setSearch,
}: {
  columns: any[],
  data: Record<string, any>[],
  initialState?: Record<string, any>,
  search: string,
  setSearch: (value: string) => void,
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    state: {
      globalFilter: search,
      expanded,
    },
    onGlobalFilterChange: setSearch,
    onExpandedChange: setExpanded,
  });

  return (
    <div className="space-y-2">
      <Table className="border-separate border-spacing-0 text-base"> 
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="sticky -top-4 md:-top-6 z-20 bg-background hover:bg-background">
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "text-xs px-3 first:pl-0 last:pr-0 border-b hover:bg-muted/50 cursor-pointer select-none last:cursor-default last:hover:bg-background truncate",
                      header.column.columnDef.meta?.className
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    title={
                      header.column.getCanSort()
                        ? header.column.getNextSortingOrder() === 'asc'
                          ? 'Sort ascending'
                          : header.column.getNextSortingOrder() === 'desc'
                            ? 'Sort descending'
                            : 'Clear sort'
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-x-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {{
                        asc: <ArrowUp className="h-4 w-4 opacity-50"/>,
                        desc: <ArrowDown className="xh-4 w-4 opacity-50"/>,
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "px-3 first:pl-0 last:pr-0 border-b py-3",
                      cell.column.columnDef.meta?.className
                    )}
                  >
                    <div className="flex items-center gap-x-1.5">
                      {cellIndex === 0 && row.getCanExpand() ? (
                         <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => {
                               e.stopPropagation();
                               row.getToggleExpandedHandler()();
                            }}
                            className="shrink-0"
                            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
                         >
                            {row.getIsExpanded() ? (
                               <ChevronDown className="h-4 w-4" />
                            ) : (
                               <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                      ) : cellIndex === 0 ? (
                          <span className="inline-block w-6 h-6 shrink-0"></span>
                      ): null}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground text-sm p-6">
                <div className="inline-flex items-center justify-center">
                  <Ban className="h-4 w-4 mr-2"/>
                  No entries
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      { (table.getCanPreviousPage() || table.getCanNextPage()) && 
        <footer className="flex gap-x-2 items-center">
          <div className="text-muted-foreground text-sm mr-auto">
            {`Page ${table.getState().pagination.pageIndex + 1} of ${table.getPageCount()}`}
          </div>
          <div className="flex">
            <Button size="sm" variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4 mr-1"/>
              Previous
            </Button>
            <Button size="sm" variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1"/>
            </Button>
          </div>
        </footer>
      }
    </div>
  )
}