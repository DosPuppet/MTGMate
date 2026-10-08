/** Case « Images par le serveur Planecircle » : relais des images quand le réseau bloque Scryfall (voir images.ts). */
import { useImages, useRelayActive } from "./images";

export function ImageRelayToggle() {
  const setMode = useImages((s) => s.setMode);
  const active = useRelayActive();
  return (
    <label
      className="toggle image-relay"
      title="À cocher si les cartes ne s'affichent pas (Scryfall bloqué par votre réseau) : les images passent par le serveur Planecircle."
    >
      <input type="checkbox" checked={active} onChange={(e) => setMode(e.target.checked ? "on" : "off")} />
      Images par le serveur Planecircle
    </label>
  );
}

/** Case « Illustrations personnelles » : seulement si le serveur en a (`tools/custom-art.ts`, voir images.ts). */
export function CustomArtToggle() {
  const custom = useImages((s) => s.custom);
  const on = useImages((s) => s.customOn);
  const setOn = useImages((s) => s.setCustomOn);
  if (!custom) return null;
  const count = Object.keys(custom.cards).length;
  return (
    <label
      className="toggle custom-art"
      title={`Images de cartes propres à ce serveur (${count} cartes) à la place de celles de Scryfall.`}
    >
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      Illustrations personnelles
    </label>
  );
}
