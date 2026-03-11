"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import {
  getParentPath,
  getFileName,
  getRelativePath,
  joinPathSegments,
  normalizePath,
  sortFiles
} from "@/lib/utils/file";
import { viewComponents } from "@/fields/registry";
import { getSchemaByName, getPrimaryField, getFieldByPath, safeAccess } from "@/lib/schema";
import { requireApiSuccess } from "@/lib/api-client";
import { EmptyCreate } from "@/components/empty-create";
import { FileOptions } from "@/components/file/file-options";
import { CollectionTable } from "./collection-table";
import { FolderCreate} from "@/components/folder-create";
import { Message } from "@/components/message";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EllipsisVertical,
  FolderPlus,
  Plus,
  Search
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CollectionHeaderActions = memo(function CollectionHeaderActions({
  addEntryHref,
  collectionPath,
  name,
  showFolderCreate,
  onFolderCreate,
  onSearchChange,
}: {
  addEntryHref: string;
  collectionPath: string;
  name: string;
  showFolderCreate: boolean;
  onFolderCreate: (entry: any) => void;
  onSearchChange: (value: string) => void;
}) {
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => onSearchChange(searchInput), 200);
    return () => clearTimeout(timeout);
  }, [searchInput, onSearchChange]);

  return (
    <div className="flex items-center gap-x-2">
      <div className="relative hidden sm:block w-52 md:w-64">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
        <Input
          className="h-9 pl-9"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search entries..."
        />
      </div>
      {showFolderCreate && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <FolderCreate path={collectionPath} type="content" name={name} onCreate={onFolderCreate}>
                <Button type="button" variant="outline" size="icon" className="shrink-0">
                  <FolderPlus />
                </Button>
              </FolderCreate>
            </div>
          </TooltipTrigger>
          <TooltipContent>Create folder</TooltipContent>
        </Tooltip>
      )}
      <Link className={cn(buttonVariants(), "hidden sm:flex")} href={addEntryHref}>
        Add an entry
      </Link>
      <Link className={cn(buttonVariants({ size: "icon" }), "sm:hidden shrink-0")} href={addEntryHref}>
        <Plus className="h-4 w-4" />
      </Link>
    </div>
  );
});

