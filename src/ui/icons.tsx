import {
  Activity, Award, BadgeMinus, BadgePlus, Battery, BatteryCharging, BookMarked, BookOpen, Brain, Check, CheckCheck,
  Circle, CircleHelp, Code, Copy, Crosshair, Dices, Download, Dumbbell, Ellipsis, Equal, Fingerprint, Flame, Forward, Gauge,
  GraduationCap, Hand, Heart, HeartPulse, Languages, Layers, ListChecks, LogIn, LogOut, Maximize, Moon, MoveDiagonal, Package,
  PawPrint, Pin, Play, Plus, Power, Radio, Redo2, Ruler, Scan, Search, Send, Shield, ShieldAlert, ShieldCheck, ShieldHalf,
  ShieldX, Shirt, Skull, SlidersHorizontal, Sparkle, Sparkles, Split, Square, Star, StickyNote, Sun, Sword, Swords,
  Tag, Tags, Target, Trash2, Undo2, Upload, WandSparkles, Workflow, Wrench, X, type LucideIcon
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "activity": Activity, "award": Award, "badge-minus": BadgeMinus, "badge-plus": BadgePlus, "battery": Battery,
  "battery-charging": BatteryCharging, "book-marked": BookMarked, "book-open": BookOpen, "brain": Brain,
  "check": Check, "check-check": CheckCheck, "circle": Circle, "circle-help": CircleHelp, "code": Code, "copy": Copy, "crosshair": Crosshair,
  "dices": Dices, "download": Download, "dumbbell": Dumbbell, "ellipsis": Ellipsis, "equal": Equal, "fingerprint": Fingerprint, "flame": Flame,
  "forward": Forward, "gauge": Gauge, "graduation-cap": GraduationCap, "hand": Hand, "heart": Heart,
  "heart-pulse": HeartPulse, "languages": Languages, "layers": Layers, "list-checks": ListChecks, "log-in": LogIn, "log-out": LogOut,
  "maximize": Maximize, "moon": Moon, "move-diagonal": MoveDiagonal, "package": Package, "paw-print": PawPrint,
  "pin": Pin, "play": Play, "plus": Plus, "power": Power, "radio": Radio, "redo-2": Redo2, "ruler": Ruler, "scan": Scan,
  "search": Search, "send": Send, "shield": Shield, "shield-alert": ShieldAlert, "shield-check": ShieldCheck,
  "shield-half": ShieldHalf, "shield-x": ShieldX, "shirt": Shirt, "skull": Skull,
  "sliders-horizontal": SlidersHorizontal, "sparkle": Sparkle, "sparkles": Sparkles, "split": Split,
  "square": Square, "star": Star, "sticky-note": StickyNote, "sun": Sun, "sword": Sword, "swords": Swords,
  "tag": Tag, "tags": Tags, "target": Target, "trash-2": Trash2, "undo-2": Undo2, "upload": Upload, "wand-sparkles": WandSparkles,
  "workflow": Workflow, "wrench": Wrench, "x": X
};

export const ICON_NAMES: readonly string[] = Object.keys(ICONS);

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Component = ICONS[name] ?? Circle;
  return <Component size={size} strokeWidth={1.6} className={className} aria-hidden="true" focusable="false" />;
}
