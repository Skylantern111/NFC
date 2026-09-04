import { Bike, KeyRound, Luggage, Package, PawPrint, Smartphone, Wallet } from 'lucide-react';

// Single source of truth for item categories — picked in ClaimTag.jsx,
// displayed in Items.jsx and Messages.jsx. Keep all three in sync here
// rather than duplicating the list/icon map per file.
export const CATEGORIES = ['Luggage', 'Keys', 'Wallet', 'Tech', 'Bike', 'Pet', 'Other'];

export const CATEGORY_ICON = {
  Luggage,
  Keys: KeyRound,
  Wallet,
  Tech: Smartphone,
  Bike,
  Pet: PawPrint,
  Other: Package,
};
