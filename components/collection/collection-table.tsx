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
  ExpandedState,
  Row
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
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Ban, ChevronLeft, ChevronRight, Loader2, SquareMinus, SquarePlus, CircleMinus, CirclePlus, Folder, FolderOpen } from "lucide-react";

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

export type TableData = {
  name: string;
  path: string;
  sha?: string;
  content?: string;
  object?: Record<string, any>;
  type: "file" | "dir";
  node?: boolean;
  parentPath?: string;
  subRows?: TableData[];
  fields?: Record<string, any>;
}

export function CollectionTable<TData extends TableData>({
  columns,
  data,
  initialState,
  search,
  setSearch,
  onExpand,
  pathname,
  path,
  isTree = false,
}: {
  columns: any[],
  data: Record<string, any>[],
  initialState?: Record<string, any>,
  search: string,
  setSearch: (value: string) => void,
  onExpand: (row: any) => Promise<void> | void,
  pathname: string,
  path: string,
  isTree?: boolean,
}) {
  console.log("pathname", pathname);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});

  const handleRowExpansion = async (row: Row<TData>) => {
    const needsLoading = !row.getIsExpanded() && row.original.subRows === undefined && row.original.parentPath;

    if (needsLoading) {
      setLoadingRows(prev => ({ ...prev, [row.id]: true }));
      try {
        await onExpand(row.original); // Pass original row data
      } catch (error) {
        console.error("onExpand failed:", error);
      } finally {
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
      }
    }
    row.toggleExpanded();
  };

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState,
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => row.original.isNode || row.original.type === "dir",
    getSubRows: (row) => row.subRows,
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
              <TableRow key={row.id}>
                {
                  row.original.type === "dir"
                    ? <TableCell
                        colSpan={columns.length}
                        className="px-3 first:pl-0 last:pr-0 border-b py-0 h-14"
                        style={{
                          paddingLeft: row.depth > 0
                            ? `${row.depth * 1.5 + 1.75}rem`
                            : undefined
                        }}
                      >
                        {isTree
                        ? <button
                            className="flex items-center gap-x-2 font-medium"
                            onClick={() => handleRowExpansion(row as Row<TData>)}
                          >
                            {loadingRows[row.id]
                              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              : row.getIsExpanded()
                                ? <FolderOpen className="h-4 w-4" />
                                : <Folder className="h-4 w-4" />
                            }
                            {row.original.name}
                          </button>
                        : <Link
                            className="flex items-center gap-x-2 font-medium"
                            href={`${pathname}?path=${encodeURIComponent(row.original.path)}`}
                          >
                            <FolderOpen className="h-4 w-4" />
                            {row.original.name}
                          </Link>
                        }
                      </TableCell>
                    : row.getVisibleCells().map((cell, index) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "px-3 first:pl-0 last:pr-0 border-b py-0 h-14",
                          cell.column.columnDef.meta?.className,
                        )}
                        style={{
                          paddingLeft: (index === 0 && row.depth > 0)
                            ? `${row.depth * 1.5 + 1.75}rem`
                            : undefined
                        }}
                      >
                        <div className="flex items-center gap-x-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          {isTree && row.getCanExpand() && index === 0 && (
                            loadingRows[row.id]
                              ? <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-full" disabled>
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </Button>
                              : <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6 rounded-full"
                                  onClick={() => handleRowExpansion(row as Row<TData>)}
                                  disabled={row.getIsExpanded() && row.subRows.length === 0}
                                >
                                  {row.getIsExpanded() ? <CircleMinus className="text-muted-foreground hover:text-foreground h-4 w-4" /> : <CirclePlus className="text-muted-foreground hover:text-foreground h-4 w-4" />}
                                  <span className="sr-only">{row.getIsExpanded() ? 'Collapse row' : 'Expand row'}</span>
                                </Button>
                          )}
                          
                        </div>
                      </TableCell>
                    ))
                }
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