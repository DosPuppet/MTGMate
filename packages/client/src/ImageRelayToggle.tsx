/** "Images through the Planecircle server" checkbox: image relay when the network blocks Scryfall (see images.ts). */
import { useImages, useRelayActive } from "./images";
import { useT } from "./localize";

export function ImageRelayToggle() {
  const setMode = useImages((s) => s.setMode);
  const active = useRelayActive();
  const t = useT();
  return (
    <label
      className="toggle image-relay"
      title={t(
        "Check this if the cards are not shown (Scryfall blocked by your network): the images go through the Planecircle server.",
      )}
    >
      <input type="checkbox" checked={active} onChange={(e) => setMode(e.target.checked ? "on" : "off")} />
      {t("Images through the Planecircle server")}
    </label>
  );
}

/** "Custom art" checkbox: only if the server has some (`tools/custom-art.ts`, see images.ts). */
export function CustomArtToggle() {
  const custom = useImages((s) => s.custom);
  const on = useImages((s) => s.customOn);
  const setOn = useImages((s) => s.setCustomOn);
  const t = useT();
  if (!custom) return null;
  const count = Object.keys(custom.cards).length;
  return (
    <label
      className="toggle custom-art"
      title={t("Card images of this server ({count} cards) instead of those of Scryfall.", { count })}
    >
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      {t("Custom art")}
    </label>
  );
}
