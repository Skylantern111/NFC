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

// Mirrors firestore.rules#publicItemFieldsOnly (itemName ≤ 100).
export const ITEM_NAME_MAX = 100;

// Shared by the claim page and "Edit item" (UI_UX_IMPROVEMENT_ROUND2.md B3).
// Returns { itemName?, category? } — empty when valid.
export function validateItemDetails({ itemName, category }) {
  const errors = {};
  if (!itemName?.trim()) errors.itemName = 'Give the item a name, e.g. “Black backpack”.';
  else if (itemName.trim().length > ITEM_NAME_MAX) errors.itemName = `Keep it under ${ITEM_NAME_MAX} characters.`;
  if (!category) errors.category = 'Choose a category.';
  else if (!CATEGORIES.includes(category)) errors.category = 'Choose one of the listed categories.';
  return errors;
}
