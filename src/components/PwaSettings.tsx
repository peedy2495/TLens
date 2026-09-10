import type { PwaState } from "../lib/pwa";

export function PwaSettings({
  language,
  working,
  pwa,
}: {
  language: "de" | "en";
  working: boolean;
  pwa: PwaState;
}) {
  const t = (de: string, en: string) => (language === "de" ? de : en);
  // Later defers only the workspace banner; settings keep the pending update
  // actionable until it is applied.
  const updateReady = pwa.updateAvailable;
  const installErrorText = pwa.installError
    ? t(
        "Installation fehlgeschlagen. Bitte erneut über „DLens installieren“ versuchen.",
        "Installation failed. Please try “Install DLens” again.",
      )
    : "";
  const swErrorText = !pwa.swError
    ? ""
    : pwa.swError === "update"
      ? t(
          "Aktualisierung fehlgeschlagen. Bitte später erneut versuchen.",
          "Update failed. Please try again later.",
        )
      : t(
          "Service Worker konnte nicht registriert werden. Die App bleibt nutzbar; bitte Seite neu laden.",
          "Service worker registration failed. The app stays usable; please reload the page.",
        );
  return (
    <div className="pwa-settings">
      <h4>{t("App-Installation", "App installation")}</h4>
      {pwa.installed ? (
        <p className="subtle" role="status">
          {t("DLens ist als App installiert.", "DLens is installed as an app.")}
        </p>
      ) : pwa.canInstall ? (
        <button type="button" onClick={() => void pwa.requestInstall()}>
          {t("DLens installieren", "Install DLens")}
        </button>
      ) : (
        <p className="subtle">
          {t(
            "Je nach Browser über das Browsermenü bzw. über „Teilen“ → „Zum Home-Bildschirm“ installieren; unter Safari (macOS) über „Zum Dock hinzufügen“.",
            "Depending on the browser, use the browser menu or Share → Add to Home Screen; on Safari (macOS) use Add to Dock.",
          )}
        </p>
      )}
      {installErrorText && <p role="alert">{installErrorText}</p>}
      <h4>{t("Offline-Status", "Offline status")}</h4>
      <p className="subtle" role="status">
        {pwa.offlineReady
          ? t("DLens ist offline verfügbar.", "DLens is available offline.")
          : t(
              "Offline noch nicht bereit: einmal online laden, bis die Zwischenspeicherung abgeschlossen ist.",
              "Offline not ready yet: load once while online until caching completes.",
            )}
      </p>
      <h4>{t("Aktualisierung", "Update")}</h4>
      {pwa.updateAvailable ? (
        <p className="subtle">
          {t(
            "Eine neue Version ist bereit und wartet auf eine explizite Aktualisierung.",
            "A new version is ready and waits for an explicit update.",
          )}
        </p>
      ) : (
        <p className="subtle">
          {t(
            "Keine wartende Aktualisierung. Updates werden nur nach Bestätigung geladen.",
            "No pending update. Updates load only after confirmation.",
          )}
        </p>
      )}
      <div className="empty-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          disabled={!updateReady || working}
          onClick={() => void pwa.applyUpdate()}
          title={
            working
              ? t(
                  "Während Import/Löschen deaktiviert",
                  "Disabled during import/deletion",
                )
              : undefined
          }
        >
          {t("Aktualisieren", "Update")}
        </button>
        {updateReady && !pwa.updateDeferred && (
          <button type="button" onClick={pwa.deferUpdate}>
            {t("Später", "Later")}
          </button>
        )}
      </div>
      {swErrorText && <p role="alert">{swErrorText}</p>}
    </div>
  );
}
