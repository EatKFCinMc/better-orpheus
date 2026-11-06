/** Disable the imported client's own updater before its startup services run. */
export function disableClientUpdateChecks(source: string): string {
  if (!source.includes('"_p._$$Updater"')) return source;
  // The 2.x updater checks distribution channels at the start of _$check.
  // Stop at the internal check entry point before an update request is made.
  return source.replace(
    /(\b[\w$]+\.[\w$]+=function\([^)]*\)\{)(?="store"===APP_CONF\.channel\|\|"cybercafe"===APP_CONF\.channel\|\|)/g,
    "$1return;"
  );
}
