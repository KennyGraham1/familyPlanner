"use client";
import { useState, useSyncExternalStore } from "react";
import { Share, X } from "lucide-react";
import {
  install,
  installPrompt,
  isInstalled,
  isIos,
  snoozeInstallSuggestion,
  subscribeInstall,
  wantsInstallSuggestion,
} from "@/lib/install";

/** Suggests keeping Kinfolk on the home screen, so it's one tap away each day. */
export function InstallCard() {
  const prompt = useSyncExternalStore(
    subscribeInstall,
    installPrompt,
    () => null,
  );
  const [hidden, setHidden] = useState(
    () => isInstalled() || !wantsInstallSuggestion(),
  );
  const ios = isIos();
  if (hidden || (!prompt && !ios)) return null;
  const dismiss = () => {
    snoozeInstallSuggestion();
    setHidden(true);
  };
  return (
    <section
      className="install-card"
      aria-label="Add Kinfolk to your home screen"
    >
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div>
        <strong>Keep Kinfolk on your home screen</strong>
        <p>
          {ios ? (
            <>
              Tap <Share size={14} aria-label="Share" /> Share, then “Add to
              Home Screen”. It opens straight to today’s plans.
            </>
          ) : (
            "Open it like an app, straight to today’s plans."
          )}
        </p>
      </div>
      {prompt && (
        <button
          className="button primary"
          onClick={async () => {
            if (await install()) setHidden(true);
          }}
        >
          Install
        </button>
      )}
      <button
        className="icon-button small"
        aria-label="Not now"
        onClick={dismiss}
      >
        <X size={16} />
      </button>
    </section>
  );
}
