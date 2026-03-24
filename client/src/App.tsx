import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import { FilterProvider } from "@/components/global-filters";
import { Loader2 } from "lucide-react";
import rolaLogo from "@assets/download-1_1770410154902.jpg";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ExecutionsPage from "@/pages/executions";
import ExecutionFormPage from "@/pages/execution-form";
import ExecutionDetailPage from "@/pages/execution-detail";
import AdminCatalogPage from "@/pages/admin-catalog";
import AdminUsersPage from "@/pages/admin-users";
import NotificationsPage from "@/pages/notifications";
import ChatPage from "@/pages/chat";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/executions" component={ExecutionsPage} />
      <Route path="/executions/new" component={ExecutionFormPage} />
      <Route path="/executions/:id/edit" component={ExecutionFormPage} />
      <Route path="/executions/:id" component={ExecutionDetailPage} />
      <Route path="/admin/countries">
        {() => <AdminCatalogPage titleKey="sidebar.countries" singularKey="adminCatalog.country" endpoint="countries" hasCode />}
      </Route>
      <Route path="/admin/brands">
        {() => <AdminCatalogPage titleKey="sidebar.brands" singularKey="adminCatalog.brand" endpoint="brands" />}
      </Route>
      <Route path="/admin/titles">
        {() => <AdminCatalogPage titleKey="sidebar.titles" singularKey="adminCatalog.titleSingular" endpoint="titles" />}
      </Route>
      <Route path="/admin/studios">
        {() => <AdminCatalogPage titleKey="sidebar.studios" singularKey="adminCatalog.studio" endpoint="studios" />}
      </Route>
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/chat/:conversationId" component={ChatPage} />
      <Route path="/chat" component={ChatPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <FilterProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-[#bababb]">
              <div className="flex items-center gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <img src={rolaLogo} alt="Rola Logo" className="w-7 h-7 rounded-md object-cover" data-testid="img-header-logo" />
                <span className="text-sm font-semibold" data-testid="text-header-title">Rola Spotlight</span>
              </div>
              <div className="flex items-center gap-1">
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </FilterProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <AuthenticatedApp />
            </AuthProvider>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
