/**
 * Message catalogue for `AdminPanel.tsx` (#158).
 */
const en = {
  heading: 'Admin',

  oidcHint:
    'Local accounts cannot be created while sign-in through Authentik is configured — new accounts are provisioned there instead.',
  createRoleLabel: 'Role',
  createUserButton: 'Create user',

  superAdminRoleLabel: 'Super admin',
  adminRoleLabel: 'Admin',
  memberRoleLabel: 'Member',
  roleSelectLabel: (username: string) => `Role of ${username}`,
  roleOptionHint: 'An admin can use every admin screen except managing accounts; a super admin can do everything.',
  readOnlyUsersHint:
    'You can see the accounts and their roles. Creating, changing and removing accounts is for super admins.',
  neverSeen: 'never',
  disableButton: 'Disable',
  enableButton: 'Enable',
  resetPasswordButton: 'Reset password',
  deleteButton: 'Delete',
  copyLinkNow: 'One-time link, shown once — copy it now:',

  deleteWarning: (username: string, impact: string) => `Deleting ${username} removes ${impact}. This cannot be undone.`,
  deletePermanentlyButton: 'Delete permanently',
  cancelButton: 'Cancel',

  createUserHeading: 'Create a user',
  usersHeading: 'Users',
  loadingUsers: 'Loading users…',
  roleColumn: 'Role',
  lastSeenColumn: 'Last seen',
  actionsColumn: 'Actions',
  disabledSuffix: ' (disabled)',

  onePerson: '1 person',
  peopleCount: (n: string) => `${n} people`,
  oneChart: '1 chart',
  chartsCount: (n: string) => `${n} charts`,
  peopleAndCharts: (people: string, charts: string) => `${people} and ${charts}`,
  oneStoredChange: '1 stored change',
  storedChangesCount: (n: string) => `${n} stored changes`,
  unconfiguredSyncSuffix: (rows: string) =>
    `${rows} (sync is not configured on this server, so an exact count of people/charts is not available)`,

  usageHeading: 'AI-customized interpretation usage',
  loadingUsage: 'Loading usage…',
  usageEmpty: 'No AI-customized interpretation requests yet.',
  usageUserColumn: 'User',
  usageRequestsColumn: 'Requests',
  usageTokensColumn: 'Tokens (in / out)',
  usageCostColumn: 'Total cost',
  usageCostLast24hColumn: 'Last 24h',
  usageLastUsedColumn: 'Last used',
  usageCapsNote: (userCap: string, totalCap: string, totalLast24h: string) =>
    `Caps: ${userCap} per user, ${totalCap} total, per rolling 24h window. This deployment's total in the last 24h: ${totalLast24h}.`,
};

const nl: typeof en = {
  heading: 'Beheer',

  oidcHint:
    'Lokale accounts kunnen niet worden aangemaakt terwijl inloggen via Authentik is geconfigureerd — nieuwe accounts worden daar aangemaakt.',
  createRoleLabel: 'Rol',
  createUserButton: 'Gebruiker aanmaken',

  superAdminRoleLabel: 'Hoofdbeheerder',
  adminRoleLabel: 'Beheerder',
  memberRoleLabel: 'Lid',
  roleSelectLabel: (username) => `Rol van ${username}`,
  roleOptionHint:
    'Een beheerder kan alle beheerschermen gebruiken behalve accountbeheer; een hoofdbeheerder kan alles.',
  readOnlyUsersHint:
    'Je kunt de accounts en hun rollen zien. Accounts aanmaken, wijzigen en verwijderen is voor hoofdbeheerders.',
  neverSeen: 'nooit',
  disableButton: 'Uitschakelen',
  enableButton: 'Inschakelen',
  resetPasswordButton: 'Wachtwoord opnieuw instellen',
  deleteButton: 'Verwijderen',
  copyLinkNow: 'Eenmalige link, één keer getoond — kopieer hem nu:',

  deleteWarning: (username: string, impact: string) =>
    `Het verwijderen van ${username} verwijdert ${impact}. Dit kan niet ongedaan worden gemaakt.`,
  deletePermanentlyButton: 'Definitief verwijderen',
  cancelButton: 'Annuleren',

  createUserHeading: 'Een gebruiker aanmaken',
  usersHeading: 'Gebruikers',
  loadingUsers: 'Gebruikers laden…',
  roleColumn: 'Rol',
  lastSeenColumn: 'Laatst gezien',
  actionsColumn: 'Acties',
  disabledSuffix: ' (uitgeschakeld)',

  onePerson: '1 persoon',
  peopleCount: (n: string) => `${n} personen`,
  oneChart: '1 horoscoop',
  chartsCount: (n: string) => `${n} horoscopen`,
  peopleAndCharts: (people: string, charts: string) => `${people} en ${charts}`,
  oneStoredChange: '1 opgeslagen wijziging',
  storedChangesCount: (n: string) => `${n} opgeslagen wijzigingen`,
  unconfiguredSyncSuffix: (rows: string) =>
    `${rows} (synchronisatie is niet geconfigureerd op deze server, dus een exact aantal personen/horoscopen is niet beschikbaar)`,

  usageHeading: 'Gebruik van AI-gepersonaliseerde interpretatie',
  loadingUsage: 'Gebruik laden…',
  usageEmpty: 'Nog geen AI-gepersonaliseerde interpretatieverzoeken.',
  usageUserColumn: 'Gebruiker',
  usageRequestsColumn: 'Verzoeken',
  usageTokensColumn: 'Tokens (in / uit)',
  usageCostColumn: 'Totale kosten',
  usageCostLast24hColumn: 'Laatste 24u',
  usageLastUsedColumn: 'Laatst gebruikt',
  usageCapsNote: (userCap: string, totalCap: string, totalLast24h: string) =>
    `Limieten: ${userCap} per gebruiker, ${totalCap} totaal, per voortschrijdend venster van 24u. Totaal van deze server in de laatste 24u: ${totalLast24h}.`,
};

export const adminPanelMessages = { en, nl };
