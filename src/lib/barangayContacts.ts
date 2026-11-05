import { supabase } from "./supabase";

/*
 * Rows of public.emergency_contacts. barangay null means a municipal contact,
 * which barangay officials can read but not change. The database writes the
 * audit log. This table has no realtime, so pages reload after each change.
 */

export type Contact = {
  id: number;
  barangay: string | null;
  name: string;
  role: string | null;
  phone: string;
  sort_order: number;
};

export type ContactInput = { name: string; role: string; phone: string };

const COLUMNS = "id, barangay, name, role, phone, sort_order";

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const ROLE_MAX = 80;

/** Same rule as the database: digits, +, spaces, dashes, parentheses, 7 to 20 characters. */
export const isValidPhone = (phone: string) => /^[0-9+() -]{7,20}$/.test(phone);

/** tel: link for a stored number. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

const clean = (input: ContactInput) => ({
  name: input.name.trim(),
  role: input.role.trim() || null,
  phone: input.phone.trim(),
});

/** One barangay's contacts (null: the municipal ones), optionally with the municipal ones too, in display order. */
export async function listContacts(barangay: string | null, withMunicipal: boolean): Promise<Contact[]> {
  const query = supabase.from("emergency_contacts").select(COLUMNS);
  const scoped =
    barangay === null ? query.is("barangay", null) : withMunicipal ? query.or(`barangay.is.null,barangay.eq."${barangay}"`) : query.eq("barangay", barangay);
  const { data, error } = await scoped
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Contact[];
}

export async function createContact(barangay: string | null, input: ContactInput, sortOrder: number): Promise<void> {
  const { error } = await supabase.from("emergency_contacts").insert({ barangay, sort_order: sortOrder, ...clean(input) });
  if (error) throw error;
}

async function updateContact(id: number, values: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.from("emergency_contacts").update(values).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not save the change (no permission for this contact).");
}

export const editContact = (id: number, input: ContactInput) => updateContact(id, clean(input));

export async function deleteContact(id: number): Promise<void> {
  const { data, error } = await supabase.from("emergency_contacts").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not delete it (no permission for this contact).");
}

/** Numbers the rows 0, 1, 2... in the given order, writing only the rows that changed. */
export async function saveContactOrder(rows: Contact[]): Promise<void> {
  await Promise.all(rows.map((row, index) => (row.sort_order === index ? null : updateContact(row.id, { sort_order: index }))));
}
