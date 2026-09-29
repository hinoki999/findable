// Shown in the UI when a profile field is empty. Never stored or sent as data.
export const PROFILE_PLACEHOLDERS = {
  name: 'Your Name',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  bio: 'Add bio',
};

// A field still showing its placeholder is empty: use null, not the placeholder text
export const realValue = (value: string | null | undefined, placeholder: string): string | null =>
  value && value.trim() && value !== placeholder ? value : null;

// A contact card with any placeholder fields emptied, for writing into a drop
export function withoutPlaceholders<T extends { name?: string; email?: string; phone?: string; bio?: string }>(card: T): T {
  return {
    ...card,
    name: realValue(card.name, PROFILE_PLACEHOLDERS.name) ?? undefined,
    email: realValue(card.email, PROFILE_PLACEHOLDERS.email) ?? undefined,
    phone: realValue(card.phone, PROFILE_PLACEHOLDERS.phone) ?? undefined,
    bio: realValue(card.bio, PROFILE_PLACEHOLDERS.bio) ?? undefined,
  };
}
