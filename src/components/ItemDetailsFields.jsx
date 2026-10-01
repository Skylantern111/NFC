import { forwardRef } from 'react';
import { CATEGORIES, CATEGORY_ICON, ITEM_NAME_MAX } from '../lib/categories';
import FormField from './FormField';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// Item name + category, shared by the claim page (dashboard/ClaimTag.jsx)
// and "Edit item" on My Items (UI_UX_IMPROVEMENT_ROUND2.md B3), so both use
// the same fields, limits and messages (lib/categories.js#validateItemDetails).
const ItemDetailsFields = forwardRef(function ItemDetailsFields(
  { itemName, onItemNameChange, category, onCategoryChange, errors = {} },
  nameRef
) {
  return (
    <>
      <FormField id="itemName" label="Item name" hint="Finders see this name." error={errors.itemName}>
        <Input
          ref={nameRef}
          placeholder="e.g. Black travel backpack"
          value={itemName}
          maxLength={ITEM_NAME_MAX}
          autoComplete="off"
          autoCapitalize="sentences"
          onChange={(e) => onItemNameChange(e.target.value)}
        />
      </FormField>

      <FormField id="category" label="Category" error={errors.category}>
        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger id="category" aria-invalid={errors.category ? true : undefined} className="h-11 w-full rounded-md">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICON[c];
              return (
                <SelectItem key={c} value={c}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {c}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </FormField>
    </>
  );
});

export default ItemDetailsFields;
