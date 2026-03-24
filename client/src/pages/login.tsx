import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Loader2, Eye, EyeOff } from "lucide-react";
import rolaLogo from "@assets/download-1_1770410154902.jpg";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    setError("");
    setIsLoading(true);
    try {
      await login(data);
    } catch (e: any) {
      setError(e.message?.includes("401") ? t("login.invalidCredentials") : t("login.loginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={rolaLogo} alt="Rola Logo" className="w-32 h-32 rounded-md object-cover mb-4" data-testid="img-login-logo" />
          <h1 className="text-2xl font-bold" data-testid="text-login-title">Rola Spotlight</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("login.marketingProjectTracker")}</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center">{t("login.signIn")}</h2>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.username")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="username"
                          data-testid="input-username"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.password")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            data-testid="input-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <p className="text-sm text-destructive text-center" data-testid="text-login-error">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("login.signIn")}
                </Button>
              </form>
            </Form>

            <div className="mt-4 p-3 rounded-md bg-muted">
              <p className="text-xs text-muted-foreground text-center mb-1">{t("login.demoCredentials")}</p>
              <p className="text-xs text-center font-mono">admin / admin123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
