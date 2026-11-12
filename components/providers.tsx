"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { ActionToastProvider } from "@/contexts/action-toast-context";
import { UserProvider } from "@/contexts/user-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { User } from "@/types/user";

export function Providers({ children, user }: { children: React.ReactNode; user: User | null }) {
  return (
    <I18nProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <UserProvider user={user}>
          <TooltipProvider>
            <ActionToastProvider>{children}</ActionToastProvider>
          </TooltipProvider>
        </UserProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
