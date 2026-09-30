import { useTheme } from "../../context/ThemeContext";
import { Toaster as Sonner } from "sonner";

const Toaster = ({ ...props }) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{
        "--normal-bg": "hsl(var(--popover))",
        "--normal-text": "hsl(var(--popover-foreground))",
        "--normal-border": "hsl(var(--foreground))",
        "--border-radius": "var(--radius)",
      }}
      toastOptions={{
        classNames: {
          toast:
            "!border-2 !border-foreground !rounded-lg !shadow-brut font-sans",
          title: "font-bold",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