export function Collection({
  name,
  path,
}: {
  name: string;
  path?: string;
}) {
  const [tableSearch, setTableSearch] = useState("");
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const schema = useMemo(() => getSchemaByName(config?.object, name), [config, name]);
  if (!schema) throw new Error(`Schema not found for "${name}".`);
  if (schema.type !== "collection") throw new Error(`"${name}" is not a collection.`);

  const viewFields = useMemo(() => {
    let pathAndFieldArray: any[] = [];
    if (schema.fields) {
      if (schema.view?.fields && schema.view?.fields.length > 0) {
        // If we have a list of fields defined for the view
        schema.view.fields.forEach((path: string) => {
          const field = getFieldByPath(schema.fields, path);
          if (field && !['object', 'block'].includes(field.type)) pathAndFieldArray.push({ path: path, field: field });
        });
      } else {
        pathAndFieldArray = schema.fields
          .filter((field: any) => !['object', 'block'].includes(field.type) && !field.hidden)
          .map((field: any) => ({ path: field.name, field: field }));
      }
    } else {
      pathAndFieldArray.push({
        path: "name",
        field: {
          label: "Name",
          name: "name",
          type: "string"
        }
      });
    }

    // If the filename starts with {year}-{month}-{day} and date is listed in the
    // view fields and is not an actual field, or if there are no fields, we add a date field
    if (
      !pathAndFieldArray.find((item: any) => item.path === "date")
      && schema.filename.startsWith("{year}-{month}-{day}")
      && (
        (schema.view?.fields && schema.view?.fields.includes("date"))
        || !schema.view?.fields
      )
    ) {
      pathAndFieldArray.push({
        path: "date",
        field: {
          label: "Date",
          name: "date",
          type: "date"
        }
      });
    }

    return pathAndFieldArray;
  }, [schema]);

  const primaryField = useMemo(() => getPrimaryField(schema) ?? "name", [schema]);

  const handleTableSearchChange = useCallback((value: string) => {
    setTableSearch(value);
  }, []);

  const fetchCollectionData = useCallback(async (fetchPath: string): Promise<Record<string, any>[] | undefined> => {
    if (!config) return undefined;

    try {
      const apiUrl = `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${encodeURIComponent(name)}?path=${encodeURIComponent(fetchPath)}`;
      
      const response = await fetch(apiUrl);
      if (response.status === 404 && fetchPath === (path || schema.path)) {
        throw new Error("Not found");
      }
      const result = await requireApiSuccess<any>(response, "Fetch failed");

      if (result.data.errors?.length) {
        result.data.errors.forEach((e: any) => toast.error(e));
      }

      const unsortedData = result.data.contents || [];
      
      if (unsortedData.length === 0) return [];
      return unsortedData.sort((a: any, b: any) => {
        if (a.type === "dir" && b.type === "file") return schema.view?.foldersFirst ? -1 : 1;
        if (a.type === "file" && b.type === "dir") return schema.view?.foldersFirst ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

    } catch (err: any) {
      console.error(`Fetch failed for path ${fetchPath}:`, err);
      if (fetchPath === (path || schema.path)) {
        setError(err.message);
      } else {
        toast.error(`Could not load items inside ${getFileName(fetchPath)}: ${err.message}`);
      }
      return undefined;
    }
  }, [config, name, path, schema.path, schema.view?.foldersFirst]);

  const handleDelete = useCallback((path: string) => {
    setData((prevData) => prevData?.filter((item: any) => item.path !== path));
  }, []);

  const handleRename = useCallback((path: string, newPath: string) => {
    setData((prevData: any) => {
      if (!prevData) return prevData;
      
      const updateNestedData = (items: any[]): any[] => {
        return items.map((item: any) => {
          // If this is the item being renamed
          if (item.path === path) {
            return { ...item, path: newPath, name: getFileName(newPath) };
          }
          
          // If this item has subRows, recursively update them
          if (item.subRows && Array.isArray(item.subRows)) {
            const updatedSubRows = updateNestedData(item.subRows);
            // Only create a new item reference if subRows changed
            if (updatedSubRows !== item.subRows) {
              return { ...item, subRows: updatedSubRows };
            }
          }
          
          // Return the original item if no changes
          return item;
        });
      };
      
      // Check if the item is moving to a different folder
      if (getParentPath(normalizePath(path)) !== getParentPath(normalizePath(newPath))) {
        // For items moved to a different folder, we need to:
        // 1. Remove the item from its original location (recursively)
        const removeItem = (items: any[]): any[] => {
          return items
            .filter((item) => item.path !== path)
            .map((item) => {
              if (item.subRows && Array.isArray(item.subRows)) {
                const updatedSubRows = removeItem(item.subRows);
                if (updatedSubRows !== item.subRows) {
                  return { ...item, subRows: updatedSubRows };
                }
              }
              return item;
            });
        };
        
        return sortFiles(removeItem(prevData));
      }
      
      // For items renamed within the same folder, update the item
      return sortFiles(updateNestedData(prevData));
    });
  }, []);

  const handleFolderCreate = useCallback((entry: any) => {
    const parentPath = getParentPath(entry.path);
    const parent = {
      type: "dir",
      name: getFileName(parentPath),
      path: parentPath,
      size: 0,
      url: null,
    }
    
    setData((prevData) => {
      if (!prevData) return [parent];
      return sortFiles([...prevData, parent]);
    });
  }, []);

  const handleConfirmRenameNode = useCallback((path: string, newPath: string) => {
    try {
      const normalizedPath = normalizePath(path);
      const normalizedNewPath = normalizePath(newPath);
      
      const renamePromise = new Promise(async (resolve, reject) => {
        try {
          const response = await fetch(`/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/files/${encodeURIComponent(normalizedPath)}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "content",
              name,
              newPath: normalizedNewPath,
            }),
          });
          const data = await requireApiSuccess<any>(response, "Failed to rename file");

          resolve(data);
        } catch (error) {
          reject(error);
        }
      });

      toast.promise(renamePromise, {
        loading: `Renaming "${path}" to "${newPath}"`,
        success: (data: any) => {
          router.push(`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(getParentPath(normalizedNewPath))}`);
          return data.message;
        },
        error: (error: any) => error.message,
      });
    } catch (error) {
      console.error(error);
    }
  }, [config.owner, config.repo, config.branch, name, router]);

  const columns = useMemo(() => {
    let tableColumns: any;
    tableColumns = viewFields.map((pathAndField: any) => {
      const path = pathAndField.path;
      const field = pathAndField.field;
      if (!field) return null;
      
      return {
        accessorKey: path,
        accessorFn: (originalRow: any) => safeAccess(originalRow.fields, path),
        header: field?.label ?? field.name,
        meta: { className: field.name === primaryField ? "truncate w-full min-w-[12rem] max-w-[1px]" : "" },
        cell: ({ cell, row }: { cell: any, row: any }) => {
          const cellValue = cell.getValue();
          const FieldComponent = viewComponents?.[field.type];
          const CellView = FieldComponent 
            ? <FieldComponent value={cellValue} field={field}/>
            : Array.isArray(cellValue)
              ? cellValue.join(', ')
              : cellValue;
          if (field.name === primaryField) {
            return (
              <Link
                className="font-medium truncate"
                href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/edit/${encodeURIComponent(row.original.path)}`}
                prefetch={true}
              >
                {CellView}
              </Link>
            );
          }
          return (
            <div className="truncate w-full max-w-[12rem]">
              {CellView}
            </div>
          );
        },
        sortUndefined: schema.view?.foldersFirst ? "first" : "last"
      };
    }).filter(Boolean) || [];

    tableColumns.push({
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }: { row: any }) => (
        <div className="flex gap-1 justify-end">
          {row.original.type === 'file' &&
            <ButtonGroup>
              <Link
                className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${name}/edit/${encodeURIComponent(row.original.path)}`}
                prefetch={true}
              >
                Edit
              </Link>
              <FileOptions path={row.original.path} sha={row.original.sha} type="collection" name={name} onDelete={handleDelete} onRename={handleRename}>
                <Button variant="outline" size="icon-xs">
                  <EllipsisVertical />
                </Button>
              </FileOptions>
            </ButtonGroup>
          }
          {schema.view?.layout === 'tree' && (
            row.original.type === 'file' &&
            !row.original.isNode &&
            !(row.depth === 0 && row.original.name === schema.view?.node?.filename)
              ? <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon-sm" className="w-8 h-8">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Add children entry</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rename this file first?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Before adding children to this file, you must rename it from &quot;{row.original.path}&quot; to 
                        &quot;{row.original.path.replace(`.${schema.extension}`, `/${schema.view?.node?.filename}`)}&quot;.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleConfirmRenameNode(row.original.path, row.original.path.replace(`.${schema.extension}`, `/${schema.view?.node?.filename}`))}>Rename</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              :  <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "w-8 h-8")}
                      href={row.original.isNode
                        ? `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.parentPath)}`
                        : row.original.type === 'dir'
                          ? `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.path)}`
                          : `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/new?parent=${encodeURIComponent(row.original.path)}`
                      }
                      prefetch={true}
                    >
                      <Plus className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    Add children entry
                  </TooltipContent>
                </Tooltip>
          )}
        </div>
      ),
      enableSorting: false
    });

    return tableColumns;
  }, [config.owner, config.repo, config.branch, name, viewFields, primaryField, handleDelete, handleRename, schema.view?.foldersFirst, schema.view?.layout, schema.view?.node?.filename, schema.extension, handleConfirmRenameNode]);

  const initialState = useMemo(() => {
    const sortId = viewFields == null
      ? "name"
      : (
          schema.view?.default?.sort
          || (viewFields.find((item: any) => item.field.name === "date") && "date")
          || primaryField
        );

    return {
      sorting: [{
        id: sortId,
        desc: sortId === "date"
          ? true
          : schema.view?.default?.order === "desc"
            ? true
            : false,
      }],
      pagination: {
        pageSize: 25,
      },
    };
  }, [schema, primaryField, viewFields]);

  useEffect(() => {
    const currentPath = schema.view?.layout === 'tree'
      ? schema.path
      : path || schema.path;
    let isMounted = true;

    setIsLoading(true);
    setError(null);

    fetchCollectionData(currentPath)
      .then(fetchedData => {
        if (isMounted && fetchedData) {
          setData(fetchedData);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => { isMounted = false };
  }, [fetchCollectionData, path, schema.path, schema.view?.layout]);

  const handleNavigate = useCallback((newPath: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("path", newPath || schema.path);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, schema.path, searchParams]);

  const handleExpand = useCallback(async (row: any) => {
    if (!row) return;
    const subRows = await fetchCollectionData(row.isNode ? row.parentPath : row.path);
    if (subRows !== undefined) {
      setData((currentData: any[]) => {
        const updateNestedData = (items: any[]): any[] => {
          return items.map((item: any) => {
            if (item.path === row.path) return { ...item, subRows };
            if (item.subRows && Array.isArray(item.subRows)) {
              const updatedSubRows = updateNestedData(item.subRows);
              if (updatedSubRows !== item.subRows) {
                return { ...item, subRows: updatedSubRows };
              }
            }
            return item;
          });
        };
        
        return updateNestedData(currentData);
      });
    }
  }, [fetchCollectionData]);

  const loadingSkeleton = useMemo(() => (
    <table className="w-full">
      <thead>
        <tr className="border-b font-medium">
          <th className="p-2 h-10 align-middle">
            <Skeleton className="w-8 h-4 rounded" />
          </th>
          <th className="p-2 h-10 align-middle">
            <Skeleton className="w-16 h-4 rounded" />
          </th>
          <th className="p-2 h-10 align-middle">
            <Skeleton className="w-12 h-4 rounded" />
          </th>
          <th className="p-2 h-10 align-middle">
            <Skeleton className="w-12 h-4 rounded" />
          </th>
        </tr>
      </thead>
      <tbody>
        {[...Array(5)].map((_, index) => (
          <tr className="border-b" key={index}>
            <td className="p-2 py-0 h-12 align-middle">
              <Skeleton className="h-8 w-8 rounded-md" />
            </td>
            <td className="p-2 py-0 h-12 align-middle w-full min-w-[12rem] max-w-px">
              <Skeleton className="w-full h-5 rounded" />
            </td>
            <td className="p-2 py-0 h-12 align-middle">
              <Skeleton className="w-24 h-5 rounded" />
            </td>
            <td className="p-2 py-0 h-12 align-middle">
              <div className="flex gap-1 justify-end">
                <ButtonGroup>
                  <Button variant="outline" size="xs" disabled>Edit</Button>
                  <Button variant="outline" size="icon-xs" disabled>
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </ButtonGroup>
                {schema.view?.layout === 'tree' && (
                  <Button variant="outline" size="icon-sm" className="w-8 h-8" disabled>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ), [schema.view?.layout]);

  const collectionPath = schema.view?.layout === "tree"
    ? schema.path
    : path || schema.path;

  const addEntryHref = `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collection/${encodeURIComponent(name)}/new${
    schema.view?.layout !== "tree" && path && path !== schema.path
      ? `?parent=${encodeURIComponent(path)}`
      : ""
  }`;

  const breadcrumbNode = useMemo(() => {
    const normalizedRootPath = normalizePath(schema.path);
    const normalizedCurrentPath = normalizePath(collectionPath);
    const relativePath = getRelativePath(normalizedCurrentPath, normalizedRootPath);
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

    const entries = segments.map((segment, index) => ({
      name: segment,
      path: joinPathSegments([normalizedRootPath, segments.slice(0, index + 1).join("/")]),
    }));

    const middleEntries = entries.length > 3 ? entries.slice(1, -1) : [];
    const visibleEntries = entries.length > 3
      ? [entries[0], entries[entries.length - 1]]
      : entries;

    return (
      <Breadcrumb>
        <BreadcrumbList className="font-semibold text-lg flex-nowrap">
          <BreadcrumbItem className={entries.length === 0 ? "min-w-0 max-w-full truncate" : undefined}>
            {entries.length > 0 ? (
              <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(schema.path)}>
                {schema.label || schema.name}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="block max-w-full font-semibold truncate">{schema.label || schema.name}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {entries.length > 0 && <BreadcrumbSeparator/>}

          {entries.length > 3 && (
            <>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                    <span className="sr-only">Show hidden segments</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleEntries.map((entry) => (
                      <DropdownMenuItem key={entry.path} onClick={() => handleNavigate(entry.path)} className="cursor-pointer">
                        {entry.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
              <BreadcrumbSeparator/>
            </>
          )}

          {visibleEntries.map((entry, index) => {
            const isLast = index === visibleEntries.length - 1;
            return (
              <Fragment key={entry.path}>
                <BreadcrumbItem className={isLast ? "min-w-0 max-w-full truncate" : undefined}>
                  {isLast ? (
                    <BreadcrumbPage className="block max-w-full font-semibold truncate">{entry.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink className="cursor-pointer" onClick={() => handleNavigate(entry.path)}>
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator/>}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }, [collectionPath, handleNavigate, schema.label, schema.name, schema.path]);

  const headerNode = useMemo(() => (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 truncate">{breadcrumbNode}</div>
      <CollectionHeaderActions
        addEntryHref={addEntryHref}
        collectionPath={collectionPath}
        name={name}
        showFolderCreate={schema.subfolders !== false}
        onFolderCreate={handleFolderCreate}
        onSearchChange={handleTableSearchChange}
      />
    </div>
  ), [addEntryHref, breadcrumbNode, collectionPath, handleFolderCreate, handleTableSearchChange, name, schema.subfolders]);

  useRepoHeader({
    header: headerNode,
  });
  
  const contentNode = isLoading
    ? loadingSkeleton
    : error
      ? (
        <div className="flex flex-1 items-center justify-center">
          <Empty className="max-w-[420px] flex-none">
            <EmptyHeader>
              <EmptyTitle>{error === "Not found" ? "Folder missing" : "Something&apos;s wrong"}</EmptyTitle>
              <EmptyDescription>
                {error === "Not found"
                  ? `The collection folder "${schema.path}" has not been created yet.`
                  : error}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {error === "Not found"
                ? <EmptyCreate type="content" name={schema.name}>Create folder</EmptyCreate>
                : (
                  <Link
                    className={buttonVariants({ variant: "default", size: "sm" })}
                    href={`/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/settings`}
                  >
                    Go to settings
                  </Link>
                )
              }
            </EmptyContent>
          </Empty>
        </div>
      )
      : <CollectionTable
          columns={columns}
          data={data}
          search={tableSearch}
          setSearch={setTableSearch}
          initialState={initialState}
          onExpand={handleExpand}
          pathname={pathname}
          path={path || schema.path}
          isTree={schema.view?.layout === 'tree'}
          primaryField={primaryField}
        />;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col space-y-6">
        {contentNode}
      </div>
    </div>
  );
}
