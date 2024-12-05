import { User } from "@/components/user";
import { About } from "@/components/about";

export function MainRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
	return(
    <div className="flex flex-col h-screen">
			<main className="flex-1 w-full overflow-auto">
				{children}
			</main>
			<footer className="flex items-center gap-2 border-t px-2 py-2 lg:px-4 lg:py-3 mt-auto">
        <User className="mr-auto"/>
        <About/>
      </footer>
		</div>
	);
}