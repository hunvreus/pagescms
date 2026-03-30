import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>The page or resource you requested could not be found.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link className={buttonVariants({ variant: "default" })} href="/">
          Go home
        </Link>
      </EmptyContent>
    </Empty>
  )
}
