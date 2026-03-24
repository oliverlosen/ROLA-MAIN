import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "en" ? "es" : "en")}
      data-testid="button-language-toggle"
      className="gap-1 text-xs font-medium"
    >
      <Languages className="w-4 h-4" />
      {lang === "en" ? "ES" : "EN"}
    </Button>
  );
}
