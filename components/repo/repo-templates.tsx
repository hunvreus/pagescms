"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import { handleCopyTemplate } from "@/lib/actions/template";
import templates from "@/lib/utils/templates";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChevronsUpDown, ArrowUpRight } from "lucide-react";
  
export function RepoTemplates({ defaultAccount }: { defaultAccount?: any }) {
  const { user } = useUser();
  const router = useRouter();
  const dialogCloseRef = useRef<any>(null);
  
  const [copyTemplateState, copyTemplateAction] = useFormState(handleCopyTemplate, {
    message: "",
    data: {
      template: "",
      owner: "",
      repo: "",
      branch: ""
    }
  });
  const [selectedAccount, setSelectedAccount] = useState(defaultAccount || user?.accounts?.[0]);
  const [name, setName] = useState(templates[0].suggested);
  const [isValidName, setIsValidName] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const validateName = useCallback((name: string) => {
    if (!name || name.length > 100) return false;
    const validNameRegex = /^(?!\.|\.\.|.*\/|.*\/\.|.*\.\.|.*\/\.)(?!@)(?!.*[~^:?*[\]{}()<>#%&!\\$'"|;,])[^\x20\x7f]*[^\x20\x7f\.]$/;
    return validNameRegex.test(name);
  }, []);

  useEffect(() => {
    setIsValidName(validateName(name));
  }, [name, validateName]);

  useEffect(() => {
    const waitForRepoReadyPromise = new Promise(async (resolve, reject) => {
      try {
        if (!copyTemplateState.data?.owner || !copyTemplateState.data?.repo) return;
        
        let attempt = 0;
        while (attempt < 10) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const response = await fetch(`/api/${copyTemplateState.data.owner}/${copyTemplateState.data.repo}/main/entries/.pages.yml`);
          if (response.ok) {
            const data: any = await response.json();
            if (data.status === "success") resolve(response);
          }
          attempt++;
        }
    
        throw new Error("Repository is not ready after 10 seconds");
      } catch (error) {
        reject(error);
      }
    });

    if (copyTemplateState?.message) {
      toast.success(copyTemplateState.message, { duration: 10000});
      if (dialogCloseRef.current) dialogCloseRef.current.click();
      toast.promise(waitForRepoReadyPromise, {
        loading: `Waiting for the repository to be ready`,
        success: (response: any) => {
          if (!copyTemplateState.data?.owner || !copyTemplateState.data?.repo) return;
          router.push(`/${copyTemplateState.data.owner}/${copyTemplateState.data.repo}`);
          return `Repository is ready, redirecting you.`;
        },
        error: (error: any) => error.message,
      });
    }
  }, [copyTemplateState, router]);

  useEffect(() => {
    if (defaultAccount) setSelectedAccount(defaultAccount);
  }, [defaultAccount]);

  return (
    <div className="flex flex-col gap-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {templates.filter(item => item.featured === true).map((template: any) => (
          <Dialog key={template.repository}>
            <DialogTrigger asChild>
              <button
                className="border rounded-md overflow-hidden hover:cursor-pointer hover:bg-accent ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <img src={template.thumbnail} alt={`Preview for ${template.name}`} className="aspect-video"/>
                <div className="flex gap-x-2 items-center px-3 py-2 border-t border-t-accent text-sm">
                  <div dangerouslySetInnerHTML={{ __html: template.icon }} className="w-4 h-4 shrink-0" />
                  <div className="font-medium truncate">{template.name}</div>
                </div>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form action={copyTemplateAction} className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>Copy template</DialogTitle>
                  <DialogDescription>
                    This will create a copy of the template repository below under the selected account.
                  </DialogDescription>
                </DialogHeader>
                <a
                  href={`https://github.com/${template.repository}`} target="_blank" 
                  className="border rounded-lg transition-all hover:bg-accent focus:bg-accent outline-none flex items-center overflow-hidden relative"
                >
                  <img src={template.thumbnail} alt={`Preview for ${template.name}`} className="aspect-video h-20"/>
                  <div className="flex-1 text-left flex flex-col gap-y-1 truncate px-3 py-2 h-full justify-center border-l border-l-accent">
                    <div className="tracking-tight truncate font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{template.repository}</div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <ArrowUpRight className="h-3 w-3 opacity-50"/>
                  </div>
                </a>
                <div className="grid gap-4">
                  <input name="owner" type="hidden" value={selectedAccount.login} readOnly />
                  <input name="template" type="hidden" value={template.repository} readOnly />
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Account
                    </Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="px-3 col-span-3">
                          <img className="h-6 w-6 rounded mr-2" src={`https://github.com/${selectedAccount.login}.png`} alt={`${selectedAccount.login}'s avatar`}/>
                          <div>{selectedAccount.login}</div>
                          <ChevronsUpDown className="ml-auto h-4 w-4 opacity-50"/>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-full">
                        {user?.accounts?.map((account: any) => (
                          <DropdownMenuItem key={account.login} onSelect={() => setSelectedAccount(account)}>
                            <img className="h-6 w-6 rounded mr-2" src={`https://github.com/${account.login}.png`} alt={`${account.login}'s avatar`}/>
                            {account.login}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label htmlFor="name" className="h-10 inline-flex items-center justify-end">
                      Name
                    </Label>
                    <div className="col-span-3">
                      <Input
                        name="name"
                        required
                        defaultValue={template.suggested}
                        onChange={(e) => setName(e.target.value)}
                      />
                      {copyTemplateState?.error &&
                        <div className="text-sm font-medium text-red-500 mt-2 ">{copyTemplateState.error}</div>
                      }
                      {!isValidName && (
                        <div className="text-sm font-medium text-red-500 mt-2 ">Invalid name</div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose ref={dialogCloseRef}></DialogClose>
                  <SubmitButton type="submit" disabled={!isValidName}>Create copy</SubmitButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </div>
  );
}