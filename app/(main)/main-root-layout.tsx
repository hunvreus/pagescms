import { User } from "@/components/user";
import { About } from "@/components/about";

export function MainRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
	return(
		<div className="flex min-h-screen flex-col">
			<header className="fixed inset-x-0 top-0 z-50 bg-background">
				<div className="flex items-center gap-2 px-2 py-2 lg:px-4 lg:py-3">
					<About/>
					<User className="ml-auto" align="end" />
				</div>
			</header>
			<main className="flex-1 w-full pt-14 lg:pt-16">
				{children}
			</main>
		</div>
	);
}
