"use client"

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { ArrowUp, ArrowDown, GripVertical, Loader, CircleMinus, CirclePlus, Folder, FolderOpen } from "lucide-react";

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
  isNode?: boolean;
  parentPath?: string;
  subRows?: TableData[];
  fields?: Record<string, any>;
}

const LShapeIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M4 4V11C4 12.0609 4.42143 13.0783 5.17157 13.8284C5.92172 14.5786 6.93913 15 8 15H20" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"/>
  </svg>
);

export type TableReorder = {
  // Column (field path) holding the manual position
  field: string;
  saving: boolean;
  // Called with the paths of all the files, in their new order
  onReorder: (orderedPaths: string[]) => void;
};

// A file row with a drag handle, used when the collection can be reordered
const ReorderRow = ({
  id,
  enabled,
  hint,
  onSortByPosition,
  children,
}: {
  id: string;
  enabled: boolean;
  hint: string;
  // Set when clicking the handle can bring the list back to the position order
  onSortByPosition?: () => void;
  children: ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !enabled });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 bg-muted shadow-sm")}
    >
      <TableCell className="p-2 border-b py-0 h-12 w-8">
        <button
          type="button"
          ref={setActivatorNodeRef}
          disabled={!enabled && !onSortByPosition}
          onClick={enabled ? undefined : onSortByPosition}
          title={enabled ? "Drag to reorder" : hint}
          aria-label={enabled ? "Drag to reorder" : hint}
          className={cn(
            "flex items-center text-muted-foreground",
            enabled
              ? "cursor-grab hover:text-foreground touch-none"
              : onSortByPosition
                ? "cursor-pointer opacity-60 hover:opacity-100"
                : "cursor-not-allowed opacity-40"
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
};

// Wraps the cells of a body row: adds the drag handle column when the
// collection can be reordered (an empty cell for folders).
const RowShell = ({
  reorder,
  isFile,
  id,
  enabled,
  hint,
  onSortByPosition,
  children,
}: {
  reorder: boolean;
  isFile: boolean;
  id: string;
  enabled: boolean;
  hint: string;
  onSortByPosition?: () => void;
  children: ReactNode;
}) => {
  if (!reorder) return <TableRow>{children}</TableRow>;
  if (isFile) {
    return (
      <ReorderRow id={id} enabled={enabled} hint={hint} onSortByPosition={onSortByPosition}>
        {children}
      </ReorderRow>
    );
  }
  return (
    <TableRow>
      <TableCell className="p-2 border-b py-0 h-12 w-8" />
      {children}
    </TableRow>
  );
};

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
  primaryField,
  reorder
}: {
  columns: any[],
  data: Record<string, any>[],
  initialState?: Record<string, any>,
  search: string,
  setSearch: (value: string) => void,
  onExpand: (row: any) => Promise<any>,
  pathname: string,
  path: string,
  isTree?: boolean,
  primaryField?: string,
  reorder?: TableReorder
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});
  const loadingPathSetRef = useRef<Set<string>>(new Set());

  const handleRowExpansion = useCallback(async (row: Row<TData>) => {
    const needsLoading = row.getCanExpand() && !row.getIsExpanded() && row.original.subRows === undefined;
    const loadPath = row.original.isNode ? row.original.parentPath : row.original.path;

    if (needsLoading) {
      if (!loadPath) return;
      if (loadingPathSetRef.current.has(loadPath)) return;

      loadingPathSetRef.current.add(loadPath);
      setLoadingRows(prev => ({ ...prev, [row.id]: true }));
      try {
        await onExpand(row.original);
      } catch (error) {
        console.error("onExpand failed for row:", row.id, error);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
        return;
      } finally {
        loadingPathSetRef.current.delete(loadPath);
        setLoadingRows(prev => {
          const newState = { ...prev };
          delete newState[row.id];
          return newState;
        });
      }
    }
    row.toggleExpanded();
  }, [onExpand]);

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

  // Reordering is only possible when the list is sorted by position (ascending)
  // and nothing is filtered out, so what is on screen is the whole order.
  const sorting = table.getState().sorting;
  const sortedByPosition =
    !!reorder &&
    !search &&
    sorting.length === 1 &&
    sorting[0].id === reorder.field &&
    !sorting[0].desc;
  const reorderEnabled = sortedByPosition && !reorder?.saving;
  // Wrong sort (not saving, no search): the handle brings the list back to the position order
  const canSortByPosition = !!reorder && !reorder.saving && !search && !sortedByPosition;
  const reorderHint = reorder?.saving
    ? "Saving the new order…"
    : search
      ? "Clear the search to reorder"
      : "Click to sort by position, then drag to reorder";
  const fileRowIds = table
    .getRowModel()
    .rows.filter((row) => row.original.type === "file")
    .map((row) => row.original.path);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!reorder || !reorderEnabled || !over || active.id === over.id) return;
    const oldIndex = fileRowIds.indexOf(String(active.id));
    const newIndex = fileRowIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorder.onReorder(arrayMove(fileRowIds, oldIndex, newIndex));
  };

  const currentPage = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  const paginationItems = (() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }

    const pages = new Set<number>([0, pageCount - 1, currentPage]);
    if (currentPage - 1 >= 0) pages.add(currentPage - 1);
    if (currentPage + 1 < pageCount) pages.add(currentPage + 1);

    const ordered = Array.from(pages).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];

    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i] - ordered[i - 1] > 1) {
        items.push("ellipsis");
      }
      items.push(ordered[i]);
    }

    return items;
  })();

  useEffect(() => {
    if (!isTree) return;
    
    table.getRowModel().rows.forEach((row) => {
      if (
        !row.getIsExpanded() &&
        (
          (row.original.isNode && row.original.parentPath && path.startsWith(row.original.parentPath)) ||
          (row.original.type === "dir" && path.startsWith(row.original.path))
        )
      ) {
        handleRowExpansion(row as Row<TData>);
      }
    });
  }, [isTree, path, handleRowExpansion, table, data]);

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
      <SortableContext items={fileRowIds} strategy={verticalListSortingStrategy}>
      <Table className="border-separate border-spacing-0 text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="sticky -top-4 md:-top-6 z-20 bg-background hover:bg-background">
              {reorder && <TableHead className="p-2 h-10 w-8 border-b"><span className="sr-only">Reorder</span></TableHead>}
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "p-2 h-10 border-b hover:bg-muted/50 cursor-pointer select-none last:cursor-default last:hover:bg-background truncate",
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
              <RowShell
                key={row.id}
                reorder={!!reorder}
                isFile={row.original.type === "file"}
                id={row.original.path}
                enabled={reorderEnabled}
                hint={reorderHint}
                onSortByPosition={
                  canSortByPosition && reorder
                    ? () => table.setSorting([{ id: reorder.field, desc: false }])
                    : undefined
                }
              >
                {
                  row.original.type === "dir"
                    ? <>
                      <TableCell
                        colSpan={columns.length - 1}
                        className="p-2 border-b py-0 h-12"
                        style={{
                          paddingLeft: row.depth > 0
                            ? `${row.depth * 2}rem`
                            : undefined
                        }}
                      >
                        {isTree
                          ? <button
                              className="flex items-center gap-x-2 font-medium"
                              onClick={() => handleRowExpansion(row as Row<TData>)}
                            >
                              {loadingRows[row.id]
                                ? <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
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
                              <Folder className="h-4 w-4" />
                              {row.original.name}
                            </Link>
                        }
                      </TableCell>
                      <TableCell className="p-2 border-b py-0 h-12">
                        {
                          (() => {
                            const lastCell = row.getVisibleCells()[row.getVisibleCells().length - 1];
                            return flexRender(lastCell.column.columnDef.cell, lastCell.getContext());
                          })()
                        }
                      </TableCell>
                      </>
                    : row.getVisibleCells().map((cell, index) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "p-2 border-b py-0 h-12",
                          cell.column.columnDef.meta?.className,
                        )}
                        style={{
                          paddingLeft: (cell.column.id === primaryField && row.depth > 0)
                            ? `${row.depth * 1.5}rem`
                            : undefined
                        }}
                      >
                        <div className="flex items-center gap-x-1">
                          {row.depth > 0 && cell.column.id === primaryField && <LShapeIcon className="h-4 w-4 text-muted-foreground opacity-50"/>}
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          {isTree && row.getCanExpand() && cell.column.id === primaryField && (
                            loadingRows[row.id]
                              ? <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-full" disabled>
                                  <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
                                </Button>
                              : <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-6 w-6 rounded-full"
                                  onClick={() => handleRowExpansion(row as Row<TData>)}
                                  disabled={row.getIsExpanded() && Array.isArray(row.original.subRows) && row.original.subRows.length === 0}
                                >
                                  {row.getIsExpanded() ? <CircleMinus className="text-muted-foreground hover:text-foreground h-4 w-4" /> : <CirclePlus className="text-muted-foreground hover:text-foreground h-4 w-4" />}
                                  <span className="sr-only">{row.getIsExpanded() ? 'Collapse row' : 'Expand row'}</span>
                                </Button>
                          )}
                          
                        </div>
                      </TableCell>
                    ))
                }
              </RowShell>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length + (reorder ? 1 : 0)} className="text-center text-muted-foreground text-sm p-6">
                <span>No entries</span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </SortableContext>
      </DndContext>
      {pageCount > 1 && (
        <footer className="flex items-center justify-end">
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanPreviousPage()) table.previousPage();
                  }}
                  className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {paginationItems.map((item, index) => (
                <PaginationItem key={`${item}-${index}`}>
                  {item === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href="#"
                      isActive={item === currentPage}
                      onClick={(event) => {
                        event.preventDefault();
                        table.setPageIndex(item);
                      }}
                    >
                      {item + 1}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  iconOnly
                  onClick={(event) => {
                    event.preventDefault();
                    if (table.getCanNextPage()) table.nextPage();
                  }}
                  className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </footer>
      )}
    </div>
  )
}
