"use client";

import { Fragment } from "react";
import { getRelativePath, joinPathSegments, normalizePath } from "@/lib/utils/file";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home } from "lucide-react";

const PathBreadcrumb = ({
  path = "",
  rootPath,
  className,
  handleNavigate
}: {
  path?: string;
  rootPath: string;
  className?: string;
  handleNavigate: (newPath: string) => void
}) => {
  const normalizedPath = normalizePath(path);
  const normalizedRelativePath = getRelativePath(normalizedPath, rootPath);
  const pathArray = normalizedRelativePath ? normalizedRelativePath.split("/") : [];

  let breadcrumbDropdown: {name: string, path: string}[] = [];
  let breadcrumbPath: {name: string, path: string}[] = [];

  if (pathArray && pathArray.length > 0) {
    pathArray.forEach((segment, index) => {
      const entry = {
        name: segment,
        path: pathArray.slice(0, index + 1).join("/"),
      };

      if (pathArray.length > 2 && index < pathArray.length - 2) {
        breadcrumbDropdown.push(entry);
      } else {
        breadcrumbPath.push(entry);
      }
    });
  }

  return pathArray.length > 0
    ? <Breadcrumb className={className}>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => handleNavigate(rootPath)} className="cursor-pointer">
              <Home className="h-3.5 w-3.5" />
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbDropdown.length > 0 && (
            <>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                    <span className="sr-only">Toggle menu</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {breadcrumbDropdown.map((item) => (
                      <DropdownMenuItem key={item.path} onClick={() => handleNavigate(joinPathSegments([rootPath, item.path]))} className="cursor-pointer">
                        {item.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>
            </>
          )}
          {breadcrumbPath.slice(0, breadcrumbPath.length - 1).map((item) => (
            <Fragment key={item.path}>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => handleNavigate(joinPathSegments([rootPath, item.path]))} className="cursor-pointer">
                  {item.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumbPath[breadcrumbPath.length - 1].name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    : null;
};

export { PathBreadcrumb };
