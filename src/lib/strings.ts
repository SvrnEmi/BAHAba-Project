import { MDRRMO_HOTLINE } from "./quickReport";

/*
 * Text for the resident and guest screens, kept together so it can be
 * translated later. Add new resident or guest text here, not in a component.
 * bahaba_app/lib/config/app_strings.dart holds the same text for Flutter.
 */

export const STRINGS = {
  nav: {
    home: "Home",
    alerts: "Alerts",
    reports: "Reports",
    map: "Map",
    contacts: "Emergency Contacts",
  },
  alerts: {
    screenTitle: "Alerts & Notifications",
    screenSubtitle: "Stay informed about flood risks",
    sectionTitle: "Flood Alerts",
    sectionSubtitle: "From your barangay and the MDRRMO",
    viewAll: "View all",
    checking: "Checking for alerts...",
    loadFailed: "Could not load alerts:",
    none: "No alerts for your barangay right now.",
    listLabel: "Flood alerts",
    allClear: "All clear",
    ended: "Ended",
    latest: "Latest alert",
    current: "Current alert",
    moreCount: (n: number) => `+${n} more`,
  },
  ground: {
    title: "Reported on the ground",
    subtitle: (barangay: string) => `From officials in ${barangay}`,
    checking: "Checking reports...",
    loadFailed: "Could not load the reports:",
    retry: "Try again",
    none: "No on-the-ground reports from your barangay yet.",
    noneFor: (barangay: string) => `No on-the-ground reports from ${barangay} yet.`,
    outOfDate: "may be out of date",
    kinds: { waterway: "Waterway", road: "Road" } as Record<string, string>,
    statuses: {
      normal: "Normal",
      rising: "Rising",
      overflowing: "Overflowing",
      passable: "Passable",
      impassable: "Not passable",
    } as Record<string, string>,
  },
  contacts: {
    title: "Emergency Contacts",
    subtitle: "Tap a number to call",
    municipal: "Municipal contacts",
    barangay: (barangay: string) => `${barangay} contacts`,
    checking: "Loading contacts...",
    loadFailed: "Could not load the contacts:",
    retry: "Try again",
    emptyLead: "No contacts have been added yet. Call the MDRRMO at ",
    emptyEnd: ".",
    hotline: MDRRMO_HOTLINE,
    call: (name: string, phone: string) => `Call ${name} at ${phone}`,
  },
  guest: {
    back: "Back",
    pickBarangay: "Barangay",
    choose: "Choose a barangay",
    municipalOnly: "Municipal contacts only",
    conditionsTitle: "Conditions on the ground",
    conditionsSubtitle: "Pick a barangay to see what officials report",
    conditionsButton: "Conditions on the ground",
    contactsButton: "Emergency Contacts",
  },
} as const;
