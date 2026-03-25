import { LayoutDashboard, FileSpreadsheet, LogOut, ChevronDown, Users, Globe, Tag, Film, Building2, Bell, MessageSquare, Mail, BriefcaseBusiness } from "lucide-react";
import rolaLogo from "@assets/download-1_1770410154902.jpg";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const mainNav = [
  { key: "sidebar.dashboard", url: "/", icon: LayoutDashboard, testId: "dashboard" },
  { key: "sidebar.executions", url: "/executions", icon: FileSpreadsheet, testId: "executions" },
  { key: "sidebar.accounts", url: "/accounts", icon: BriefcaseBusiness, testId: "accounts" },
];

const catalogNav = [
  { key: "sidebar.countries", url: "/admin/countries", icon: Globe, testId: "countries" },
  { key: "sidebar.brands", url: "/admin/brands", icon: Tag, testId: "brands" },
  { key: "sidebar.titles", url: "/admin/titles", icon: Film, testId: "titles" },
  { key: "sidebar.studios", url: "/admin/studios", icon: Building2, testId: "studios" },
  { key: "sidebar.users", url: "/admin/users", icon: Users, testId: "users" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  editor: "bg-chart-1 text-white",
  approver: "bg-chart-5 text-white",
  viewer: "bg-muted text-muted-foreground",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const { data: unreadNotifs } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 5000,
  });

  const { data: unreadMsgs } = useQuery<{ count: number }>({
    queryKey: ["/api/conversations/unread-count"],
    refetchInterval: 5000,
  });

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const isAdmin = user?.role === "admin";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={rolaLogo} alt="Rola Logo" className="w-9 h-9 rounded-md object-cover" data-testid="img-rola-logo" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate" data-testid="text-app-title">Rola Spotlight</span>
            <span className="text-xs text-muted-foreground">{t("app.marketingTracker")}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.main")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}>
                    <Link href={item.url} data-testid={`link-nav-${item.testId}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{t(item.key)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/email")}>
                  <Link href="/email" data-testid="link-nav-email">
                    <Mail className="w-4 h-4" />
                    <span>{t("sidebar.email")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/notifications"}>
                  <Link href="/notifications" data-testid="link-nav-notifications">
                    <Bell className="w-4 h-4" />
                    <span>{t("sidebar.notifications")}</span>
                  </Link>
                </SidebarMenuButton>
                {(unreadNotifs?.count || 0) > 0 && (
                  <SidebarMenuBadge data-testid="badge-notifications-count">
                    <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-sm ring-2 ring-sidebar animate-pulse">
                      {unreadNotifs!.count > 99 ? "99+" : unreadNotifs!.count}
                    </span>
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/chat")}>
                  <Link href="/chat" data-testid="link-nav-chat">
                    <MessageSquare className="w-4 h-4" />
                    <span>{t("sidebar.chat")}</span>
                  </Link>
                </SidebarMenuButton>
                {(unreadMsgs?.count || 0) > 0 && (
                  <SidebarMenuBadge data-testid="badge-chat-count">
                    <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-sm ring-2 ring-sidebar animate-pulse">
                      {unreadMsgs!.count > 99 ? "99+" : unreadMsgs!.count}
                    </span>
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <Collapsible defaultOpen={location.startsWith("/admin")}>
            <SidebarGroup>
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer flex items-center justify-between gap-1">
                  <span>{t("sidebar.administration")}</span>
                  <ChevronDown className="w-3 h-3 transition-transform group-data-[state=open]:rotate-180" />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {catalogNav.map((item) => (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton asChild isActive={location === item.url}>
                          <Link href={item.url} data-testid={`link-admin-${item.testId}`}>
                            <item.icon className="w-4 h-4" />
                            <span>{t(item.key)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-sidebar-accent">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{user?.displayName}</span>
            <Badge variant="secondary" className={`text-[10px] w-fit ${ROLE_COLORS[user?.role || "viewer"]}`}>
              {user?.role?.toUpperCase()}
            </Badge>
          </div>
          <SidebarMenuButton
            onClick={() => logout()}
            className="w-8 h-8 p-0 flex items-center justify-center"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
